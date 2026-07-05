import React, { createContext, useContext, useReducer } from 'react';
import type { ReactNode } from 'react';
import type {
    Game,
    GameAction,
    Player,
} from '../types/game';
import {
    createInitialGame,
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
import {
    handleSetTeams,
    handleStartGame,
    handleEndQuarter,
    handleAddTimeout,
    handleSubstitutePlayer,
    handleAddPlayerToTeam,
    handleSelectPlayer,
    handleRestoreGame,
    handleUpdateGameInfo,
} from './reducers/gameFlowHandlers';

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
        case 'SET_TEAMS':
            return handleSetTeams(state, action.payload);

        case 'START_GAME':
            return handleStartGame(state);

        case 'PAUSE_GAME':
            return { ...state, phase: 'paused' };

        case 'RESUME_GAME':
            return { ...state, phase: 'playing' };

        case 'END_QUARTER':
            return handleEndQuarter(state);

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

        case 'ADD_TIMEOUT':
            return handleAddTimeout(state, action.payload);

        case 'SUBSTITUTE_PLAYER':
            return handleSubstitutePlayer(state, action.payload);

        case 'ADD_PLAYER_TO_TEAM':
            return handleAddPlayerToTeam(state, action.payload);

        case 'SELECT_PLAYER':
            return handleSelectPlayer(state, action.payload);

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

        case 'RESTORE_GAME':
            return handleRestoreGame(action.payload);

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

        case 'UPDATE_GAME_INFO':
            return handleUpdateGameInfo(state, action.payload);

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
