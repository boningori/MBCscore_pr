// ピリオドの表示名。
//
// 延長の書き方が画面ごとに散らばっていた。スコアボード・スタメン選択は
// OT / OT2 と出すのに、保留パネルと保留解決モーダルは内部表現のまま Q5 と
// 出しており、同じ試合の同じピリオドが画面によって違う名前で出ていた。
// 増やすたびに書き分けるとまた食い違うので、1か所に置く。

import { MAX_QUARTERS } from '../types/game';

/**
 * 1〜4 は Q1〜Q4、5以降は延長。
 * 最初の延長は1回しか無いのが普通なので番号を付けず OT とし、
 * 2回目以降だけ OT2・OT3 とする。
 */
export function quarterLabel(quarter: number): string {
    if (quarter <= MAX_QUARTERS) return `Q${quarter}`;
    const overtime = quarter - MAX_QUARTERS;
    return overtime === 1 ? 'OT' : `OT${overtime}`;
}
