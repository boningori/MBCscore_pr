// スマホの2列表示で列を `1fr` にすると、`1fr` は `minmax(auto, 1fr)` と同義で
// 最小幅が中身で決まるため、長い氏名がカードごとモーダルの外へ押し出される。
// 実測で `佐々木健太郎` を入れたところ実際に枠外へ飛び出した。
// jsdom はレイアウトを計算しないので、CSSの記述そのものを縛る。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// コメントを先に落とす。落とさないとルール直前の日本語コメントが
// セレクタ側の捕捉に混ざり、完全一致が成立しない
// （lineupContrast.test.ts と同じ前処理）
const css = readFileSync(
    resolve(process.cwd(), 'src/components/SubstitutionModal/SubstitutionModal.css'),
    'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * セレクタに完全一致するルールのうち、**最後**のものの中身を返す。
 *
 * 同じセレクタが複数回書かれることがある。たとえば .sub-player-name は
 * ファイル前半に共通ルールがあり、@media (max-width: 600px) の中で
 * スマホ用に上書きしている。先頭を拾うと常に共通ルールを見てしまい、
 * スマホ用の指定を確かめられない。後に書かれた方が勝つという
 * カスケードの規則に合わせる。
 * （findLast は ES2023。型検査の lib は ES2022 なので .at(-1) を使う）
 */
function ruleBody(selector: string): string {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const matched = rules.filter(m => m[1].replace(/\s+/g, ' ').trim() === selector);
    const rule = matched.at(-1);
    if (!rule) throw new Error(`ルールが無い: ${selector}`);
    return rule[2];
}

describe('交代モーダルの2列表示', () => {
    for (const side of ['court', 'bench']) {
        it(`${side} の列は minmax(0, 1fr)（1fr だと長い氏名で枠外へ飛び出す）`, () => {
            const body = ruleBody(`.substitution-modal .substitution-column.${side} .sub-player-list`);
            expect(body).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/);
        });
    }

    it('名前は折り返さず1行で切り詰める（番号の位置が行ごとに動かないように）', () => {
        // F3でセレクタを .substitution-grid の中に限定した。ベンチファウル側の
        // 「交代要員を選択」モーダルは同じ substitution-modal クラスを使うが
        // substitution-grid を持たないため、この上書きが誤って当たらない
        const body = ruleBody('.substitution-modal .substitution-grid .sub-player-name');
        expect(body).toMatch(/white-space:\s*nowrap/);
        expect(body).toMatch(/text-overflow:\s*ellipsis/);
    });

    it('退場バッジはどの幅でも消さない', () => {
        // 失格者をIN候補から外さない代わりに併記する既存方針の要
        expect(css).not.toMatch(/\.sub-player-fouled-out\s*\{[^}]*display:\s*none/);
    });
});
