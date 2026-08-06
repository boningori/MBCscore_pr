import type {
    Game,
    PayloadOf,
    ScoreEntry,
    StatEntry,
    FoulEntry,
    FoulType,
    FoulRecord,
} from '../../types/game';
import { recalculateRunningScores } from './shared';

export function handleAddPendingAction(state: Game, payload: PayloadOf<'ADD_PENDING_ACTION'>): Game {
    const pendingAction = payload;
    return {
        ...state,
        pendingActions: [...state.pendingActions, pendingAction],
    };
}

export function handleResolvePendingAction(state: Game, payload: PayloadOf<'RESOLVE_PENDING_ACTION'>): Game {
    const { pendingActionId, playerId } = payload;
    const pending = state.pendingActions.find(p => p.id === pendingActionId);
    if (!pending) return state;

    // 保留アクションを正式な履歴に変換
    let newState = { ...state };
    const player = [...state.teamA.players, ...state.teamB.players].find(p => p.id === playerId);
    if (!player) return state;

    if (pending.actionType === 'SCORE') {
        const scoreType = pending.value as '2P' | '3P' | 'FT';
        const points = scoreType === '3P' ? 3 : scoreType === '2P' ? 2 : 1;

        const updateTeamScore = (team: typeof state.teamA, isTarget: boolean) => {
            if (!isTarget) return team;
            return {
                ...team,
                players: team.players.map(p => {
                    if (p.id !== playerId) return p;
                    const stats = { ...p.stats, points: p.stats.points + points };
                    if (scoreType === '2P') {
                        stats.twoPointMade++;
                        stats.twoPointAttempt++;
                    } else if (scoreType === '3P') {
                        stats.threePointMade++;
                        stats.threePointAttempt++;
                    } else {
                        stats.freeThrowMade++;
                        stats.freeThrowAttempt++;
                    }
                    return { ...p, stats };
                })
            };
        };

        const newTeamA = updateTeamScore(state.teamA, pending.teamId === 'teamA');
        const newTeamB = updateTeamScore(state.teamB, pending.teamId === 'teamB');

        const scoreEntry: ScoreEntry = {
            id: crypto.randomUUID(),
            teamId: pending.teamId,
            playerId,
            playerNumber: player.number,
            scoreType,
            points,
            quarter: pending.quarter,
            timestamp: pending.timestamp,
            // 保留は作成時刻(pending.timestamp)を持つため、時系列で累計を再計算して整合させる
            runningScoreA: 0,
            runningScoreB: 0,
        };

        newState = {
            ...newState,
            teamA: newTeamA,
            teamB: newTeamB,
            scoreHistory: recalculateRunningScores([...newState.scoreHistory, scoreEntry]),
        };
    } else if (pending.actionType === 'STAT') {
        const statType = pending.value as 'OREB' | 'DREB' | 'AST' | 'STL' | 'BLK' | 'TO' | 'TO:DD' | 'TO:TR' | 'TO:PM' | 'TO:CM' | '2PA' | '3PA' | 'FTA';

        const updatePlayerStat = (team: typeof state.teamA, isTarget: boolean) => {
            if (!isTarget) return team;
            return {
                ...team,
                players: team.players.map(p => {
                    if (p.id !== playerId) return p;
                    const stats = { ...p.stats };
                    switch (statType) {
                        case 'OREB': stats.offensiveRebounds++; break;
                        case 'DREB': stats.defensiveRebounds++; break;
                        case 'AST': stats.assists++; break;
                        case 'STL': stats.steals++; break;
                        case 'BLK': stats.blocks++; break;
                        case 'TO': stats.turnovers++; break;
                        case 'TO:DD': stats.turnovers++; stats.turnoverDD++; break;
                        case 'TO:TR': stats.turnovers++; stats.turnoverTR++; break;
                        case 'TO:PM': stats.turnovers++; stats.turnoverPM++; break;
                        case 'TO:CM': stats.turnovers++; stats.turnoverCM++; break;
                        case '2PA': stats.twoPointAttempt++; break;
                        case '3PA': stats.threePointAttempt++; break;
                        case 'FTA': stats.freeThrowAttempt++; break;
                    }
                    return { ...p, stats };
                })
            };
        };

        const statEntry: StatEntry = {
            id: crypto.randomUUID(),
            teamId: pending.teamId,
            playerId,
            playerNumber: player.number,
            statType,
            quarter: pending.quarter,
            timestamp: pending.timestamp,
        };

        newState = {
            ...newState,
            teamA: updatePlayerStat(newState.teamA, pending.teamId === 'teamA'),
            teamB: updatePlayerStat(newState.teamB, pending.teamId === 'teamB'),
            statHistory: [...newState.statHistory, statEntry],
        };
    } else if (pending.actionType === 'FOUL') {
        const foulType = pending.value as FoulType;
        const updateTeamFoul = (team: typeof state.teamA, isTarget: boolean) => {
            if (!isTarget) return team;
            const newTeamFouls = [...team.teamFouls];
            newTeamFouls[pending.quarter - 1]++;
            return {
                ...team,
                teamFouls: newTeamFouls,
                players: team.players.map(p => {
                    if (p.id !== playerId) return p;
                    return { ...p, fouls: [...p.fouls, foulType] };
                })
            };
        };

        // ファウル履歴エントリを作成
        const foulEntry: FoulEntry = {
            id: crypto.randomUUID(),
            teamId: pending.teamId,
            playerId,
            playerNumber: player.number,
            foulType,
            quarter: pending.quarter,
            timestamp: pending.timestamp,
            isCoachOrBench: false,
        };

        newState = {
            ...newState,
            teamA: updateTeamFoul(newState.teamA, pending.teamId === 'teamA'),
            teamB: updateTeamFoul(newState.teamB, pending.teamId === 'teamB'),
            foulHistory: [...newState.foulHistory, foulEntry],
        };
    }

    return {
        ...newState,
        pendingActions: newState.pendingActions.filter(p => p.id !== pendingActionId),
    };
}

