// 履歴ポップアップ（シンプルモードの📜ボタンで開くもの）の並べ方。
//
// 中身は左右2カラムで両チームを並べる作りだが、狭い画面では1枚あたりの幅が
// 足りない。実測(375px): ポップアップの中身343px → 2カラムとジョグダイヤルで
// 一覧が117pxしか残らず、「オフェンスREB」のような短い語まで2行に折り返し、
// 編集・削除メニューも3行に割れていた。
//
// 縦に積めば1枚が296pxになり、どちらも1行に収まる（実測）。
// 記録画面（シンプルモード）が既に両チームを縦に積んでいるので並びも揃う。
//
// jsdomはレイアウトを計算しないため実寸では検証できず、CSSの記述を直接見る
// （src/components/ActionButtons/foulGroupWidth.test.ts と同じ方針）。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// コメント内にも grid-template-columns: や height: が出てくるため先に取り除く
const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/** そのセレクタの宣言ブロックを、現れる順に全部返す（基底と@media内で複数ある） */
function ruleBodies(selector: string): string[] {
    const bodies: string[] = [];
    let from = 0;
    for (;;) {
        const index = appCss.indexOf(selector, from);
        if (index === -1) break;
        const start = appCss.indexOf('{', index);
        const end = appCss.indexOf('}', start);
        bodies.push(appCss.slice(start + 1, end));
        from = end + 1;
    }
    return bodies;
}

/** `@media (...)` ブロックの中身を返す（無ければ空文字） */
function mediaBlock(condition: string): string {
    const index = appCss.indexOf(`@media ${condition}`);
    if (index === -1) return '';
    const start = appCss.indexOf('{', index);
    // ネストした宣言ブロックを数えて、対応する閉じ括弧まで取る
    let depth = 0;
    for (let i = start; i < appCss.length; i++) {
        if (appCss[i] === '{') depth++;
        else if (appCss[i] === '}') {
            depth--;
            if (depth === 0) return appCss.slice(start + 1, i);
        }
    }
    return '';
}

const NARROW = '(max-width: 480px)';

describe('履歴ポップアップの並べ方', () => {
    it('広い画面では左右2カラムのまま', () => {
        const [base] = ruleBodies('.app-container .history-popup-body');
        expect(base).toBeDefined();
        expect(/grid-template-columns:\s*1fr\s+1fr/.test(base)).toBe(true);
    });

    it('狭い画面では1カラムに積む', () => {
        const narrow = mediaBlock(NARROW);
        expect(narrow).not.toBe('');
        expect(narrow).toContain('.app-container .history-popup-body');

        const start = narrow.indexOf('{', narrow.indexOf('.app-container .history-popup-body'));
        const body = narrow.slice(start + 1, narrow.indexOf('}', start));
        // 1fr 1fr のままだと、一覧が117pxまで狭まる元の症状に戻る
        expect(/grid-template-columns:\s*1fr\s*;/.test(body)).toBe(true);
        // 上下で均等に分ける（片方の記録が多くても、もう片方が押し出されない）
        expect(/grid-template-rows:\s*1fr\s+1fr/.test(body)).toBe(true);
    });

    // タブレット向けの拡大（@media min-width: 768px）が行の高さを固定していた。
    // メニューは行の中に流し込んで行を伸ばす作りなので（ActionHistory.css）、
    // 固定値だとこの経路だけメニューがはみ出して隠れる
    it('ポップアップ内の行の高さを固定しない', () => {
        const bodies = ruleBodies('.app-container .history-popup-content .history-item ');
        const exact = ruleBodies('.app-container .history-popup-content .history-item {');
        const all = [...bodies, ...exact];
        expect(all.length).toBeGreaterThan(0);
        for (const body of all) {
            expect(/(^|[;\s])height:\s*\d/.test(body)).toBe(false);
        }
        // 大きく見せる意図（48px）は min- で残す
        expect(exact.some(body => /min-height:\s*48px/.test(body))).toBe(true);
    });
});
