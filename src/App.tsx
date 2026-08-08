import { useState, useCallback, useEffect } from 'react';
import { GameProvider, useGame } from './context/GameContext';
import type { Team, FoulType, FreeThrowResult, ShotSituation, ScoreType, StatType } from './types/game';
import type { SavedTeam, NumberType } from './utils/teamStorage';
import { formatPlayerNumber } from './utils/playerNumber';
import type { PendingAction } from './types/pendingAction';
import { createPendingAction } from './types/pendingAction';
import { saveRecentOpponent } from './utils/teamStorage';
import { buildMatchTeams } from './utils/matchTeams';
import { migrateSavedTeamIds } from './utils/savedTeamIdMigration';
import { saveGameResult } from './utils/gameHistoryStorage';
import { loadGameSession, clearGameSession, hasGameSession } from './utils/gameSessionStorage';
import { Home } from './components/Home';
import { MyTeamManager } from './components/MyTeamManager';
import { GameSetup } from './components/GameSetup';
import { History } from './components/History';
import { OpponentManager } from './components/OpponentManager';
import { PlayerStatsAnalysis } from './components/PlayerStatsAnalysis';
import { Scoreboard } from './components/Scoreboard';
import { ActionButtons } from './components/ActionButtons';
import { ActionHistory } from './components/ActionHistory';
import { TeamPanel } from './components/TeamPanel';
// import { VoiceInput } from './components/VoiceInput'; // 一時的に非表示
import { SubstitutionModal } from './components/SubstitutionModal';
import { TimeoutInputModal } from './components/TimeoutInputModal/TimeoutInputModal';
import { StatsPanel } from './components/StatsPanel';
import { QuarterLineup } from './components/QuarterLineup';
import { PendingActionPanel } from './components/PendingActionPanel';
import { PendingActionResolver } from './components/PendingActionResolver';

import { FoulInputFlow } from './components/FoulInputFlow';
import { RunningScoresheet } from './components/RunningScoresheet';
import { AppSettingsModal } from './components/Settings/AppSettingsModal';
import { ToastContainer } from './components/Toast/Toast';
import { showToast } from './components/Toast/toastApi';
import { Modal } from './components/Modal';
import { UndoSnackbar } from './components/UndoSnackbar/UndoSnackbar';
import { RestorePrompt } from './components/RestorePrompt';
import { BackupPrompt } from './components/BackupPrompt/BackupPrompt';
import { UpdatePrompt, useAppUpdate } from './components/UpdatePrompt';
import { consumeLaunchShortcut, parseLaunchShortcut } from './utils/launchShortcut';
import type { ShortcutTarget } from './utils/launchShortcut';
import { useOfflineToast } from './hooks/useOfflineToast';
import { useFoulOutNotice } from './hooks/useFoulOutNotice';
import type { MirrorSnapshot } from './utils/mirrorBackup';
import { hasAppData, getLatestSnapshot, saveSnapshot, requestPersistentStorage } from './utils/mirrorBackup';
import { STORAGE_ERROR_EVENT } from './utils/storageError';
import { isBackupDue } from './utils/lastBackupStorage';
import { shareBackup } from './utils/dataBackup';
// import type { VoiceCommand } from './utils/voiceCommands'; // 一時的に非表示
import { useFullscreen } from './hooks/useFullscreen';
import { useGameMode } from './hooks/useGameMode';
import { useGameAutoSave } from './hooks/useGameAutoSave';
import { GAME_SCREENS, type AppScreen } from './types/screens';
import { useWakeLock } from './hooks/useWakeLock';

import { useScreenHistorySync } from './hooks/useScreenHistorySync';
import './App.css';

// 画面の識別子と試合系画面の集合は types/screens.ts に置く。
// 戻る/進むの復元ガードと自動保存が同じ集合を見る必要があり、
// 片方（フック側）から App.tsx を参照できないため。

