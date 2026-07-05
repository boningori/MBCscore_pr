import React, { createContext, useContext, useReducer } from 'react';
import type { ReactNode } from 'react';
import type {
    Game,
    GameAction,
    Player,
} from '../types/game';
import type { GameInfo } from '../types/game';
import {
    createInitialGame,
    createInitialGameInfo,
    MAX_PERSONAL_FOULS,
} from '../types/game';
import {
    handleAddScore,
    handleRemoveScore,
    handleEditScore,
    handleConvertScoreToMiss,
    handleConvertMissToScore,
    handleToggleOwnGoal,
} from './reducers/scoreHandlers';
import {
    handleAddStat,
    handleRemoveStat,
    handleEditStat,
} from './reducers/statHandlers';
import {
    handleAddFoul,
    handleAddFoulWithFreeThrows,
    handleRemoveFoul,
} from './reducers/foulHandlers';
import {
    handleAddPendingAction,
    handleResolvePendingAction,
    handleUpdatePendingActionCandidates,
    handleRemovePendingAction,
    handleResolvePendingActionWithFoulType,
    handleResolvePendingActionWithFreeThrows,
    handleResolvePendingActionUnknown,
} from './reducers/pendingHandlers';

// Context
interface GameContextType {
    state: Game;
    dispatch: React.Dispatch<GameAction>;
    // ヘルパー関数
    getTeamScore: (teamId: string) => number;
    getPlayerById: (playerId: string) => Player | null;
    getPlayersOnCourt: (teamId: string) => Player[];
    getTeamFoulsInQuarter: (teamId: string, quarter: number) => number;
    canPlayerPlay: (player: Player) => boolean;
}

const GameContext = createContext<GameContextType | null>(null);

