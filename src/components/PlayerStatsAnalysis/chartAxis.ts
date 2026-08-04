/** Y軸の目盛り本数（0を含む） */
export const TICK_COUNT = 5;

const INTERVALS = TICK_COUNT - 1;

/**
 * Y軸の目盛り値を降順で返す（最後は必ず0）。
 *
 * 旧実装はキリの良い「最大値」を先に決めてから4等分していたため、
 * 最大3のスティールが 3 / 2.3 / 1.5 / 0.8 / 0 となり、
 * 「0.8回」という実在しない目盛りが出ていた。
 *
 * ここでは目盛り「間隔」を先に選び、最大値をその4倍にする。さらに、
 * 元データが全て整数（試合単位のスティール・ブロック等）なら間隔も整数に
 * 制限して、回数の軸に小数が出ないようにする。
 * 月単位・四半期単位は平均値になるため、その場合は小数の間隔を許す。
 */
export function buildAxisTicks(values: number[]): number[] {
    const rawMax = values.length > 0 ? Math.max(...values, 0) : 0;
    const integerOnly = values.every(v => Number.isInteger(v));
    const step = niceStep(rawMax / INTERVALS, integerOnly);
    const max = step * INTERVALS;
    return Array.from({ length: TICK_COUNT }, (_, i) => round(max - step * i));
}

/**
 * 1・2・2.5・5・10… の系列から、必要な間隔以上で最も小さいものを選ぶ。
 *
 * integerOnly のときは整数の系列を使い、さらに3を含める。
 * 1・2・5・10 だけだと最大10のリバウンドで間隔5・軸20となり、
 * 棒が高さの半分までしか伸びず間延びする。3を許すと軸12に収まる。
 */
function niceStep(minStep: number, integerOnly: boolean): number {
    if (!(minStep > 0)) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(minStep)));
    const factors = integerOnly ? [1, 2, 3, 5, 10] : [1, 2, 2.5, 5, 10];
    for (const factor of factors) {
        const candidate = factor * magnitude;
        if (candidate < minStep - 1e-9) continue;
        const rounded = round(candidate);
        // 整数指定なら1未満に落とさない（0.5回のスティールは存在しない）
        if (integerOnly && !Number.isInteger(rounded)) continue;
        return integerOnly ? Math.max(1, Math.round(rounded)) : rounded;
    }
    const fallback = round(10 * magnitude);
    return integerOnly ? Math.max(1, Math.round(fallback)) : fallback;
}

/** 0.1*3 のような浮動小数の誤差を落とす */
function round(value: number): number {
    return Math.round(value * 1000) / 1000;
}
