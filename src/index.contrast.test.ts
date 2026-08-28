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

// --bg-hover はホバー地だけでなく、選手カードの中のタイル地としても使われる
// （PlayerStatsAnalysis の .stat-box / .highlight-stat）。--bg-tertiary より明るいので、
// --bg-tertiary 基準で決めた --text-secondary はここでは足りない。
// 一覧カードの REB/AST/FG ラベルが 3.48:1 で沈んでいた
describe('--bg-hover（カード内タイルの地）の上の文字', () => {
    it('--team-white はAAを満たす（.stat-label / .highlight-label が使う）', () => {
        expect(contrast(color('--team-white'), color('--bg-hover'))).toBeGreaterThanOrEqual(AA);
    });

    it('--text-primary はAAを満たす（タイルの数値が使う）', () => {
        expect(contrast(color('--text-primary'), color('--bg-hover'))).toBeGreaterThanOrEqual(AA);
    });

    it('--text-secondary はAAに届かない（この面では使わない）', () => {
        expect(contrast(color('--text-secondary'), color('--bg-hover'))).toBeLessThan(AA);
    });
});

describe('文字色に使ってはいけないトークンの記録', () => {
    it('--primary-light は --bg-tertiary 上でAAを満たさない（だから --primary-text がある）', () => {
        // この前提が崩れた（=--primary-lightが十分明るくなった）ときは
        // トークンを2本持つ理由が無くなるので、統合を検討する合図にする
        expect(contrast(color('--primary-light'), color('--bg-tertiary'))).toBeLessThan(AA);
    });
});

// 色みを敷いたパネルの上の文字（選手スタッツ分析の行・チップ）。
//
// これらの面は「アクセント色を8〜20%、--bg-tertiary の上に重ねた」もので、
// 素の --bg-tertiary より明るい。そのため --bg-tertiary 基準で決めた
// --danger-text / --text-secondary でもAAに届かず、詳細画面の数値が
// まとめて沈んでいた（実測: --danger-text 3.90:1、--text-secondary 3.85:1、
// --team-blue-light 3.30:1、--active-highlight-light 3.16:1）。
//
// 「どんな面でも使える1組」にはしていない。そこまで持ち上げると色が白へ寄って
// 6色の区別が付かなくなるうえ、実在しない組み合わせのために明度を捨てることになる。
// 代わりに PlayerStatsAnalysis.css が実際に敷いている面だけを列挙して縛る。
// 新しい色の面を足すときは、ここに1行足して通ることを確かめること。
describe('色みを敷いた面の上の文字（--*-on-tint）', () => {
    /** アクセント色を alpha で --bg-tertiary に重ねた面の色 */
    function tint(accent: string, alpha: number): string {
        const base = color('--bg-tertiary');
        const mix = (i: number) => {
            const a = parseInt(accent.slice(1 + i * 2, 3 + i * 2), 16);
            const b = parseInt(base.slice(1 + i * 2, 3 + i * 2), 16);
            return Math.round(a * alpha + b * (1 - alpha));
        };
        return '#' + [0, 1, 2].map(i => mix(i).toString(16).padStart(2, '0')).join('');
    }

    // [文字色トークン, 面の説明（CSSの規則名）, 敷いている色, 濃さ]
    const pairs: [string, string, string, number][] = [
        ['--text-secondary-on-tint', '.perf-row.stl の地', '#3b82f6', 0.15],
        ['--text-secondary-on-tint', '.perf-row.blk の地', '#ec4899', 0.15],
        ['--text-secondary-on-tint', '.perf-row.to の地', '#dc2626', 0.15],
        ['--text-secondary-on-tint', '.perf-row.foul の地', '#d97706', 0.15],
        ['--team-blue-text-on-tint', '.perf-row.stl / .stat-pts の地', '#3b82f6', 0.15],
        ['--team-blue-text-on-tint', '.stat-stl の地（紫）', '#8b5cf6', 0.15],
        ['--active-highlight-text-on-tint', '.perf-row.blk / .stat-blk の地', '#ec4899', 0.15],
        ['--danger-text-on-tint', '.perf-row.to の地', '#dc2626', 0.15],
        ['--danger-text-on-tint', '.stat-to の地', '#ef4444', 0.15],
        ['--danger-text-on-tint', '.to-total の地（いちばん濃い）', '#ef4444', 0.2],
        ['--danger-text-on-tint', '.to-dd 等の地（いちばん薄い）', '#ef4444', 0.08],
        // 緑と橙は専用トークンを足さず既存で足りる。
        // ここが割れたら、上と同じ形で -on-tint を足す合図
        ['--secondary-text', '.stat-reb の地', '#22c55e', 0.15],
        ['--warning-light', '.perf-row.foul の地', '#d97706', 0.15],
        ['--warning-light', '.stat-ast の地', '#f59e0b', 0.15],
    ];

    it.each(pairs)('%s が %s でAAを満たす', (textToken, _label, accent, alpha) => {
        expect(contrast(color(textToken), tint(accent, alpha))).toBeGreaterThanOrEqual(AA);
    });

    // 同じ行の中で面が変わっても色を切り替えずに済むよう、素の面でも成り立たせる
    it.each([
        '--text-secondary-on-tint',
        '--team-blue-text-on-tint',
        '--active-highlight-text-on-tint',
        '--danger-text-on-tint',
    ])('%s は --bg-tertiary の上でもAAを満たす', textToken => {
        expect(contrast(color(textToken), color('--bg-tertiary'))).toBeGreaterThanOrEqual(AA);
    });

    // 差し替え元より明るいこと（=文字用に持ち上げた値である）。
    // ここが崩れたらトークンを2本持つ理由が無くなるので、統合を検討する合図にする
    it.each([
        ['--text-secondary-on-tint', '--text-secondary'],
        ['--team-blue-text-on-tint', '--team-blue-light'],
        ['--active-highlight-text-on-tint', '--active-highlight-light'],
        ['--danger-text-on-tint', '--danger-text'],
    ])('%s は %s より明るい', (onTint, original) => {
        expect(luminance(color(onTint))).toBeGreaterThan(luminance(color(original)));
    });

    // 差し替え前に使っていた色では足りなかったことを、実際に使われていた面で記録する。
    // ここが「足りる」に変わったら、-on-tint を持つ理由が消えた合図
    it.each([
        ['--text-secondary', '.perf-label', '#3b82f6', 0.15],
        ['--team-blue-light', '.stat-pts', '#3b82f6', 0.15],
        ['--active-highlight-light', '.stat-blk', '#ec4899', 0.15],
        ['--danger-light', '.to-total', '#ef4444', 0.2],
    ])('%s は %s の面ではAAに届かない（だから -on-tint がある）', (token, _label, accent, alpha) => {
        expect(contrast(color(token), tint(accent, alpha))).toBeLessThan(AA);
    });
});
