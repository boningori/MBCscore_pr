import type { Game, PayloadOf, StatEntry } from '../../types/game';

export function handleAddStat(state: Game, payload: PayloadOf<'ADD_STAT'>): Game {
    const { teamId, playerId, statType, entryId } = payload;

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

    const player = [...state.teamA.players, ...state.teamB.players].find(p => p.id === playerId);
    const statEntry: StatEntry = {
        id: entryId ?? crypto.randomUUID(),
        teamId,
        playerId,
        playerNumber: player?.number || 0,
        statType,
        quarter: state.currentQuarter,
        timestamp: Date.now(),
    };

    return {
        ...state,
        teamA: updatePlayerStat(state.teamA, teamId === 'teamA'),
        teamB: updatePlayerStat(state.teamB, teamId === 'teamB'),
        statHistory: [...state.statHistory, statEntry],
        selectedPlayerId: null,
        selectedTeamId: null,
    };
}

export function handleRemoveStat(state: Game, payload: PayloadOf<'REMOVE_STAT'>): Game {
    const { entryId } = payload;
    const entry = state.statHistory.find(s => s.id === entryId);
    if (!entry) return state;

    const updateTeam = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== entry.playerId) return p;
                const stats = { ...p.stats };
                switch (entry.statType) {
                    case 'OREB': stats.offensiveRebounds--; break;
                    case 'DREB': stats.defensiveRebounds--; break;
                    case 'AST': stats.assists--; break;
                    case 'STL': stats.steals--; break;
                    case 'BLK': stats.blocks--; break;
                    case 'TO': stats.turnovers--; break;
                    case 'TO:DD': stats.turnovers--; stats.turnoverDD--; break;
                    case 'TO:TR': stats.turnovers--; stats.turnoverTR--; break;
                    case 'TO:PM': stats.turnovers--; stats.turnoverPM--; break;
                    case 'TO:CM': stats.turnovers--; stats.turnoverCM--; break;
                    case '2PA': stats.twoPointAttempt--; break;
                    case '3PA': stats.threePointAttempt--; break;
                    case 'FTA': stats.freeThrowAttempt--; break;
                }
                return { ...p, stats };
            })
        };
    };

    return {
        ...state,
        teamA: updateTeam(state.teamA, entry.teamId === 'teamA'),
        teamB: updateTeam(state.teamB, entry.teamId === 'teamB'),
        statHistory: state.statHistory.filter(s => s.id !== entryId),
    };
}

export function handleEditStat(state: Game, payload: PayloadOf<'EDIT_STAT'>): Game {
    const { entryId, newPlayerId, newStatType } = payload;
    const entry = state.statHistory.find(s => s.id === entryId);
    if (!entry) return state;

    // 元の選手からスタッツを減算
    const removeFromPlayer = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== entry.playerId) return p;
                const stats = { ...p.stats };
                switch (entry.statType) {
                    case 'OREB': stats.offensiveRebounds--; break;
                    case 'DREB': stats.defensiveRebounds--; break;
                    case 'AST': stats.assists--; break;
                    case 'STL': stats.steals--; break;
                    case 'BLK': stats.blocks--; break;
                    case 'TO': stats.turnovers--; break;
                    case 'TO:DD': stats.turnovers--; stats.turnoverDD--; break;
                    case 'TO:TR': stats.turnovers--; stats.turnoverTR--; break;
                    case 'TO:PM': stats.turnovers--; stats.turnoverPM--; break;
                    case 'TO:CM': stats.turnovers--; stats.turnoverCM--; break;
                    case '2PA': stats.twoPointAttempt--; break;
                    case '3PA': stats.threePointAttempt--; break;
                    case 'FTA': stats.freeThrowAttempt--; break;
                }
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
                const stats = { ...p.stats };
                switch (newStatType) {
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

    const newPlayer = [...state.teamA.players, ...state.teamB.players].find(p => p.id === newPlayerId);
    const updatedEntry: StatEntry = {
        ...entry,
        playerId: newPlayerId,
        playerNumber: newPlayer?.number || entry.playerNumber,
        statType: newStatType,
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
        statHistory: state.statHistory.map(s => s.id === entryId ? updatedEntry : s),
    };
}
