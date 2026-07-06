import type {
    Game,
    GameAction,
    Player,
    GameInfo,
} from '../../types/game';
import { createInitialGameInfo } from '../../types/game';

export function handleSetTeams(state: Game, payload: GameAction['payload']): Game {
    const { teamA, teamB } = payload as { teamA: Game['teamA']; teamB: Game['teamB'] };
    // デフォルトカラー設定（setupデータから来る場合は上書きされる可能性があるが、ここで保証する）
    const teamAWithColor = { ...teamA, color: teamA.color || 'white' };
    const teamBWithColor = { ...teamB, color: teamB.color || 'blue' };
    return { ...state, teamA: teamAWithColor, teamB: teamBWithColor };
}

export function handleStartGame(state: Game): Game {
    // コート上の選手の出場時限を記録（スターターとして）
    const updateQuarters = (team: typeof state.teamA) => ({
        ...team,
        players: team.players.map(p => ({
            ...p,
            quartersPlayed: p.isOnCourt
                ? p.quartersPlayed.map((q, i) => i === state.currentQuarter - 1 ? 'starter' as const : q)
                : p.quartersPlayed
        }))
    });
    return {
        ...state,
        phase: 'playing',
        teamA: updateQuarters(state.teamA),
        teamB: updateQuarters(state.teamB),
        startTime: state.startTime || new Date(),
    };
}

export function handleEndQuarter(state: Game): Game {
    const nextQuarter = state.currentQuarter + 1;
    if (nextQuarter > 4) {
        const scoreA = state.teamA.players.reduce((sum, p) => sum + p.stats.points, 0);
        const scoreB = state.teamB.players.reduce((sum, p) => sum + p.stats.points, 0);
        if (scoreA === scoreB) {
            // OTは第4Qの延長とみなし、チームファウルはリセットせず直前ピリオドから通算する（FIBA/JBA）
            const extendForOT = (team: typeof state.teamA) => ({
                ...team,
                teamFouls: [...team.teamFouls, team.teamFouls[team.teamFouls.length - 1] ?? 0],
                players: team.players.map(p => ({
                    ...p,
                    quartersPlayed: [...p.quartersPlayed, false as const],
                })),
            });
            return {
                ...state,
                currentQuarter: nextQuarter,
                phase: 'quarterEnd',
                teamA: extendForOT(state.teamA),
                teamB: extendForOT(state.teamB),
            };
        }
        return { ...state, phase: 'finished', endTime: new Date() };
    }
    return {
        ...state,
        currentQuarter: nextQuarter,
        phase: 'quarterEnd',
    };
}

export function handleAddTimeout(state: Game, payload: GameAction['payload']): Game {
    const { teamId, elapsedMinutes } = payload as {
        teamId: string;
        elapsedMinutes: number;
    };

    const updateTeamTimeout = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            timeouts: [...team.timeouts, { quarter: state.currentQuarter, elapsedMinutes }]
        };
    };

    return {
        ...state,
        teamA: updateTeamTimeout(state.teamA, teamId === 'teamA'),
        teamB: updateTeamTimeout(state.teamB, teamId === 'teamB'),
    };
}

export function handleSubstitutePlayer(state: Game, payload: GameAction['payload']): Game {
    const { teamId, playerInId, playerOutId } = payload as {
        teamId: string;
        playerInId: string;
        playerOutId: string;
    };

    const updateTeamSubstitution = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id === playerInId) {
                    const quartersPlayed = [...p.quartersPlayed];
                    const currentQIndex = state.currentQuarter - 1;
                    const current = quartersPlayed[currentQIndex];
                    // スターターが一度退いて再度入る場合は'both'（×表示）
                    // 途中交代で出て一度退いて再度入る場合も'both'
                    if (current === 'starter' || current === 'sub') {
                        quartersPlayed[currentQIndex] = 'both';
                    } else if (current !== 'both') {
                        // 初めての途中出場は'sub'
                        quartersPlayed[currentQIndex] = 'sub';
                    }
                    return { ...p, isOnCourt: true, quartersPlayed };
                }
                if (p.id === playerOutId) {
                    return { ...p, isOnCourt: false };
                }
                return p;
            })
        };
    };

    return {
        ...state,
        teamA: updateTeamSubstitution(state.teamA, teamId === 'teamA'),
        teamB: updateTeamSubstitution(state.teamB, teamId === 'teamB'),
    };
}

export function handleAddPlayerToTeam(state: Game, payload: GameAction['payload']): Game {
    const { teamId, number, name } = payload as {
        teamId: string;
        number: number;
        name: string;
    };

    const quarterCount = Math.max(4, state.teamA.teamFouls.length);
    const newPlayer: Player = {
        id: crypto.randomUUID(),
        number,
        name,
        isCaptain: false,
        fouls: [],
        stats: {
            points: 0,
            twoPointMade: 0,
            twoPointAttempt: 0,
            threePointMade: 0,
            threePointAttempt: 0,
            freeThrowMade: 0,
            freeThrowAttempt: 0,
            offensiveRebounds: 0,
            defensiveRebounds: 0,
            assists: 0,
            steals: 0,
            blocks: 0,
            turnovers: 0,
            turnoverDD: 0,
            turnoverTR: 0,
            turnoverPM: 0,
            turnoverCM: 0,
        },
        quartersPlayed: Array(quarterCount).fill(false),
        isOnCourt: false,
    };

    const addPlayerToTeam = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        // 背番号順にソートして追加
        const players = [...team.players, newPlayer].sort((a, b) => {
            // 00 (DOUBLE_ZERO_INTERNAL = 100) は最後
            const numA = a.number === 100 ? 1000 : a.number;
            const numB = b.number === 100 ? 1000 : b.number;
            return numA - numB;
        });
        return { ...team, players };
    };

    return {
        ...state,
        teamA: addPlayerToTeam(state.teamA, teamId === 'teamA'),
        teamB: addPlayerToTeam(state.teamB, teamId === 'teamB'),
    };
}

export function handleSelectPlayer(state: Game, payload: GameAction['payload']): Game {
    const { playerId, teamId } = payload as { playerId: Game['selectedPlayerId']; teamId: Game['selectedTeamId'] };
    return { ...state, selectedPlayerId: playerId, selectedTeamId: teamId };
}

export function handleRestoreGame(payload: GameAction['payload']): Game {
    const { game } = payload as { game: Game };
    // 古いデータとの互換性のため、新しいフィールドを補完
    const migrateTeam = (team: typeof game.teamA) => ({
        ...team,
        assistantCoachFouls: team.assistantCoachFouls || [],
        benchFouls: team.benchFouls || [],
    });
    return {
        ...game,
        teamA: migrateTeam(game.teamA),
        teamB: migrateTeam(game.teamB),
    };
}

export function handleUpdateGameInfo(state: Game, payload: GameAction['payload']): Game {
    const gameInfo = payload as Partial<GameInfo>;
    return {
        ...state,
        gameInfo: {
            ...(state.gameInfo || createInitialGameInfo()),
            ...gameInfo,
        },
    };
}
