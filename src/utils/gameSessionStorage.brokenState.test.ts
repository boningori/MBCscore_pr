// 読めないセッションを「中断中の試合あり」と名乗らないこと。
//
// getGameSessionState は鍵の有無（hasGameSession）だけで先に打ち切っていた。
// 中身が JSON として壊れている、あるいは game を持たない形が入っていると、
// loadGameSession は null を返す（createJsonStorage が形を検査して捨てる）のに、
// ここは phase を読めなかっただけとみなして 'inProgress' を返していた。
//
// 壊れた値は読み込みで捨てられても localStorage には残り続けるので、
// この食い違いは毎回の起動で再発する。ホームから見える姿は:
//   - 「試合を再開」が出ているのに、押しても何も起きない
//   - 「新しく試合を始めると中断中の試合は失われます」と引き止められるが、
//     失われるものは無い
// どちらも利用者には直しようがなく、「壊れている」とだけ受け取られる。
//
// 読めないものは無いものとして扱う。鍵が残っていても、次に試合を始めれば
// その上に書かれる。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getGameSessionState, saveGameSession } from './gameSessionStorage';
import type { Game } from '../types/game';

const KEY = 'minibasket-game-session';

beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => { });
    vi.spyOn(console, 'error').mockImplementation(() => { });
});
afterEach(() => vi.restoreAllMocks());

describe('読めない中断セッション', () => {
    it('JSON として壊れていれば「なし」', () => {
        localStorage.setItem(KEY, '{壊れた');
        expect(getGameSessionState()).toBe('none');
    });

    it('game を持たない形なら「なし」', () => {
        localStorage.setItem(KEY, JSON.stringify({ gameName: '第1節', date: '2026-04-10' }));
        expect(getGameSessionState()).toBe('none');
    });

    it('null が入っていれば「なし」', () => {
        localStorage.setItem(KEY, 'null');
        expect(getGameSessionState()).toBe('none');
    });
});

describe('読める中断セッション（従来どおり）', () => {
    const game = (phase: Game['phase']) => ({ phase } as Game);

    it('試合中なら inProgress', () => {
        saveGameSession(game('playing'), '第1節', '2026-04-10');
        expect(getGameSessionState()).toBe('inProgress');
    });

    it('終了済みなら finished', () => {
        saveGameSession(game('finished'), '第1節', '2026-04-10');
        expect(getGameSessionState()).toBe('finished');
    });

    it('鍵が無ければ none', () => {
        expect(getGameSessionState()).toBe('none');
    });
});
