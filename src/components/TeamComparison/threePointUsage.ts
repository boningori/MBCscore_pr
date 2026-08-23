// 「この試合は3Pを使っていない」と言い切ってよいかの判定。
//
// showThreePoint は試合オプションから途中で変えられる。設定を見るだけだと、
// 前半だけ3Pを使って後半OFFにした試合で「未使用」と出てしまう。記録が
// 1つでもあれば、設定がどうであれ未使用とは言わない。
//
// 古い記録は showThreePoint 自体が保存されていない（optional）。この場合は
// 「使っていない」のか「そもそも分からない」のかを区別できないので、
// 使用扱いにして通常の 0/0 表示（formatShot と同じ「-」）に落とす。

import type { ScoreEntry, StatEntry } from '../../types/game';

export function isThreePointUnused(
    showThreePoint: boolean | undefined,
    scoreHistory: ScoreEntry[],
    statHistory: StatEntry[],
): boolean {
    if (showThreePoint !== false) return false;
    if (scoreHistory.some(s => s.scoreType === '3P')) return false;
    if (statHistory.some(s => s.statType === '3PA')) return false;
    return true;
}
