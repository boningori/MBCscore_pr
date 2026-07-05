import type { Game, GameAction, ScoreEntry, StatEntry } from '../../types/game';
import { recalculateRunningScores } from './shared';

export function handleAddScore(state: Game, payload: GameAction['payload']): Game {
    const { teamId, playerId, scoreType } = payload as {
        teamId: string;
        playerId: string;
        scoreType: '2P' | '3P' | 'FT'
    };
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

    const newTeamA = updateTeamScore(state.teamA, teamId === 'teamA');
    const newTeamB = updateTeamScore(state.teamB, teamId === 'teamB');

    const player = [...state.teamA.players, ...state.teamB.players].find(p => p.id === playerId);
    const scoreEntry: ScoreEntry = {
        id: crypto.randomUUID(),
        teamId,
        playerId,
        playerNumber: player?.number || 0,
        scoreType,
        points,
        quarter: state.currentQuarter,
        timestamp: Date.now(),
        runningScoreA: newTeamA.players.reduce((sum, p) => sum + p.stats.points, 0),
        runningScoreB: newTeamB.players.reduce((sum, p) => sum + p.stats.points, 0),
    };

    return {
        ...state,
        teamA: newTeamA,
        teamB: newTeamB,
        scoreHistory: [...state.scoreHistory, scoreEntry],
        selectedPlayerId: null,
        selectedTeamId: null,
    };
}

export function handleRemoveScore(state: Game, payload: GameAction['payload']): Game {
    const { entryId } = payload as { entryId: string };
    const entry = state.scoreHistory.find(s => s.id === entryId);
    if (!entry) return state;

    const points = entry.points;
    const updateTeam = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== entry.playerId) return p;
                const stats = { ...p.stats, points: p.stats.points - points };
                if (entry.scoreType === '2P') {
                    stats.twoPointMade--;
                    stats.twoPointAttempt--;
                } else if (entry.scoreType === '3P') {
                    stats.threePointMade--;
                    stats.threePointAttempt--;
                } else {
                    stats.freeThrowMade--;
                    stats.freeThrowAttempt--;
                }
                return { ...p, stats };
            })
        };
    };

    return {
        ...state,
        teamA: updateTeam(state.teamA, entry.teamId === 'teamA'),
        teamB: updateTeam(state.teamB, entry.teamId === 'teamB'),
        scoreHistory: state.scoreHistory.filter(s => s.id !== entryId),
    };
}

export function handleEditScore(state: Game, payload: GameAction['payload']): Game {
    const { entryId, newPlayerId, newScoreType } = payload as {
        entryId: string;
        newPlayerId: string;
        newScoreType: '2P' | '3P' | 'FT';
    };
    const entry = state.scoreHistory.find(s => s.id === entryId);
    if (!entry) return state;

    const oldPoints = entry.points;
    const newPoints = newScoreType === '3P' ? 3 : newScoreType === '2P' ? 2 : 1;

    // 元の選手からスタッツを減算
    const removeFromPlayer = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== entry.playerId) return p;
                const stats = { ...p.stats, points: p.stats.points - oldPoints };
                if (entry.scoreType === '2P') { stats.twoPointMade--; stats.twoPointAttempt--; }
                else if (entry.scoreType === '3P') { stats.threePointMade--; stats.threePointAttempt--; }
                else { stats.freeThrowMade--; stats.freeThrowAttempt--; }
                return { ...p, stats };
            })
        };
    };

    // 新しい選手にスタッツを加算
    const addToPlayer = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== newPlayerId) return p;
                const stats = { ...p.stats, points: p.stats.points + newPoints };
                if (newScoreType === '2P') { stats.twoPointMade++; stats.twoPointAttempt++; }
                else if (newScoreType === '3P') { stats.threePointMade++; stats.threePointAttempt++; }
                else { stats.freeThrowMade++; stats.freeThrowAttempt++; }
                return { ...p, stats };
            })
        };
    };

    const newPlayer = [...state.teamA.players, ...state.teamB.players].find(p => p.id === newPlayerId);
    const updatedEntry: ScoreEntry = {
        ...entry,
        playerId: newPlayerId,
        playerNumber: newPlayer?.number || entry.playerNumber,
        scoreType: newScoreType,
        points: newPoints,
    };

    // まず元の選手から減算
    let teamA = removeFromPlayer(state.teamA, entry.teamId === 'teamA');
    let teamB = removeFromPlayer(state.teamB, entry.teamId === 'teamB');
    // 次に新しい選手に加算
    teamA = addToPlayer(teamA, entry.teamId === 'teamA');
    teamB = addToPlayer(teamB, entry.teamId === 'teamB');

    return {
        ...state,
        teamA,
        teamB,
        scoreHistory: state.scoreHistory.map(s => s.id === entryId ? updatedEntry : s),
    };
}