// Undoスナックバー用のスタッツ表示名
const STAT_UNDO_LABELS: Record<string, string> = {
  OREB: 'オフェンスリバウンド',
  DREB: 'ディフェンスリバウンド',
  AST: 'アシスト',
  STL: 'スティール',
  BLK: 'ブロック',
  TO: 'ターンオーバー',
  'TO:DD': 'ターンオーバー(ダブドリ)',
  'TO:TR': 'ターンオーバー(トラベリング)',
  'TO:PM': 'ターンオーバー(パスミス)',
  'TO:CM': 'ターンオーバー(キャッチミス)',
  '2PA': '2Pミス',
  '3PA': '3Pミス',
  FTA: 'FTミス',
};

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

function AppContent() {
  const { state, dispatch } = useGame();
  const [screen, setScreen] = useState<AppScreen>(initialScreen);
  const [gameName, setGameName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [showSubstitutionModal, setShowSubstitutionModal] = useState(false);
  const [substitutionTeamId, setSubstitutionTeamId] = useState<'teamA' | 'teamB'>('teamA');
  const [showStats, setShowStats] = useState(false);
  const [activeTab, setActiveTab] = useState<'teamA' | 'teamB'>('teamA');
  const [lineupTab, setLineupTab] = useState<'teamA' | 'teamB'>('teamA');
  const [showFoulSelector, setShowFoulSelector] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: string; value?: string } | null>(null);
  const [showTeamSelector, setShowTeamSelector] = useState(false); // チーム選択モーダル表示（保留アクション化用）
  const [resolvingPendingAction, setResolvingPendingAction] = useState<PendingAction | null>(null); // 解決中の保留アクション
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
      setScreen(next);
      // 別のショートカットで移動したときに、前回の警告が残らないようにする
      setShowNewGameWarning(warnNewGame);
    });
  }, []);
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

  // 起動時: 過去の試合に登録マイチームのidを書き戻す。
  // 改名されるとその試合は名前で辿れなくなり選手スタッツ分析から消えるため、
  // 改名される前に帰属をidへ凍結しておく（走らせても分析結果は変わらない）。
  // 起動スナップショットより先に置き、書き戻し後のデータが控えに載るようにする。
  useEffect(() => {
    migrateSavedTeamIds();
  }, []);

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
      message: `${getPlayerUndoLabel(teamId, playerId)} ${STAT_UNDO_LABELS[statType] ?? statType}`,
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

  // 交代要員選択（ベンチの選手を選択）
  const handleBenchPlayerSelect = (playerId: string) => {
    if (!coachFoulState) return;
    const team = coachFoulState.teamId === 'teamA' ? state.teamA : state.teamB;
    const player = team.players.find(p => p.id === playerId);
    if (!player) return;

    setCoachFoulState({
      ...coachFoulState,
      step: 'foulInput',
      foulType: 'T',
      playerId,
      label: `#${formatPlayerNumber(player.number)} ${player.courtName || player.name} (T)`,
      benchTechType: 'Sub',
    });
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
      []
    );

    dispatch({
      type: 'ADD_PENDING_ACTION',
      payload: newPendingAction,
    });

    setPendingAction(null);
    setShowTeamSelector(false);
  };

  // 保留アクション解決
  const handleResolvePendingAction = (pending: PendingAction) => {
    setResolvingPendingAction(pending);
  };

  // 保留アクション解決確定
  const handleConfirmResolvePending = (playerId: string) => {
    if (!resolvingPendingAction) return;

    // ファウルタイプの場合はファウル種類選択モーダルを表示
    if (resolvingPendingAction.actionType === 'FOUL') {
      setResolvingFoulPending({
        pendingActionId: resolvingPendingAction.id,
        playerId,
        teamId: resolvingPendingAction.teamId,
      });
      setActiveTab(resolvingPendingAction.teamId as 'teamA' | 'teamB');
      setShowFoulSelector(true);
      setResolvingPendingAction(null);
      return;
    }

    dispatch({
      type: 'RESOLVE_PENDING_ACTION',
      payload: { pendingActionId: resolvingPendingAction.id, playerId },
    });
    setResolvingPendingAction(null);
  };

  // 保留アクション削除
  const handleRemovePendingAction = (pendingActionId: string) => {
    dispatch({
      type: 'REMOVE_PENDING_ACTION',
      payload: { pendingActionId },
    });
  };

  // 保留アクションの候補選手更新
  const handleUpdatePendingCandidates = (pendingActionId: string, candidatePlayerIds: string[]) => {
    dispatch({
      type: 'UPDATE_PENDING_ACTION_CANDIDATES',
      payload: { pendingActionId, candidatePlayerIds },
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
  }, [currentQuarter, dispatch, state.teamA, state.teamB]);

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
  }, [dispatch]);




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
      state.pendingActions
    );

    if (!saved) {
      // 記録は state と中断セッションの両方に残したまま、復旧手段を出す
      setShowSaveFailed(true);
      return;
    }

    clearGameSession();
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

  // 成功 → ミス変換
  const handleConvertScoreToMiss = (entryId: string, newMissType: '2PA' | '3PA' | 'FTA') => {
    dispatch({ type: 'CONVERT_SCORE_TO_MISS', payload: { entryId, newMissType } });
  };

  // ミス → 成功変換
  const handleConvertMissToScore = (entryId: string, newScoreType: '2P' | '3P' | 'FT') => {
    dispatch({ type: 'CONVERT_MISS_TO_SCORE', payload: { entryId, newScoreType } });
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
        onBackup={async () => {
          await shareBackup();
          setShowBackupPrompt(false);
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
                onClick={() => { setShowNewGameWarning(false); setScreen('gameSetup'); }}
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

            <StatsPanel players={state.teamA.players} teamName={state.teamA.name} />
            <StatsPanel players={state.teamB.players} teamName={state.teamB.name} />
          </div>
        ) : (
          <>
            {/* 3列メインエリア: Team A | Center (Scoreboard + Actions) | Team B */}
            {/* action-pending: アクション先行選択中は選手カードを強調表示 */}
            <div className={`game-main-area ${gameMode === 'simple' ? 'simple-mode' : 'full-mode'} ${pendingAction ? 'action-pending' : ''}`}>
              {/* Left: Team A */}
              <TeamPanel
                teamId="teamA"
                teamName={state.teamA.name}
                teamColor={state.teamA.color}
                players={state.teamA.players}
                isMyTeam={state.teamA.isMyTeam}
                isActive={selectedTeamId === 'teamA'}
                selectedPlayerId={selectedPlayerId}
                gameMode={gameMode}
                scoreHistory={state.scoreHistory}
                statHistory={state.statHistory}
                foulHistory={state.foulHistory}
                onPlayerSelect={handlePlayerSelect}
                onSubstitute={() => { setSubstitutionTeamId('teamA'); setShowSubstitutionModal(true); }}
                onCoachFoul={() => handleCoachFoul('teamA')}
                actionHistoryHandlers={actionHistoryHandlers}
                teamFouls={state.teamA.teamFouls[currentQuarter - 1] || 0}
                timeoutUsed={state.teamA.timeouts.some(t => t.quarter === currentQuarter)}
                onTimeoutRequest={phase === 'playing' ? () => setTimeoutModalTeam('teamA') : undefined}
              />

              {/* Center: Scoreboard + Action Buttons */}
              <div className="center-column">
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
                      ? pendingAction.type === 'SCORE' ? `${pendingAction.value}成功`
                        : pendingAction.type === 'FOUL' ? 'ファウル'
                          : STAT_UNDO_LABELS[pendingAction.value ?? ''] ?? pendingAction.value
                      : null}
                    gameMode={gameMode}
                    showThreePoint={state.showThreePoint}
                    onHoldPending={() => setShowTeamSelector(true)}
                    onCancelAction={() => setPendingAction(null)}
                    idleNotice={phase === 'quarterEnd'
                      ? `⚠ 今の記録は ${currentQuarter <= 4 ? `Q${currentQuarter}` : 'OT'} として保存されます`
                      : null}
                  />
                </div>
              </div>

              {/* Right: Team B */}
              <TeamPanel
                teamId="teamB"
                teamName={state.teamB.name}
                teamColor={state.teamB.color}
                players={state.teamB.players}
                isMyTeam={state.teamB.isMyTeam}
                isActive={selectedTeamId === 'teamB'}
                selectedPlayerId={selectedPlayerId}
                gameMode={gameMode}
                scoreHistory={state.scoreHistory}
                statHistory={state.statHistory}
                foulHistory={state.foulHistory}
                onPlayerSelect={handlePlayerSelect}
                onSubstitute={() => { setSubstitutionTeamId('teamB'); setShowSubstitutionModal(true); }}
                onCoachFoul={() => handleCoachFoul('teamB')}
                actionHistoryHandlers={actionHistoryHandlers}
                teamFouls={state.teamB.teamFouls[currentQuarter - 1] || 0}
                timeoutUsed={state.teamB.timeouts.some(t => t.quarter === currentQuarter)}
                onTimeoutRequest={phase === 'playing' ? () => setTimeoutModalTeam('teamB') : undefined}
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
              playerName={foulingPlayer?.name}
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
            playerName={selectedPlayer?.name}
            teamFouls={teamFouls}
            opponentTeamId={opponentTeamId}
            opponentPlayers={opponentTeam.players}
            opponentTeamName={opponentTeam.name}
            showThreePoint={state.showThreePoint}
          />
        );
      })()}

      {/* 交代モーダル */}
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
              {pendingAction.type === 'SCORE' ? `${pendingAction.value}成功` :
                pendingAction.type === 'STAT' ? pendingAction.value :
                  pendingAction.type === 'MISS' ? `${pendingAction.value}` :
                    'ファウル'}
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

      {/* Team A 保留アクション (左下) */}
      {pendingActions.filter(p => p.teamId === 'teamA').length > 0 && (
        <div className="pending-actions-floating-left">
          <PendingActionPanel
            pendingActions={pendingActions.filter(p => p.teamId === 'teamA')}
            onResolve={handleResolvePendingAction}
            onResolveUnknown={handleResolveUnknown}
            onRemove={handleRemovePendingAction}
            onUpdateCandidates={handleUpdatePendingCandidates}
            onDirectResolve={handleDirectResolvePending}
          />
        </div>
      )}

      {/* Team B 保留アクション (右下) */}
      {pendingActions.filter(p => p.teamId === 'teamB').length > 0 && (
        <div className="pending-actions-floating-right">
          <PendingActionPanel
            pendingActions={pendingActions.filter(p => p.teamId === 'teamB')}
            onResolve={handleResolvePendingAction}
            onResolveUnknown={handleResolveUnknown}
            onRemove={handleRemovePendingAction}
            onUpdateCandidates={handleUpdatePendingCandidates}
            onDirectResolve={handleDirectResolvePending}
          />
        </div>
      )}

      {/* 保留アクション解決モーダル */}
      {resolvingPendingAction && (
        <PendingActionResolver
          pendingAction={resolvingPendingAction}
          onResolve={handleConfirmResolvePending}
          onCancel={() => setResolvingPendingAction(null)}
        />
      )}


      {/* 試合終了確認モーダル */}
      {endGameConfirmType && (
        <Modal
          onClose={() => setEndGameConfirmType(null)}
          contentClassName="modal-content end-game-confirm-modal"
          closeOnOverlayClick={false}
          labelledBy="end-game-confirm-title"
        >
          <h3 id="end-game-confirm-title">試合終了の確認</h3>
          <p className="end-game-confirm-message">
            試合を終了するとデータの編集ができません。<br />
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
            <div className="substitution-actions">
              <button className="btn btn-secondary btn-large" onClick={() => setCoachFoulState({ teamId: coachFoulState.teamId, step: 'type' })}>
                戻る
              </button>
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
          />
        );
      })()}

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
 * 更新はリロードを伴うので、記録中（試合が進行中）は出さずに保留し、
 * 試合が終わる/ホームに戻ってから表示する。
 */
function AppUpdateBanner() {
  const { state } = useGame();
  const isGameInProgress =
    state.phase === 'playing' || state.phase === 'paused' || state.phase === 'quarterEnd';
  const { show, apply, dismiss } = useAppUpdate(isGameInProgress);

  if (!show) return null;
  return <UpdatePrompt onUpdate={apply} onDismiss={dismiss} />;
}

function App() {
  return (
    <GameProvider>
      <AppContent />
      <AppUpdateBanner />
      <ToastContainer />
    </GameProvider>
  );
}

export default App;
