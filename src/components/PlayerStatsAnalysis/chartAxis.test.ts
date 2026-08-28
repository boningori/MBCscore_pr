import { describe, it, expect } from 'vitest';
import { buildAxisTicks, formatBarValue, formatTick } from './chartAxis';

// 旧実装はキリの良い「最大値」を求めてから機械的に4等分していた。
// スティール最大3なら 3 / 2.3 / 1.5 / 0.8 / 0 となり、
// 「0.8回のスティール」という実在しない目盛りが出ていた。
// 目盛り間隔を先に決め、さらに回数そのものを描くグラフ（試合単位）なら
// 間隔も整数にする。（月単位・四半期単位は平均値になるため小数の目盛りが必要）
//
// 整数かどうかは「値」ではなく「期間の単位」で決める。値で決めていたころは、
// 月平均がたまたま全部整数になった月だけ軸の刻みが変わっていた。

/** 回数そのもの（試合単位） */
const counts = (values: number[]) => buildAxisTicks(values, true);
/** 期間平均（月・四半期・年単位） */
const averages = (values: number[]) => buildAxisTicks(values, false);

describe('buildAxisTicks', () => {
    it('目盛りは降順で、最後が0', () => {
        for (const values of [[0.5], [1], [2], [3], [7], [12], [45], [130]]) {
            for (const ticks of [counts(values), averages(values)]) {
                expect(ticks.length).toBeGreaterThanOrEqual(2);
                expect(ticks[ticks.length - 1]).toBe(0);
                for (let i = 1; i < ticks.length; i++) expect(ticks[i]).toBeLessThan(ticks[i - 1]);
            }
        }
    });

    it('平均値の軸は5本のまま（間隔を1未満にできるので上端を詰められる）', () => {
        for (const values of [[0.5], [1], [2], [3], [7], [12], [45], [130]]) {
            expect(averages(values)).toHaveLength(5);
        }
        // 最大0.4なら間隔0.1・上端0.4。回数のように上端が跳ね上がらない
        expect(averages([0.1, 0.4])).toEqual([0.4, 0.3, 0.2, 0.1, 0]);
    });

    // 回数のグラフは間隔が整数に制限されるため、最小の間隔が1になる。
    // 4等分を固定すると上端が必ず4以上になり、最大1のブロックのグラフでは
    // 棒が高さの1/4までしか伸びない（実測: 0/1しか無い試合別グラフの軸が 4/3/2/1/0）。
    // 上端を最大値に合わせ、そのぶん目盛りの本数を減らす
    it('回数のグラフは、最大値が小さいときに軸を間延びさせない', () => {
        expect(counts([0, 1, 0, 1])).toEqual([1, 0]);
        expect(counts([0, 1, 2, 1])).toEqual([2, 1, 0]);
        expect(counts([3, 1, 2])).toEqual([3, 2, 1, 0]);
        // 最大4は間隔1の4等分がちょうど収まるので従来どおり
        expect(counts([4, 1, 2])).toEqual([4, 3, 2, 1, 0]);
        // 5以上は間隔を広げる側（従来の4等分）に戻る
        expect(counts([5, 1, 2])).toEqual([8, 6, 4, 2, 0]);
    });

    it('小数の値でも、回数のグラフなら整数の上端に切り上げる', () => {
        // 試合単位は回数そのものなので小数は来ないが、上端の決め方が
        // 最大値を下回らないことは保っておく
        expect(counts([0.5])).toEqual([1, 0]);
        expect(counts([2.5])).toEqual([3, 2, 1, 0]);
    });

    it('最大値を必ず含む高さになる', () => {
        for (const values of [[0.5], [1], [2, 1], [3], [7], [12], [45], [130]]) {
            expect(counts(values)[0]).toBeGreaterThanOrEqual(Math.max(...values));
            expect(averages(values)[0]).toBeGreaterThanOrEqual(Math.max(...values));
        }
    });

    it('試合単位（回数）では目盛りも整数になる', () => {
        // スティール 0〜3（旧: 3/2.3/1.5/0.8/0）
        expect(counts([0, 1, 2, 2, 3, 1])).toEqual([3, 2, 1, 0]);
        // ブロック 0〜2（旧: 2/1.5/1/0.5/0）
        expect(counts([0, 0, 1, 0, 1, 2])).toEqual([2, 1, 0]);
        // 得点 6〜18
        expect(counts([6, 9, 8, 14, 18, 16])).toEqual([20, 15, 10, 5, 0]);
        // リバウンド 3〜10
        expect(counts([3, 5, 5, 8, 10, 9])).toEqual([12, 9, 6, 3, 0]);
    });

    it('回数のグラフの目盛りは、本数が減っても整数のまま', () => {
        for (const values of [[0], [1], [2], [3], [4], [0.5]]) {
            for (const tick of counts(values)) expect(Number.isInteger(tick)).toBe(true);
        }
    });

    it('平均値（小数）では小数の目盛りを許す', () => {
        // 月単位などは平均になる。整数に丸め上げると軸が粗くなりすぎる
        const ticks = averages([0.5, 0.8, 1.2]);
        expect(ticks[0]).toBeGreaterThanOrEqual(1.2);
        expect(ticks).toHaveLength(5);
        expect(ticks.some(t => !Number.isInteger(t))).toBe(true);
    });

    // 値で判断していたころ、月平均が 1.0/4.0/…/12.0 の月だけ軸が 12/9/6/3/0、
    // 11.7 が混じる月は 20/15/10/5/0 になっていた。同じ画面に並ぶ6枚の
    // グラフの間でも、データ次第で刻み方が食い違う
    it('平均値の刻みは、値がたまたま整数でも変わらない', () => {
        expect(averages([1, 4, 6, 8, 10, 12])).toEqual(averages([1, 4, 6, 8, 10, 11.7]));
    });

    it('平均値でも3の系列を使い、軸が間延びしない', () => {
        // 1・2・5・10 だけだと最大11.7で間隔5・軸20となり、棒が6割までしか伸びない
        expect(averages([1, 4, 6, 8, 10, 11.7])[0]).toBe(12);
    });

    it('データが空・全て0でも軸が成立し、期間の単位で食い違わない', () => {
        // 同じ「記録なし」が、試合単位では 1/0・月単位では 4/3/2/1/0 と
        // 別の軸で描かれていた（平均値側は間隔0に対して1が返るため）
        for (const build of [counts, averages]) {
            expect(build([])).toEqual([1, 0]);
            expect(build([0, 0, 0])).toEqual([1, 0]);
        }
    });
});

