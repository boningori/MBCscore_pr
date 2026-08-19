// 成長グラフの横スクロール位置。
//
// 6枚のグラフがそれぞれ独立に横スクロールし、初期位置は左端＝いちばん古い期間
// だった。20試合の選手をタブレット(768px)で開くと、1枚につき5試合ぶんしか
// 見えず、そこに出るのは最初の5試合（実測: 枠258px／中身962px）。
// 「成長を可視化」する画面で直近が隠れているうえ、6枚を別々に送る必要があった。

import { describe, it, expect } from 'vitest';
import { scrollToLatest, syncScrollLeft } from './chartScroll';

/** scrollLeft への書き込み回数を数える擬似要素 */
function fakeAxis(scrollWidth: number, clientWidth: number, scrollLeft = 0) {
    const state = { value: scrollLeft, writes: 0 };
    return {
        scrollWidth,
        clientWidth,
        get scrollLeft() { return state.value; },
        set scrollLeft(v: number) { state.value = v; state.writes++; },
        get writes() { return state.writes; },
    };
}

describe('scrollToLatest', () => {
    it('いちばん新しい期間が見える右端へ寄せる', () => {
        const axis = fakeAxis(962, 258);
        scrollToLatest(axis);
        expect(axis.scrollLeft).toBe(962 - 258);
    });

    it('全部が収まっているなら動かさない（負の位置を作らない）', () => {
        const axis = fakeAxis(200, 400);
        scrollToLatest(axis);
        expect(axis.scrollLeft).toBe(0);
    });

    it('要素が無ければ何もしない', () => {
        expect(() => scrollToLatest(null)).not.toThrow();
    });
});

describe('syncScrollLeft', () => {
    it('他のグラフを同じ位置へそろえる', () => {
        const source = fakeAxis(962, 258, 300);
        const a = fakeAxis(962, 258, 0);
        const b = fakeAxis(962, 258, 0);
        syncScrollLeft(source, [source, a, b]);
        expect(a.scrollLeft).toBe(300);
        expect(b.scrollLeft).toBe(300);
    });

    it('動かした本人には書き戻さない', () => {
        const source = fakeAxis(962, 258, 300);
        syncScrollLeft(source, [source]);
        expect(source.writes).toBe(0);
    });

    // 書き込むと scroll イベントが飛び、そのイベントがまた同期を呼ぶ。
    // すでに同じ位置なら書かないことで往復を止める
    it('すでに同じ位置なら書き込まない', () => {
        const source = fakeAxis(962, 258, 300);
        const other = fakeAxis(962, 258, 300);
        syncScrollLeft(source, [source, other]);
        expect(other.writes).toBe(0);
    });

    it('未マウントの枠(null)が混ざっても落ちない', () => {
        const source = fakeAxis(962, 258, 120);
        const other = fakeAxis(962, 258, 0);
        expect(() => syncScrollLeft(source, [null, source, other])).not.toThrow();
        expect(other.scrollLeft).toBe(120);
    });
});
