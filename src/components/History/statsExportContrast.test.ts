// 履歴のスタッツ出力で、白地に載る文字。
//
// 出力の下地は白（pdfExport.exportElement が html2canvas に
// backgroundColor: '#ffffff' を渡す。A4の白紙に刷るスコアシートに合わせた値）。
// スタッツ表と未割り当ての記録は自前の背景を持つので濃紺のまま出るが、
// 出力範囲の直下にある見出し（試合名・日付・会場）だけは自前の背景を持たず、
// 白地にそのまま載る。
//
// ここにダークテーマ用の --text-muted (#8695ad) を置くと白地で 3.67:1 にしかならない
// （実測: 出力したJPEGの見出し行を画素で読むと背景 rgb(255,255,255)・
// 文字 rgb(126,134,148)）。選手詳細で先に解いてある問題と同じなので、
// 同じ考え方（出力時だけ濃色に切り替える）で守る。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// コメントは外す。セレクタ名を説明として書いた箇所がルールとして拾われるため
const css = readFileSync(
    resolve(process.cwd(), 'src/components/History/History.css'),
    'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');

function rules(): { selector: string; body: string }[] {
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({
        selector: m[1].replace(/\s+/g, ' ').trim(),
        body: m[2],
    }));
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

describe('履歴のスタッツ出力で白地に載る文字', () => {
    it('見出しの文字色を出力時に上書きしている', () => {
        const overrides = rules().filter(
            r => r.selector.includes('.history-stats-export.exporting')
                && r.selector.includes('.history-stats-caption')
                && /(^|[;\s])color:/.test(r.body),
        );

        expect(overrides.length).toBeGreaterThan(0);
    });

    it('上書きの色は白地に対して 4.5:1 以上ある', () => {
        const override = rules().find(
            r => r.selector.includes('.history-stats-export.exporting')
                && r.selector.includes('.history-stats-caption'),
        );
        const hex = override?.body.match(/color:\s*(#[0-9a-fA-F]{6})/)?.[1];

        expect(hex).toBeDefined();
        expect(contrastWithWhite(hex!)).toBeGreaterThanOrEqual(4.5);
    });

    // 画面（濃紺の地）では今までどおり控えめな色で出す。出力時の色を
    // 素の .history-stats-caption に書いてしまうと、画面が読みにくくなる
    it('画面表示の見出しは出力用の色を直接持たない', () => {
        const base = rules().find(
            r => r.selector.includes('.history-stats-caption')
                && !r.selector.includes('.exporting'),
        );

        expect(base).toBeDefined();
        expect(base!.body).toContain('var(--text-muted)');
    });
});
