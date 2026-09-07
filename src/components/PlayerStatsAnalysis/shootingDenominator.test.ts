// 選手詳細のシュート成績で、分母（18/24）を狭い画面でも落とさないこと。
//
// 以前は @media (max-width: 640px) で .shooting-made を display:none にしていた。
// 実測(375px): 詳細の「2P 75%」「FT 80%」「FG 75%」から 18/24・8/10 が消え、
// 一覧のカード（同じ数字を出している）から開くと情報が減るという逆転になっていた。
//
// 分母は飾りではない。FG%順の並べ替えは規定試投に満たない選手を下へ回すので
// （playerSort.ts の qualifyingAttempts）、なぜ下にいるのかを読む手掛かりが
// 分母しかない。率だけでは 1/1 の100% と 18/24 の75% を見分けられない。
//
// jsdomはレイアウトを計算しないため実寸では検証できず、CSSの記述を直接見る
// （src/components/ActionButtons/foulGroupWidth.test.ts と同じ方針）。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// コメント内にも display: や grid-template-columns: が出てくるため先に取り除く
const css = readFileSync(
    resolve(process.cwd(), 'src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.css'),
    'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** そのセレクタの宣言ブロックを、現れる順に全部返す（基底と@media内で複数ある） */
function ruleBodies(selector: string): string[] {
    const bodies: string[] = [];
    let from = 0;
    for (;;) {
        const index = css.indexOf(selector, from);
        if (index === -1) break;
        const start = css.indexOf('{', index);
        const end = css.indexOf('}', start);
        bodies.push(css.slice(start + 1, end));
        from = end + 1;
    }
    return bodies;
}

/** 列の数（grid-template-columns の値をトークン数で数える） */
function columnCount(body: string): number {
    const value = /grid-template-columns:\s*([^;]+);/.exec(body)?.[1].trim();
    return value ? value.split(/\s+/).length : 0;
}

describe('シュート成績の分母', () => {
    it('どの画面幅でも display:none にしない', () => {
        const bodies = ruleBodies('.player-stats-container .shooting-made');
        expect(bodies.length).toBeGreaterThan(0);
        for (const body of bodies) {
            expect(/display:\s*none/.test(body)).toBe(false);
        }
    });

    it('分母のぶんの列を確保する（ラベル・バー・率・分母の4列）', () => {
        const bodies = ruleBodies('.player-stats-container .shooting-bar-row');
        expect(bodies.length).toBeGreaterThan(0);
        for (const body of bodies) {
            const count = columnCount(body);
            // grid-template-columns を書いていないブロックは対象外
            if (count === 0) continue;
            expect(count).toBe(4);
        }
    });

    it('分母は途中で折り返さない', () => {
        // 列幅は固定なので、折り返すと2行になって行の高さがそろわなくなる。
        // 「120/160」のような桁数でも1行に収める
        const bodies = ruleBodies('.player-stats-container .shooting-made');
        expect(bodies.some(body => /white-space:\s*nowrap/.test(body))).toBe(true);
    });
});
