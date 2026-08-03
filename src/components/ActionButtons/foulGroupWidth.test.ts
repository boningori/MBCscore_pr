import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// シンプルモードのアクション列は 3:1 の比率で幅を配分している。
// 比率だけだと、親が狭い場面（横向きスマホ 812x375 では親が216px）で
// ファウル列が53pxまで縮む一方、中の「⚠️ ファウル」ボタンは文字が折り返せず
// 70pxを下回れないため17pxはみ出していた。
// min-width の下限を外すと同じ症状が静かに戻るので、ここで存在を固定する。
// jsdomはレイアウトを計算しないため実寸では検証できず、CSSの記述を直接見る
// （src/utils/appSettings.cssSync.test.ts と同じ方針）。
// コメント内にも "min-width:" の文字列が出てくるため、先に取り除いてから解析する
const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/** セレクタに対応する宣言ブロックの中身を返す */
function ruleBody(selector: string): string {
    const index = appCss.indexOf(selector);
    if (index === -1) return '';
    const start = appCss.indexOf('{', index);
    const end = appCss.indexOf('}', start);
    return appCss.slice(start + 1, end);
}

const FOUL_GROUP_SELECTOR =
    '.app-container .game-main-area.simple-mode .action-buttons-container .action-group:last-child';
const SCORE_GROUP_SELECTOR =
    '.app-container .game-main-area.simple-mode .action-buttons-container .action-group';

describe('シンプルモードのアクション列の幅', () => {
    it('ファウル列のルールが存在する', () => {
        expect(ruleBody(FOUL_GROUP_SELECTOR)).not.toBe('');
    });

    it('ファウル列は中身より狭くならない下限を持つ', () => {
        const body = ruleBody(FOUL_GROUP_SELECTOR);
        const minWidth = /min-width:\s*([^;]+);/.exec(body)?.[1].trim();

        expect(minWidth).toBeDefined();
        // 0 や auto では従来のはみ出しに戻る
        expect(minWidth).not.toBe('0');
        expect(minWidth).toBe('min-content');
    });

    it('スコア列は縮められる（不足分を吸収する側）', () => {
        // ファウル列を守るぶん、スコア列が min-width:0 で縮めることが前提になる
        const body = ruleBody(SCORE_GROUP_SELECTOR);
        expect(/min-width:\s*0\s*;/.test(body)).toBe(true);
    });
});
