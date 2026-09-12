// 復元・取り込みが中断セッションを書き換えてよいかの判定。
//
// 記録中の試合と、終了したが未保存の試合は、まだ履歴に入っていない＝この世に
// 1つしかない記録である。復元がこれを上書きすると、作りかけの記録が消える。
//
// 読めないセッションは守らない。中身が壊れていて復元で上書きできるなら、
// そのほうがよい（鍵の有無だけを見る hasGameSession では、壊れたものまで
// 守ってしまい、正しい控えから戻す道を塞ぐ）。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GAME_SESSION_KEY, isLiveSessionProtected, saveGameSession } from './gameSessionStorage';
import type { Game } from '../types/game';

const game = (phase: Game['phase']) => ({ phase } as Game);

beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => { });
    vi.spyOn(console, 'error').mockImplementation(() => { });
});
afterEach(() => vi.restoreAllMocks());

describe('守るべき試合があるか', () => {
    it('記録中なら守る', () => {
        saveGameSession(game('playing'), '第1節', '2026-04-10');
        expect(isLiveSessionProtected()).toBe(true);
    });

    it('終了したが未保存でも守る（まだ履歴に入っていない）', () => {
        saveGameSession(game('finished'), '第1節', '2026-04-10');
        expect(isLiveSessionProtected()).toBe(true);
    });

    it('セッションが無ければ守らない', () => {
        expect(isLiveSessionProtected()).toBe(false);
    });

    it('読めないセッションは守らない（壊れたものを守る理由が無い）', () => {
        localStorage.setItem(GAME_SESSION_KEY, '{壊れた');
        expect(isLiveSessionProtected()).toBe(false);
    });

    it('鍵の名前を公開している（復元側が参照する）', () => {
        expect(GAME_SESSION_KEY).toBe('minibasket-game-session');
    });
});
