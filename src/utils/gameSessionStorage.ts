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

// 中断した試合の復元元。game を持たない形が入っていると復元直後に落ちるため、
// 最低限そこだけ確かめる（無効なら「中断中の試合なし」として扱われる）
const sessionStorage_ = createJsonStorage<GameSession | null>(
    GAME_SESSION_KEY, null, 'game session',
    (v): v is GameSession | null =>
        v === null || (typeof v === 'object' && !Array.isArray(v) && typeof (v as GameSession).game === 'object' && (v as GameSession).game !== null),
);

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
