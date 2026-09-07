// シンプルモードで揃えるボタンの高さは、固定値ではなく下限（min-height）で置く。
//
// コンポーネント側（ActionButtons.css / SwipeableScoreButton.css）はどれも
// min-height で高さを決めている。App.css がシンプルモード用に値を差し替えるとき、
// 同じ値の height を重ねると「中身が入り切らなくなった瞬間にはみ出す」箱になる。
// これらのボタンは overflow: visible なので、はみ出しは隣のボタンに重なる。
// 実測(740×360): 枠70pxに対して中身66px。余裕は4pxしかない。
//
// 同じ形（コンポーネントの min-height を、外側のより強いセレクタが固定 height で
// 潰す）で実際に不具合を1件踏んでいる —— 履歴ポップアップの編集・削除メニューが
// 行からはみ出して押せなくなっていた（popupLayout.test.ts）。
//
// jsdomはレイアウトを計算しないため実寸では検証できず、CSSの記述を直接見る
// （foulGroupWidth.test.ts と同じ方針）。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// コメント内にも height: が出てくるため先に取り除く
const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * そのセレクタの宣言ブロックを、現れる順に全部返す。
 *
 * セレクタはそこで終わっているものだけを拾う。前方一致で拾うと
 * `.stat-btn` が `.stat-btn-group .swipe-hint` のルールに当たり、
 * 別の宣言ブロックを検査してしまう（実際に踏んだ）。
 */
function ruleBodies(selector: string): string[] {
    const bodies: string[] = [];
    let from = 0;
    for (;;) {
        const index = appCss.indexOf(selector, from);
        if (index === -1) break;
        from = index + selector.length;
        // セレクタの直後は「宣言ブロックの開始」か「次のセレクタへの区切り」だけ
        if (!/^\s*[,{]/.test(appCss.slice(from))) continue;
        const start = appCss.indexOf('{', index);
        const end = appCss.indexOf('}', start);
        bodies.push(appCss.slice(start + 1, end));
        from = end + 1;
    }
    return bodies;
}

const SIMPLE = '.app-container .game-main-area.simple-mode';

// シンプルモードで高さを揃えている操作ボタン
const HEIGHT_ALIGNED = [
    `${SIMPLE} .btn-foul`,
    `${SIMPLE} .stat-btn`,
    `${SIMPLE} .stat-btn-group`,
];

describe('シンプルモードのボタン高さ', () => {
    it.each(HEIGHT_ALIGNED)('%s は下限で揃える（固定 height を使わない）', selector => {
        const bodies = ruleBodies(selector);
        expect(bodies.length).toBeGreaterThan(0);
        for (const body of bodies) {
            expect(/(^|[;\s])height:\s*/.test(body)).toBe(false);
            expect(/min-height:\s*/.test(body)).toBe(true);
        }
    });

    // スワイプ対応の得点ボタンは複数のセレクタでまとめて指定されている
    it('スワイプ得点ボタンも下限で揃える', () => {
        const bodies = ruleBodies(`${SIMPLE} .swipeable-score-btn`);
        expect(bodies.length).toBeGreaterThan(0);
        for (const body of bodies) {
            expect(/(^|[;\s])height:\s*/.test(body)).toBe(false);
        }
    });
});
