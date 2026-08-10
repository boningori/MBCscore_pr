import { describe, it, expect } from 'vitest';
import { planPdfPages } from './pdfExport';

// A4縦(mm)
const A4_W = 210;
const A4_H = 297;

// 旧実装は Math.min(pageWidth/w, pageHeight/h) で常に1ページに押し込んでいた。
// 選手詳細は「試合別詳細（1試合1行）＋推移グラフ6枚」を含むので高さが試合数に
// 比例して伸びる。実測では52試合の選手で描画幅が 89.4mm（A4幅の42%）まで縮み、
// 右側120mmが空白のまま本文が読めない大きさになっていた。
// 幅はページいっぱいに使い、あふれる分は次ページへ送る。

describe('planPdfPages', () => {
    it('A4に収まる高さなら1ページで、幅はページいっぱいに使う', () => {
        // 幅1000px・高さ1000px → 210mm角。A4の高さ297mmに収まる
        const pages = planPdfPages(1000, 1000, A4_W, A4_H);

        expect(pages).toHaveLength(1);
        expect(pages[0].sourceY).toBe(0);
        expect(pages[0].sourceHeight).toBe(1000);
        expect(pages[0].drawWidth).toBeCloseTo(A4_W, 5);
        expect(pages[0].x).toBe(0);
        expect(pages[0].drawHeight).toBeCloseTo(210, 5);
    });

    it('A4の縦横比ちょうどなら1ページ', () => {
        const pages = planPdfPages(1000, 1000 * (A4_H / A4_W), A4_W, A4_H);

        expect(pages).toHaveLength(1);
        expect(pages[0].drawHeight).toBeCloseTo(A4_H, 5);
    });

    // 公式様式は実測で 794x1168px（縦横比1.471）。A4より4%だけ縦長い。
    // ここで改ページすると、提出物が「2ページ目に数mmだけ」という形で必ず割れる
    it('スコアシート（A4よりわずかに縦長）は1ページに収める', () => {
        const pages = planPdfPages(794, 1168, A4_W, A4_H);

        expect(pages).toHaveLength(1);
        expect(pages[0].drawHeight).toBeCloseTo(A4_H, 5);
        // 高さに合わせて縮むが、A4幅の9割は保つ
        expect(pages[0].drawWidth).toBeGreaterThan(A4_W * 0.9);
        expect(pages[0].drawWidth).toBeLessThan(A4_W);
        // 縮んだ分は左右中央に置く
        expect(pages[0].x).toBeCloseTo((A4_W - pages[0].drawWidth) / 2, 5);
    });

    it('縦長なら複数ページに分ける（幅は縮めない）', () => {
        // 縦横比 3.32:1 相当（実測した52試合の選手詳細）
        const pages = planPdfPages(1000, 3320, A4_W, A4_H);

        // 210mm幅なら全高は 3320 * 0.21 = 697.2mm → 297mm × 3ページ
        expect(pages).toHaveLength(3);
        // どのページも幅は縮めない（縮めると読めなくなるのが元の不具合）
        for (const page of pages) {
            expect(page.drawWidth).toBeCloseTo(A4_W, 5);
            expect(page.x).toBe(0);
        }
    });

    it('許容を超える縦長は縮めずに改ページする', () => {
        const mmPerPx = A4_W / 1000;
        // 全高がA4の1.2倍（許容1.15超）
        const canvasHeight = Math.round((A4_H * 1.2) / mmPerPx);
        const pages = planPdfPages(1000, canvasHeight, A4_W, A4_H);

        expect(pages.length).toBeGreaterThan(1);
        expect(pages[0].drawWidth).toBeCloseTo(A4_W, 5);
    });

    it('分割しても元canvasを過不足なく覆う', () => {
        const canvasHeight = 3320;
        const pages = planPdfPages(1000, canvasHeight, A4_W, A4_H);

        expect(pages[0].sourceY).toBe(0);
        // 隙間も重なりもない
        for (let i = 1; i < pages.length; i++) {
            expect(pages[i].sourceY).toBe(pages[i - 1].sourceY + pages[i - 1].sourceHeight);
        }
        const last = pages[pages.length - 1];
        expect(last.sourceY + last.sourceHeight).toBe(canvasHeight);
    });

    it('どのページもA4の高さを超えない', () => {
        for (const h of [3320, 5000, 12345]) {
            for (const page of planPdfPages(1000, h, A4_W, A4_H)) {
                expect(page.drawHeight).toBeLessThanOrEqual(A4_H + 1e-6);
            }
        }
    });

    it('最終ページは余った分だけの高さにする（引き伸ばさない）', () => {
        // 全高 297mm + 150mm 相当（許容1.15超）→ 2ページ目は約150mm
        const mmPerPx = A4_W / 1000;
        const canvasHeight = Math.round((A4_H + 150) / mmPerPx);
        const pages = planPdfPages(1000, canvasHeight, A4_W, A4_H);

        expect(pages).toHaveLength(2);
        expect(pages[1].drawHeight).toBeCloseTo(150, 0);
    });

    it('高さ0や幅0でも落ちない', () => {
        expect(planPdfPages(0, 100, A4_W, A4_H)).toHaveLength(1);
        expect(planPdfPages(100, 0, A4_W, A4_H)).toHaveLength(1);
    });
});
