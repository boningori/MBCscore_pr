import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// VoiceMemo.css は一度、このプロジェクトに存在しない変数名
// （--color-surface / --color-text / --color-text-muted / --color-border / --color-danger）を
// 参照していた。未定義の var() はフォールバック値に落ちるだけでエラーにならないため、
// ダークテーマのアプリに明るいテーマ用の色が描画され、カード背景 #fff の上に
// 本文 #f8fafc という「白地に白文字」になっていた（実測コントラスト比 約1.03:1）。
// CSSを読むだけでは気づけなかったので、参照と定義の突き合わせをテストで縛る。

const root = process.cwd();
const componentCss = readFileSync(resolve(root, 'src/components/VoiceMemo/VoiceMemo.css'), 'utf8');
const globalCss = readFileSync(resolve(root, 'src/index.css'), 'utf8');

const referencedTokens = [
    ...new Set([...componentCss.matchAll(/var\(\s*(--[\w-]+)/g)].map(m => m[1])),
];
const definedTokens = new Set(
    [...globalCss.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map(m => m[1]),
);

// 相対輝度（WCAG 2.x の定義）
function relativeLuminance(hex: string): number {
    const value = hex.replace('#', '');
    const channels = [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16) / 255);
    const linear = channels.map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(hexA: string, hexB: string): number {
    const a = relativeLuminance(hexA);
    const b = relativeLuminance(hexB);
    const [light, dark] = a > b ? [a, b] : [b, a];
    return (light + 0.05) / (dark + 0.05);
}

function tokenValue(name: string): string {
    const match = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`).exec(globalCss);
    if (!match) throw new Error(`${name} が src/index.css に見つからない`);
    return match[1];
}

describe('VoiceMemo.css: 参照しているCSS変数', () => {
    it('1つ以上のCSS変数を参照している（正規表現が壊れていないことの確認）', () => {
        expect(referencedTokens.length).toBeGreaterThan(0);
    });

    it('すべて src/index.css に定義されている', () => {
        const missing = referencedTokens.filter(t => !definedTokens.has(t));
        expect(missing).toEqual([]);
    });

    it('存在しない --color-* 系を参照していない', () => {
        expect(referencedTokens.filter(t => t.startsWith('--color-'))).toEqual([]);
    });
});

describe('VoiceMemo.css: 可読性', () => {
    it('メモ本文に明示的な文字色が指定されている（継承任せにしない）', () => {
        // 本文に色指定が無かったため、アプリのほぼ白い文字色を継承して白いカードに乗っていた
        const rule = /\.voice-memo-item-text\s*\{[^}]*\}/.exec(componentCss);
        expect(rule).not.toBeNull();
        expect(rule![0]).toMatch(/color\s*:/);
    });

    it('本文とカード背景のコントラスト比が WCAG AA (4.5:1) を満たす', () => {
        expect(contrastRatio(tokenValue('--text-primary'), tokenValue('--bg-card'))).toBeGreaterThanOrEqual(4.5);
    });

    it('見出し（Q・時刻）とカード背景のコントラスト比が WCAG AA を満たす', () => {
        expect(contrastRatio(tokenValue('--text-muted'), tokenValue('--bg-card'))).toBeGreaterThanOrEqual(4.5);
    });
});
