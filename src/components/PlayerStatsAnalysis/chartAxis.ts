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
 * ここでは目盛り「間隔」を先に選び、最大値をその4倍にする。回数そのものを
 * 描くグラフ（試合単位）では間隔も整数に制限して、回数の軸に小数が出ない
 * ようにする。月単位・四半期単位・年単位は平均値なので小数の間隔を許す。
 *
 * 判断の入力は formatBarValue と同じ「回数そのものか平均値か」＝期間の単位。
 * 以前はここだけ値が整数かどうかで決めていたため、月平均がたまたま
 * 全部整数になった月だけ軸の刻みが変わっていた（実測: 得点の月平均が
 * 1.0/4.0/6.0… の月は軸が 12/9/6/3/0、11.7 が混じる月は 20/15/10/5/0）。
 * 同じ画面に並ぶ6枚のグラフの間でも、データ次第で刻み方が食い違う。
 *
 * @param wholeNumbers 回数そのもの（試合単位）なら true。平均値なら false
 */
export function buildAxisTicks(values: number[], wholeNumbers: boolean): number[] {
    const rawMax = values.length > 0 ? Math.max(...values, 0) : 0;
    const step = niceStep(rawMax / INTERVALS, wholeNumbers);
    const max = step * INTERVALS;
    return Array.from({ length: TICK_COUNT }, (_, i) => round(max - step * i));
}

/**
 * 1・2・2.5・3・5・10… の系列から、必要な間隔以上で最も小さいものを選ぶ。
 *
 * どちらの系列も3を含める。1・2・5・10 だけだと最大10のリバウンドで
 * 間隔5・軸20となり、棒が高さの半分までしか伸びず間延びする。3を許すと
 * 軸12に収まる。平均値の側にも同じことが起きる（最大11.7の月平均で軸20）。
 *
 * integerOnly のときは 2.5 を落とし、1未満へも落とさない
 * （0.5回のスティールは存在しない）。
 */
function niceStep(minStep: number, integerOnly: boolean): number {
    if (!(minStep > 0)) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(minStep)));
    const factors = integerOnly ? [1, 2, 3, 5, 10] : [1, 2, 2.5, 3, 5, 10];
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

/**
 * 目盛りの表示文字列。目盛り値そのものを桁を落とさずに出す。
 *
 * 以前は一律 toFixed(1) だった。間隔が 0.25 になる軸（月平均のAST・STL・BLKなど
 * 最大値が1以下のとき、niceStep が 2.5×10⁻¹ を選ぶ）で 0.75→「0.8」・
 * 0.25→「0.3」と表示され、線の位置と数字が食い違っていた。並びも
 * 1 / 0.8 / 0.5 / 0.3 / 0 と不等間隔に見える。
 * buildAxisTicks が3桁に丸めた値なので、そのまま出せば足りる。
 */
export function formatTick(value: number): string {
    return String(round(value));
}

/**
 * 棒の上に出す値の表示文字列。
 *
 * 軸が整数だけの試合単位グラフ（スティール0〜3など）で、棒のラベルだけ
 * toFixed(1) の「2.0」「0.0」になっていた。同じグラフの中で桁がそろわない。
 *
 * 判断は「回数そのものか平均値か」＝期間の単位で決める。値が整数かどうかで
 * 決めると、月平均がたまたま 1.0 / 1.0 / 1.0 になった月だけ「1」と出て、
 * 隣の「3.7」のグラフと桁がそろわなくなる。
 *
 * @param wholeNumbers 回数そのもの（試合単位）なら true。平均値なら false
 */
export function formatBarValue(value: number, wholeNumbers: boolean): string {
    return wholeNumbers ? String(round(value)) : value.toFixed(1);
}
