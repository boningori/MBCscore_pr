import React, { createContext, useContext, useReducer } from 'react';
import type { ReactNode } from 'react';
import type {
    Game,
    GameAction,
    Player,
} from '../types/game';
import { createInitialGame } from '../types/game';
import { gameReducer } from './reducers';

// Context
interface GameContextType {
    state: Game;
    dispatch: React.Dispatch<GameAction>;
    // ヘルパー関数
    getTeamScore: (teamId: string) => number;
    getPlayerById: (playerId: string) => Player | null;
    getPlayersOnCourt: (teamId: string) => Player[];
    getTeamFoulsInQuarter: (teamId: string, quarter: number) => number;
}

const GameContext = createContext<GameContextType | null>(null);

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

    // canPlayerPlay（5ファウル未満か）はここにあったが、参照が無かった。
    // 出場可否でコートから外す用途を想定した名前だが、練習試合では
    // 相手チームの同意のうえで退場者が出続ける運用があるため、そもそも
    // アプリ側で出場を止めない方針にしている（PROJECT_MAP「設計上の制約」）。
    // 退場は useFoulOutNotice と表示で伝える。

    return (
        <GameContext.Provider value={{
            state,
            dispatch,
            getTeamScore,
            getPlayerById,
            getPlayersOnCourt,
            getTeamFoulsInQuarter,
        }}>
            {children}
        </GameContext.Provider>
    );
}

// Hook
// eslint-disable-next-line react-refresh/only-export-components -- hookはコンポーネントと同居が自然なため
export function useGame() {
    const context = useContext(GameContext);
    if (!context) {
        throw new Error('useGame must be used within a GameProvider');
    }
    return context;
}
