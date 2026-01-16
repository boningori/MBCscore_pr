// 試合セッション永続保存（キャッシュ）用ストレージ
// 試合中は連続的に保存し、画面遷移しても再開可能にする

import type { Game } from '../types/game';

const GAME_SESSION_KEY = 'minibasket-game-session';

export interface GameSession {
    game: Game;
    gameName: string;
    date: string;
    savedAt: string;
}

// 試合セッションを保存
export function saveGameSession(game: Game, gameName: string, date: string): void {
    try {
        const session: GameSession = {
            game,
            gameName,
            date,
            savedAt: new Date().toISOString(),
        };
        localStorage.setItem(GAME_SESSION_KEY, JSON.stringify(session));
    } catch (error) {
        console.error('Failed to save game session:', error);
    }
}

// 試合セッションを読み込み
export function loadGameSession(): GameSession | null {
    try {
        const data = localStorage.getItem(GAME_SESSION_KEY);
        if (!data) return null;
        return JSON.parse(data) as GameSession;
    } catch (error) {
        console.error('Failed to load game session:', error);
        return null;
    }
}

// 試合セッションをクリア
export function clearGameSession(): void {
    try {
        localStorage.removeItem(GAME_SESSION_KEY);
    } catch (error) {
        console.error('Failed to clear game session:', error);
    }
}

// 試合セッションが存在するか確認
export function hasGameSession(): boolean {
    return localStorage.getItem(GAME_SESSION_KEY) !== null;
}
