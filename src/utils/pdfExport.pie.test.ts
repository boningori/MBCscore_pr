import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readPieSegments, pieSplitAngle, repaintPieCharts } from './pdfExport';

// html2canvas は conic-gradient を描けないため、複製DOM上でPNGに差し替える。
// jsdom には canvas 実装が無いので、描画呼び出しを記録する偽の2Dコンテキストを差し込む。
interface DrawnWedge {
    color: string;
    start: number;
    end: number;
}

function stubCanvas(): { wedges: DrawnWedge[]; restore: () => void } {
    const wedges: DrawnWedge[] = [];
    const getContext = HTMLCanvasElement.prototype.getContext;
    const toDataURL = HTMLCanvasElement.prototype.toDataURL;

    HTMLCanvasElement.prototype.getContext = vi.fn(() => {
        let pending: { start: number; end: number } | null = null;
        return {
            fillStyle: '',
            beginPath() { },
            moveTo() { },
            closePath() { },
            arc(_x: number, _y: number, _r: number, start: number, end: number) {
                pending = { start, end };
            },
            fill() {
                if (pending) wedges.push({ color: this.fillStyle, ...pending });
                pending = null;
            },
        };
    }) as unknown as typeof getContext;

    HTMLCanvasElement.prototype.toDataURL = vi.fn(
        () => 'data:image/png;base64,STUB'
    ) as unknown as typeof toDataURL;

    return {
        wedges,
        restore: () => {
            HTMLCanvasElement.prototype.getContext = getContext;
            HTMLCanvasElement.prototype.toDataURL = toDataURL;
        },
    };
}

function makePie(percent: string | null): HTMLElement {
    const root = document.createElement('div');
    const pie = document.createElement('div');
    pie.style.setProperty('--stats-success', 'rgb(5, 150, 105)');
    pie.style.setProperty('--stats-success-pale', 'rgb(163, 177, 196)');
    pie.style.backgroundImage = 'conic-gradient(var(--stats-success) 0% 40%, var(--stats-success-pale) 40% 100%)';
    if (percent !== null) pie.dataset.piePercent = percent;
    root.appendChild(pie);
    document.body.appendChild(root);
    return root;
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('pieSplitAngle', () => {
    it('conic-gradient と同じく真上から時計回りで区切る', () => {
        // 0% は真上（canvasの0radは3時方向なので -PI/2）
        expect(pieSplitAngle(0)).toBeCloseTo(-Math.PI / 2);
        // 25% で3時方向
        expect(pieSplitAngle(25)).toBeCloseTo(0);
        // 50% で6時方向
        expect(pieSplitAngle(50)).toBeCloseTo(Math.PI / 2);
        // 100% で一周
        expect(pieSplitAngle(100)).toBeCloseTo(Math.PI * 1.5);
    });

    it('範囲外の割合は0-100に丸める', () => {
        expect(pieSplitAngle(-10)).toBeCloseTo(pieSplitAngle(0));
        expect(pieSplitAngle(140)).toBeCloseTo(pieSplitAngle(100));
    });
});

describe('readPieSegments', () => {
    it('data属性の割合とCSS変数の色を読む', () => {
        const pie = makePie('37.5').firstElementChild as HTMLElement;

        expect(readPieSegments(pie)).toEqual({
            percent: 37.5,
            mainColor: 'rgb(5, 150, 105)',
            restColor: 'rgb(163, 177, 196)',
        });
    });

    it('割合が無い・数値でない要素は対象外', () => {
        const noAttr = makePie(null).firstElementChild as HTMLElement;
        const notNumber = makePie('abc').firstElementChild as HTMLElement;

        expect(readPieSegments(noAttr)).toBeNull();
        expect(readPieSegments(notNumber)).toBeNull();
    });
});

describe('repaintPieCharts', () => {
    let stub: ReturnType<typeof stubCanvas>;

    beforeEach(() => { stub = stubCanvas(); });
    afterEach(() => { stub.restore(); });

    it('conic-gradientをPNGの背景画像に差し替える', () => {
        const root = makePie('37.5');
        const pie = root.firstElementChild as HTMLElement;

        repaintPieCharts(root);

        expect(pie.style.backgroundImage).toBe('url("data:image/png;base64,STUB")');
        expect(pie.style.backgroundImage).not.toContain('conic-gradient');
        expect(pie.style.backgroundSize).toBe('100% 100%');
    });

    it('DEF色で全面を塗ってからOFF色の扇形を重ねる', () => {
        const root = makePie('25');

        repaintPieCharts(root);

        expect(stub.wedges).toEqual([
            { color: 'rgb(163, 177, 196)', start: -Math.PI / 2, end: Math.PI * 1.5 },
            { color: 'rgb(5, 150, 105)', start: -Math.PI / 2, end: 0 },
        ]);
    });

    it('割合が読めない円グラフには触らない', () => {
        const root = makePie(null);
        const pie = root.firstElementChild as HTMLElement;

        repaintPieCharts(root);

        expect(pie.style.backgroundImage).toContain('conic-gradient');
    });
});
