import { useState, useCallback, useEffect } from 'react';
import { GameProvider, useGame } from './context/GameContext';
import type { Team, Player, FoulType, FreeThrowResult, ShotSituation, ScoreType, StatType } from './types/game';
import type { SavedTeam, NumberType } from './utils/teamStorage';
import { formatPlayerNumber } from './utils/playerNumber';
// 表示名は utils/actionLabels に集約する。以前はこのファイルと保留パネル・
// 保留解決モーダルに別々の辞書があり、チーム選択モーダルだけ内部コードが出ていた
import { actionLabel, statLabel } from './utils/actionLabels';
import { todayInputDate } from './utils/localDate';
import { quarterLabel } from './utils/quarterLabel';
import { createPendingAction } from './types/pendingAction';
import { saveRecentOpponent } from './utils/teamStorage';
import { buildMatchTeams } from './utils/matchTeams';
import { migrateSavedTeamIds } from './utils/savedTeamIdMigration';
import { saveGameResult } from './utils/gameHistoryStorage';
import { loadGameSession, clearGameSession, hasGameSession } from './utils/gameSessionStorage';
import { Home } from './components/Home';
import { MyTeamManager } from './components/MyTeamManager';
import { GameSetup, type GameSetupDraft } from './components/GameSetup';
import { History } from './components/History';
import { OpponentManager } from './components/OpponentManager';
import { PlayerStatsAnalysis } from './components/PlayerStatsAnalysis';
import { Scoreboard } from './components/Scoreboard';
import { ActionButtons } from './components/ActionButtons';
import { ActionHistory } from './components/ActionHistory';
import { TeamPanel } from './components/TeamPanel';
// import { VoiceInput } from './components/VoiceInput'; // 一時的に非表示
import { VoiceMemoButton, VoiceMemoPanel, VoiceMemoStrip } from './components/VoiceMemo';
import type { VoiceMemo } from './utils/voiceMemo';
import { SubstitutionModal } from './components/SubstitutionModal';
import { TimeoutInputModal } from './components/TimeoutInputModal/TimeoutInputModal';
import { StatsPanel } from './components/StatsPanel';
import { TeamComparison } from './components/TeamComparison';
import { QuarterLineup } from './components/QuarterLineup';
import { PendingActionPanel } from './components/PendingActionPanel';

import { FoulInputFlow } from './components/FoulInputFlow';
import { RunningScoresheet } from './components/RunningScoresheet';
import { AppSettingsModal } from './components/Settings/AppSettingsModal';
import { ToastContainer } from './components/Toast/Toast';
import { showToast } from './components/Toast/toastApi';
import { Modal, ConfirmModal } from './components/Modal';
import { UndoSnackbar } from './components/UndoSnackbar/UndoSnackbar';
import { RestorePrompt } from './components/RestorePrompt';
import { BackupPrompt } from './components/BackupPrompt/BackupPrompt';
import { UpdatePrompt, useAppUpdate, suppressesAppUpdate } from './components/UpdatePrompt';
import { consumeLaunchShortcut, parseLaunchShortcut } from './utils/launchShortcut';
import type { ShortcutTarget } from './utils/launchShortcut';
import { useOfflineToast } from './hooks/useOfflineToast';
import { useFoulOutNotice } from './hooks/useFoulOutNotice';
import type { MirrorSnapshot } from './utils/mirrorBackup';
import { hasAppData, getLatestSnapshot, saveSnapshot, requestPersistentStorage } from './utils/mirrorBackup';
import { startOcrAssetWarmup } from './utils/ocrAssetCache';
import { STORAGE_ERROR_EVENT } from './utils/storageError';
import { isBackupDue } from './utils/lastBackupStorage';
import { shareBackup } from './utils/dataBackup';
import { wouldOverflowFoulColumns } from './utils/foulColumns';
// import type { VoiceCommand } from './utils/voiceCommands'; // 一時的に非表示
import { useFullscreen } from './hooks/useFullscreen';
import { useGameMode } from './hooks/useGameMode';
import { useGameAutoSave } from './hooks/useGameAutoSave';
import { useVoiceMemo } from './hooks/useVoiceMemo';
import { GAME_SCREENS, type AppScreen } from './types/screens';
import { useWakeLock } from './hooks/useWakeLock';

import { useScreenHistorySync } from './hooks/useScreenHistorySync';
import { useBackHandler } from './hooks/useBackHandler';
import { useScrollToTopOnOpen } from './hooks/useScrollToTopOnOpen';
import './App.css';

// 画面の識別子と試合系画面の集合は types/screens.ts に置く。
// 戻る/進むの復元ガードと自動保存が同じ集合を見る必要があり、
// 片方（フック側）から App.tsx を参照できないため。

// manifestのショートカット（アイコン長押しメニュー）から起動されたかを、
// モジュール読み込み時に一度だけ確定させる。
// URLのクエリを消す副作用を伴うため、レンダー中（useStateの初期化関数）で
// 呼ぶとStrictModeの二重実行で結果を取りこぼす。Reactのライフサイクルの外で
// 1回だけ評価する。
const LAUNCH_TARGET = consumeLaunchShortcut();

/**
 * ショートカットの遷移先から、行き先の画面と新規開始警告の要否を決める。
 *
 * コールドスタート（initialScreen）と、起動中に launchQueue で受け取る経路の
 * 両方がこれを使う。分かれて書くと、片方だけ挙動が変わってドリフトするため。
 */
function resolveShortcut(
  target: ShortcutTarget | null,
): { screen: AppScreen; warnNewGame: boolean } {
  if (target === 'history') return { screen: 'history', warnNewGame: false };
  if (target === 'playerStats') return { screen: 'playerStats', warnNewGame: false };
  // 進行中の試合がある場合はホームに留まり、警告モーダルで選ばせる
  // （ショートカットだけ素通りさせて記録を消さない）
  if (target === 'newGame') {
    return hasGameSession()
      ? { screen: 'home', warnNewGame: true }
      : { screen: 'gameSetup', warnNewGame: false };
  }
  return { screen: 'home', warnNewGame: false };
}

/** ショートカット起動時の初期画面。新規試合は進行中セッションの有無で分岐する */
function initialScreen(): AppScreen {
  return resolveShortcut(LAUNCH_TARGET).screen;
}

interface AppContentProps {
  screen: AppScreen;
  setScreen: (screen: AppScreen) => void;
}