// Reducer
export function gameReducer(state: Game, action: GameAction): Game {
    switch (action.type) {
        case 'SET_TEAMS': {
            const { teamA, teamB } = action.payload;
            // デフォルトカラー設定（setupデータから来る場合は上書きされる可能性があるが、ここで保証する）
            const teamAWithColor = { ...teamA, color: teamA.color || 'white' };
            const teamBWithColor = { ...teamB, color: teamB.color || 'blue' };
            return { ...state, teamA: teamAWithColor, teamB: teamBWithColor };
        }

        case 'START_GAME': {
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

        case 'PAUSE_GAME':
            return { ...state, phase: 'paused' };

        case 'RESUME_GAME':
            return { ...state, phase: 'playing' };

        case 'END_QUARTER': {
            const nextQuarter = state.currentQuarter + 1;
            if (nextQuarter > 4) {
                const scoreA = state.teamA.players.reduce((sum, p) => sum + p.stats.points, 0);
                const scoreB = state.teamB.players.reduce((sum, p) => sum + p.stats.points, 0);
                if (scoreA === scoreB) {
                    const extendForOT = (team: typeof state.teamA) => ({
                        ...team,
                        teamFouls: [...team.teamFouls, 0],
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

        case 'END_GAME':
            return { ...state, phase: 'finished', endTime: new Date() };



        case 'ADD_SCORE':
            return handleAddScore(state, action.payload);

        case 'ADD_STAT':
            return handleAddStat(state, action.payload);

        case 'ADD_FOUL':
            return handleAddFoul(state, action.payload);

        case 'ADD_FOUL_WITH_FREE_THROWS':
            return handleAddFoulWithFreeThrows(state, action.payload);

        case 'ADD_TIMEOUT': {
            const { teamId, elapsedMinutes } = action.payload as {
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

        case 'SUBSTITUTE_PLAYER': {
            const { teamId, playerInId, playerOutId } = action.payload as {
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

        case 'ADD_PLAYER_TO_TEAM': {
            const { teamId, number, name } = action.payload as {
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

        case 'SELECT_PLAYER': {
            const { playerId, teamId } = action.payload;
            return { ...state, selectedPlayerId: playerId, selectedTeamId: teamId };
        }

        case 'CLEAR_SELECTION':
            return { ...state, selectedPlayerId: null, selectedTeamId: null };

        case 'RESET_GAME':
            return createInitialGame();

        case 'REMOVE_SCORE':
            return handleRemoveScore(state, action.payload);

        case 'REMOVE_STAT':
            return handleRemoveStat(state, action.payload);

        case 'REMOVE_FOUL':
            return handleRemoveFoul(state, action.payload);

        case 'RESTORE_GAME': {
            const { game } = action.payload as { game: Game };
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

        case 'EDIT_SCORE':
            return handleEditScore(state, action.payload);

        case 'EDIT_STAT':
            return handleEditStat(state, action.payload);

        case 'CONVERT_SCORE_TO_MISS':
            return handleConvertScoreToMiss(state, action.payload);

        case 'CONVERT_MISS_TO_SCORE':
            return handleConvertMissToScore(state, action.payload);

        case 'ADD_PENDING_ACTION':
            return handleAddPendingAction(state, action.payload);

        case 'RESOLVE_PENDING_ACTION':
            return handleResolvePendingAction(state, action.payload);

        case 'UPDATE_PENDING_ACTION_CANDIDATES':
            return handleUpdatePendingActionCandidates(state, action.payload);

        case 'REMOVE_PENDING_ACTION':
            return handleRemovePendingAction(state, action.payload);

        case 'RESOLVE_PENDING_ACTION_WITH_FOUL_TYPE':
            return handleResolvePendingActionWithFoulType(state, action.payload);

        case 'RESOLVE_PENDING_ACTION_WITH_FREE_THROWS':
            return handleResolvePendingActionWithFreeThrows(state, action.payload);

        case 'RESOLVE_PENDING_ACTION_UNKNOWN':
            return handleResolvePendingActionUnknown(state, action.payload);

        case 'UPDATE_GAME_INFO': {
            const gameInfo = action.payload as Partial<GameInfo>;
            return {
                ...state,
                gameInfo: {
                    ...(state.gameInfo || createInitialGameInfo()),
                    ...gameInfo,
                },
            };
        }

        case 'TOGGLE_OWN_GOAL':
            return handleToggleOwnGoal(state, action.payload);

        case 'SET_END_TIME': {
            const { endTime } = action.payload as { endTime: Date | null };
            return { ...state, endTime };
        }

        default:
            return state;
    }
}

// Provider
export function GameProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(gameReducer, createInitialGame());

    // ヘルパー関数
    const getTeamScore = (teamId: string): number => {
        const team = teamId === 'teamA' ? state.teamA : state.teamB;
        return team.players.reduce((sum, p) => sum + p.stats.points, 0);
    };

    const getPlayerById = (playerId: string): Player | null => {
        return [...state.teamA.players, ...state.teamB.players].find(p => p.id === playerId) || null;
    };

    const getPlayersOnCourt = (teamId: string): Player[] => {
        const team = teamId === 'teamA' ? state.teamA : state.teamB;
        return team.players.filter(p => p.isOnCourt);
    };

    const getTeamFoulsInQuarter = (teamId: string, quarter: number): number => {
        const team = teamId === 'teamA' ? state.teamA : state.teamB;
        return team.teamFouls[quarter - 1] || 0;
    };

    const canPlayerPlay = (player: Player): boolean => {
        return player.fouls.length < MAX_PERSONAL_FOULS;
    };

    return (
        <GameContext.Provider value={{
            state,
            dispatch,
            getTeamScore,
            getPlayerById,
            getPlayersOnCourt,
            getTeamFoulsInQuarter,
            canPlayerPlay,
        }}>
            {children}
        </GameContext.Provider>
    );
}

// Hook
export function useGame() {
    const context = useContext(GameContext);
    if (!context) {
        throw new Error('useGame must be used within a GameProvider');
    }
    return context;
}
