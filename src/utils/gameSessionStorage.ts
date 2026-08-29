// 試合セッション永続保存（キャッシュ）用ストレージ
// 試合中は連続的に保存し、画面遷移しても再開可能にする

import type { Game } from '../types/game';
import { createJsonStorage } from './createStorage';
import { coerceTeam } from './migrateTeam';
import { coerceEntries } from './coerceStored';

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

/**
 * 中断セッションを、再開しても落ちない形に整える。
 *
 * ここは履歴と違って「試合の途中」に効く。壊れたセッションを再開すると、
 * 記録を続けようとしたその場でアプリがエラー画面になり、しかも
 * localStorage に残るので再開のたびに再発する。
 *
 * 実測（v1.6.9・実ブラウザ・仕込んで「試合を再開」を押す）:
 *   game が空                  → Cannot read properties of undefined (reading 'players')
 *   teamA が null              → Cannot read properties of null (reading 'players')
 *   players の要素が null      → Cannot read properties of null (reading 'isOnCourt')
 *   timeouts が文字列          → state.teamA.timeouts.some is not a function
 *   score/stat/foul/pending が配列でない  → .filter is not a function
 *   同 要素が null             → Cannot read properties of null (reading 'teamId')
 *
 * 直すところが無ければ同じオブジェクトを返す（migrateTeam と同じ参照維持）。
 */
export function repairGameSession(session: GameSession): GameSession {
    const g = session.game;
    const teamA = coerceTeam(g?.teamA);
    const teamB = coerceTeam(g?.teamB);
    const scoreHistory = coerceEntries<Game['scoreHistory'][number]>(g?.scoreHistory);
    const statHistory = coerceEntries<Game['statHistory'][number]>(g?.statHistory);
    const foulHistory = coerceEntries<Game['foulHistory'][number]>(g?.foulHistory);
    const pendingActions = coerceEntries<Game['pendingActions'][number]>(g?.pendingActions);

    const unchanged =
        teamA === g?.teamA &&
        teamB === g?.teamB &&
        scoreHistory === g?.scoreHistory &&
        statHistory === g?.statHistory &&
        foulHistory === g?.foulHistory &&
        pendingActions === g?.pendingActions;
    if (unchanged) return session;

    return {
        ...session,
        game: { ...g, teamA, teamB, scoreHistory, statHistory, foulHistory, pendingActions },
    };
}

// 試合セッションを読み込み（壊れていれば読み込みの時点で整える）
export function loadGameSession(): GameSession | null {
    const session = sessionStorage_.load();
    if (!session) return null;

    const repaired = repairGameSession(session);
    // 直した形を書き戻す。再開するたびに直し続けるのは無駄で、
    // 途中保存が走ったときに壊れた形へ戻る余地も残る
    if (repaired !== session) sessionStorage_.save(repaired);
    return repaired;
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
