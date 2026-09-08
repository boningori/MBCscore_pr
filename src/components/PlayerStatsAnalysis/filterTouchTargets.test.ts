// 絞り込みの操作子（期間の日付入力と、絞り込みを解除する「✕」）のタップ領域。
//
// 実測(375px): 同じ行に並ぶ <select> は44pxなのに、日付入力は30px・✕ は24x24px。
// このアプリは --touch-target（下限44px / WCAG 2.5.8）を他のボタンすべてに
// 効かせている（index.css）ので、ここだけが例外になっていた。
//
// ✕ はただの飾りではない。集計が0件になったときの案内が
// 「✕ で絞り込みを解除してください」と名指しする脱出口で（EmptyState）、
// ここが押せないと利用者はその絞り込みから抜け出せない。
//
// 試合履歴の検索欄の ✕ も同じ見た目に揃える約束になっている
// （History.css の「選手スタッツ分析の期間リセットと同じ見た目に揃える」）ので、
// 揃ったまま直すことをここで一緒に固定する。
//
// jsdomはレイアウトを計算しないのでCSSの記述を直接見る
// （src/components/ActionButtons/foulGroupWidth.test.ts と同じ方針）

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadCss(path: string): string {
    return readFileSync(resolve(process.cwd(), path), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
}

function ruleBody(css: string, selector: string): string {
    const index = css.indexOf(selector);
    if (index === -1) return '';
    const start = css.indexOf('{', index);
    const end = css.indexOf('}', start);
    return css.slice(start + 1, end);
}

const statsCss = loadCss('src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.css');
const historyCss = loadCss('src/components/History/History.css');

describe('期間の絞り込みのタップ領域', () => {
    it('日付の入力欄は、隣の並び順セレクトと同じ高さを下回らない', () => {
        const body = ruleBody(statsCss, '.player-stats-container .date-range input[type="date"]');

        expect(/min-height:\s*var\(--touch-target\)\s*;/.test(body)).toBe(true);
    });

    it('絞り込み解除の✕は、案内が名指しする脱出口なのでタップ領域を確保する', () => {
        const body = ruleBody(statsCss, '.player-stats-container .btn-reset');

        expect(/width:\s*var\(--touch-target\)\s*;/.test(body)).toBe(true);
        expect(/height:\s*var\(--touch-target\)\s*;/.test(body)).toBe(true);
    });

    // タップ領域を44pxにすると、日付2つ＋✕ の合計が画面幅を超える。
    // 入力欄は縮んで吸収する側だが、無制限に縮めてはいけない。
    // Chromeの日付入力は幅が足りないと日の欄を落とす（実測: 106pxで
    // 「2026/07/0」、110pxから「2026/07/01」が全部出る）。絞り込みの
    // 開始日・終了日が読めないのは、絞り込みそのものが読めないのと同じ。
    it('日付の入力欄は、日付が全部読める幅を下回らない', () => {
        const body = ruleBody(statsCss, '.player-stats-container .date-range input[type="date"]');

        const minWidth = /min-width:\s*(\d+)px\s*;/.exec(body)?.[1];
        expect(minWidth).toBeDefined();
        expect(Number(minWidth)).toBeGreaterThanOrEqual(110);
    });

    // 下限を割るほど狭い画面（実測: 320pxでは日付2つで一杯）では、
    // 縮めるのではなく折り返して✕を次の行へ落とす。
    // 折り返しを許さないと、修正前と同じくページごと横に溢れる
    // （実測(320px・修正前): ページの scrollWidth が 346px）
    it('入力欄の下限を割る幅では、行を折り返して逃がす', () => {
        // 絞り込みを縦積みにするのは 640px 以下のブロック
        const mobileIndex = statsCss.indexOf('@media (max-width: 640px)');
        expect(mobileIndex).toBeGreaterThan(-1);
        const body = ruleBody(statsCss.slice(mobileIndex), '.player-stats-container .date-range');

        expect(/flex-wrap:\s*wrap\s*;/.test(body)).toBe(true);
    });

    // 入力欄を縮められるようにしても、それだけでは縮まない。
    // スマホ幅の .controls-bar は flex-direction:column + flex-wrap:wrap + stretch で、
    // 1本の flex line の幅がいちばん広い項目の max-content で決まり、その幅に
    // 全項目が引き伸ばされる。日付の行の max-content（368px）が画面の351pxを
    // 超えると、マイチーム選択も並び順も一緒に368pxへ広がってページが横に溢れた。
    // 項目の側を画面幅で頭打ちにして、はみ出しを行の中で吸収させる
    it('スマホ幅では、絞り込みの各項目が画面幅を超えて広がらない', () => {
        const body = ruleBody(statsCss, '.player-stats-container .controls-bar > .field-group');

        expect(/max-width:\s*100%\s*;/.test(body)).toBe(true);
        expect(/min-width:\s*0\s*;/.test(body)).toBe(true);
    });

    it('試合履歴の検索欄の✕も同じ大きさにそろえる', () => {
        const body = ruleBody(historyCss, '.history-container .btn-reset');

        expect(/width:\s*var\(--touch-target\)\s*;/.test(body)).toBe(true);
        expect(/height:\s*var\(--touch-target\)\s*;/.test(body)).toBe(true);
    });
});
