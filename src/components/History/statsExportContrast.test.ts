// 履歴のスタッツ出力は、画面（濃紺）と別に白地で出す。
//
// 出力の下地はもともと白（pdfExport.exportElement が html2canvas に
// backgroundColor: '#ffffff' を渡す。A4の白紙に刷るスコアシートに合わせた値）。
// 一方スタッツ表と未割り当ての記録は自前の濃紺背景を持っているため、
// 白い紙の上に濃紺のベタが乗った状態で出ていた。インクを食ううえ、
// モノクロ印刷では地が真っ黒に潰れて数字が読めない。
//
// アプリ本体は無条件ダークで、白地に置ける色トークンを持たない。
// 出力時だけ（.exporting）、出力範囲の中でトークンを白地用に差し替える。
// 画面側は一切変えない。
//
// ここで守るのは「差し替えた色が白地で読めること」と「表が使う色を
// 取りこぼしていないこと」の2点。StatsPanel.css に新しい色を足したのに
// 出力側の差し替えを忘れると、その1列だけ白地に明色で出て消える。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** コメントは外す。説明として書いたセレクタ名がルールとして拾われるため */
function read(path: string): string {
    return readFileSync(resolve(process.cwd(), path), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
}

const historyCss = read('src/components/History/History.css');
const statsPanelCss = read('src/components/StatsPanel/StatsPanel.css');

function rules(css: string): { selector: string; body: string }[] {
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

function contrast(a: string, b: string): number {
    const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/** 出力時にトークンを差し替えているブロック */
function exportPalette(): Record<string, string> {
    const block = rules(historyCss).find(
        r => r.selector.includes('.history-stats-export.exporting') && r.body.includes('--bg-secondary:'),
    );
    if (!block) return {};
    return Object.fromEntries(
        [...block.body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map(m => [m[1], m[2]]),
    );
}

/** 出力範囲の中で「地」になるトークン */
const SURFACES = ['--bg-secondary', '--bg-tertiary'];
/** 出力範囲の中で「文字」になるトークン */
const TEXTS = ['--text-primary', '--text-secondary', '--text-muted', '--primary-text', '--danger-text'];
/** 枠線など、文字ではないもの（WCAGの非文字は 3:1） */
const NON_TEXT = ['--border', '--warning', '--secondary'];

describe('履歴のスタッツ出力の白地パレット', () => {
    const palette = exportPalette();

    it('出力時だけ差し替える（画面側のトークンは触らない）', () => {
        const unscoped = rules(historyCss).filter(
            r => r.body.includes('--bg-secondary:') && !r.selector.includes('.exporting'),
        );

        expect(Object.keys(palette).length).toBeGreaterThan(0);
        expect(unscoped).toHaveLength(0);
    });

    it.each([...SURFACES, ...TEXTS, ...NON_TEXT])('%s を差し替えている', token => {
        expect(palette[token]).toBeDefined();
    });

    // 下地は白。地そのものが白から離れると、html2canvas が塗る白い余白との
    // 境目が出る（パネルの外は canvas の #ffffff のまま）
    it('パネルの地は白', () => {
        expect(palette['--bg-secondary']?.toLowerCase()).toBe('#ffffff');
    });

    // トークンを差し替えるだけでは足りない。選手名・パネル見出し・未割り当ての
    // 見出しは自分で color を持たず、出力範囲の外（.history-container の
    // color: var(--text-primary)）で既に白に解決された値を継承してくる。
    // 差し替えたトークンは子孫の var() しか通らないので、継承されてくる白は
    // そのまま白地に載って消える（実測: 出力したJPEGで選手名と大半の列が
    // 見えなくなった）。出力範囲そのものに color を置いて、継承を断つ
    it('出力範囲そのものに color を置いて、外からの継承を断っている', () => {
        const block = rules(historyCss).find(
            r => r.selector.includes('.history-stats-export.exporting') && r.body.includes('--bg-secondary:'),
        );

        expect(block?.body).toMatch(/(^|[;\s])color:\s*var\(--text-primary\)/);
    });

    const pairs = TEXTS.flatMap(text => SURFACES.map(surface => [text, surface] as const));

    it.each(pairs)('%s は %s の上で 4.5:1 以上ある', (text, surface) => {
        expect(contrast(palette[text], palette[surface])).toBeGreaterThanOrEqual(4.5);
    });

    const nonTextPairs = NON_TEXT.flatMap(t => SURFACES.map(s => [t, s] as const));

    it.each(nonTextPairs)('%s は %s の上で 3:1 以上ある（非文字）', (token, surface) => {
        expect(contrast(palette[token], palette[surface])).toBeGreaterThanOrEqual(3);
    });

    // 表に新しい色を足したのに出力側の差し替えを忘れると、そこだけ
    // 明色のまま白地に出て消える。取りこぼしを機械的に見つける
    it('スタッツ表が色に使っているトークンをすべて差し替えている', () => {
        // border- は border-radius も拾う。色でないトークン（寸法・書体）は
        // 名前の頭で外す。新しい色トークンはこの接頭辞に当たらないので、
        // 検査の網は保たれる
        const notColor = /^--(radius|spacing|font|transition|touch|chart)/;
        const used = new Set<string>();
        for (const [, value] of statsPanelCss.matchAll(
            /(?:^|[;{])\s*(?:color|background|background-color|border[a-z-]*)\s*:\s*([^;}]*)/g,
        )) {
            for (const [, name] of value.matchAll(/var\((--[a-z0-9-]+)/g)) {
                if (!notColor.test(name)) used.add(name);
            }
        }

        expect(used.size).toBeGreaterThan(0);
        expect([...used].filter(name => !(name in palette))).toEqual([]);
    });
});

describe('履歴のスタッツ出力の見出し', () => {
    // 画面（濃紺の地）では今までどおり控えめな色で出す。出力用の色を
    // 素の .history-stats-caption に書いてしまうと、画面が読みにくくなる
    it('画面表示の見出しはトークン越しに色を取る', () => {
        const base = rules(historyCss).find(
            r => r.selector.includes('.history-stats-caption') && !r.selector.includes('.exporting'),
        );

        expect(base).toBeDefined();
        expect(base!.body).toContain('var(--text-muted)');
    });
});
