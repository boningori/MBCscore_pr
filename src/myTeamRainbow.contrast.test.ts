import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// マイチームのチーム名に使う虹の契約。
//
// 教科書どおりの虹（#0000ff / #4b0082 / #8f00ff）は --bg-secondary の上で
// 1.13〜2.52:1 しか出ず、チーム名の後半が地に溶ける。チーム名は「どちらの
// パネルか」を確かめる唯一の文字なので、そこが読めなくなるのは目的と逆行する。
// 明度を引き上げた7色を使っており、将来「もっと鮮やかに」と触られたときに
// ここで止まる。
// jsdom環境では import.meta.url が file: にならないため cwd 基準で読む
const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8');

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

/** 宣言の値部分を取り出す（見つからなければ失敗させる） */
function declaration(name: string): string {
    const matched = indexCss.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
    if (!matched) throw new Error(`${name} が src/index.css に無い`);
    return matched[1];
}

const rainbow = declaration('--my-team-rainbow').match(/#[0-9a-fA-F]{6}/g) ?? [];
const bgSecondary = declaration('--bg-secondary').trim();

const AA = 4.5;

describe('--my-team-rainbow', () => {
    it('7色ある', () => {
        expect(rainbow).toHaveLength(7);
    });

    it.each(rainbow)('%s はパネル地(--bg-secondary)の上でAAを満たす', hex => {
        expect(contrast(hex, bgSecondary)).toBeGreaterThanOrEqual(AA);
    });
});
