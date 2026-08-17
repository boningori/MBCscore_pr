// gameReducer 本体（Fast Refresh対応のため、コンポーネントを含むGameContext.tsxから分離）

import type { Game, GameAction } from '../../types/game';
import { createInitialGame } from '../../types/game';
import {
    handleAddScore,
    handleRemoveScore,
    handleEditScore,
    handleConvertScoreToMiss,
    handleConvertMissToScore,
    handleToggleOwnGoal,
} from './scoreHandlers';
import {
    handleAddStat,
    handleRemoveStat,
    handleEditStat,
} from './statHandlers';
import {
    handleAddFoul,
    handleAddFoulWithFreeThrows,
    handleEditFoul,
    handleRemoveFoul,
} from './foulHandlers';
import {
    handleAddPendingAction,
    handleResolvePendingAction,
    handleUpdatePendingActionCandidates,
    handleRemovePendingAction,
    handleResolvePendingActionWithFoulType,
    handleResolvePendingActionWithFreeThrows,
    handleResolvePendingActionUnknown,
} from './pendingHandlers';
import {
    handleSetTeams,
    handleStartGame,
    handleEndQuarter,
    handleUndoQuarterEnd,
    handleAddTimeout,
    handleRemoveTimeout,
    handleSubstitutePlayer,
    handleAddPlayerToTeam,
    handleSelectPlayer,
    handleRestoreGame,
    handleUpdateGameInfo,
} from './gameFlowHandlers';

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

        case 'UNDO_QUARTER_END':
            return handleUndoQuarterEnd(state);

        case 'SET_SHOW_THREE_POINT':
            return { ...state, showThreePoint: action.payload.showThreePoint };

        case 'SET_QUARTER_MINUTES':
            return { ...state, quarterMinutes: action.payload.quarterMinutes };

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

        case 'REMOVE_TIMEOUT':
            return handleRemoveTimeout(state, action.payload);

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

        case 'EDIT_FOUL':
            return handleEditFoul(state, action.payload);

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
            const { endTime } = action.payload;
            return { ...state, endTime };
        }

        default:
            return state;
    }
}
