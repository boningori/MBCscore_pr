// 試合セッション永続保存（キャッシュ）用ストレージ
// 試合中は連続的に保存し、画面遷移しても再開可能にする

import type { Game } from '../types/game';
import { createJsonStorage } from './createStorage';

const GAME_SESSION_KEY = 'minibasket-game-session';

export interface GameSession {
    game: Game;
    gameName: string;
    date: string;
    savedAt: string;
}

const sessionStorage_ = createJsonStorage<GameSession | null>(GAME_SESSION_KEY, null, 'game session');

// 試合セッションを保存
export function saveGameSession(game: Game, gameName: string, date: string): void {
    sessionStorage_.save({
        game,
        gameName,
        date,
        savedAt: new Date().toISOString(),
    });
}

// 試合セッションを読み込み
export function loadGameSession(): GameSession | null {
    return sessionStorage_.load();
}

// 試合セッションをクリア
export function clearGameSession(): void {
    sessionStorage_.clear();
}

// 試合セッションが存在するか確認
export function hasGameSession(): boolean {
    return localStorage.getItem(GAME_SESSION_KEY) !== null;
}
