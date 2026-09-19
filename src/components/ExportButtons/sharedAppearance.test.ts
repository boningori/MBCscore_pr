// 出力ボタンは4箇所（履歴のスタッツ・チーム比較・スコアシート、選手詳細）で
// 同じものを出す。部品は ExportButtons に寄せたが、見た目はCSSが決めるので、
// 置かれた先の画面が .btn を上書きすると、そこだけ別物に戻る。
//
// 実際、選手詳細のツールバーだけが .btn を上書きしていて、実測で
// 文字13.6px・角丸8px・PDFがグラデーション・JPEGに1px枠、という具合に
// 他の3箇所（14.3px / 12px / 単色 / 枠なし）と食い違っていた。
//
// ツールバーの器（地・余白・影）はその画面のカード類と揃えるものなので
// 各画面が持ってよい。ここで見張るのは中のボタンだけ。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** 出力ボタンを置いている画面のCSS */
const SHEETS = [
    'src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.css',
    'src/components/RunningScoresheet/RunningScoresheet.css',
    'src/components/TeamComparison/TeamComparison.css',
    'src/components/History/History.css',
] as const;

/** ボタンの見た目を変える指定。並び（余白・折り返し）はツールバー側の役目 */
const APPEARANCE = /(^|[;\s])(font-size|border-radius|background|background-color|border|border-color|color|box-shadow|transform|padding)\s*:/;

function rules(path: string): { selector: string; body: string }[] {
    const css = readFileSync(resolve(process.cwd(), path), 'utf-8')
        // コメントは外す。説明として書いたセレクタ名が拾われるため
        .replace(/\/\*[\s\S]*?\*\//g, '');
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({
        selector: m[1].replace(/\s+/g, ' ').trim(),
        body: m[2],
    }));
}

/** そのCSSが .btn / .btn-primary / .btn-secondary の見た目を変えているか */
function buttonOverrides(path: string): string[] {
    return rules(path)
        .filter(r => /\.btn(-primary|-secondary)?(\s|:|,|$)/.test(r.selector) && APPEARANCE.test(r.body))
        .map(r => r.selector);
}

describe('出力ボタンの見た目', () => {
    it.each(SHEETS)('%s は共通のボタンを上書きしない', path => {
        expect(buttonOverrides(path)).toEqual([]);
    });
});
