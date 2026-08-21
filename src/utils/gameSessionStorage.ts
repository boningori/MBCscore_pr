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

/** 中断セッションの状態。ホームの導線の文言を決めるために使う */
export type GameSessionState = 'none' | 'inProgress' | 'finished';

/**
 * 中断セッションが「まだ試合中」か「終わったのに未保存」かを返す。
 *
 * 試合終了の画面（保存して終了／保存せずにホームへ）は、端末の戻る操作では
 * 素通りできる —— オーバーレイであってモーダルではないため。抜けても記録は
 * セッションに残り、ホームの導線から同じ保存画面へ戻れるので失われはしないが、
 * その導線が「試合を再開／中断した試合を続ける」としか名乗っていなかった。
 * 保存し忘れている試合があることが、ホームからは読み取れない。
 *
 * 判定のためだけに毎回パースするのは無駄なので、鍵の有無で先に打ち切る。
 */
export function getGameSessionState(): GameSessionState {
    if (!hasGameSession()) return 'none';
    return loadGameSession()?.game?.phase === 'finished' ? 'finished' : 'inProgress';
}
