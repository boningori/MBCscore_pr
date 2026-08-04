import { describe, it, expect } from 'vitest';
import { buildAxisTicks } from './chartAxis';

// 旧実装はキリの良い「最大値」を求めてから機械的に4等分していた。
// スティール最大3なら 3 / 2.3 / 1.5 / 0.8 / 0 となり、
// 「0.8回のスティール」という実在しない目盛りが出ていた。
// 目盛り間隔を先に決め、さらに元データが全て整数なら間隔も整数にする。
// （月単位・四半期単位は平均値になるため小数の目盛りが必要）

describe('buildAxisTicks', () => {
    it('目盛りは常に5本で、降順・最後が0', () => {
        for (const values of [[0.5], [1], [2], [3], [7], [12], [45], [130]]) {
            const ticks = buildAxisTicks(values);
            expect(ticks).toHaveLength(5);
            expect(ticks[4]).toBe(0);
            for (let i = 1; i < ticks.length; i++) expect(ticks[i]).toBeLessThan(ticks[i - 1]);
        }
    });

    it('最大値を必ず含む高さになる', () => {
        for (const values of [[0.5], [1], [2, 1], [3], [7], [12], [45], [130]]) {
            expect(buildAxisTicks(values)[0]).toBeGreaterThanOrEqual(Math.max(...values));
        }
    });

    it('試合単位（整数）では目盛りも整数になる', () => {
        // スティール 0〜3（旧: 3/2.3/1.5/0.8/0）
        expect(buildAxisTicks([0, 1, 2, 2, 3, 1])).toEqual([4, 3, 2, 1, 0]);
        // ブロック 0〜2（旧: 2/1.5/1/0.5/0）
        expect(buildAxisTicks([0, 0, 1, 0, 1, 2])).toEqual([4, 3, 2, 1, 0]);
        // 得点 6〜18
        expect(buildAxisTicks([6, 9, 8, 14, 18, 16])).toEqual([20, 15, 10, 5, 0]);
        // リバウンド 3〜10
        expect(buildAxisTicks([3, 5, 5, 8, 10, 9])).toEqual([12, 9, 6, 3, 0]);
    });

    it('平均値（小数）では小数の目盛りを許す', () => {
        // 月単位などは平均になる。整数に丸め上げると軸が粗くなりすぎる
        const ticks = buildAxisTicks([0.5, 0.8, 1.2]);
        expect(ticks[0]).toBeGreaterThanOrEqual(1.2);
        expect(ticks).toHaveLength(5);
        expect(ticks.some(t => !Number.isInteger(t))).toBe(true);
    });

    it('データが空・全て0でも軸が成立する', () => {
        expect(buildAxisTicks([])[0]).toBeGreaterThan(0);
        expect(buildAxisTicks([0, 0, 0])[0]).toBeGreaterThan(0);
    });
});