export function handleUpdatePendingActionCandidates(state: Game, payload: PayloadOf<'UPDATE_PENDING_ACTION_CANDIDATES'>): Game {
    const { pendingActionId, candidatePlayerIds } = payload;
    return {
        ...state,
        pendingActions: state.pendingActions.map(p =>
            p.id === pendingActionId ? { ...p, candidatePlayerIds } : p
        ),
    };
}

export function handleRemovePendingAction(state: Game, payload: PayloadOf<'REMOVE_PENDING_ACTION'>): Game {
    const { pendingActionId } = payload;
    return {
        ...state,
        pendingActions: state.pendingActions.filter(p => p.id !== pendingActionId),
    };
}

export function handleResolvePendingActionWithFoulType(state: Game, payload: PayloadOf<'RESOLVE_PENDING_ACTION_WITH_FOUL_TYPE'>): Game {
    const { pendingActionId, playerId, foulType } = payload;
    const pending = state.pendingActions.find(p => p.id === pendingActionId);
    if (!pending || pending.actionType !== 'FOUL') return state;

    const player = [...state.teamA.players, ...state.teamB.players].find(p => p.id === playerId);
    if (!player) return state;

    const updateTeamFoul = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        const newTeamFouls = [...team.teamFouls];
        newTeamFouls[pending.quarter - 1]++;
        return {
            ...team,
            teamFouls: newTeamFouls,
            players: team.players.map(p => {
                if (p.id !== playerId) return p;
                return { ...p, fouls: [...p.fouls, foulType] };
            })
        };
    };

    // ファウル履歴エントリを作成
    const foulEntry: FoulEntry = {
        id: crypto.randomUUID(),
        teamId: pending.teamId,
        playerId,
        playerNumber: player.number,
        foulType,
        quarter: pending.quarter,
        timestamp: pending.timestamp,
        isCoachOrBench: false,
    };

    return {
        ...state,
        teamA: updateTeamFoul(state.teamA, pending.teamId === 'teamA'),
        teamB: updateTeamFoul(state.teamB, pending.teamId === 'teamB'),
        foulHistory: [...state.foulHistory, foulEntry],
        pendingActions: state.pendingActions.filter(p => p.id !== pendingActionId),
    };
}

