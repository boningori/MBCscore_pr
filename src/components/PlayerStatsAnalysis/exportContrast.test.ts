import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 選手詳細の出力（PDF/JPEG）の下地は白。
// pdfExport.exportElement が html2canvas に backgroundColor: '#ffffff' を渡すためで、
// これはA4の白紙に印刷するランニングスコアシートに合わせた値。
//
// 一方この画面の濃紺の地は .player-stats-container が持っていて、出力範囲
// (.detail-export-area) の外にある。そのため自前の背景を持たない箇所だけが白地になり、
// そこに載るダークテーマの明色文字（--text-primary #f8fafc / --text-secondary #a3b1c4）が
// 白地に対して 1.05:1 / 2.18:1 となって消えていた（html2canvas 実測）。
//
// カード類は自前の背景を持つので濃紺のまま出る。白地に載るのは以下だけなので、
// 出力中(.exporting)はそこだけ濃色に切り替える。この3か所と、そこで使う色が
// 白地で読めることをここで守る。
// jsdom環境では import.meta.url が file: にならないため cwd（プロジェクトルート）基準で読む
// コメントは外す。セレクタ名を説明として書いた箇所が、ルールの一部として拾われてしまうため
const css = readFileSync(
    resolve(process.cwd(), 'src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.css'),
    'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** `selector { body }` の組を取り出す。@media の前置きは直後のルールの selector 側に混ざるが、
 *  ここでは selector に特定の文字列を含むかしか見ないため問題にならない */
function rules(): { selector: string; body: string }[] {
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({
        selector: m[1].replace(/\s+/g, ' ').trim(),
        body: m[2],
    }));
}

/** 出力中の .detail-export-area 配下を対象にしたルールのうち、target を含むもの */
function exportRulesFor(target: string): { selector: string; body: string }[] {
    return rules().filter(r =>
        r.selector.includes('.detail-export-area.exporting') && r.selector.includes(target)
    );
}

function relativeLuminance(hex: string): number {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
        .map(v => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        })
        .reduce((sum, c, i) => sum + [0.2126, 0.7152, 0.0722][i] * c, 0);
}

function contrastWithWhite(hex: string): number {
    return 1.05 / (relativeLuminance(hex) + 0.05);
}

describe('選手詳細の出力で白地に載る文字', () => {
    // 白地に置ける濃色は本体トークンに無い（アプリは無条件ダークで明色文字しか持たない）。
    // 出力専用の変数として .exporting に持たせている
    const onWhiteVars = ['--export-on-white', '--export-on-white-dim'];

    it.each(onWhiteVars)('%s が .exporting に定義されている', name => {
        const defs = rules().filter(
            r => r.selector.includes('.detail-export-area.exporting') && r.body.includes(`${name}:`)
        );
        expect(defs.length).toBeGreaterThan(0);
    });

    it.each(onWhiteVars)('%s は白地に対して 4.5:1 以上ある', name => {
        const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
        expect(match).not.toBeNull();
        expect(contrastWithWhite(match![1])).toBeGreaterThanOrEqual(4.5);
    });

    // 出力範囲の直下にあって自前の背景を持たない＝白地に載る3か所。
    // 逆に .highlight-section や .stats-card は自前の背景を持つので上書きしてはいけない
    const onWhiteTargets = [
        ['.period-badge', '📅 N試合の統計 のバッジ'],
        ['.recent-form-section', '直近フォームの見出し'],
        ['.win-loss-split-section', '勝敗別スプリットの見出し'],
    ] as const;

    it.each(onWhiteTargets)('%s (%s) の文字色を出力時に上書きしている', target => {
        const found = exportRulesFor(target).filter(r => /(^|;|\s)color\s*:/.test(r.body));
        expect(found.length).toBeGreaterThan(0);
    });

    it('自前の背景を持つ .highlight-section の見出しは上書きしない', () => {
        expect(exportRulesFor('.highlight-section')).toHaveLength(0);
    });
});
