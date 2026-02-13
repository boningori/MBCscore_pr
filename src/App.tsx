import { useState, useCallback, useEffect, useRef } from 'react';
import { GameProvider, useGame } from './context/GameContext';
import type { Team, FoulType, FreeThrowResult, ShotSituation } from './types/game';
import type { SavedTeam, NumberType } from './utils/teamStorage';
import type { PendingAction } from './types/pendingAction';
import { createPendingAction } from './types/pendingAction';
import { savedTeamToTeam, saveRecentOpponent } from './utils/teamStorage';
import { saveGameResult } from './utils/gameHistoryStorage';
import { saveGameSession, loadGameSession, clearGameSession } from './utils/gameSessionStorage';
import { Home } from './components/Home';
import { MyTeamManager } from './components/MyTeamManager';
import { GameSetup } from './components/GameSetup';
import { History } from './components/History';
import { OpponentManager } from './components/OpponentManager';
import { PlayerStatsAnalysis } from './components/PlayerStatsAnalysis';
import { Scoreboard } from './components/Scoreboard';
import { ActionButtons } from './components/ActionButtons';
import { ActionHistory } from './components/ActionHistory';
// import { VoiceInput } from './components/VoiceInput'; // 一時的に非表示
import { SubstitutionModal } from './components/SubstitutionModal';
import { StatsPanel } from './components/StatsPanel';
import { QuarterLineup } from './components/QuarterLineup';
import { PendingActionPanel } from './components/PendingActionPanel';
import { PendingActionResolver } from './components/PendingActionResolver';

import { FoulInputFlow } from './components/FoulInputFlow';
import { RunningScoresheet } from './components/RunningScoresheet';
import { AppSettingsModal } from './components/Settings/AppSettingsModal';
// import type { VoiceCommand } from './utils/voiceCommands'; // 一時的に非表示
import './App.css';

// アプリの画面状態
type AppScreen = 'home' | 'myTeamManager' | 'opponentManager' | 'gameSetup' | 'game' | 'quarterLineup' | 'history' | 'scoresheet' | 'playerStats';

