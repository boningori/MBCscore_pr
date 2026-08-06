import type {
    Game,
    PayloadOf,
    Player,
} from '../../types/game';
import { createInitialGameInfo, DEFAULT_QUARTER_MINUTES } from '../../types/game';

export function handleSetTeams(state: Game, payload: PayloadOf<'SET_TEAMS'>): Game {
    const { teamA, teamB, showThreePoint, quarterMinutes } = payload;
    // デフォルトカラー設定（setupデータから来る場合は上書きされる可能性があるが、ここで保証する）
    const teamAWithColor = { ...teamA, color: teamA.color || 'white' };
    const teamBWithColor = { ...teamB, color: teamB.color || 'blue' };
    return {
        ...state,
        teamA: teamAWithColor,
        teamB: teamBWithColor,
        showThreePoint: showThreePoint ?? state.showThreePoint,
        quarterMinutes: quarterMinutes ?? state.quarterMinutes,
    };
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

// クォーター終了の取り消し（誤タップ復帰用）
// quarterEnd中のみ有効。新クォーターとして記録済みのエントリがある場合は
// クォーター帰属が壊れるため取り消さない。
export function handleUndoQuarterEnd(state: Game): Game {
    if (state.phase !== 'quarterEnd') return state;

    const newQuarter = state.currentQuarter; // 未開始の次クォーター
    const prevQuarter = newQuarter - 1;
    if (prevQuarter < 1) return state;

    const hasEntriesInNewQuarter =
        state.scoreHistory.some(e => e.quarter === newQuarter) ||
        state.statHistory.some(e => e.quarter === newQuarter) ||
        state.foulHistory.some(e => e.quarter === newQuarter);
    if (hasEntriesInNewQuarter) return state;

    const revertTeam = (team: typeof state.teamA) => ({
        ...team,
        // OT突入取り消し時はEND_QUARTERで延長した枠を戻す
        teamFouls: newQuarter > 4 ? team.teamFouls.slice(0, prevQuarter) : team.teamFouls,
        players: team.players.map(p => ({
            ...p,
            quartersPlayed: newQuarter > 4
                ? p.quartersPlayed.slice(0, prevQuarter)
                // 部分的にラインナップ確定済みでも、新Qの出場フラグは白紙に戻す
                : p.quartersPlayed.map((q, i) => (i === newQuarter - 1 ? false as const : q)),
        })),
    });

    return {
        ...state,
        currentQuarter: prevQuarter,
        phase: 'playing',
        teamA: revertTeam(state.teamA),
        teamB: revertTeam(state.teamB),
    };
}

export function handleAddTimeout(state: Game, payload: PayloadOf<'ADD_TIMEOUT'>): Game {
    const { teamId, elapsedMinutes } = payload;

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

export function handleSubstitutePlayer(state: Game, payload: PayloadOf<'SUBSTITUTE_PLAYER'>): Game {
    const { teamId, playerInId, playerOutId } = payload;

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

export function handleAddPlayerToTeam(state: Game, payload: PayloadOf<'ADD_PLAYER_TO_TEAM'>): Game {
    const { teamId, number, name } = payload;

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

export function handleSelectPlayer(state: Game, payload: PayloadOf<'SELECT_PLAYER'>): Game {
    const { playerId, teamId } = payload;
    return { ...state, selectedPlayerId: playerId, selectedTeamId: teamId };
}

export function handleRestoreGame(payload: PayloadOf<'RESTORE_GAME'>): Game {
    const { game } = payload;
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
        showThreePoint: game.showThreePoint ?? true,
        quarterMinutes: game.quarterMinutes ?? DEFAULT_QUARTER_MINUTES,
    };
}

export function handleUpdateGameInfo(state: Game, payload: PayloadOf<'UPDATE_GAME_INFO'>): Game {
    const gameInfo = payload;
    return {
        ...state,
        gameInfo: {
            ...(state.gameInfo || createInitialGameInfo()),
            ...gameInfo,
        },
    };
}
