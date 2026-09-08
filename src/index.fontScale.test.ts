import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// フォントの最小段（--font-size-xs）が、スマホで読めない大きさまで下がらないこと。
//
// 以前は clamp(10px, 1.2vh, 12px) と画面高で伸縮させていた。狙いは「記録画面を
// 1画面に収める」ことだったが、可変幅が10〜12pxしかないうえ 1.2vh が12pxに届くのは
// 画面高1000px以上（タブレット）なので、スマホでは事実上どの機種でも下限10pxに
// 張り付いていた。
//
// 実測(375x812・本番ビルド): チーム比較のQ別スコア表が10px。しかも表の幅は
// 318pxの枠に対して201pxしか使っておらず、詰まっているから小さいのではなく
// トークンをそのまま継いでいるだけだった。48pxのスコアの真下に10pxの表が並ぶ。
//
// 記録画面の収まりへの影響も測った。xs を12pxに上げても `.app-main` の
// clientHeight/scrollHeight は縦(375x812)で741/834、横(812x375)で322/322 と
// 1pxも動かない。記録画面で xs を使うのは action-hint（↑成功 ↓ミス）と
// simple-btn-label（交代/ベンチ）だけで、どちらも高さ固定のボタンの中にあるため。
// つまり画面高での伸縮は収まりに寄与しておらず、小ささだけが残っていた。
//
// jsdom環境では import.meta.url が file: にならないため cwd 基準で読む
const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8');

/** カスタムプロパティの値（:root の宣言） */
function tokenValue(name: string): string {
    const m = indexCss.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
    return m ? m[1].trim() : '';
}

/**
 * その値が実際に取りうる最小のpx。
 *
 * clamp(min, 可変, max) なら第1引数が下限。素の値ならそれ自体。
 * 「clamp をやめた」「下限だけ据え置いた」のどちらでも同じ土俵で見たいので、
 * 書き方ではなく結果の下限を見る。
 */
function minimumPx(value: string): number | null {
    const clamp = value.match(/^clamp\(\s*([\d.]+)px\s*,/);
    if (clamp) return Number(clamp[1]);
    const fixed = value.match(/^([\d.]+)px$/);
    return fixed ? Number(fixed[1]) : null;
}

const MIN_READABLE_PX = 12;

describe('フォントの最小段', () => {
    it('--font-size-xs はどの画面でも12pxを下回らない', () => {
        const min = minimumPx(tokenValue('--font-size-xs'));

        expect(min).not.toBeNull();
        expect(min).toBeGreaterThanOrEqual(MIN_READABLE_PX);
    });

    it('段の大小関係は保つ（xs <= sm <= md）', () => {
        // 下限を上げた結果 xs が sm を追い越すと、注記のほうが本文より大きくなる
        const xs = minimumPx(tokenValue('--font-size-xs'));
        const sm = minimumPx(tokenValue('--font-size-sm'));
        const md = minimumPx(tokenValue('--font-size-md'));

        expect(xs).not.toBeNull();
        expect(sm).not.toBeNull();
        expect(md).not.toBeNull();
        expect(xs!).toBeLessThanOrEqual(sm!);
        expect(sm!).toBeLessThanOrEqual(md!);
    });
});