export function handleResolvePendingActionWithFreeThrows(state: Game, payload: PayloadOf<'RESOLVE_PENDING_ACTION_WITH_FREE_THROWS'>): Game {
    const {
        pendingActionId,
        playerId,
        foulType,
        shotSituation,
        freeThrows,
        freeThrowResults,
        shooterTeamId,
        shooterPlayerId,
        shotMade,
    } = payload;

    const pending = state.pendingActions.find(p => p.id === pendingActionId);
    if (!pending || pending.actionType !== 'FOUL') return state;

    const foulingPlayer = [...state.teamA.players, ...state.teamB.players].find(p => p.id === playerId);
    const shooterPlayer = [...state.teamA.players, ...state.teamB.players].find(p => p.id === shooterPlayerId);
    if (!foulingPlayer) return state;

    // FT成功数を計算
    const ftMade = freeThrowResults.filter(r => r === 'made').length;

    // ファウル記録（FoulRecord形式）
    const foulRecord: FoulRecord = {
        type: foulType,
        freeThrows,
        freeThrowResults: freeThrowResults.length > 0 ? freeThrowResults : undefined,
    };

    // ファウルをしたチームを更新
    const updateFoulingTeam = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        const newTeamFouls = [...team.teamFouls];
        newTeamFouls[pending.quarter - 1]++;
        return {
            ...team,
            teamFouls: newTeamFouls,
            players: team.players.map(p => {
                if (p.id !== playerId) return p;
                return { ...p, fouls: [...p.fouls, foulRecord] };
            })
        };
    };

    // バスケットカウント（シュート成功）の得点
    const basketPoints = shotMade && shotSituation !== 'none' ? (shotSituation === '3P' ? 3 : 2) : 0;

    // シューターチームを更新（バスケット得点 + FT得点とスタッツ）
    const updateShooterTeam = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget || !shooterPlayerId) return team;
        if (freeThrows === 0 && !shotMade) return team;

        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== shooterPlayerId) return p;
                const stats = { ...p.stats };
                // バスケットカウント：シュート成功分のスタッツ
                if (shotMade && shotSituation !== 'none') {
                    if (shotSituation === '2P') {
                        stats.twoPointAttempt += 1;
                        stats.twoPointMade += 1;
                    } else {
                        stats.threePointAttempt += 1;
                        stats.threePointMade += 1;
                    }
                    stats.points += basketPoints;
                }
                // FTスタッツ
                if (freeThrows > 0) {
                    stats.freeThrowAttempt += freeThrows;
                    stats.freeThrowMade += ftMade;
                    stats.points += ftMade;
                }
                return { ...p, stats };
            })
        };
    };

    // ファウル履歴エントリを作成
    const foulEntry: FoulEntry = {
        id: crypto.randomUUID(),
        teamId: pending.teamId,
        playerId,
        playerNumber: foulingPlayer.number,
        foulType,
        quarter: pending.quarter,
        timestamp: pending.timestamp,
        isCoachOrBench: false,
        freeThrows,
        freeThrowResults,
        shotSituation,
        shotMade: shotMade || undefined,
        shooterTeamId: (freeThrows > 0 || shotMade) ? shooterTeamId : undefined,
        shooterPlayerId: (freeThrows > 0 || shotMade) ? shooterPlayerId : undefined,
        shooterPlayerNumber: (freeThrows > 0 || shotMade) ? (shooterPlayer?.number || 0) : undefined,
    };

    // チーム更新（ファウル側）
    let newTeamA = updateFoulingTeam(state.teamA, pending.teamId === 'teamA');
    let newTeamB = updateFoulingTeam(state.teamB, pending.teamId === 'teamB');

    // チーム更新（シューター側）
    newTeamA = updateShooterTeam(newTeamA, shooterTeamId === 'teamA');
    newTeamB = updateShooterTeam(newTeamB, shooterTeamId === 'teamB');

    // スコア履歴を追加（バスケット + FT）
    const newScoreHistory = [...state.scoreHistory];
    const now = pending.timestamp;

    // バスケットカウント（シュート成功）のスコア履歴
    if (shotMade && basketPoints > 0 && shooterPlayerId) {
        const finalScoreA = newTeamA.players.reduce((sum, p) => sum + p.stats.points, 0);
        const finalScoreB = newTeamB.players.reduce((sum, p) => sum + p.stats.points, 0);
        const basketScoreA = shooterTeamId === 'teamA' ? finalScoreA - ftMade : finalScoreA;
        const basketScoreB = shooterTeamId === 'teamB' ? finalScoreB - ftMade : finalScoreB;

        const basketEntry: ScoreEntry = {
            id: crypto.randomUUID(),
            teamId: shooterTeamId,
            playerId: shooterPlayerId,
            playerNumber: shooterPlayer?.number || 0,
            scoreType: shotSituation === '3P' ? '3P' : '2P',
            points: basketPoints,
            quarter: pending.quarter,
            timestamp: now,
            runningScoreA: basketScoreA,
            runningScoreB: basketScoreB,
        };
        newScoreHistory.push(basketEntry);
    }

    // FT成功分のスコア履歴を追加
    if (ftMade > 0 && shooterPlayerId) {
        // FT後の最終スコア
        const finalScoreA = newTeamA.players.reduce((sum, p) => sum + p.stats.points, 0);
        const finalScoreB = newTeamB.players.reduce((sum, p) => sum + p.stats.points, 0);

        // FT前の基準スコア（シューターのチームのみftMadeを引く）
        const baseScoreA = shooterTeamId === 'teamA' ? finalScoreA - ftMade : finalScoreA;
        const baseScoreB = shooterTeamId === 'teamB' ? finalScoreB - ftMade : finalScoreB;

        for (let i = 0; i < ftMade; i++) {
            const scoreEntry: ScoreEntry = {
                id: crypto.randomUUID(),
                teamId: shooterTeamId,
                playerId: shooterPlayerId,
                playerNumber: shooterPlayer?.number || 0,
                scoreType: 'FT',
                points: 1,
                quarter: pending.quarter,
                timestamp: now + 1 + i,
                // 各FTごとにランニングスコアをインクリメント
                runningScoreA: shooterTeamId === 'teamA' ? baseScoreA + (i + 1) : baseScoreA,
                runningScoreB: shooterTeamId === 'teamB' ? baseScoreB + (i + 1) : baseScoreB,
            };
            newScoreHistory.push(scoreEntry);
        }
    }

    return {
        ...state,
        teamA: newTeamA,
        teamB: newTeamB,
        // 保留は作成時刻を持つため、時系列で累計を再計算して整合させる
        scoreHistory: recalculateRunningScores(newScoreHistory),
        foulHistory: [...state.foulHistory, foulEntry],
        pendingActions: state.pendingActions.filter(p => p.id !== pendingActionId),
    };
}

export function handleResolvePendingActionUnknown(state: Game, payload: PayloadOf<'RESOLVE_PENDING_ACTION_UNKNOWN'>): Game {
    // 選手不明としてアクションを記録（統計履歴には残すが個人統計には加算しない）
    const { pendingActionId } = payload;
    const pending = state.pendingActions.find(p => p.id === pendingActionId);
    if (!pending) return state;

    let newState = { ...state };

    // STAT アクションのみ対応（不明選手の得点やファウルは記録すべきでない）
    if (pending.actionType === 'STAT') {
        const statType = pending.value as 'OREB' | 'DREB' | 'AST' | 'STL' | 'BLK' | 'TO' | '2PA' | '3PA' | 'FTA';

        const statEntry: StatEntry = {
            id: crypto.randomUUID(),
            teamId: pending.teamId,
            playerId: 'unknown',  // 不明選手
            playerNumber: -1,     // 不明選手は-1
            statType,
            quarter: pending.quarter,
            timestamp: pending.timestamp,
        };

        newState = {
            ...newState,
            statHistory: [...newState.statHistory, statEntry],
        };
    }

    return {
        ...newState,
        pendingActions: newState.pendingActions.filter(p => p.id !== pendingActionId),
    };
}
