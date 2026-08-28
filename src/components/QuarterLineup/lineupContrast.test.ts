import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// スタメン選択の小さな文字（出場Qの丸・選択の✓・ファウル数）の読みやすさを縛る。
//
// 実測で、出場Qの丸が未出場 3.41:1（--text-muted on --bg-tertiary）、出場済み
// 3.40:1（白 on --secondary）、✓ が 3.40:1 と、どれも 10〜11px の文字で
// WCAG AA(4.5:1) を大きく下回っていた。--text-muted × --bg-tertiary は
// index.contrast.test.ts が「使わない運用」として保証の対象から外している
// 組み合わせで、この画面がそれを踏んでいた。
//
// 各Qの前に必ず通る画面で、しかも体育館の照明下でタブレットを斜めから見る。
// 値が戻らないようここで固定する。
// jsdom環境では import.meta.url が file: にならないため cwd 基準で読む

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const indexCss = strip(readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8'));
const lineupCss = strip(readFileSync(
    resolve(process.cwd(), 'src/components/QuarterLineup/QuarterLineup.css'), 'utf-8',
));

/** :root の --name: #rrggbb; を全て拾う（index.contrast.test.ts と同じ読み方） */
function readTokens(): Record<string, string> {
    const root = indexCss.match(/:root\s*\{([\s\S]*?)\n\}/);
    if (!root) throw new Error(':root ブロックが見つからない');
    const tokens: Record<string, string> = {};
    for (const m of root[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
        tokens[m[1]] = m[2];
    }
    return tokens;
}

const tokens = readTokens();

/** `var(--x)` / `#rrggbb` / `white` を #rrggbb に解決する */
function resolveColor(value: string): string {
    const trimmed = value.trim();
    if (trimmed === 'white') return '#ffffff';
    const varMatch = /^var\((--[\w-]+)\)$/.exec(trimmed);
    if (varMatch) {
        const token = tokens[varMatch[1]];
        if (!token) throw new Error(`${varMatch[1]} が :root に無い`);
        return token;
    }
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
    throw new Error(`解決できない色: ${value}`);
}

/** セレクタに完全一致するルールから、指定プロパティの値を取る */
function declaration(selector: string, property: string): string {
    const rules = [...lineupCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const rule = rules.find(m => m[1].replace(/\s+/g, ' ').trim() === selector);
    if (!rule) throw new Error(`ルールが無い: ${selector}`);
    const decl = new RegExp(`(?:^|;)\\s*${property}\\s*:([^;]+)`).exec(rule[2]);
    if (!decl) throw new Error(`${selector} に ${property} が無い`);
    return decl[1];
}

function luminance(hex: string): number {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
        .map(v => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        })
        .reduce((sum, c, i) => sum + [0.2126, 0.7152, 0.0722][i] * c, 0);
}

function contrast(fg: string, bg: string): number {
    const a = luminance(fg);
    const b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const AA = 4.5;

/** セレクタ自身が color と background を持つ場合の実測コントラスト */
function selfContrast(selector: string): number {
    return contrast(
        resolveColor(declaration(selector, 'color')),
        resolveColor(declaration(selector, 'background')),
    );
}

describe('スタメン選択の文字コントラスト（WCAG AA 4.5:1）', () => {
    it('未出場のQの丸', () => {
        // 地はこのルール自身の background、文字色も同じルールが持つ
        expect(selfContrast('.quarter-lineup .quarter-dot')).toBeGreaterThanOrEqual(AA);
    });

    it('出場済みのQの丸', () => {
        expect(selfContrast('.quarter-lineup .quarter-dot.played')).toBeGreaterThanOrEqual(AA);
    });

    it('選択済みの✓バッジ', () => {
        expect(selfContrast('.quarter-lineup .selection-check')).toBeGreaterThanOrEqual(AA);
    });

    it('ファウル数はカード地の上で読める', () => {
        // カードの地は .lineup-player-card の background（--bg-secondary）
        const cardBg = resolveColor(declaration('.quarter-lineup .lineup-player-card', 'background'));
        const foulColor = resolveColor(
            declaration('.quarter-lineup .lineup-player-stats .stat-fouls', 'color'),
        );
        expect(contrast(foulColor, cardBg)).toBeGreaterThanOrEqual(AA);
    });

    it('「前Q出場」の見出し', () => {
        // カード左端の青いバーを廃止したので、前Qの5人を伝えるのはこの行だけ。
        // 素の .text-muted はこの行の地(--bg-tertiary)の上で 3.41:1 しか出ない
        const bg = resolveColor(declaration('.quarter-lineup .previous-quarter-info', 'background'));
        const label = resolveColor(
            declaration('.quarter-lineup .previous-quarter-info .text-muted', 'color'),
        );
        expect(contrast(label, bg)).toBeGreaterThanOrEqual(AA);
    });

    it('ファウル数は選択済みカードの地の上でも読める', () => {
        // 選択済みは緑を混ぜた面になる。--text-muted のままだと 4.1:1 で AA を割っていた
        const cardBg = resolveColor(declaration('.quarter-lineup .lineup-player-card', 'background'));
        const selectedBg = blendSelectedBackground(cardBg);
        const foulColor = resolveColor(
            declaration('.quarter-lineup .lineup-player-stats .stat-fouls', 'color'),
        );
        expect(contrast(foulColor, selectedBg)).toBeGreaterThanOrEqual(AA);
    });
});

/** .selected の rgba(...) をカード地に合成した実際の面を返す */
function blendSelectedBackground(cardBg: string): string {
    const value = declaration('.quarter-lineup .lineup-player-card.selected', 'background').trim();
    const m = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(value);
    if (!m) throw new Error(`選択済みの背景が rgba() ではない: ${value}`);
    const [r, g, b, a] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    const base = parseInt(cardBg.slice(1), 16);
    const mix = [(base >> 16) & 255, (base >> 8) & 255, base & 255]
        .map((v, i) => Math.round(a * [r, g, b][i] + (1 - a) * v));
    return '#' + mix.map(v => v.toString(16).padStart(2, '0')).join('');
}

describe('選択済みカードの見分け（非文字は 3:1）', () => {
    it('枠の色が選択済みの地に対して 3:1 以上', () => {
        const cardBg = resolveColor(declaration('.quarter-lineup .lineup-player-card', 'background'));
        const selectedBg = blendSelectedBackground(cardBg);
        const border = resolveColor(
            declaration('.quarter-lineup .lineup-player-card.selected', 'border-color'),
        );
        expect(contrast(border, selectedBg)).toBeGreaterThanOrEqual(3);
    });

    it('枠の色が未選択の枠に対して 3:1 以上（並んだときに見分けられる）', () => {
        const plainBorder = resolveColor(
            /border:\s*2px\s+solid\s+(var\(--[\w-]+\))/.exec(
                lineupCss.match(/\.quarter-lineup \.lineup-player-card\s*\{([^{}]*)\}/)![1],
            )![1],
        );
        const selectedBorder = resolveColor(
            declaration('.quarter-lineup .lineup-player-card.selected', 'border-color'),
        );
        expect(contrast(selectedBorder, plainBorder)).toBeGreaterThanOrEqual(3);
    });
});
