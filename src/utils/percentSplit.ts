/**
 * 内訳を「割合」と「残り」に割り、合計が必ず100%になるようにする。
 *
 * 割合と残りをそれぞれ独立に丸めると、両方が切り上がって合計101%になることがある
 * （実例: OFF 13 / DEF 27 / 計40 → 32.5%→33%、67.5%→68%）。
 * 片方だけを丸め、もう片方は 100 から引いて求める。
 *
 * 母数が0のときは両方0を返す（「-」等の代替表示は呼び出し側の判断）。
 */
export function splitPercent(part: number, total: number): { part: number; rest: number } {
    if (total <= 0) return { part: 0, rest: 0 };
    const rounded = Math.round((part / total) * 100);
    return { part: rounded, rest: 100 - rounded };
}
