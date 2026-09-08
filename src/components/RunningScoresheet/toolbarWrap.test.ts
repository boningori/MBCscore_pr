// スコアシートのツールバーが、狭い画面でボタンを押し潰さないこと。
//
// 以前は flex-wrap も white-space も指定が無く、1行に入り切らないぶんは
// ボタン自身が縮められていた。ラベルは文字単位で折り返せてしまうため、
// 実測(375px・試合中→スコアシート。枠は343px):
//   「閉じる」     … 54×76px（閉／じ／る と縦に3行）
//   「試合情報編集」… 83×55px（試合情／報編集 と語の途中で割れる）
// 履歴からの経路は枠が310pxでさらに狭く、同じ症状がより強く出ていた。
//
// 直し方は「ボタンの中では折らず、行として折り返す」。
// jsdomはレイアウトを計算しないため実寸では検証できず、CSSの記述を直接見る
// （src/components/ActionButtons/foulGroupWidth.test.ts と同じ方針）。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// コメント内にも flex-wrap: や white-space: が出てくるため先に取り除く
const css = readFileSync(
    resolve(process.cwd(), 'src/components/RunningScoresheet/RunningScoresheet.css'),
    'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');

function ruleBody(selector: string): string {
    const index = css.indexOf(selector);
    if (index === -1) return '';
    const start = css.indexOf('{', index);
    const end = css.indexOf('}', start);
    return css.slice(start + 1, end);
}

const TOOLBAR = '.running-scoresheet-container .scoresheet-toolbar';

describe('スコアシートのツールバー', () => {
    it('入り切らないときは行を折り返す', () => {
        const body = ruleBody(TOOLBAR);
        expect(body).not.toBe('');
        expect(/flex-wrap:\s*wrap/.test(body)).toBe(true);
    });

    it('ボタンのラベルは語の途中で折らない', () => {
        const body = ruleBody(`${TOOLBAR} > button`);
        expect(body).not.toBe('');
        expect(/white-space:\s*nowrap/.test(body)).toBe(true);
    });

    // 「横スクロールしてもツールバーが画面内に留まる」ことは、以前は
    // position:sticky で保っていた。横スクロールを内側の要素
    // （.scoresheet-scroller）へ移したあとはツールバーがその外側にあり、
    // そもそも横へ流れない。保証はCSSではなく構造が持っているので、
    // 検査も構造側（scrollAffordance.test.tsx の
    // 「ツールバーはスクロールする要素の外にある」）へ移した。
});