function AppContent({ screen, setScreen }: AppContentProps) {
  const { state, dispatch } = useGame();
  const [gameName, setGameName] = useState('');
  const [date, setDate] = useState(todayInputDate);
  const [showSubstitutionModal, setShowSubstitutionModal] = useState(false);
  const [substitutionTeamId, setSubstitutionTeamId] = useState<'teamA' | 'teamB'>('teamA');
  const [showStats, setShowStats] = useState(false);
  const [activeTab, setActiveTab] = useState<'teamA' | 'teamB'>('teamA');
  const [lineupTab, setLineupTab] = useState<'teamA' | 'teamB'>('teamA');
  const [showFoulSelector, setShowFoulSelector] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: string; value?: string } | null>(null);
  const [showTeamSelector, setShowTeamSelector] = useState(false); // チーム選択モーダル表示（保留アクション化用）
  const [resolvingFoulPending, setResolvingFoulPending] = useState<{ pendingActionId: string; playerId: string; teamId: string } | null>(null); // ファウル種類選択待ち
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [endGameConfirmType, setEndGameConfirmType] = useState<'tied' | 'notTied' | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false); // 保存せず破棄の確認
  const [showSaveFailed, setShowSaveFailed] = useState(false); // 試合結果の保存に失敗
  const [showPendingWarning, setShowPendingWarning] = useState(false); // 未割り当ての記録が残ったまま終了しようとした
  const [isBackingUp, setIsBackingUp] = useState(false); // 保存失敗時のバックアップ実行中
  // 進行中セッションがある状態での新規開始警告。
  // 新規試合ショートカットから起動した場合も、ホームのボタンと同じ警告を通す
  // （ショートカットだけ素通りさせて記録を消さない）
  const [showNewGameWarning, setShowNewGameWarning] = useState(
    () => resolveShortcut(LAUNCH_TARGET).warnNewGame,
  );

  // 試合設定ウィザードの入力途中の状態。
  //
  // 設定は AppScreen なので、スタメン選択へ進むとアンマウントされて中身が消える。
  // 1段戻ったときに1/5からやり直しにならないよう控えを持つ（GameSetupDraft）。
  // 読むのは GameSetup がマウントされる瞬間の1回だけだが、レンダー中に ref を
  // 読むのは禁じ手なので素直に state で持つ（設定画面が出ている間だけの再描画）。
  const [setupDraft, setSetupDraft] = useState<GameSetupDraft | null>(null);

  /**
   * 下書きを捨てる。
   *
   * 残してよいのは「設定 ⇄ スタメン選択」の往復だけ。ホームへ抜けたあとも
   * 残すと、次に「新規試合開始」を押したときに前回諦めた設定が出てくる。
   */
  const clearSetupDraft = useCallback(() => {
    setSetupDraft(null);
  }, []);

  // アプリが起動している状態でアイコン長押しショートカットを押したときの遷移。
  //
  // manifest の launch_handler は 'focus-existing'（vite.config.ts）で、これは
  // 既存ウィンドウにフォーカスを戻すだけで navigate しない。ターゲットURLは
  // launchQueue に積まれるだけなので、ここで受け取らないとショートカットが
  // 完全な無反応になる（?s= が読まれないまま画面が変わらない）。
  // 遷移規則は resolveShortcut でコールドスタートと共有する。
  useEffect(() => {
    if (typeof window === 'undefined' || !window.launchQueue) return;
    window.launchQueue.setConsumer(({ targetURL }) => {
      const target = parseLaunchShortcut(targetURL);
      if (target === null) return;
      const { screen: next, warnNewGame } = resolveShortcut(target);
      // ショートカットからの新規開始も「最初から」。前に諦めた設定は引き継がない
      if (next === 'gameSetup') clearSetupDraft();
      setScreen(next);
      // 別のショートカットで移動したときに、前回の警告が残らないようにする
      setShowNewGameWarning(warnNewGame);
    });
    // マウント時のみ。setScreen は AppShell の useState のセッターで参照は変わらない
  }, [setScreen, clearSetupDraft]);
  // 記録直後のワンタップUndo（得点/スタッツのみ。ファウルは専用フローがあるため対象外）
  const [undoInfo, setUndoInfo] = useState<{ message: string; kind: 'score' | 'stat'; entryId: string } | null>(null);

  const { phase, selectedPlayerId, selectedTeamId, currentQuarter, pendingActions } = state;

  // 通信が切れた瞬間に「記録は続けられます」と伝える（常設バッジは操作要素に
  // 重なるため置かない。詳細は useOfflineToast のコメント）
  useOfflineToast();

  // 5ファウル到達を記録した瞬間に知らせる（出場は止めない。詳細はフック側のコメント）
  useFoulOutNotice(state);

  const [restoreCandidate, setRestoreCandidate] = useState<MirrorSnapshot | null>(null);
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);

  // ブラウザ履歴と画面遷移を同期（Androidの戻るボタン/ジェスチャでアプリが終了しないように）。
  // 試合系画面は表示できる試合がない場合（未設定/終了保存後）に復元せずホームへ差し替える
  useScreenHistorySync(screen, setScreen, {
    homeScreen: 'home',
    guardedScreens: GAME_SCREENS,
    canShowGuarded: state.teamA.players.length > 0 && state.phase !== 'finished',
  });

  // 画面を切り替えたらページの先頭から見せる。
  // URLルーティングを持たないぶん、ブラウザの「新しいページは先頭から」が
  // 効かない（詳細は useScrollToTopOnOpen）
  useScrollToTopOnOpen(screen);

  // スコアシートとスタメン選択は、画面上の「戻る」が1段だけ戻す（試合画面・試合設定へ）。
  // 端末の戻る操作は画面のエントリを消費してホームへ抜けるため、同じ「戻る」で
  // 行き先が食い違っていた。試合中にシートを開いてエッジスワイプすると、
  // 記録画面ではなくホームまで飛ぶ。サブビューと同じ扱いにして揃える
  // （履歴側の辻褄は useScreenHistorySync が合わせる）。
  useBackHandler(screen === 'scoresheet', useCallback(() => setScreen('game'), [setScreen]));
  useBackHandler(
    screen === 'quarterLineup',
    // 行き先は画面上の「戻る」と同じ規則（試合前は設定へ・試合中は試合画面へ）
    useCallback(() => setScreen(phase === 'setup' ? 'gameSetup' : 'game'), [phase, setScreen]),
  );

  // アクション先行入力の「記録待ち」も、戻る操作で取り消せるようにする。
  //
  // この状態では選手タップが「選択」ではなく「即記録」に変わる。抜ける手段は
  // ステータスバーの「キャンセル」だけで、受け取らないと記録画面ごとホームへ
  // 飛ぶ（保留パネル・得点セレクターと同じ扱いに揃える）。
  // 記録待ちのまま画面を離れても状態は残るので、戻ってくると次の選手タップが
  // 意図しない記録になる——そこがいちばん困る
  useBackHandler(pendingAction !== null, useCallback(() => setPendingAction(null), []));

  // 起動時: 過去の試合に登録マイチームのidを書き戻す。
  // 改名されるとその試合は名前で辿れなくなり選手スタッツ分析から消えるため、
  // 改名される前に帰属をidへ凍結しておく（走らせても分析結果は変わらない）。
  // 起動スナップショットより先に置き、書き戻し後のデータが控えに載るようにする。
  useEffect(() => {
    migrateSavedTeamIds();
  }, []);

  // 起動後: OCRアセットを裏で取っておく。
  // プリキャッシュから外した（1本でも落ちるとSWのinstallごと失敗し、オフライン
  // 記録まで道連れになるため。vite.config.ts）代わりに、ここで従来どおり
  // 「体育館でオフラインでも写真読込が使える」状態を保つ。
  // 失敗しても黙って諦める（ocrAssetCache.ts）
  useEffect(() => startOcrAssetWarmup(), []);

  // 起動時: 永続ストレージ要求・データ消失検知・起動スナップショット
  useEffect(() => {
    requestPersistentStorage();
    (async () => {
      if (!hasAppData() && !sessionStorage.getItem('mbc-restore-dismissed')) {
        const snapshot = await getLatestSnapshot();
        if (snapshot && Object.keys(snapshot.entries).length > 0) {
          setRestoreCandidate(snapshot);
          return;
        }
      }
      saveSnapshot();
    })();
  }, []);

  // 保存失敗をToastでユーザーに通知
  useEffect(() => {
    const handler = () => {
      showToast('⚠️ データの保存に失敗しました。設定画面からバックアップを保存してください', 'error');
    };
    window.addEventListener(STORAGE_ERROR_EVENT, handler);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, handler);
  }, []);

  // 試合終了時は即座にミラーバックアップ
  useEffect(() => {
    if (phase === 'finished') {
      saveSnapshot();
    }
  }, [phase]);

  // 試合状態が変更されたらセッション保存（デバウンス付き）
  useGameAutoSave(state, screen, gameName, date, phase);

  // 記録中は画面を消させない。入力の間隔が数十秒あくため、自動ロックが効くと
  // 得点のたびに復帰操作が要る。全画面表示はスリープを止めないので別立てで押さえる。
  // 試合が終わったら解放し、結果画面を開いたまま放置しても電池を使わせない
  useWakeLock(screen === 'game' && phase !== 'finished');


  // 試合設定完了
  const handleGameSetupComplete = (setupData: {
    gameName: string;
    date: string;
    myTeam: SavedTeam;
    opponentTeam: SavedTeam;
    myTeamColor: 'white' | 'blue';
    opponentTeamColor: 'white' | 'blue';
    numberType: NumberType;
    showThreePoint: boolean;
    quarterMinutes: 5 | 6;
  }) => {
    // 新しいゲームを開始するため状態をリセット
    dispatch({ type: 'RESET_GAME' });

    // 音声メモは手入力のための下書きであり、寿命は試合単位。ここは前の試合の
    // セッションを実際に置き換える地点なので、ここで消す（ウィザードへの
    // 入口では消さない。入口で消すと、設定を諦めて中断中の試合を再開したときに
    // 巻き添えで消えてしまう）
    voiceMemo.clearAll();

    setGameName(setupData.gameName);
    setDate(setupData.date);

    // 白=teamA（上段）／青=teamB（下段）の割り当て、番号タイプ、マイチーム側の
    // savedTeamId、コート上選手のクリアまで buildMatchTeams が引き受ける
    const { teamA, teamB } = buildMatchTeams(setupData);

    dispatch({ type: 'SET_TEAMS', payload: { teamA, teamB, showThreePoint: setupData.showThreePoint, quarterMinutes: setupData.quarterMinutes } });

    // 対戦チームを履歴に保存（念のため更新）
    saveRecentOpponent(setupData.opponentTeam);

    // Q1スタメン選択画面へ（新規試合は白タブから）
    setLineupTab('teamA');
    setScreen('quarterLineup');
  };

  // Undoスナックバー用の選手表示名
  const getPlayerUndoLabel = (teamId: string, playerId: string): string => {
    const team = teamId === 'teamA' ? state.teamA : state.teamB;
    const p = team.players.find(pl => pl.id === playerId);
    return p ? `#${formatPlayerNumber(p.number)} ${p.courtName || p.name}` : '';
  };

  // 得点を記録し、Undoスナックバーを表示する
  const recordScore = (teamId: string, playerId: string, scoreType: '2P' | '3P' | 'FT') => {
    const entryId = crypto.randomUUID();
    dispatch({ type: 'ADD_SCORE', payload: { teamId, playerId, scoreType, entryId } });
    const points = scoreType === '3P' ? 3 : scoreType === '2P' ? 2 : 1;
    setUndoInfo({
      message: `${getPlayerUndoLabel(teamId, playerId)} ${scoreType}成功 +${points}`,
      kind: 'score',
      entryId,
    });
  };

  // スタッツを記録し、Undoスナックバーを表示する
  const recordStat = (teamId: string, playerId: string, statType: StatType) => {
    const entryId = crypto.randomUUID();
    dispatch({ type: 'ADD_STAT', payload: { teamId, playerId, statType, entryId } });
    setUndoInfo({
      message: `${getPlayerUndoLabel(teamId, playerId)} ${statLabel(statType)}`,
      kind: 'stat',
      entryId,
    });
  };

  // スナックバーからの取り消し（対象IDが既に削除済みならreducer側でno-op）
  const handleUndoLast = useCallback(() => {
    if (!undoInfo) return;
    dispatch({ type: undoInfo.kind === 'score' ? 'REMOVE_SCORE' : 'REMOVE_STAT', payload: { entryId: undoInfo.entryId } });
    setUndoInfo(null);
  }, [undoInfo, dispatch]);

  const handleDismissUndo = useCallback(() => {
    setUndoInfo(null);
  }, []);

  // 選手選択
  const handlePlayerSelect = (playerId: string, teamId: string) => {
    // 保留中のアクションがあれば実行
    if (pendingAction) {
      if (pendingAction.type === 'SCORE') {
        recordScore(teamId, playerId, pendingAction.value as '2P' | '3P' | 'FT');
      } else if (pendingAction.type === 'STAT') {
        // value は ActionButtons が渡す固定の種別文字列（StatType のいずれか）
        recordStat(teamId, playerId, pendingAction.value as StatType);
      } else if (pendingAction.type === 'MISS') {
        recordStat(teamId, playerId, pendingAction.value as StatType);
      } else if (pendingAction.type === 'FOUL') {
        // ファウルタイプセレクター表示のために選択状態にする
        dispatch({ type: 'SELECT_PLAYER', payload: { playerId, teamId } });
        setActiveTab(teamId as 'teamA' | 'teamB');
        setShowFoulSelector(true);
        setPendingAction(null);
        return;
      }

      setPendingAction(null);
      dispatch({ type: 'CLEAR_SELECTION' });
      return;
    }

    // 通常の選手選択
    if (selectedPlayerId === playerId) {
      dispatch({ type: 'CLEAR_SELECTION' });
    } else {
      dispatch({ type: 'SELECT_PLAYER', payload: { playerId, teamId } });
      setActiveTab(teamId as 'teamA' | 'teamB');
    }
  };

  // 得点追加
  const handleScore = (scoreType: '2P' | '3P' | 'FT') => {
    if (selectedPlayerId && selectedTeamId) {
      recordScore(selectedTeamId, selectedPlayerId, scoreType);
      dispatch({ type: 'CLEAR_SELECTION' });
    } else {
      setPendingAction({ type: 'SCORE', value: scoreType });
    }
  };

  // 統計追加（シュートミスも含む）
  const handleStat = (statType: 'OREB' | 'DREB' | 'AST' | 'STL' | 'BLK' | 'TO' | 'TO:DD' | 'TO:TR' | 'TO:PM' | 'TO:CM' | '2PA' | '3PA' | 'FTA') => {
    if (selectedPlayerId && selectedTeamId) {
      recordStat(selectedTeamId, selectedPlayerId, statType);
      dispatch({ type: 'CLEAR_SELECTION' });
    } else {
      setPendingAction({ type: 'STAT', value: statType });
    }
  };

  // シュートミス追加（handleStatと同じロジック）
  const handleMiss = (missType: '2PA' | '3PA' | 'FTA') => {
    handleStat(missType);
  };

  // ファウルセレクター表示
  const handleShowFoulSelector = () => {
    if (selectedPlayerId && selectedTeamId) {
      setShowFoulSelector(true);
    } else {
      setPendingAction({ type: 'FOUL' });
    }
  };


  // ファウル追加（FT付き版）
  const handleFoulWithFreeThrows = (data: {
    foulType: FoulType;
    shotSituation: ShotSituation;
    shotMade: boolean;
    freeThrows: number;
    freeThrowResults: FreeThrowResult[];
    shooterPlayerId: string | null;
  }) => {
    setShowFoulSelector(false);

    // 保留ファウルアクションを解決する場合
    if (resolvingFoulPending) {
      const opponentTeamId = resolvingFoulPending.teamId === 'teamA' ? 'teamB' : 'teamA';
      dispatch({
        type: 'RESOLVE_PENDING_ACTION_WITH_FREE_THROWS',
        payload: {
          pendingActionId: resolvingFoulPending.pendingActionId,
          playerId: resolvingFoulPending.playerId,
          foulType: data.foulType,
          shotSituation: data.shotSituation,
          shotMade: data.shotMade,
          freeThrows: data.freeThrows,
          freeThrowResults: data.freeThrowResults,
          shooterTeamId: opponentTeamId,
          shooterPlayerId: data.shooterPlayerId || '',
        },
      });
      setResolvingFoulPending(null);
      return;
    }

    if (!selectedPlayerId || !selectedTeamId) return;

    // 相手チームのID
    const opponentTeamId = selectedTeamId === 'teamA' ? 'teamB' : 'teamA';

    dispatch({
      type: 'ADD_FOUL_WITH_FREE_THROWS',
      payload: {
        teamId: selectedTeamId,
        playerId: selectedPlayerId,
        foulType: data.foulType,
        shotSituation: data.shotSituation,
        shotMade: data.shotMade,
        freeThrows: data.freeThrows,
        freeThrowResults: data.freeThrowResults,
        shooterTeamId: opponentTeamId,
        shooterPlayerId: data.shooterPlayerId || '',
      },
    });
    dispatch({ type: 'CLEAR_SELECTION' });
  };

  // ベンチファウルのフロー管理
  const [coachFoulState, setCoachFoulState] = useState<{
    teamId: 'teamA' | 'teamB';
    step: 'type' | 'selectPlayer' | 'foulInput';
    foulType?: FoulType;
    playerId?: string;
    label?: string;
    benchTechType?: 'HC' | 'AC' | 'Sub' | 'Bench';  // ベンチテクニカルの種類
  } | null>(null);

  // コーチ・ベンチファウル（選択モーダル表示）
  const handleCoachFoul = (teamId: 'teamA' | 'teamB') => {
    setCoachFoulState({ teamId, step: 'type' });
  };

  // ベンチファウル種類選択 → FoulInputFlowへ or 選手選択へ
  const handleCoachFoulTypeSelect = (type: 'HC' | 'AC' | 'Sub' | 'Bench') => {
    if (!coachFoulState) return;

    // 交代要員の場合は選手選択ステップへ
    if (type === 'Sub') {
      setCoachFoulState({
        ...coachFoulState,
        step: 'selectPlayer',
        benchTechType: 'Sub',
      });
      return;
    }

    const foulType: FoulType = type === 'Bench' ? 'BT' : 'T';
    const playerId = type === 'HC' ? 'COACH' : type === 'AC' ? 'ACOACH' : 'BENCH';
    const label = type === 'HC' ? 'コーチ (C)' : type === 'AC' ? 'A.コーチ (C)' : 'ベンチ関係者 (B)';
    setCoachFoulState({
      ...coachFoulState,
      step: 'foulInput',
      foulType,
      playerId,
      label,
      benchTechType: type,
    });
  };

  // 交代要員のテクニカルは選手行に「T」を書く＝様式のファウル欄（5枠）を使う。
  // ベンチファウルは FoulInputFlow の種類選択を通らないので、そちらのゲートでは
  // 捕まらない。ここで同じ条件の確認を挟む
  const [benchOverflowPlayerId, setBenchOverflowPlayerId] = useState<string | null>(null);

  const proceedBenchPlayerSelect = (player: Player) => {
    setCoachFoulState(prev => prev && ({
      ...prev,
      step: 'foulInput',
      foulType: 'T',
      playerId: player.id,
      label: `#${formatPlayerNumber(player.number)} ${player.courtName || player.name} (T)`,
      benchTechType: 'Sub',
    }));
  };

  // 交代要員選択（ベンチの選手を選択）
  const handleBenchPlayerSelect = (playerId: string) => {
    if (!coachFoulState) return;
    const team = coachFoulState.teamId === 'teamA' ? state.teamA : state.teamB;
    const player = team.players.find(p => p.id === playerId);
    if (!player) return;

    if (wouldOverflowFoulColumns(player.fouls)) {
      setBenchOverflowPlayerId(playerId);
      return;
    }
    proceedBenchPlayerSelect(player);
  };

  // ベンチファウルFoulInputFlow完了
  const handleCoachFoulComplete = (data: {
    foulType: FoulType;
    shotSituation: ShotSituation;
    freeThrows: number;
    freeThrowResults: FreeThrowResult[];
    shooterPlayerId: string | null;
  }) => {
    if (!coachFoulState || !coachFoulState.foulType || !coachFoulState.playerId) return;
    const { teamId, foulType, playerId, benchTechType } = coachFoulState;
    const opponentTeamId = teamId === 'teamA' ? 'teamB' : 'teamA';

    dispatch({
      type: 'ADD_FOUL_WITH_FREE_THROWS',
      payload: {
        teamId,
        playerId,
        foulType,
        shotSituation: 'none' as ShotSituation,
        freeThrows: data.freeThrows,
        freeThrowResults: data.freeThrowResults,
        shooterTeamId: opponentTeamId,
        shooterPlayerId: data.shooterPlayerId || '',
        benchTechType,  // ベンチテクニカルの種類（HC/AC/Sub/Bench）
      },
    });
    setPendingAction(null);
    setCoachFoulState(null);
  };

  // ベンチファウルキャンセル
  const handleCoachFoulCancel = () => {
    setCoachFoulState(null);
  };

  // ベンチファウルFoulInputFlowから戻る → typeステップへ
  const handleCoachFoulBack = () => {
    if (!coachFoulState) return;
    setCoachFoulState({ teamId: coachFoulState.teamId, step: 'type' });
  };

  // チーム選択して保留アクション作成
  const handleTeamSelectForPending = (teamId: 'teamA' | 'teamB') => {
    if (!pendingAction) return;

    const team = teamId === 'teamA' ? state.teamA : state.teamB;
    const playersOnCourt = team.players
      .filter(p => p.isOnCourt)
      .map(p => ({
        id: p.id,
        number: p.number,
        name: p.name,
        courtName: p.courtName,
      }));

    const actionType = pendingAction.type === 'SCORE' ? 'SCORE'
      : pendingAction.type === 'STAT' || pendingAction.type === 'MISS' ? 'STAT'
        : 'FOUL';

    const newPendingAction = createPendingAction(
      actionType,
      pendingAction.value || '',
      teamId,
      currentQuarter,
      playersOnCourt,
    );

    dispatch({
      type: 'ADD_PENDING_ACTION',
      payload: newPendingAction,
    });

    setPendingAction(null);
    setShowTeamSelector(false);
  };

  // 保留アクション削除
  const handleRemovePendingAction = (pendingActionId: string) => {
    dispatch({
      type: 'REMOVE_PENDING_ACTION',
      payload: { pendingActionId },
    });
  };

  // 保留アクションをダイレクトに解決（選手を直接選択）
  const handleDirectResolvePending = (pendingActionId: string, playerId: string) => {
    // 対象の保留アクションを取得
    const pending = pendingActions.find(p => p.id === pendingActionId);
    if (!pending) return;

    // ファウルタイプの場合はファウル種類選択モーダルを表示
    if (pending.actionType === 'FOUL') {
      setResolvingFoulPending({
        pendingActionId: pending.id,
        playerId,
        teamId: pending.teamId,
      });
      setActiveTab(pending.teamId as 'teamA' | 'teamB');
      setShowFoulSelector(true);
      return;
    }

    // その他のアクションは直接解決
    dispatch({
      type: 'RESOLVE_PENDING_ACTION',
      payload: { pendingActionId, playerId },
    });
  };

  // 保留アクションを不明選手として解決
  const handleResolveUnknown = (pendingActionId: string) => {
    dispatch({
      type: 'RESOLVE_PENDING_ACTION_UNKNOWN',
      payload: { pendingActionId },
    });
  };

  /**
   * そのチームの保留アクションのUI（1件も無ければ何も出さない）。
   *
   * 置き場所はチームパネルのヘッダー（TeamPanel の pendingSlot）。画面下端に
   * 浮かせていた頃は、低い画面でアクション履歴の最新1行を覆っていた。
   */
  const renderPendingSlot = (teamId: 'teamA' | 'teamB') => {
    const teamPending = pendingActions.filter(p => p.teamId === teamId);
    if (teamPending.length === 0) return undefined;
    return (
      <PendingActionPanel
        pendingActions={teamPending}
        onResolveUnknown={handleResolveUnknown}
        onRemove={handleRemovePendingAction}
        onDirectResolve={handleDirectResolvePending}
      />
    );
  };

  // アクション先行時のチーム選択モーダルは自動表示しない。
  // 選手カードの直接タップで即記録し、「選手がわからない」場合のみ
  // ActionButtonsのボタンから明示的に開く（保留アクション化）。


  // タイムアウト
  const handleTimeout = (teamId: 'teamA' | 'teamB' = activeTab, elapsedMinutes: number = 0) => {
    dispatch({
      type: 'ADD_TIMEOUT',
      payload: { teamId, elapsedMinutes },
    });
  };

  // フルモード: TeamPanelのタイムアウトチップから開く入力モーダル
  const [timeoutModalTeam, setTimeoutModalTeam] = useState<'teamA' | 'teamB' | null>(null);

  /**
   * タイムアウトのチップが指すピリオド。
   *
   * 記録は進行中のピリオドに付くが、クォーター終了直後（quarterEnd）は
   * currentQuarter が既に次のピリオドを指している。チップの使用済み判定も
   * 取り消しも currentQuarter を見ていたため、インターバル中は「まだ始まって
   * いないピリオドの残り1回」を出すことになり、直前のピリオドで押し間違えた
   * タイムアウトはそのまま公式様式に印字されて二度と直せなかった。
   * タイムアウトはアクション履歴に載らないので、このチップが唯一の訂正経路になる。
   *
   * インターバル中は「いま終わったピリオド」を指す。ここは記録画面へ戻って
   * 直前のクォーターを見直す場面なので、指す先もそちらに合わせるのが素直。
   *
   * 残る制限: さらに先のピリオドへ進んだあとで前のピリオドの誤りに気づいた場合は
   * 直せない。ピリオドを選ばせるUIが要るため、ここでは扱わない。
   */
  const timeoutQuarter = phase === 'quarterEnd' ? currentQuarter - 1 : currentQuarter;
  // 指す先が「いまのピリオド」でないときだけ、チップの読み上げ名にピリオドを添える。
  // 同じヘッダーのTFバッジは currentQuarter を出しているため、黙っていると
  // 隣り合う2つが別のピリオドを指していることが読み取れない
  const timeoutQuarterLabel = timeoutQuarter !== currentQuarter ? quarterLabel(timeoutQuarter) : undefined;
  const timeoutUsedFor = (team: Team) => team.timeouts.some(t => t.quarter === timeoutQuarter);

  // 記録済みタイムアウトの取り消し確認。
  // 経過分を打ち間違えても直せず、そのまま公式様式に印字されていたため、
  // 記録済みチップから取り消せるようにする（誤タップで消えないよう確認を挟む）
  const [timeoutCancelTeam, setTimeoutCancelTeam] = useState<'teamA' | 'teamB' | null>(null);

  const handleTimeoutCancel = () => {
    if (!timeoutCancelTeam) return;
    dispatch({ type: 'REMOVE_TIMEOUT', payload: { teamId: timeoutCancelTeam, quarter: timeoutQuarter } });
    setTimeoutCancelTeam(null);
  };

  // 試合オプションモーダル（3P設定の途中変更など）
  const [showGameOptions, setShowGameOptions] = useState(false);

  // 交代モーダル表示


  // 交代実行
  const handleSubstitute = (playerInId: string, playerOutId: string) => {
    dispatch({
      type: 'SUBSTITUTE_PLAYER',
      payload: { teamId: substitutionTeamId, playerInId, playerOutId },
    });
  };

  // FoulInputFlow の中断ブロックから交代を要求されたとき。
  // フローは開いたままにする（入力途中の状態はフロー内部に残る）
  const handleRequestSubstitution = (teamId: 'teamA' | 'teamB') => {
    setSubstitutionTeamId(teamId);
    setShowSubstitutionModal(true);
  };

  // 中断（タイムアウト・交代）で選ばせるチーム。
  // タイムアウトは1クォーター1回なので、使用済みかどうかも渡す
  const interruptTeams = [
    {
      id: 'teamA' as const,
      name: state.teamA.name,
      timeoutUsed: state.teamA.timeouts.some(t => t.quarter === currentQuarter),
    },
    {
      id: 'teamB' as const,
      name: state.teamB.name,
      timeoutUsed: state.teamB.timeouts.some(t => t.quarter === currentQuarter),
    },
  ];

  // 音声コマンド処理 (一時的に非表示)
  // const handleVoiceCommand = useCallback((command: VoiceCommand) => {
  //   ... 省略 ...
  // }, [state.teamA, state.teamB, dispatch]);

  // クォーター開始時のスタメン確定（白・青まとめて1回で反映）
  const handleLineupStart = (selected: { teamA: string[]; teamB: string[] }) => {
    // 選択された選手をコート上に、それ以外をベンチに設定
    const updatePlayers = (team: Team, startingPlayerIds: string[]) => ({
      ...team,
      players: team.players.map(p => ({
        ...p,
        isOnCourt: startingPlayerIds.includes(p.id),
        // 出場クォーターを記録。
        // ここは長らく `true` を書いていた（QuarterPlayType に無い値）。
        // 直後の START_GAME が 'starter' で上書きするため表面化していなかったが、
        // それを保証していたのは Scoreboard 側の phase === 'quarterEnd' ガード1本
        // だけで、型は素通しだった。GameAction を判別可能ユニオンにした際に
        // コンパイラが検出したので、はじめから正しい値を書く
        quartersPlayed: p.quartersPlayed.map((played, i) =>
          i === currentQuarter - 1 ? (startingPlayerIds.includes(p.id) ? 'starter' : played) : played
        ),
      })),
    });

    dispatch({
      type: 'SET_TEAMS',
      payload: {
        teamA: updatePlayers(state.teamA, selected.teamA),
        teamB: updatePlayers(state.teamB, selected.teamB),
      },
    });

    setScreen('game');
    // phase が 'setup' または 'quarterEnd' の場合、START_GAME を呼び出して playing に遷移
    if (phase === 'setup' || phase === 'quarterEnd') {
      dispatch({ type: 'START_GAME' });
    }
  };

  // クォーター終了時にスタメン選択へ
  const handleQuarterEnd = useCallback(() => {
    if (currentQuarter >= 4) {
      const scoreA = state.teamA.players.reduce((sum, p) => sum + p.stats.points, 0);
      const scoreB = state.teamB.players.reduce((sum, p) => sum + p.stats.points, 0);
      setEndGameConfirmType(scoreA === scoreB ? 'tied' : 'notTied');
      return;
    }
    dispatch({ type: 'END_QUARTER' });
    setScreen('quarterLineup');
  }, [currentQuarter, dispatch, setScreen, state.teamA, state.teamB]);

  const handleEndGameConfirm = useCallback(() => {
    setEndGameConfirmType(null);
    if (endGameConfirmType === 'tied') {
      dispatch({ type: 'END_GAME' });
    } else {
      dispatch({ type: 'END_QUARTER' });
    }
  }, [dispatch, endGameConfirmType]);

  const handleEndGameToOT = useCallback(() => {
    setEndGameConfirmType(null);
    dispatch({ type: 'END_QUARTER' });
    setScreen('quarterLineup');
  }, [dispatch, setScreen]);




  /**
   * 試合終了・保存してホームへ。
   *
   * 保存できたときだけセッションを消す。以前は成否を見ずに消していたため、
   * 容量超過などで履歴に書けないと、履歴にもセッションにも残らない試合が
   * できていた。トーストは「設定画面からバックアップを」と案内するが、
   * その時点で対象データはもう存在しない、という状態だった。
   */
  const handleGameFinished = (options?: { skipPendingCheck?: boolean }) => {
    // 保留中の記録はどの選手のスタッツにも入っていない＝最終スコアに現れない。
    // 黙って保存すると実際の試合と違うスコアが履歴に残るので、必ず一度知らせる。
    // （それでも保存を選べる。試合後に急いでいる場面で詰ませない）
    if (!options?.skipPendingCheck && pendingActions.length > 0) {
      setShowPendingWarning(true);
      return;
    }

    const { saved } = saveGameResult(
      gameName,
      state.teamA,
      state.teamB,
      state.scoreHistory,
      state.statHistory,
      state.foulHistory,
      new Date(date),
      state.gameInfo,
      state.pendingActions,
      {
        showThreePoint: state.showThreePoint,
        quarterMinutes: state.quarterMinutes,
        // 公式様式の終了時間。gameInfo とは別フィールドなので明示的に渡す
        endTime: state.endTime,
      }
    );

    if (!saved) {
      // 記録は state と中断セッションの両方に残したまま、復旧手段を出す
      setShowSaveFailed(true);
      return;
    }

    clearGameSession();
    // 音声メモは手入力のための下書きなので、試合が終われば役目は終わり
    voiceMemo.clearAll();
    setScreen('home');

    // 前回バックアップ後に試合が増えていれば督促
    if (isBackupDue()) {
      setShowBackupPrompt(true);
    }
  };

  // ホーム画面に戻る。
  // 試合中のホームボタンからも呼ばれる「中断」の導線なので、
  // ここでセッションを消してはいけない（破棄は handleDiscardGame）
  const handleBackToHome = () => {
    // 設定を諦めてホームへ抜けた。次の「新規試合開始」は最初から
    clearSetupDraft();
    setScreen('home');
  };

  /**
   * 試合データを保存せずに破棄してホームへ。
   *
   * 確認ダイアログが「※この操作は取り消せません」と言う以上、中断セッションも
   * 消す。以前は画面を戻すだけだったため、破棄したはずの試合がホームの
   * 「試合を再開」から復活し、文言と挙動が食い違っていた。
   */
  const handleDiscardGame = () => {
    clearGameSession();
    // 音声メモは手入力のための下書きなので、試合が終われば役目は終わり
    voiceMemo.clearAll();
    setScreen('home');
  };

  // 試合を再開
  const handleResumeGame = () => {
    const session = loadGameSession();
    if (session) {
      dispatch({ type: 'RESTORE_GAME', payload: { game: session.game } });
      setGameName(session.gameName);
      setDate(session.date);
      setScreen('game');
    }
  };

  // 新規試合開始（進行中セッションがあれば上書き警告を挟む）
  const handleStartNewGame = () => {
    // 新規はいつでも最初から。前の試合の設定の残りを引きずらせない
    clearSetupDraft();
    if (hasGameSession()) {
      setShowNewGameWarning(true);
    } else {
      setScreen('gameSetup');
    }
  };

  // スコア履歴から削除
  const handleRemoveScore = (entryId: string) => {
    dispatch({ type: 'REMOVE_SCORE', payload: { entryId } });
  };

  // 統計履歴から削除
  const handleRemoveStat = (entryId: string) => {
    dispatch({ type: 'REMOVE_STAT', payload: { entryId } });
  };

  // ファウル履歴から削除
  const handleRemoveFoul = (entryId: string) => {
    dispatch({ type: 'REMOVE_FOUL', payload: { entryId } });
  };

  // スコア編集
  const handleEditScore = (entryId: string, newPlayerId: string, newScoreType: ScoreType) => {
    dispatch({ type: 'EDIT_SCORE', payload: { entryId, newPlayerId, newScoreType } });
  };

  // スタッツ編集
  const handleEditStat = (entryId: string, newPlayerId: string, newStatType: StatType) => {
    dispatch({ type: 'EDIT_STAT', payload: { entryId, newPlayerId, newStatType } });
  };

  // ファウルの選手付け替え（種別・FTは動かさない。理由は handleEditFoul）
  const handleEditFoul = (entryId: string, newPlayerId: string) => {
    dispatch({ type: 'EDIT_FOUL', payload: { entryId, newPlayerId } });
  };

  // FTの成否の訂正（本数と種別は変えない。理由は handleEditFoulFreeThrows）
  const handleEditFoulFreeThrows = (entryId: string, freeThrowResults: FreeThrowResult[]) => {
    dispatch({ type: 'EDIT_FOUL_FREE_THROWS', payload: { entryId, freeThrowResults } });
  };

  // 成功 → ミス変換（選手の付け替えを伴うことがある）
  const handleConvertScoreToMiss = (entryId: string, newMissType: '2PA' | '3PA' | 'FTA', newPlayerId: string) => {
    dispatch({ type: 'CONVERT_SCORE_TO_MISS', payload: { entryId, newMissType, newPlayerId } });
  };

  // ミス → 成功変換（選手の付け替えを伴うことがある）
  const handleConvertMissToScore = (entryId: string, newScoreType: '2P' | '3P' | 'FT', newPlayerId: string) => {
    dispatch({ type: 'CONVERT_MISS_TO_SCORE', payload: { entryId, newScoreType, newPlayerId } });
  };

  // オウンゴールトグル
  const handleToggleOwnGoal = (entryId: string) => {
    dispatch({ type: 'TOGGLE_OWN_GOAL', payload: { entryId } });
  };

  // ActionHistory共通ハンドラ
  const actionHistoryHandlers = {
    onRemoveScore: handleRemoveScore,
    onRemoveStat: handleRemoveStat,
    onRemoveFoul: handleRemoveFoul,
    onEditScore: handleEditScore,
    onEditStat: handleEditStat,
    onEditFoul: handleEditFoul,
    onEditFoulFreeThrows: handleEditFoulFreeThrows,
    onConvertScoreToMiss: handleConvertScoreToMiss,
    onConvertMissToScore: handleConvertMissToScore,
    onToggleOwnGoal: handleToggleOwnGoal,
  };

  // フルスクリーン制御
  const { isFullScreen, toggleFullScreen } = useFullscreen();

  // ゲームモード（フル/シンプル） - アプリ設定の既定値・画面幅・手動切り替えを束ねて管理
  const { gameMode, toggleGameMode } = useGameMode();

  // 履歴ポップアップ（シンプルモード用）
  const [showHistoryPopup, setShowHistoryPopup] = useState(false);

  // 音声メモ。フルモードのみ。シンプルモードは入力項目が少なく、記録に迷う場面が少ない
  const voiceMemo = useVoiceMemo({ quarter: currentQuarter, enabled: gameMode === 'full' });
  const [showVoiceMemos, setShowVoiceMemos] = useState(false);
  const [showVoiceMemoStrip, setShowVoiceMemoStrip] = useState(false);
  // 「済にする」の取り消し猶予。得点・スタッツ用の undoInfo とは別枠にする。
  // 共用すると、メモを済にした瞬間に得点の取り消しが消えてしまう
  const [voiceMemoUndo, setVoiceMemoUndo] = useState<VoiceMemo | null>(null);

  /** 済にする＝一覧から消す。数秒だけ戻せるように、消したメモを控えておく */
  const handleVoiceMemoDone = (id: string) => {
    const target = voiceMemo.memos.find(m => m.id === id);
    voiceMemo.removeMemoById(id);
    setVoiceMemoUndo(target ?? null);
  };

  const handleVoiceMemoUndo = () => {
    if (voiceMemoUndo) voiceMemo.restoreMemo(voiceMemoUndo);
    setVoiceMemoUndo(null);
  };

  // 猶予切れ。UndoSnackbar の既定値に合わせて5秒
  useEffect(() => {
    if (!voiceMemoUndo) return;
    const timer = setTimeout(() => setVoiceMemoUndo(null), 5000);
    return () => clearTimeout(timer);
  }, [voiceMemoUndo]);

  // 復元・バックアップ督促は画面を占有する確認なので、設定より前に単独で出す
  if (restoreCandidate) {
    return (
      <RestorePrompt
        snapshot={restoreCandidate}
        onDismiss={() => {
          sessionStorage.setItem('mbc-restore-dismissed', '1');
          setRestoreCandidate(null);
          saveSnapshot();
        }}
      />
    );
  }

  if (showBackupPrompt) {
    return (
      <BackupPrompt
        // 保存できたときだけ閉じる。失敗を握って閉じると、バックアップが
        // 無いまま「保存した」と思わせることになる（BackupPrompt 側で通知する）
        onBackup={async () => {
          const saved = await shareBackup();
          if (saved) setShowBackupPrompt(false);
          return saved;
        }}
        onDismiss={() => setShowBackupPrompt(false)}
      />
    );
  }

  /**
   * 現在の画面を描画する。
   *
   * 早期returnの外側にアプリ設定を置くためにここで束ねている。
   * 以前は設定モーダルをホーム画面の分岐内にだけ描画していたため、
   * 保存失敗のトーストが「設定画面からバックアップを保存してください」と
   * 案内しても、記録中は開く手段が無かった。
   */
  const renderScreen = () => {
  if (screen === 'home') {
    return (
      <>
        <Home
          onStartGame={handleStartNewGame}
          onManageTeams={() => setScreen('myTeamManager')}
          onViewHistory={() => setScreen('history')}
          onManageOpponents={() => setScreen('opponentManager')}
          onViewPlayerStats={() => setScreen('playerStats')}
          onResumeGame={handleResumeGame}
          onOpenSettings={() => setShowAppSettings(true)}
          isFullScreen={isFullScreen}
          onToggleFullScreen={toggleFullScreen}
        />
        {/* 進行中セッションがある状態での新規開始警告 */}
        {showNewGameWarning && (
          <Modal
            onClose={() => setShowNewGameWarning(false)}
            contentClassName="modal-content end-game-confirm-modal"
            closeOnOverlayClick={false}
            labelledBy="new-game-warning-title"
          >
            <h3 id="new-game-warning-title">進行中の試合があります</h3>
            <p className="end-game-confirm-message">
              新しい試合を開始して記録を始めると、<br />
              進行中の試合データは削除されます。
            </p>
            <div className="modal-actions-column">
              <button
                className="btn btn-primary btn-large"
                onClick={() => { setShowNewGameWarning(false); handleResumeGame(); }}
              >
                試合を再開する
              </button>
              <button
                className="btn btn-danger btn-large"
                onClick={() => { setShowNewGameWarning(false); clearSetupDraft(); setScreen('gameSetup'); }}
              >
                新規試合を開始
              </button>
              <button className="btn btn-secondary btn-large" data-autofocus onClick={() => setShowNewGameWarning(false)}>
                キャンセル
              </button>
            </div>
          </Modal>
        )}
      </>
    );
  }

  // マイチーム管理画面
  if (screen === 'myTeamManager') {
    return (
      <MyTeamManager
        onBack={handleBackToHome}
        backLabel="ホーム"
      />
    );
  }

  // 対戦チーム管理画面
  if (screen === 'opponentManager') {
    return <OpponentManager onBack={handleBackToHome} />;
  }

  // 試合設定画面
  if (screen === 'gameSetup') {
    return (
      <GameSetup
        onComplete={handleGameSetupComplete}
        onBack={handleBackToHome}
        initialDraft={setupDraft}
        onDraftChange={setSetupDraft}
      />
    );
  }

  // 履歴画面
  if (screen === 'history') {
    return <History onBack={handleBackToHome} />;
  }

  // 選手スタッツ分析画面
  if (screen === 'playerStats') {
    return <PlayerStatsAnalysis onBack={handleBackToHome} />;
  }

  // スコアシート画面
  if (screen === 'scoresheet') {
    return (
      <RunningScoresheet
        game={state}
        gameName={gameName}
        date={date}
        onClose={() => setScreen('game')}
        onUpdateGameInfo={(gameInfo) => dispatch({ type: 'UPDATE_GAME_INFO', payload: gameInfo })}
        onEndTimeChange={(endTime) => dispatch({ type: 'SET_END_TIME', payload: { endTime } })}
      />
    );
  }

  // クォーターごとのスタメン選択画面
  if (screen === 'quarterLineup') {
    return (
      <QuarterLineup
        quarter={currentQuarter}
        teamA={state.teamA}
        teamB={state.teamB}
        initialTab={lineupTab}
        onTabChange={setLineupTab}
        onStart={handleLineupStart}
        // 名簿から漏れた選手をこの画面で登録する。
        // 交代モーダルの「+ 選手を追加」と同じ action を使うので、
        // 背番号順への並べ替えも様式あふれの扱いも1か所のまま
        onAddPlayers={(teamId, added) => {
          added.forEach(p =>
            dispatch({ type: 'ADD_PLAYER_TO_TEAM', payload: { teamId, number: p.number, name: p.name } }),
          );
        }}
        // 戻る先: 試合前なら設定へ・試合中ならゲーム画面へ（Q終了の取り消しが可能）
        onBack={phase === 'setup' ? () => setScreen('gameSetup') : () => setScreen('game')}
      />
    );
  }

  // 旧セットアップ画面（フォールバック）




  // ゲーム画面
  return (
    <div className={`app-container game-mode-${gameMode}`} onContextMenu={(e) => e.preventDefault()}>
      {/* ヘッダー */}
      <header className="app-header">
        <div className="header-left">
          <button className="btn btn-secondary btn-small" onClick={handleBackToHome} aria-label="ホームへ戻る">
            🏠
          </button>
          <button
            className="btn btn-secondary btn-small"
            onClick={toggleFullScreen}
            style={{ marginLeft: '8px' }}
            aria-label={isFullScreen ? '全画面を解除' : '全画面表示'}
          >
            {isFullScreen ? '⊟' : '⊞'}<span className="btn-label">{isFullScreen ? '縮小' : '全画面'}</span>
          </button>
          <button
            className={`btn btn-small ${gameMode === 'simple' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={toggleGameMode}
            style={{ marginLeft: '8px' }}
            aria-label={gameMode === 'full' ? 'シンプルモードに切り替え' : 'フルモードに切り替え'}
          >
            {gameMode === 'full' ? '📱' : '💻'}<span className="btn-label">{gameMode === 'full' ? ' シンプル' : ' フル'}</span>
          </button>
        </div>
        <div className="header-center">
          {/* 音声入力機能は一時的に非表示 */}
          {/* {gameMode === 'full' && <VoiceInput onCommand={handleVoiceCommand} />} */}
          {voiceMemo.isFeatureEnabled && (
            <>
              <VoiceMemoButton
                isRecording={voiceMemo.isRecording}
                isOffline={voiceMemo.isOffline}
                onStart={voiceMemo.startRecording}
                onStop={voiceMemo.stopRecording}
              />
              <button
                className="btn btn-secondary btn-small"
                onClick={() => setShowVoiceMemoStrip(v => !v)}
                style={{ marginLeft: '8px' }}
                aria-label={`音声メモを開く（${voiceMemo.memos.length}件）`}
                aria-pressed={showVoiceMemoStrip}
              >
                📝<span className="btn-label"> メモ</span>
                {voiceMemo.memos.length > 0 && ` ${voiceMemo.memos.length}`}
              </button>
            </>
          )}
        </div>
        <div className="header-right">
          {/* 履歴ボタン（シンプルモード、またはタブレット以上で表示） */}
          <button
            className={`btn ${showHistoryPopup ? 'btn-primary' : 'btn-secondary'} btn-small history-popup-btn`}
            onClick={() => setShowHistoryPopup(!showHistoryPopup)}
            style={{ marginRight: '8px' }}
            aria-label="アクション履歴"
          >
            📜<span className="btn-label"> 履歴</span>
          </button>
          {/* スコアシートボタン（両モード共通） */}
          <button
            className="btn btn-secondary btn-small"
            onClick={() => setScreen('scoresheet')}
            style={{ marginRight: '8px' }}
            aria-label="スコアシート"
          >
            📄<span className="btn-label"> スコアシート</span>
          </button>
          {/* フルモード用: 統計 */}
          {gameMode === 'full' && (
            <button
              className={`btn ${showStats ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowStats(!showStats)}
              aria-label="チーム統計"
            >
              📊<span className="btn-label"> 統計</span>
            </button>
          )}
          {/* 試合オプション（3P設定などの途中変更） */}
          <button
            className="btn btn-secondary btn-small"
            onClick={() => setShowGameOptions(true)}
            style={{ marginLeft: '8px' }}
            aria-label="試合オプション"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="app-main">
        {showStats ? (
          <div className="stats-view">
            {/*
              試合中は選手別を先に出す。この画面を試合中に開く目的はほぼ
              「誰が何ファウル目か」の確認で、時間に追われている場面になる。
              チーム比較を上に置いていたときは、その高さ（実測1227px）を
              スクロールし切らないと選手別に届かず、スマホでは画面外だった。

              履歴の詳細は逆にチーム比較が先。あちらは振り返るための画面で、
              先に要る情報が違う（History.tsx）。

              statHistory は「不明で記録」した分を合計に含めるために渡す
            */}
            <StatsPanel players={state.teamA.players} teamName={state.teamA.name} teamId="teamA" statHistory={state.statHistory} />
            <StatsPanel players={state.teamB.players} teamName={state.teamB.name} teamId="teamB" statHistory={state.statHistory} />

            <TeamComparison
              teamA={state.teamA}
              teamB={state.teamB}
              scoreHistory={state.scoreHistory}
              statHistory={state.statHistory}
              foulHistory={state.foulHistory}
              showThreePoint={state.showThreePoint}
            />
          </div>
        ) : (
          <>
            {/* 3列メインエリア: Team A | Center (Scoreboard + Actions) | Team B */}
            {/* action-pending: アクション先行選択中は選手カードを強調表示 */}
            <div className={`game-main-area ${gameMode === 'simple' ? 'simple-mode' : 'full-mode'} ${pendingAction ? 'action-pending' : ''}`}>
              {/* Left: Team A */}
              {/* disabled: 試合終了後はアクションボタンと同じ条件で選手カードも止める */}
              <TeamPanel
                teamId="teamA"
                teamName={state.teamA.name}
                teamColor={state.teamA.color}
                players={state.teamA.players}
                isActive={selectedTeamId === 'teamA'}
                selectedPlayerId={selectedPlayerId}
                gameMode={gameMode}
                disabled={phase === 'finished'}
                scoreHistory={state.scoreHistory}
                statHistory={state.statHistory}
                foulHistory={state.foulHistory}
                showThreePoint={state.showThreePoint}
                onPlayerSelect={handlePlayerSelect}
                onSubstitute={() => { setSubstitutionTeamId('teamA'); setShowSubstitutionModal(true); }}
                onCoachFoul={() => handleCoachFoul('teamA')}
                actionHistoryHandlers={actionHistoryHandlers}
                teamFouls={state.teamA.teamFouls[currentQuarter - 1] || 0}
                timeoutUsed={timeoutUsedFor(state.teamA)}
                timeoutQuarterLabel={timeoutQuarterLabel}
                pendingSlot={renderPendingSlot('teamA')}
                onTimeoutRequest={phase === 'playing' ? () => setTimeoutModalTeam('teamA') : undefined}
                onTimeoutCancel={() => setTimeoutCancelTeam('teamA')}
              />

              {/* Center: Scoreboard + Action Buttons */}
              <div className="center-column">
                {/* 音声メモの帯。position: absolute でスコアボードに重なるので、
                    入力ボタンの位置は動かない。描画条件に猶予中を含めているのは、
                    最後の1件を済にした瞬間に帯ごと消えて「元に戻す」が出せなくなるため */}
                {voiceMemo.isFeatureEnabled && showVoiceMemoStrip &&
                  (voiceMemo.memos.length > 0 || voiceMemoUndo) && (
                  <VoiceMemoStrip
                    memo={voiceMemo.memos[0] ?? voiceMemoUndo!}
                    total={voiceMemo.memos.length}
                    position={1}
                    canRetry={voiceMemo.memos[0] ? voiceMemo.canRetry(voiceMemo.memos[0].id) : false}
                    onRetry={voiceMemo.retryMemo}
                    onDone={handleVoiceMemoDone}
                    undoMemo={voiceMemoUndo}
                    onUndo={handleVoiceMemoUndo}
                    onCollapse={() => {
                      // たたむと猶予は破棄する（戻せなくなる）
                      setVoiceMemoUndo(null);
                      setShowVoiceMemoStrip(false);
                    }}
                    onOpenList={() => setShowVoiceMemos(true)}
                  />
                )}

                {/* スコアボード */}
                <div className="scoreboard-section">
                  <Scoreboard
                    onQuarterEnd={handleQuarterEnd}
                    onOpenLineup={() => setScreen('quarterLineup')}
                  />
                </div>

                {/* アクションボタン */}
                <div className={`center-actions-area ${pendingAction ? 'active' : ''}`}>
                  <ActionButtons
                    onScore={handleScore}
                    onStat={handleStat}
                    onMiss={handleMiss}
                    onFoul={handleShowFoulSelector}
                    disabled={phase === 'finished'}
                    hasSelection={!!selectedPlayerId}
                    activeAction={pendingAction}
                    activeActionLabel={pendingAction
                      ? actionLabel(pendingAction.type, pendingAction.value ?? '')
                      : null}
                    gameMode={gameMode}
                    showThreePoint={state.showThreePoint}
                    onHoldPending={() => setShowTeamSelector(true)}
                    onCancelAction={() => setPendingAction(null)}
                    idleNotice={phase === 'quarterEnd'
                      ? `⚠ 今の記録は ${quarterLabel(currentQuarter)} として保存されます`
                      : null}
                  />
                </div>
              </div>

              {/* Right: Team B */}
              {/* disabled: 試合終了後はアクションボタンと同じ条件で選手カードも止める */}
              <TeamPanel
                teamId="teamB"
                teamName={state.teamB.name}
                teamColor={state.teamB.color}
                players={state.teamB.players}
                isActive={selectedTeamId === 'teamB'}
                selectedPlayerId={selectedPlayerId}
                gameMode={gameMode}
                disabled={phase === 'finished'}
                scoreHistory={state.scoreHistory}
                statHistory={state.statHistory}
                foulHistory={state.foulHistory}
                showThreePoint={state.showThreePoint}
                onPlayerSelect={handlePlayerSelect}
                onSubstitute={() => { setSubstitutionTeamId('teamB'); setShowSubstitutionModal(true); }}
                onCoachFoul={() => handleCoachFoul('teamB')}
                actionHistoryHandlers={actionHistoryHandlers}
                teamFouls={state.teamB.teamFouls[currentQuarter - 1] || 0}
                timeoutUsed={timeoutUsedFor(state.teamB)}
                timeoutQuarterLabel={timeoutQuarterLabel}
                pendingSlot={renderPendingSlot('teamB')}
                onTimeoutRequest={phase === 'playing' ? () => setTimeoutModalTeam('teamB') : undefined}
                onTimeoutCancel={() => setTimeoutCancelTeam('teamB')}
              />
            </div>
          </>
        )}
      </main>

      {/* ファウル種類選択モーダル */}
      {showFoulSelector && (() => {
        const selectedPlayer = selectedPlayerId
          ? [...state.teamA.players, ...state.teamB.players].find(p => p.id === selectedPlayerId)
          : null;

        // 保留アクション解決時もFoulInputFlowを使用（FT入力対応）
        if (resolvingFoulPending) {
          const foulingTeamId = resolvingFoulPending.teamId as 'teamA' | 'teamB';
          const foulingTeam = foulingTeamId === 'teamA' ? state.teamA : state.teamB;
          const opponentTeam = foulingTeamId === 'teamA' ? state.teamB : state.teamA;
          const opponentTeamIdForPending = foulingTeamId === 'teamA' ? 'teamB' : 'teamA';
          const foulingPlayer = foulingTeam.players.find(p => p.id === resolvingFoulPending.playerId);
          const pendingAction = pendingActions.find(p => p.id === resolvingFoulPending.pendingActionId);
          const teamFoulsForPending = foulingTeam.teamFouls[(pendingAction?.quarter || currentQuarter) - 1] || 0;

          return (
            <FoulInputFlow
              onComplete={handleFoulWithFreeThrows}
              onCancel={() => {
                setShowFoulSelector(false);
                setResolvingFoulPending(null);
              }}
              hasSelectedPlayer={true}
              currentFoulCount={foulingPlayer?.fouls.length || 0}
              currentFouls={foulingPlayer?.fouls}
              playerName={foulingPlayer?.name}
              playerNumber={foulingPlayer?.number}
              teamFouls={teamFoulsForPending}
              opponentTeamId={opponentTeamIdForPending}
              opponentPlayers={opponentTeam.players}
              opponentTeamName={opponentTeam.name}
              showThreePoint={state.showThreePoint}
            />
          );
        }

        // 通常時はFoulInputFlow（FT入力付き）を使用
        const foulingTeam = selectedTeamId === 'teamA' ? state.teamA : state.teamB;
        const opponentTeam = selectedTeamId === 'teamA' ? state.teamB : state.teamA;
        const opponentTeamId = selectedTeamId === 'teamA' ? 'teamB' : 'teamA';
        const teamFouls = foulingTeam.teamFouls[currentQuarter - 1] || 0;

        return (
          <FoulInputFlow
            onComplete={handleFoulWithFreeThrows}
            onCancel={() => {
              setShowFoulSelector(false);
              dispatch({ type: 'CLEAR_SELECTION' });
            }}
            hasSelectedPlayer={!!selectedPlayerId}
            currentFoulCount={selectedPlayer?.fouls.length || 0}
            currentFouls={selectedPlayer?.fouls}
            playerName={selectedPlayer?.name}
            playerNumber={selectedPlayer?.number}
            teamFouls={teamFouls}
            opponentTeamId={opponentTeamId}
            opponentPlayers={opponentTeam.players}
            opponentTeamName={opponentTeam.name}
            showThreePoint={state.showThreePoint}
            interruptTeams={interruptTeams}
            onRequestTimeout={phase === 'playing' ? setTimeoutModalTeam : undefined}
            onRequestSubstitution={handleRequestSubstitution}
          />
        );
      })()}

      {/* チーム選択モーダル（保留アクション作成用・「選手がわからない」から明示的に開く） */}
      {showTeamSelector && pendingAction && (
        <Modal
          onClose={() => setShowTeamSelector(false)}
          overlayClassName="team-selector-overlay"
          contentClassName="team-selector-modal"
          labelledBy="team-selector-title"
        >
          <h3 id="team-selector-title">どちらのチームですか？</h3>
            <p className="team-selector-action">
              {actionLabel(pendingAction.type, pendingAction.value ?? '')}
              を保留として記録し、あとから選手を割り当てられます
            </p>
            <div className="team-selector-buttons">
              <button
                className={`team-select-btn team-a color-${state.teamA.color}`}
                onClick={() => handleTeamSelectForPending('teamA')}
              >
                <span className="team-name">{state.teamA.name}</span>
                <span className="team-color">{state.teamA.color === 'white' ? '白' : '青'}</span>
              </button>
              <button
                className={`team-select-btn team-b color-${state.teamB.color}`}
                onClick={() => handleTeamSelectForPending('teamB')}
              >
                <span className="team-name">{state.teamB.name}</span>
                <span className="team-color">{state.teamB.color === 'white' ? '白' : '青'}</span>
              </button>
            </div>
          <button
            className="btn btn-secondary"
            onClick={() => setShowTeamSelector(false)}
          >
            戻る
          </button>
        </Modal>
      )}

      {/* 保留アクションはチームパネルのヘッダーへ置く（renderPendingSlot） */}

      {/* 試合終了確認モーダル */}
      {endGameConfirmType && (
        <Modal
          onClose={() => setEndGameConfirmType(null)}
          contentClassName="modal-content end-game-confirm-modal"
          closeOnOverlayClick={false}
          labelledBy="end-game-confirm-title"
        >
          <h3 id="end-game-confirm-title">試合終了の確認</h3>
          {/* 同点で終えたときだけ「延長戦へ」が増える。なぜ選択肢が変わったのかを
              本文が言わないと、押し間違いに見える。先頭に理由を置く */}
          {endGameConfirmType === 'tied' && (
            <p className="end-game-confirm-tied">
              同点で終了しました。延長戦を行いますか？
            </p>
          )}
          {/*
            以前は「データの編集ができません」と言っていたが、終了後もアクション履歴
            からの訂正・削除は残してある（記録し終えてから気づく取り違えを、履歴を
            消さずに直せる唯一の手段のため）。言い切ってしまうと、直せるのに
            諦めさせる。止まるのは新しい記録の追加だけなので、そのとおりに書く。
            残る手段も添える —— そこが分からないと、終了を押すこと自体をためらう
          */}
          <p className="end-game-confirm-message">
            試合を終了すると、新しい記録の追加はできません。<br />
            <span className="end-game-confirm-note">
              （アクション履歴からの訂正・削除は続けられます）
            </span><br />
            試合を終了しますか？
          </p>
          <div className="modal-actions-column">
            {endGameConfirmType === 'tied' && (
              <button className="btn btn-primary btn-large" onClick={handleEndGameToOT}>
                延長戦へ
              </button>
            )}
            <button className="btn btn-danger btn-large" onClick={handleEndGameConfirm}>
              試合を終了する
            </button>
            <button className="btn btn-secondary btn-large" data-autofocus onClick={() => setEndGameConfirmType(null)}>
              戻る
            </button>
          </div>
        </Modal>
      )}

      {showVoiceMemos && (
        <VoiceMemoPanel
          memos={voiceMemo.memos}
          onClose={() => setShowVoiceMemos(false)}
          onRetry={voiceMemo.retryMemo}
          canRetry={voiceMemo.canRetry}
          onRemove={voiceMemo.removeMemoById}
        />
      )}

      {/* 試合終了表示 */}
      {phase === 'finished' && (
        <div className="game-finished-overlay">
          <div className="game-finished-content">
            <h2>試合終了</h2>
            <div className="final-score">
              <span>{state.teamA.name}</span>
              <span className="final-score-value">
                {state.teamA.players.reduce((sum, p) => sum + p.stats.points, 0)}
              </span>
              <span>-</span>
              <span className="final-score-value">
                {state.teamB.players.reduce((sum, p) => sum + p.stats.points, 0)}
              </span>
              <span>{state.teamB.name}</span>
            </div>
            <div className="game-finished-actions">
              <button className="btn btn-primary btn-large game-finished-btn" onClick={() => handleGameFinished()}>
                保存して終了
              </button>
              <button
                className="btn btn-danger btn-large game-finished-btn"
                onClick={() => setShowDiscardConfirm(true)}
              >
                保存せずにホームへ
              </button>
            </div>
          </div>
        </div>
      )}

      {/*
        未割り当ての記録を残したまま終了しようとしたときの確認。
        保留中の得点はどの選手のスタッツにも入っていない＝最終スコアに出ないため、
        気づかず保存すると実際の試合と違うスコアが履歴に残る。
        保留パネルは試合終了オーバーレイより手前(z-index)に浮いているので、
        この確認を閉じればその場で割り当てられる。
      */}
      {showPendingWarning && (
        <Modal
          onClose={() => setShowPendingWarning(false)}
          contentClassName="modal-content end-game-confirm-modal"
          closeOnOverlayClick={false}
          labelledBy="pending-warning-title"
        >
          <h3 id="pending-warning-title">未割り当ての記録があります</h3>
          <p className="end-game-confirm-message">
            選手が決まっていない記録が<strong>{pendingActions.length}件</strong>残っています。<br />
            このまま保存すると、最終スコアに反映されません。<br />
            画面下の保留パネルから割り当ててください。
          </p>
          <div className="modal-actions-column">
            <button
              className="btn btn-primary btn-large"
              data-autofocus
              onClick={() => setShowPendingWarning(false)}
            >
              戻って割り当てる
            </button>
            <button
              className="btn btn-danger btn-large"
              onClick={() => { setShowPendingWarning(false); handleGameFinished({ skipPendingCheck: true }); }}
            >
              このまま保存
            </button>
          </div>
        </Modal>
      )}

      {/* 保存せず破棄の確認モーダル */}
      {showDiscardConfirm && (
        <Modal
          onClose={() => setShowDiscardConfirm(false)}
          contentClassName="modal-content end-game-confirm-modal"
          closeOnOverlayClick={false}
          labelledBy="discard-confirm-title"
        >
          <h3 id="discard-confirm-title">確認</h3>
          <p className="end-game-confirm-message">
            試合データを保存せずにホームへ戻りますか？<br />
            ※この操作は取り消せません
          </p>
          <div className="modal-actions-column">
            <button
              className="btn btn-danger btn-large"
              onClick={() => { setShowDiscardConfirm(false); handleDiscardGame(); }}
            >
              保存せずに戻る
            </button>
            <button className="btn btn-secondary btn-large" data-autofocus onClick={() => setShowDiscardConfirm(false)}>
              キャンセル
            </button>
          </div>
        </Modal>
      )}
      {/*
        試合結果の保存に失敗したときの復旧導線。
        記録はまだ state と中断セッションに残っているので、閉じても失われない。
        端末の空きが原因なので、その場でバックアップを取り出せる出口を必ず置く
        （設定画面まで辿らせない）。
      */}
      {showSaveFailed && (
        <Modal
          onClose={() => setShowSaveFailed(false)}
          contentClassName="modal-content end-game-confirm-modal"
          closeOnOverlayClick={false}
          labelledBy="save-failed-title"
        >
          <h3 id="save-failed-title">試合を保存できませんでした</h3>
          <p className="end-game-confirm-message">
            端末の空き容量が足りない可能性があります。<br />
            <strong>この試合の記録はまだ残っています。</strong><br />
            バックアップを取り出すか、空き容量を作ってからもう一度保存してください。
          </p>
          <div className="modal-actions-column">
            <button
              className="btn btn-primary btn-large"
              disabled={isBackingUp}
              onClick={async () => {
                setIsBackingUp(true);
                const ok = await shareBackup();
                setIsBackingUp(false);
                showToast(
                  ok ? 'バックアップを保存しました' : 'バックアップに失敗しました',
                  ok ? 'success' : 'error',
                );
              }}
            >
              {isBackingUp ? '保存中…' : '💾 バックアップを保存'}
            </button>
            {/* 保留の確認は保存を試す前に済んでいるので、再試行では挟まない */}
            <button
              className="btn btn-secondary btn-large"
              onClick={() => { setShowSaveFailed(false); handleGameFinished({ skipPendingCheck: true }); }}
            >
              もう一度保存する
            </button>
            <button
              className="btn btn-secondary btn-large"
              data-autofocus
              onClick={() => setShowSaveFailed(false)}
            >
              閉じる
            </button>
          </div>
        </Modal>
      )}

      {/* ベンチファウル選択モーダル - Step 1: 種類選択 */}
      {coachFoulState && coachFoulState.step === 'type' && (
        <Modal
          onClose={handleCoachFoulCancel}
          contentClassName="modal-content coach-foul-modal"
          labelledBy="coach-foul-type-title"
        >
          <h3 id="coach-foul-type-title">ベンチファウル種類</h3>
          <div className="modal-actions-column">
            <button className="btn btn-danger btn-large" onClick={() => handleCoachFoulTypeSelect('HC')}>
              コーチ (C)
              <span className="btn-desc">監督本人のテクニカル</span>
            </button>
            <button className="btn btn-danger btn-large" onClick={() => handleCoachFoulTypeSelect('AC')}>
              A.コーチ (C)
              <span className="btn-desc">A.コーチのテクニカル → コーチにもB</span>
            </button>
            <button className="btn btn-warning btn-large" onClick={() => handleCoachFoulTypeSelect('Sub')}>
              交代要員 (T)
              <span className="btn-desc">ベンチ選手のテクニカル → コーチにもB</span>
            </button>
            <button className="btn btn-warning btn-large" onClick={() => handleCoachFoulTypeSelect('Bench')}>
              ベンチ関係者 (B)
              <span className="btn-desc">引率者等のテクニカル → コーチにB</span>
            </button>
          </div>
          <button className="btn btn-secondary" onClick={handleCoachFoulCancel}>
            キャンセル
          </button>
        </Modal>
      )}

      {/* ベンチファウル - Step 1.5: 交代要員（ベンチ選手）選択 */}
      {coachFoulState && coachFoulState.step === 'selectPlayer' && (() => {
        const team = coachFoulState.teamId === 'teamA' ? state.teamA : state.teamB;
        const benchPlayers = team.players.filter(p => !p.isOnCourt);
        return (
          <Modal
            onClose={handleCoachFoulCancel}
            contentClassName="modal-content substitution-modal"
            labelledBy="coach-foul-select-title"
          >
            <div className="modal-header">
              <h2 className="modal-title" id="coach-foul-select-title">交代要員を選択 - {team.name}</h2>
              <button className="modal-close" onClick={handleCoachFoulCancel} aria-label="閉じる">✕</button>
            </div>
            <p className="modal-note" style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
              選手行に「T」、コーチ行に「B」が記録されます
            </p>
            <div className="sub-player-list" style={{ maxHeight: '320px' }}>
              {benchPlayers.length > 0 ? (
                benchPlayers.map(player => (
                  <button
                    type="button"
                    key={player.id}
                    className="sub-player-card"
                    onClick={() => handleBenchPlayerSelect(player.id)}
                  >
                    <span className="sub-player-number">#{formatPlayerNumber(player.number)}</span>
                    <span className="sub-player-name">{player.courtName || player.name}</span>
                    <span className="sub-player-stats">F:{player.fouls.length}</span>
                  </button>
                ))
              ) : (
                <div className="sub-empty">ベンチに選手がいません</div>
              )}
            </div>
            {/* 交代モーダルと同じ substitution-modal を使うため、ボタンも
                同じ footer に入れる。入れないと下端の余白が無いまま
                （.substitution-modal の padding-bottom: 0）ボタンが縁に貼り付く */}
            <div className="substitution-footer">
              <div className="substitution-actions">
                <button className="btn btn-secondary btn-large" onClick={() => setCoachFoulState({ teamId: coachFoulState.teamId, step: 'type' })}>
                  戻る
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* ベンチファウル - Step 2: FoulInputFlow（シューター選択・FT結果入力） */}
      {coachFoulState && coachFoulState.step === 'foulInput' && coachFoulState.foulType && (() => {
        const opponentTeamId = coachFoulState.teamId === 'teamA' ? 'teamB' : 'teamA';
        const opponentTeam = opponentTeamId === 'teamA' ? state.teamA : state.teamB;
        return (
          <FoulInputFlow
            onComplete={handleCoachFoulComplete}
            onCancel={handleCoachFoulBack}
            hasSelectedPlayer={true}
            teamFouls={0}
            opponentTeamId={opponentTeamId}
            opponentPlayers={opponentTeam.players}
            opponentTeamName={opponentTeam.name}
            benchFoulMode={true}
            benchFoulType={coachFoulState.foulType}
            benchFoulLabel={coachFoulState.label}
            showThreePoint={state.showThreePoint}
            interruptTeams={interruptTeams}
            onRequestTimeout={phase === 'playing' ? setTimeoutModalTeam : undefined}
            onRequestSubstitution={handleRequestSubstitution}
          />
        );
      })()}

      {/* 交代モーダル。
          オーバーレイの z-index は全て 1000 で、重なり順は DOM の並びで決まる。
          ベンチファウルの FoulInputFlow より後ろに置かないと、そこから交代を
          開いたときに暗幕の下へ潜る */}
      {showSubstitutionModal && (
        <SubstitutionModal
          teamName={substitutionTeamId === 'teamA' ? state.teamA.name : state.teamB.name}
          teamId={substitutionTeamId}
          players={substitutionTeamId === 'teamA' ? state.teamA.players : state.teamB.players}
          onSubstitute={handleSubstitute}
          onAddPlayer={(number, name) => {
            dispatch({
              type: 'ADD_PLAYER_TO_TEAM',
              payload: { teamId: substitutionTeamId, number, name }
            });
          }}
          onClose={() => setShowSubstitutionModal(false)}
        />
      )}

      {/* 履歴ポップアップ（両モード共通） */}
      {showHistoryPopup && (
        <Modal
          onClose={() => setShowHistoryPopup(false)}
          overlayClassName="history-popup-overlay"
          contentClassName="history-popup-content"
          labelledBy="history-popup-title"
        >
          <div className="history-popup-header">
            <h3 id="history-popup-title">アクション履歴</h3>
            <button className="btn btn-secondary btn-small" onClick={() => setShowHistoryPopup(false)} aria-label="閉じる">
              ✕
            </button>
          </div>
          <div className="history-popup-body">
            {(['teamA', 'teamB'] as const).map(tid => {
              const team = tid === 'teamA' ? state.teamA : state.teamB;
              return (
                <div key={tid} className={`history-popup-team color-${team.color}`}>
                  <h4>{team.name}</h4>
                  <ActionHistory
                    teamId={tid}
                    teamName={team.name}
                    scoreHistory={state.scoreHistory}
                    statHistory={state.statHistory}
                    foulHistory={state.foulHistory}
                    players={team.players}
                    showThreePoint={state.showThreePoint}
                    {...actionHistoryHandlers}
                  />
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {/* 記録直後のワンタップUndo */}
      {undoInfo && phase !== 'finished' && (
        <UndoSnackbar
          recordId={undoInfo.entryId}
          message={undoInfo.message}
          onUndo={handleUndoLast}
          onDismiss={handleDismissUndo}
        />
      )}

      {/* 試合オプションモーダル（設定確認ステップで見落としてもここでリカバリ可能） */}
      {showGameOptions && (
        <Modal
          onClose={() => setShowGameOptions(false)}
          contentClassName="modal-content end-game-confirm-modal"
          labelledBy="game-options-title"
        >
          <h3 id="game-options-title">試合オプション</h3>
          <p className="end-game-confirm-message">3Pシュートの入力ボタン</p>
          <div className="modal-actions-column">
            <button
              className={`btn btn-large ${!state.showThreePoint ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => dispatch({ type: 'SET_SHOW_THREE_POINT', payload: { showThreePoint: false } })}
            >
              🚫 使わない{!state.showThreePoint ? '（現在）' : ''}
            </button>
            <button
              className={`btn btn-large ${state.showThreePoint ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => dispatch({ type: 'SET_SHOW_THREE_POINT', payload: { showThreePoint: true } })}
            >
              🎯 使う{state.showThreePoint ? '（現在）' : ''}
            </button>
          </div>
          <p className="end-game-confirm-message">クォーター時間</p>
          <div className="modal-actions-column">
            <button
              className={`btn btn-large ${state.quarterMinutes === 6 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => dispatch({ type: 'SET_QUARTER_MINUTES', payload: { quarterMinutes: 6 } })}
            >
              6分（公式）{state.quarterMinutes === 6 ? '（現在）' : ''}
            </button>
            <button
              className={`btn btn-large ${state.quarterMinutes === 5 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => dispatch({ type: 'SET_QUARTER_MINUTES', payload: { quarterMinutes: 5 } })}
            >
              5分{state.quarterMinutes === 5 ? '（現在）' : ''}
            </button>
          </div>
          {/*
            アプリ設定への入口。ヘッダーは既にボタンで埋まっているので増やさず、
            ここに置く。保存失敗のトーストが設定画面を案内するため、
            記録中にも辿り着ける経路が要る
          */}
          <p className="end-game-confirm-message">アプリ全体</p>
          <div className="modal-actions-column">
            <button
              className="btn btn-secondary btn-large"
              onClick={() => { setShowGameOptions(false); setShowAppSettings(true); }}
            >
              ⚙️ アプリ設定・バックアップ
            </button>
            <button className="btn btn-secondary btn-large" onClick={() => setShowGameOptions(false)}>
              閉じる
            </button>
          </div>
        </Modal>
      )}

      {/* TeamPanelのタイムアウトチップから開く入力モーダル（フル・シンプル共通） */}
      <TimeoutInputModal
        isOpen={timeoutModalTeam !== null}
        teamName={timeoutModalTeam === 'teamB' ? state.teamB.name : state.teamA.name}
        teamColor={timeoutModalTeam === 'teamB' ? state.teamB.color : state.teamA.color}
        currentQuarter={currentQuarter}
        quarterMinutes={state.quarterMinutes}
        onConfirm={(elapsedMinutes) => {
          if (timeoutModalTeam) handleTimeout(timeoutModalTeam, elapsedMinutes);
          setTimeoutModalTeam(null);
        }}
        onCancel={() => setTimeoutModalTeam(null)}
      />

      {/* 記録済みタイムアウトの取り消し確認 */}
      {timeoutCancelTeam && (
        <ConfirmModal
          title="タイムアウトの取り消し"
          message={`${timeoutCancelTeam === 'teamA' ? state.teamA.name : state.teamB.name} の ${quarterLabel(timeoutQuarter)} のタイムアウトを取り消します`}
          // インターバル中は終わったピリオドを取り消している。次のピリオドが
          // 始まればチップはそちらを指すので、取り消したぶんを入れ直す手段は無い。
          // 「もう一度記録できます」のままだと、やり直せると思って取り消してしまう
          note={timeoutQuarterLabel
            ? `${timeoutQuarterLabel}は終了しているため、取り消すと記録し直せません`
            : '取り消すと、このクォーターにもう一度記録できます'}
          confirmLabel="取り消す"
          onConfirm={handleTimeoutCancel}
          onCancel={() => setTimeoutCancelTeam(null)}
        />
      )}

      {/*
        交代要員のテクニカルが6個目以降になるときの確認。
        このファウルはチームファウルには加算されない（選手行にT・コーチ行にB）ので、
        FoulInputFlow 側の確認とは補足文を変える
      */}
      {benchOverflowPlayerId && coachFoulState && (() => {
        const team = coachFoulState.teamId === 'teamA' ? state.teamA : state.teamB;
        const player = team.players.find(p => p.id === benchOverflowPlayerId);
        if (!player) return null;
        return (
          <ConfirmModal
            title={`このファウルは${player.fouls.length + 1}個目です`}
            message={`#${formatPlayerNumber(player.number)} ${player.courtName || player.name} は既に${player.fouls.length}ファウルです。6個目以降は公式様式のファウル欄（5枠）に記録できません。`}
            note="コーチ行の「B」は記録されます。"
            confirmLabel="記録する"
            cancelLabel="やめる"
            onConfirm={() => { setBenchOverflowPlayerId(null); proceedBenchPlayerSelect(player); }}
            onCancel={() => setBenchOverflowPlayerId(null)}
          />
        );
      })()}
    </div>
  );
  };

  return (
    <>
      {renderScreen()}
      {/* 設定はどの画面からでも開ける（保存失敗時の案内先になるため） */}
      <AppSettingsModal
        isOpen={showAppSettings}
        onClose={() => setShowAppSettings(false)}
      />
    </>
  );
}

/**
 * アプリ更新の案内バー。
 * AppContentは画面ごとに早期returnするため、どの画面でも出せるよう
 * 固定配置の要素として兄弟に置く。
 * 更新はリロードを伴うので、作業の途中では出さずに保留し、
 * ホームや閲覧系の画面に戻ってから表示する（suppressesAppUpdate）。
 */
function AppUpdateBanner({ screen }: { screen: AppScreen }) {
  const { state } = useGame();
  const { show, apply, dismiss } = useAppUpdate(suppressesAppUpdate(screen, state.phase));

  if (!show) return null;
  return <UpdatePrompt onUpdate={apply} onDismiss={dismiss} />;
}

/**
 * 表示中の画面を持つ層。
 *
 * AppContent の中に置いていたが、更新バーは AppContent の外（早期returnの
 * 影響を受けない兄弟）に居るため、画面を知る手立てが無かった。そのせいで
 * 判定が phase だけになり、試合設定ウィザードの途中でも更新バナーが出ていた。
 */
function AppShell() {
  const [screen, setScreen] = useState<AppScreen>(initialScreen);

  return (
    <>
      <AppContent screen={screen} setScreen={setScreen} />
      <AppUpdateBanner screen={screen} />
    </>
  );
}

function App() {
  return (
    <GameProvider>
      <AppShell />
      <ToastContainer />
    </GameProvider>
  );
}

export default App;
