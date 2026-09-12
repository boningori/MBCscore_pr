// 記録中のタブを表す印。
//
// 実測: 同じ端末の2つのタブで同じ試合を記録すると、あとから書いたほうが勝ち、
// もう片方の記録が黙って消える（3本入れて2本しか残らない）。useGameAutoSave が
// メモリ上の状態を丸ごと書くため、相手の得点を知らないまま上書きしてしまう。
// 両方のタブが同じ数字を表示し、スコアシートの辻褄も合うので気づけない。
//
// 起きてから警告するのではなく、後から開いたタブを入口で止める。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    OWNER_STALE_MS,
    claimSessionOwner,
    isOwnedByOtherTab,
    myTabId,
    releaseSessionOwner,
} from './sessionOwner';

const OWNER_KEY = 'minibasket-session-owner';

/** 別のタブが age ミリ秒前に打った印 */
function foreignOwner(age: number) {
    localStorage.setItem(OWNER_KEY, JSON.stringify({ id: 'other-tab', at: Date.now() - age }));
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('別のタブが記録中か', () => {
    it('印が無ければ偽', () => {
        expect(isOwnedByOtherTab()).toBe(false);
    });

    it('自分が宣言した直後は偽（自分の印だから）', () => {
        claimSessionOwner();
        expect(isOwnedByOtherTab()).toBe(false);
    });

    it('別のタブの新しい印があれば真', () => {
        foreignOwner(1_000);
        expect(isOwnedByOtherTab()).toBe(true);
    });

    it('別のタブでも時間切れなら偽（端末が落ちたあと復帰できる）', () => {
        foreignOwner(OWNER_STALE_MS + 1);
        expect(isOwnedByOtherTab()).toBe(false);
    });

    it('手放すと偽に戻る', () => {
        claimSessionOwner();
        releaseSessionOwner();
        expect(localStorage.getItem(OWNER_KEY)).toBeNull();
        expect(isOwnedByOtherTab()).toBe(false);
    });

    it('他人の印は手放さない（自分のときだけ消す）', () => {
        foreignOwner(1_000);
        releaseSessionOwner();
        expect(isOwnedByOtherTab()).toBe(true);
    });

    it('壊れた印は塞がない側へ倒す', () => {
        localStorage.setItem(OWNER_KEY, '{壊れた');
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        expect(isOwnedByOtherTab()).toBe(false);
    });

    it('タブのidは読み込みのあいだ変わらない', () => {
        expect(myTabId()).toBe(myTabId());
    });
});
