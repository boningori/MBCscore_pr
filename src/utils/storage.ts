import type { Game } from '../types/game';

const STORAGE_KEY = 'minibasket-score-game';

// ゲームをLocalStorageに保存
export const saveGame = (game: Game): void => {
    try {
        const serialized = JSON.stringify(game);
        localStorage.setItem(STORAGE_KEY, serialized);
    } catch (error) {
        console.error('Failed to save game:', error);
    }
};

// ゲームをLocalStorageから読み込み
export const loadGame = (): Game | null => {
    try {
        const serialized = localStorage.getItem(STORAGE_KEY);
        if (!serialized) return null;
        return JSON.parse(serialized) as Game;
    } catch (error) {
        console.error('Failed to load game:', error);
        return null;
    }
};

// ゲームを削除
export const clearGame = (): void => {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.error('Failed to clear game:', error);
    }
};

// 全ゲーム履歴を保存（将来の機能用）
const HISTORY_KEY = 'minibasket-score-history';

export const saveGameToHistory = (game: Game): void => {
    try {
        const history = getGameHistory();
        history.push({
            ...game,
            endTime: new Date(),
        });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
        console.error('Failed to save game history:', error);
    }
};

export const getGameHistory = (): Game[] => {
    try {
        const serialized = localStorage.getItem(HISTORY_KEY);
        if (!serialized) return [];
        return JSON.parse(serialized) as Game[];
    } catch (error) {
        console.error('Failed to load game history:', error);
        return [];
    }
};