export function handleConvertScoreToMiss(state: Game, payload: GameAction['payload']): Game {
    // 成功 → ミスへの変換
    const { entryId, newMissType } = payload as {
        entryId: string;
        newMissType: '2PA' | '3PA' | 'FTA';
    };
    const entry = state.scoreHistory.find(s => s.id === entryId);
    if (!entry) return state;

    const oldPoints = entry.points;

    // 元の選手からスコア分を減算
    const removeScore = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== entry.playerId) return p;
                const stats = { ...p.stats, points: p.stats.points - oldPoints };
                if (entry.scoreType === '2P') { stats.twoPointMade--; stats.twoPointAttempt--; }
                else if (entry.scoreType === '3P') { stats.threePointMade--; stats.threePointAttempt--; }
                else { stats.freeThrowMade--; stats.freeThrowAttempt--; }
                return { ...p, stats };
            })
        };
    };

    // ミスのアテンプトを加算
    const addMiss = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== entry.playerId) return p;
                const stats = { ...p.stats };
                if (newMissType === '2PA') { stats.twoPointAttempt++; }
                else if (newMissType === '3PA') { stats.threePointAttempt++; }
                else { stats.freeThrowAttempt++; }
                return { ...p, stats };
            })
        };
    };

    let teamA = removeScore(state.teamA, entry.teamId === 'teamA');
    let teamB = removeScore(state.teamB, entry.teamId === 'teamB');
    teamA = addMiss(teamA, entry.teamId === 'teamA');
    teamB = addMiss(teamB, entry.teamId === 'teamB');

    // 新しいStatEntryを作成
    const newStatEntry: StatEntry = {
        id: crypto.randomUUID(),
        teamId: entry.teamId,
        playerId: entry.playerId,
        playerNumber: entry.playerNumber,
        statType: newMissType,
        quarter: entry.quarter,
        timestamp: entry.timestamp, // 元のタイムスタンプを維持
    };

    // scoreHistoryから削除し、statHistoryに追加
    const newScoreHistory = state.scoreHistory.filter(s => s.id !== entryId);
    const newStatHistory = [...state.statHistory, newStatEntry];

    // ランニングスコアを再計算
    const recalculatedScoreHistory = recalculateRunningScores(newScoreHistory);

    return {
        ...state,
        teamA,
        teamB,
        scoreHistory: recalculatedScoreHistory,
        statHistory: newStatHistory,
    };
}

export function handleConvertMissToScore(state: Game, payload: GameAction['payload']): Game {
    // ミス → 成功への変換
    const { entryId, newScoreType } = payload as {
        entryId: string;
        newScoreType: '2P' | '3P' | 'FT';
    };
    const entry = state.statHistory.find(s => s.id === entryId);
    if (!entry) return state;

    // 2PA, 3PA, FTA のみ変換可能
    if (!['2PA', '3PA', 'FTA'].includes(entry.statType)) return state;

    const newPoints = newScoreType === '3P' ? 3 : newScoreType === '2P' ? 2 : 1;

    // 元の選手からミスのアテンプトを減算
    const removeMiss = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== entry.playerId) return p;
                const stats = { ...p.stats };
                if (entry.statType === '2PA') { stats.twoPointAttempt--; }
                else if (entry.statType === '3PA') { stats.threePointAttempt--; }
                else if (entry.statType === 'FTA') { stats.freeThrowAttempt--; }
                return { ...p, stats };
            })
        };
    };

    // 得点を加算
    const addScore = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== entry.playerId) return p;
                const stats = { ...p.stats, points: p.stats.points + newPoints };
                if (newScoreType === '2P') { stats.twoPointMade++; stats.twoPointAttempt++; }
                else if (newScoreType === '3P') { stats.threePointMade++; stats.threePointAttempt++; }
                else { stats.freeThrowMade++; stats.freeThrowAttempt++; }
                return { ...p, stats };
            })
        };
    };

    let teamA = removeMiss(state.teamA, entry.teamId === 'teamA');
    let teamB = removeMiss(state.teamB, entry.teamId === 'teamB');
    teamA = addScore(teamA, entry.teamId === 'teamA');
    teamB = addScore(teamB, entry.teamId === 'teamB');

    // 新しいScoreEntryを作成（ランニングスコアは後で再計算）
    const newScoreEntry: ScoreEntry = {
        id: crypto.randomUUID(),
        teamId: entry.teamId,
        playerId: entry.playerId,
        playerNumber: entry.playerNumber,
        scoreType: newScoreType,
        points: newPoints,
        quarter: entry.quarter,
        timestamp: entry.timestamp, // 元のタイムスタンプを維持
        runningScoreA: 0, // 後で再計算
        runningScoreB: 0, // 後で再計算
    };

    // statHistoryから削除し、scoreHistoryに追加
    const newStatHistory = state.statHistory.filter(s => s.id !== entryId);
    const newScoreHistory = [...state.scoreHistory, newScoreEntry];

    // ランニングスコアを再計算
    const recalculatedScoreHistory = recalculateRunningScores(newScoreHistory);

    return {
        ...state,
        teamA,
        teamB,
        scoreHistory: recalculatedScoreHistory,
        statHistory: newStatHistory,
    };
}

export function handleToggleOwnGoal(state: Game, payload: GameAction['payload']): Game {
    const { entryId } = payload as { entryId: string };
    return {
        ...state,
        scoreHistory: state.scoreHistory.map(entry =>
            entry.id === entryId
                ? { ...entry, isOwnGoal: !entry.isOwnGoal }
                : entry
        ),
    };
}
