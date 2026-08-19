// 出力は生きたDOMに 'exporting' を付け外しして寸法を変える。
//
// 成長グラフは横スクロールする軸を持ち、いちばん新しい期間が見える右端から
// 始まる（v1.3.5 / chartScroll）。出力用のレイアウトでは列が縮んで中身が枠に
// 収まるため、ブラウザが scrollLeft を 0 に丸める。クラスを外すと再びあふれるが
// 位置は 0 のままで、出力したあとグラフ6枚がいちばん古い期間まで巻き戻る
// （実測: JPEG出力の前 594/594 → 後 0/594）。
//
// 出力は「画像を作る」処理であって画面を動かす処理ではない。触った状態は
// 元に戻して返す。

import { describe, it, expect } from 'vitest';
import { captureScrollLeft } from './pdfExport';

/** scrollLeft を持つ最小の擬似要素 */
function fakeScroller(left: number) {
    return { scrollLeft: left };
}

describe('captureScrollLeft', () => {
    it('横スクロール位置を控えて、あとで戻せる', () => {
        const a = fakeScroller(594);
        const b = fakeScroller(120);
        const restore = captureScrollLeft([a, b]);

        // 出力用レイアウトで中身が収まり、ブラウザが 0 に丸める
        a.scrollLeft = 0;
        b.scrollLeft = 0;
        restore();

        expect(a.scrollLeft).toBe(594);
        expect(b.scrollLeft).toBe(120);
    });

    it('もともと左端だったものは触らない（戻す必要がない）', () => {
        const a = fakeScroller(0);
        const restore = captureScrollLeft([a]);
        a.scrollLeft = 40;
        restore();

        expect(a.scrollLeft).toBe(40);
    });

    it('スクロールする要素が1つも無くても落ちない', () => {
        expect(() => captureScrollLeft([])()).not.toThrow();
    });
});
