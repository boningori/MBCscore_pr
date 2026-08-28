import { describe, it, expect } from 'vitest';
import { STAT_COLORS, STAT_TEXT_COLORS, STAT_LABELS, type StatType } from './types';

// 成長グラフの系列色は、棒の塗りと見出しの文字で同じ値を使っていた。
// 塗りは面なので3:1で足りるが、文字は4.5:1が要る。そのまま流用していたため
// 見出しが地に沈んでいた（実測: 得点 3.98、スティール 3.45、ブロック 4.15、
// TO 3.89）。塗り用と文字用を分けた前提を、値が戻らないよう縛る。

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

// グラフカードの地（--bg-secondary）と、その1段明るい面（--bg-tertiary）。
// 見出しはどちらの上にも出しうるので両方で保証する
const SURFACES: [string, string][] = [
    ['--bg-secondary', '#1e293b'],
    ['--bg-tertiary', '#334155'],
];

/** 棒グラフが乗る面。.plot-area は透明で、地はグラフカード（--bg-secondary） */
const PLOT_BG = '#1e293b';

const AA = 4.5;
const NON_TEXT = 3;
const statTypes = Object.keys(STAT_LABELS) as StatType[];

describe('成長グラフの系列色', () => {
    describe.each(statTypes)('%s', statType => {
        it.each(SURFACES)('見出し（STAT_TEXT_COLORS）が %s の上でAAを満たす', (_name, bg) => {
            expect(contrast(STAT_TEXT_COLORS[statType], bg)).toBeGreaterThanOrEqual(AA);
        });

        // 棒の塗りは面。淡くしすぎると系列が地に溶けるので下限も見る。
        // 棒が乗るのはグラフカードの地だけ（.plot-area は透明で、実測 #1e293b）
        it('棒の塗り（STAT_COLORS）がグラフカードの地で3:1を満たす', () => {
            expect(contrast(STAT_COLORS[statType], PLOT_BG)).toBeGreaterThanOrEqual(NON_TEXT);
        });
    });

    it('6系列すべてに文字用の色がある', () => {
        expect(Object.keys(STAT_TEXT_COLORS).sort()).toEqual(statTypes.slice().sort());
    });

    // 塗り用より暗くすると、分けている意味が逆転する
    it.each(statTypes)('%s の文字用は塗り用より暗くない', statType => {
        expect(luminance(STAT_TEXT_COLORS[statType]))
            .toBeGreaterThanOrEqual(luminance(STAT_COLORS[statType]));
    });

    // 系列どうしが見分けられること。文字用へ持ち上げる過程で色が白へ寄ると、
    // 6つの見出しが同じ色に見えてグラフとの対応が付かなくなる
    it('文字用の6色は互いに区別できる（同じ値が無い）', () => {
        const values = statTypes.map(t => STAT_TEXT_COLORS[t]);
        expect(new Set(values).size).toBe(values.length);
    });

    // 足りている系列まで塗り替えると、無用に色がずれる
    it('元からAAを満たす系列（アシスト）は塗り用と同じ値のまま', () => {
        expect(contrast(STAT_COLORS.assists, '#1e293b')).toBeGreaterThanOrEqual(AA);
        expect(STAT_TEXT_COLORS.assists).toBe(STAT_COLORS.assists);
    });

    // 分ける理由の記録。ここが「足りる」に変わったら統合を検討する合図
    it.each(['points', 'steals', 'blocks', 'turnovers'] as StatType[])(
        '%s は塗り用のままでは文字としてAAに届かない',
        statType => {
            expect(contrast(STAT_COLORS[statType], '#1e293b')).toBeLessThan(AA);
        },
    );
});