function AppContent() {
  const { state, dispatch } = useGame();
  const [screen, setScreen] = useState<AppScreen>('home');
  const [gameName, setGameName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [showSubstitutionModal, setShowSubstitutionModal] = useState(false);
  const [substitutionTeamId, setSubstitutionTeamId] = useState<'teamA' | 'teamB'>('teamA');
  const [showStats, setShowStats] = useState(false);
  const [activeTab, setActiveTab] = useState<'teamA' | 'teamB'>('teamA');
  const [lineupTeamId, setLineupTeamId] = useState<'teamA' | 'teamB'>('teamA');
  const [showFoulSelector, setShowFoulSelector] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: string; value?: string } | null>(null);
  const [showTeamSelector, setShowTeamSelector] = useState(false); // チーム選択モーダル表示
  const [resolvingPendingAction, setResolvingPendingAction] = useState<PendingAction | null>(null); // 解決中の保留アクション
  const [resolvingFoulPending, setResolvingFoulPending] = useState<{ pendingActionId: string; playerId: string; teamId: string } | null>(null); // ファウル種類選択待ち
  const [showAppSettings, setShowAppSettings] = useState(false);

  const { phase, selectedPlayerId, selectedTeamId, currentQuarter, pendingActions } = state;

  // 試合状態が変更されたらセッション保存（デバウンス付き）
  const saveTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (screen === 'game' && phase !== 'setup') {
      // 既存のタイマーをクリア
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // 500ms後に保存（UIブロックを防止）
      saveTimeoutRef.current = window.setTimeout(() => {
        saveGameSession(state, gameName, date);
      }, 500);
    }
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [state, screen, gameName, date, phase]);

  // 試合設定完了
  const handleGameSetupComplete = (setupData: {
    gameName: string;
    date: string;
    myTeam: SavedTeam;
    opponentTeam: SavedTeam;
    myTeamColor: 'white' | 'blue';
    opponentTeamColor: 'white' | 'blue';
    numberType: NumberType;
  }) => {
    // 新しいゲームを開始するため状態をリセット
    dispatch({ type: 'RESET_GAME' });

    setGameName(setupData.gameName);
    setDate(setupData.date);

    // 白チーム=teamA（上段）、青チーム=teamB（下段）に固定
    // マイチームの色に応じて割り当てを決定
    const isMyTeamWhite = setupData.myTeamColor === 'white';

    // 白チーム（teamA）の作成
    const whiteTeamSource = isMyTeamWhite ? setupData.myTeam : setupData.opponentTeam;
    const whiteNumberType = isMyTeamWhite ? setupData.numberType : undefined;
    const teamA = savedTeamToTeam(whiteTeamSource, 'teamA', whiteNumberType);
    teamA.isMyTeam = isMyTeamWhite;
    teamA.color = 'white';

    // 青チーム（teamB）の作成
    const blueTeamSource = isMyTeamWhite ? setupData.opponentTeam : setupData.myTeam;
    const blueNumberType = isMyTeamWhite ? undefined : setupData.numberType;
    const teamB = savedTeamToTeam(blueTeamSource, 'teamB', blueNumberType);
    teamB.isMyTeam = !isMyTeamWhite;
    teamB.color = 'blue';

    // コート上選手はクリア（QuarterLineupで選択）
    teamA.players = teamA.players.map(p => ({ ...p, isOnCourt: false }));
    teamB.players = teamB.players.map(p => ({ ...p, isOnCourt: false }));

    dispatch({ type: 'SET_TEAMS', payload: { teamA, teamB } });

    // 対戦チームを履歴に保存（念のため更新）
    saveRecentOpponent(setupData.opponentTeam);

    // Q1スタメン選択画面へ（常に白チーム=teamAから開始）
    setLineupTeamId('teamA');
    setScreen('quarterLineup');
  };

  // 選手選択
  const handlePlayerSelect = (playerId: string, teamId: string) => {
    // 保留中のアクションがあれば実行
    if (pendingAction) {
      if (pendingAction.type === 'SCORE') {
        dispatch({
          type: 'ADD_SCORE',
          payload: { teamId, playerId, scoreType: pendingAction.value as any },
        });
      } else if (pendingAction.type === 'STAT') {
        dispatch({
          type: 'ADD_STAT',
          payload: { teamId, playerId, statType: pendingAction.value as any },
        });
      } else if (pendingAction.type === 'MISS') {
        dispatch({
          type: 'ADD_STAT',
          payload: { teamId, playerId, statType: pendingAction.value as any },
        });
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
      dispatch({
        type: 'ADD_SCORE',
        payload: { teamId: selectedTeamId, playerId: selectedPlayerId, scoreType },
      });
      dispatch({ type: 'CLEAR_SELECTION' });
    } else {
      setPendingAction({ type: 'SCORE', value: scoreType });
    }
  };

  // 統計追加
  const handleStat = (statType: 'OREB' | 'DREB' | 'AST' | 'STL' | 'BLK' | 'TO' | 'TO:DD' | 'TO:TR' | 'TO:PM' | 'TO:CM') => {
    if (selectedPlayerId && selectedTeamId) {
      dispatch({
        type: 'ADD_STAT',
        payload: { teamId: selectedTeamId, playerId: selectedPlayerId, statType },
      });
      dispatch({ type: 'CLEAR_SELECTION' });
    } else {
      setPendingAction({ type: 'STAT', value: statType });
    }
  };

  // シュートミス追加
  const handleMiss = (missType: '2PA' | '3PA' | 'FTA') => {
    if (selectedPlayerId && selectedTeamId) {
      dispatch({
        type: 'ADD_STAT',
        payload: { teamId: selectedTeamId, playerId: selectedPlayerId, statType: missType },
      });
      dispatch({ type: 'CLEAR_SELECTION' });
    } else {
      setPendingAction({ type: 'MISS', value: missType });
    }
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
      label: `#${player.number} ${player.courtName || player.name} (T)`,
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

  // pendingActionが設定されたらチーム選択モーダルを表示
  useEffect(() => {
    if (pendingAction && !selectedPlayerId && !selectedTeamId) {
      setShowTeamSelector(true);
    }
  }, [pendingAction, selectedPlayerId, selectedTeamId]);


  // タイムアウト
  const handleTimeout = (teamId: 'teamA' | 'teamB' = activeTab, elapsedMinutes: number = 0) => {
    dispatch({
      type: 'ADD_TIMEOUT',
      payload: { teamId, elapsedMinutes },
    });
  };

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

  // クォーター開始時のスタメン確定
  const handleLineupConfirm = (startingPlayerIds: string[]) => {
    // 選択された選手をコート上に、それ以外をベンチに設定
    const updatePlayers = (team: Team) => ({
      ...team,
      players: team.players.map(p => ({
        ...p,
        isOnCourt: startingPlayerIds.includes(p.id),
        // 出場クォーターを記録
        quartersPlayed: p.quartersPlayed.map((played, i) =>
          i === currentQuarter - 1 ? (startingPlayerIds.includes(p.id) ? true : played) : played
        ),
      })),
    });

    if (lineupTeamId === 'teamA') {
      dispatch({
        type: 'SET_TEAMS',
        payload: {
          teamA: updatePlayers(state.teamA),
          teamB: state.teamB,
        },
      });
      // Team Bのスタメン選択へ
      setLineupTeamId('teamB');
    } else {
      dispatch({
        type: 'SET_TEAMS',
        payload: {
          teamA: state.teamA,
          teamB: updatePlayers(state.teamB),
        },
      });
      // 両チーム完了、ゲーム開始/再開
      setScreen('game');
      // phase が 'setup' または 'quarterEnd' の場合、START_GAME を呼び出して playing に遷移
      if (phase === 'setup' || phase === 'quarterEnd') {
        dispatch({ type: 'START_GAME' });
      }
    }
  };

  // クォーター終了時にスタメン選択へ
  const handleQuarterEnd = useCallback(() => {
    dispatch({ type: 'END_QUARTER' });
    if (currentQuarter < 4) {
      setLineupTeamId('teamA');
      setScreen('quarterLineup');
    }
  }, [currentQuarter, dispatch]);



  // 試合終了・保存してホームへ
  const handleGameFinished = () => {
    // 試合結果を保存
    saveGameResult(
      gameName,
      state.teamA,
      state.teamB,
      state.scoreHistory,
      state.statHistory,
      state.foulHistory,
      new Date(date),
      state.gameInfo
    );

    // セッションデータをクリア
    clearGameSession();

    // ホームへ戻る
    setScreen('home');
  };

  // ホーム画面に戻る
  const handleBackToHome = () => {
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
  const handleEditScore = (entryId: string, newPlayerId: string, newScoreType: string) => {
    dispatch({ type: 'EDIT_SCORE', payload: { entryId, newPlayerId, newScoreType } });
  };

  // スタッツ編集
  const handleEditStat = (entryId: string, newPlayerId: string, newStatType: string) => {
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

  // フルスクリーン制御
  const [isFullScreen, setIsFullScreen] = useState(false);

  // ゲームモード（フル/シンプル）
  const [gameMode, setGameMode] = useState<'full' | 'simple'>('full');

  // 履歴ポップアップ（シンプルモード用）
  const [showHistoryPopup, setShowHistoryPopup] = useState(false);

  const toggleFullScreen = async () => {
    try {
      const doc = document as any;
      const elem = document.documentElement as any;

      const isFs = doc.fullscreenElement || doc.mozFullScreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;

      if (!isFs) {
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
          await elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
          await elem.msRequestFullscreen();
        } else if (elem.mozRequestFullScreen) {
          await elem.mozRequestFullScreen();
        }
      } else {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        } else if (doc.msExitFullscreen) {
          await doc.msExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          await doc.mozCancelFullScreen();
        }
      }
    } catch (err) {
      console.error('フルスクリーン切り替えエラー:', err);
      alert('全画面表示に切り替えられませんでした。ブラウザの設定を確認してください。');
    }
  };

  // フルスクリーン状態の監視（ESCキーなどで解除された場合に対応）
  useEffect(() => {
    const handleFullScreenChange = () => {
      const doc = document as any;
      const isFs = !!(doc.fullscreenElement || doc.mozFullScreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement);
      setIsFullScreen(isFs);
    };

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullScreenChange);
    document.addEventListener('mozfullscreenchange', handleFullScreenChange);
    document.addEventListener('MSFullscreenChange', handleFullScreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullScreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullScreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullScreenChange);
    };
  }, []);

  if (screen === 'home') {
    return (
      <>
        <Home
          onStartGame={() => setScreen('gameSetup')}
          onManageTeams={() => setScreen('myTeamManager')}
          onViewHistory={() => setScreen('history')}
          onManageOpponents={() => setScreen('opponentManager')}
          onViewPlayerStats={() => setScreen('playerStats')}
          onResumeGame={handleResumeGame}
          onOpenSettings={() => setShowAppSettings(true)}
          isFullScreen={isFullScreen}
          onToggleFullScreen={toggleFullScreen}
        />
        <AppSettingsModal
          isOpen={showAppSettings}
          onClose={() => setShowAppSettings(false)}
        />
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
      />
    );
  }

  // クォーターごとのスタメン選択画面
  if (screen === 'quarterLineup') {
    const lineupTeam = lineupTeamId === 'teamA' ? state.teamA : state.teamB;
    return (
      <QuarterLineup
        quarter={currentQuarter}
        teamName={lineupTeam.name}
        players={lineupTeam.players}
        onConfirm={handleLineupConfirm}
        onBack={lineupTeamId === 'teamA' ? () => setScreen('game') : undefined}
      />
    );
  }

  // 旧セットアップ画面（フォールバック）




  // ゲーム画面
  return (
    <div className="app-container" onContextMenu={(e) => e.preventDefault()}>
      {/* ヘッダー */}
      <header className="app-header">
        <div className="header-left">
          <button className="btn btn-secondary btn-small" onClick={handleBackToHome}>
            🏠
          </button>
          <button className="btn btn-secondary btn-small" onClick={toggleFullScreen} style={{ marginLeft: '8px' }}>
            {isFullScreen ? '縮小' : '全画面'}
          </button>
          <button
            className={`btn btn-small ${gameMode === 'simple' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setGameMode(gameMode === 'full' ? 'simple' : 'full')}
            style={{ marginLeft: '8px' }}
          >
            {gameMode === 'full' ? '📱 シンプル' : '💻 フル'}
          </button>
        </div>
        <div className="header-center">
          {/* 音声入力機能は一時的に非表示 */}
          {/* {gameMode === 'full' && <VoiceInput onCommand={handleVoiceCommand} />} */}
        </div>
        <div className="header-right">
          {/* シンプルモード用: 履歴ボタン */}
          {gameMode === 'simple' && (
            <button
              className={`btn ${showHistoryPopup ? 'btn-primary' : 'btn-secondary'} btn-small`}
              onClick={() => setShowHistoryPopup(!showHistoryPopup)}
              style={{ marginRight: '8px' }}
            >
              📜 履歴
            </button>
          )}
          {/* スコアシートボタン（両モード共通） */}
          <button
            className="btn btn-secondary btn-small"
            onClick={() => setScreen('scoresheet')}
            style={{ marginRight: '8px' }}
          >
            📄 スコアシート
          </button>
          {/* フルモード用: 統計 */}
          {gameMode === 'full' && (
            <button
              className={`btn ${showStats ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowStats(!showStats)}
            >
              📊 統計
            </button>
          )}
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
            <div className={`game-main-area ${gameMode === 'simple' ? 'simple-mode' : 'full-mode'}`}>
              {/* Left: Team A */}
              <div className={`team-panel team-a color-${state.teamA.color} ${selectedTeamId === 'teamA' ? 'active' : ''}`}>
                <div className="team-panel-header">
                  <span className="team-name">{state.teamA.name}</span>
                </div>
                <div className="team-players">
                  {state.teamA.players.filter(p => p.isOnCourt).map(player => (
                    <div
                      key={player.id}
                      className={`mini-player-card ${selectedPlayerId === player.id ? 'selected' : ''}`}
                      onClick={() => handlePlayerSelect(player.id, 'teamA')}
                    >
                      <span className="player-num">
                        #{player.number}
                        {gameMode === 'full' && state.teamA.isMyTeam
                          ? (player.courtName ? ` ${player.courtName}` : ` ${player.name}`)
                          : ''}
                      </span>
                      <span className="player-pts">{player.stats.points}</span>
                      {player.fouls.length > 0 && (
                        <span className={`player-fouls ${player.fouls.length >= 4 ? 'warning' : ''}`}>
                          F{player.fouls.length}
                        </span>
                      )}
                    </div>
                  ))}
                  {/* シンプルモード用の交代ボタン（選手カードと同じグリッド内） */}
                  {gameMode === 'simple' && (
                    <button
                      className="simple-sub-btn"
                      onClick={() => { setSubstitutionTeamId('teamA'); setShowSubstitutionModal(true); }}
                    >
                      🔄 交代
                    </button>
                  )}
                </div>
                <div className="team-bench">
                  {/* ベンチ選手のショートカット（一時的に無効化）
                  {state.teamA.players.filter(p => !p.isOnCourt && p.fouls.length < 5).slice(0, 3).map(p => (
                    <span key={p.id} className="bench-num" onClick={() => handlePlayerSelect(p.id, 'teamA')}>
                      #{p.number}
                    </span>
                  ))}
                  */}
                  <div className="bench-actions">
                    <button className="btn btn-small" onClick={() => { setSubstitutionTeamId('teamA'); setShowSubstitutionModal(true); }}>
                      交代
                    </button>
                    <button className="btn btn-small btn-danger" onClick={() => handleCoachFoul('teamA')}>
                      ベンチ<br />ファウル
                    </button>
                  </div>
                </div>
                {/* アクション履歴（フルモードのみ） */}
                {gameMode === 'full' && (
                  <ActionHistory
                    teamId="teamA"
                    teamName={state.teamA.name}
                    scoreHistory={state.scoreHistory}
                    statHistory={state.statHistory}
                    foulHistory={state.foulHistory}
                    players={state.teamA.players}
                    onRemoveScore={handleRemoveScore}
                    onRemoveStat={handleRemoveStat}
                    onRemoveFoul={handleRemoveFoul}
                    onEditScore={handleEditScore}
                    onEditStat={handleEditStat}
                    onConvertScoreToMiss={handleConvertScoreToMiss}
                    onConvertMissToScore={handleConvertMissToScore}
                  />
                )}

              </div>

              {/* Center: Scoreboard + Action Buttons */}
              <div className="center-column">
                {/* スコアボード */}
                <div className="scoreboard-section">
                  <Scoreboard
                    onQuarterEnd={handleQuarterEnd}
                    onTimeout={handleTimeout}
                    mode={gameMode}
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
                    gameMode={gameMode}
                  />
                </div>
              </div>

              {/* Right: Team B */}
              <div className={`team-panel team-b color-${state.teamB.color} ${selectedTeamId === 'teamB' ? 'active' : ''}`}>
                <div className="team-panel-header">
                  <span className="team-name">{state.teamB.name}</span>
                </div>
                <div className="team-players">
                  {state.teamB.players.filter(p => p.isOnCourt).map(player => (
                    <div
                      key={player.id}
                      className={`mini-player-card ${selectedPlayerId === player.id ? 'selected' : ''}`}
                      onClick={() => handlePlayerSelect(player.id, 'teamB')}
                    >
                      <span className="player-num">
                        #{player.number}
                        {gameMode === 'full' && state.teamB.isMyTeam
                          ? (player.courtName ? ` ${player.courtName}` : ` ${player.name}`)
                          : ''}
                      </span>
                      <span className="player-pts">{player.stats.points}</span>
                      {player.fouls.length > 0 && (
                        <span className={`player-fouls ${player.fouls.length >= 4 ? 'warning' : ''}`}>
                          F{player.fouls.length}
                        </span>
                      )}
                    </div>
                  ))}
                  {/* シンプルモード用の交代ボタン（選手カードと同じグリッド内） */}
                  {gameMode === 'simple' && (
                    <button
                      className="simple-sub-btn"
                      onClick={() => { setSubstitutionTeamId('teamB'); setShowSubstitutionModal(true); }}
                    >
                      🔄 交代
                    </button>
                  )}
                </div>
                <div className="team-bench">
                  {/* ベンチ選手のショートカット（一時的に無効化）
                  {state.teamB.players.filter(p => !p.isOnCourt && p.fouls.length < 5).slice(0, 3).map(p => (
                    <span key={p.id} className="bench-num" onClick={() => handlePlayerSelect(p.id, 'teamB')}>
                      #{p.number}
                    </span>
                  ))}
                  */}
                  <div className="bench-actions">
                    <button className="btn btn-small" onClick={() => { setSubstitutionTeamId('teamB'); setShowSubstitutionModal(true); }}>
                      交代
                    </button>
                    <button className="btn btn-small btn-danger" onClick={() => handleCoachFoul('teamB')}>
                      ベンチ<br />ファウル
                    </button>
                  </div>
                </div>
                {/* アクション履歴（フルモードのみ） */}
                {gameMode === 'full' && (
                  <ActionHistory
                    teamId="teamB"
                    teamName={state.teamB.name}
                    scoreHistory={state.scoreHistory}
                    statHistory={state.statHistory}
                    foulHistory={state.foulHistory}
                    players={state.teamB.players}
                    onRemoveScore={handleRemoveScore}
                    onRemoveStat={handleRemoveStat}
                    onRemoveFoul={handleRemoveFoul}
                    onEditScore={handleEditScore}
                    onEditStat={handleEditStat}
                    onConvertScoreToMiss={handleConvertScoreToMiss}
                    onConvertMissToScore={handleConvertMissToScore}
                  />
                )}
              </div>
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

      {/* チーム選択モーダル（保留アクション作成用） */}
      {showTeamSelector && pendingAction && (
        <div className="team-selector-overlay" onClick={() => { setShowTeamSelector(false); setPendingAction(null); }}>
          <div className="team-selector-modal" onClick={e => e.stopPropagation()}>
            <h3>チームを選択</h3>
            <p className="team-selector-action">
              {pendingAction.type === 'SCORE' ? `${pendingAction.value}成功` :
                pendingAction.type === 'STAT' ? pendingAction.value :
                  pendingAction.type === 'MISS' ? `${pendingAction.value}` :
                    'ファウル'}
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
              onClick={() => { setShowTeamSelector(false); setPendingAction(null); }}
            >
              キャンセル
            </button>
          </div>
        </div>
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
              <button className="btn btn-primary btn-large game-finished-btn" onClick={handleGameFinished}>
                保存して終了
              </button>
              <button
                className="btn btn-danger btn-large game-finished-btn"
                onClick={() => {
                  if (confirm('試合データを保存せずにホームへ戻りますか？\n※この操作は取り消せません')) {
                    handleBackToHome();
                  }
                }}
              >
                保存せずにホームへ
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ベンチファウル選択モーダル - Step 1: 種類選択 */}
      {coachFoulState && coachFoulState.step === 'type' && (
        <div className="modal-overlay" onClick={handleCoachFoulCancel}>
          <div className="modal-content coach-foul-modal" onClick={e => e.stopPropagation()}>
            <h3>ベンチファウル種類</h3>
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
          </div>
        </div>
      )}

      {/* ベンチファウル - Step 1.5: 交代要員（ベンチ選手）選択 */}
      {coachFoulState && coachFoulState.step === 'selectPlayer' && (() => {
        const team = coachFoulState.teamId === 'teamA' ? state.teamA : state.teamB;
        const benchPlayers = team.players.filter(p => !p.isOnCourt);
        return (
          <div className="modal-overlay" onClick={handleCoachFoulCancel}>
            <div className="modal-content substitution-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">交代要員を選択 - {team.name}</h2>
                <button className="modal-close" onClick={handleCoachFoulCancel}>✕</button>
              </div>
              <p className="modal-note" style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                選手行に「T」、コーチ行に「B」が記録されます
              </p>
              <div className="sub-player-list" style={{ maxHeight: '320px' }}>
                {benchPlayers.length > 0 ? (
                  benchPlayers.map(player => (
                    <div
                      key={player.id}
                      className="sub-player-card"
                      onClick={() => handleBenchPlayerSelect(player.id)}
                    >
                      <span className="sub-player-number">#{player.number}</span>
                      <span className="sub-player-name">{player.courtName || player.name}</span>
                      <span className="sub-player-stats">F:{player.fouls.length}</span>
                    </div>
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
            </div>
          </div>
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
          />
        );
      })()}

      {/* 履歴ポップアップ（シンプルモード用） */}
      {showHistoryPopup && gameMode === 'simple' && (
        <div className="history-popup-overlay" onClick={() => setShowHistoryPopup(false)}>
          <div className="history-popup-content" onClick={e => e.stopPropagation()}>
            <div className="history-popup-header">
              <h3>アクション履歴</h3>
              <button className="btn btn-secondary btn-small" onClick={() => setShowHistoryPopup(false)}>
                ✕
              </button>
            </div>
            <div className="history-popup-body">
              <div className={`history-popup-team color-${state.teamA.color}`}>
                <h4>{state.teamA.name}</h4>
                <ActionHistory
                  teamId="teamA"
                  teamName={state.teamA.name}
                  scoreHistory={state.scoreHistory}
                  statHistory={state.statHistory}
                  foulHistory={state.foulHistory}
                  players={state.teamA.players}
                  onRemoveScore={handleRemoveScore}
                  onRemoveStat={handleRemoveStat}
                  onRemoveFoul={handleRemoveFoul}
                  onEditScore={handleEditScore}
                  onEditStat={handleEditStat}
                  onConvertScoreToMiss={handleConvertScoreToMiss}
                  onConvertMissToScore={handleConvertMissToScore}
                />
              </div>
              <div className={`history-popup-team color-${state.teamB.color}`}>
                <h4>{state.teamB.name}</h4>
                <ActionHistory
                  teamId="teamB"
                  teamName={state.teamB.name}
                  scoreHistory={state.scoreHistory}
                  statHistory={state.statHistory}
                  foulHistory={state.foulHistory}
                  players={state.teamB.players}
                  onRemoveScore={handleRemoveScore}
                  onRemoveStat={handleRemoveStat}
                  onRemoveFoul={handleRemoveFoul}
                  onEditScore={handleEditScore}
                  onEditStat={handleEditStat}
                  onConvertScoreToMiss={handleConvertScoreToMiss}
                  onConvertMissToScore={handleConvertMissToScore}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
}

export default App;
