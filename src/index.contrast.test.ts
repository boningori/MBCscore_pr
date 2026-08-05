import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 配色トークンのコントラスト契約。
// ダーク一色のアプリなので、文字色トークンが「どの面の上で使ってよいか」を
// ここで固定する。実測で .player-pts が 2.82:1、.item-count が 2.25:1 と
// WCAG AA(4.5:1)を大きく下回っていたため、値が戻らないよう縛る。
// jsdom環境では import.meta.url が file: にならないため cwd 基準で読む
const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8');

/** :root の --name: #rrggbb; を全て拾う */
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

function channelLuminance(v: number): number {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrast(fg: string, bg: string): number {
    const a = luminance(fg);
    const b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** トークン名を実際の色に解決する（未定義なら失敗させる） */
function color(name: string): string {
    const value = tokens[name];
    if (!value) throw new Error(`${name} が :root に無い`);
    return value;
}

const AA = 4.5;

describe('文字色トークンのコントラスト（WCAG AA 4.5:1）', () => {
    // パネル・カードの地色。この3面の上に本文が乗る
    const surfaces = ['--bg-primary', '--bg-secondary', '--bg-tertiary'];

    describe.each(['--text-primary', '--text-secondary'])('%s', textToken => {
        it.each(surfaces)('%s の上でAAを満たす', surface => {
            expect(contrast(color(textToken), color(surface))).toBeGreaterThanOrEqual(AA);
        });
    });

    describe('--text-muted', () => {
        // 補助文字。カード地(--bg-tertiary)より明るい面では使わない運用のため、
        // 保証するのは暗い2面に限る
        it.each(['--bg-primary', '--bg-secondary'])('%s の上でAAを満たす', surface => {
            expect(contrast(color('--text-muted'), color(surface))).toBeGreaterThanOrEqual(AA);
        });
    });

    describe.each(['--danger-text', '--secondary-text'])('%s', textToken => {
        // 赤・緑の文字用トークン。素の --danger / --secondary は枠線・背景の明度で、
        // 文字にすると選手カード地の上で2.1〜2.8:1しか出ない
        it.each(surfaces)('%s の上でAAを満たす', surface => {
            expect(contrast(color(textToken), color(surface))).toBeGreaterThanOrEqual(AA);
        });
    });

    describe('--primary-text', () => {
        // 得点など青で強調する文字に使う。--primary-light は枠線・背景用で、
        // 文字にすると --bg-tertiary 上で2.8:1しか出ない
        it.each(surfaces)('%s の上でAAを満たす', surface => {
            expect(contrast(color('--primary-text'), color(surface))).toBeGreaterThanOrEqual(AA);
        });

        it('--primary-light より明るい（文字用に持ち上げた値である）', () => {
            expect(luminance(color('--primary-text'))).toBeGreaterThan(luminance(color('--primary-light')));
        });
    });
});

describe('塗りボタンの白文字', () => {
    // .btn-primary / .btn-success / .btn-danger は白文字を地色に載せる。
    // 地色トークンが明るくなると白が読めなくなるため、地色側で縛る
    it.each([
        ['--primary', '.btn-primary'],
        ['--secondary-dark', '.btn-success'],
        ['--danger', '.btn-danger'],
    ])('%s（%s の地）の上で白がAAを満たす', bgToken => {
        expect(contrast('#ffffff', color(bgToken))).toBeGreaterThanOrEqual(AA);
    });
});

describe('文字色に使ってはいけないトークンの記録', () => {
    it('--primary-light は --bg-tertiary 上でAAを満たさない（だから --primary-text がある）', () => {
        // この前提が崩れた（=--primary-lightが十分明るくなった）ときは
        // トークンを2本持つ理由が無くなるので、統合を検討する合図にする
        expect(contrast(color('--primary-light'), color('--bg-tertiary'))).toBeLessThan(AA);
    });
});