describe('formatTick', () => {
    it('目盛り値をそのまま出す（桁を落とさない）', () => {
        // 月平均のAST・STL・BLKなど最大値が1以下だと間隔が0.25になる。
        // 一律 toFixed(1) だと 0.75→「0.8」・0.25→「0.3」で線とずれ、
        // 並びも 1 / 0.8 / 0.5 / 0.3 / 0 と不等間隔に見えていた
        expect(averages([0.4, 0.7, 1]).map(formatTick)).toEqual(['1', '0.75', '0.5', '0.25', '0']);
    });

    it('整数と1桁小数はそのまま', () => {
        expect(counts([6, 9, 14]).map(formatTick)).toEqual(['20', '15', '10', '5', '0']);
        expect(averages([7, 9, 8.5]).map(formatTick)).toEqual(['10', '7.5', '5', '2.5', '0']);
    });

    it('表示した目盛りは、実際の目盛り値と読み戻して一致する', () => {
        for (const values of [[0.4, 0.7, 1], [0.05, 0.1], [3], [2, 1], [45], [130], [12.5]]) {
            for (const ticks of [counts(values), averages(values)]) {
                expect(ticks.map(formatTick).map(Number)).toEqual(ticks);
            }
        }
    });
});

describe('formatBarValue', () => {
    it('試合単位（回数そのもの）は軸と同じく整数で出す', () => {
        // 軸が 4/3/2/1/0 なのに棒だけ「2.0」「0.0」だと桁がそろわない
        expect(formatBarValue(2, true)).toBe('2');
        expect(formatBarValue(0, true)).toBe('0');
    });

    it('期間平均は、値がたまたま整数でも小数1桁で出す', () => {
        // 月平均が 1.0 / 1.0 / 1.0 の月だけ「1」になると、隣の「3.7」と桁がそろわない
        expect(formatBarValue(3.666, false)).toBe('3.7');
        expect(formatBarValue(1, false)).toBe('1.0');
        expect(formatBarValue(0, false)).toBe('0.0');
    });
});
