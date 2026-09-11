// 保留アクションの集計。
//
// 保留は「何が起きたかは分かっているが、誰がやったかは決まっていない」記録で、
// 解決されるまでチームファウルにも選手スタッツにも入らない
// （handleAddPendingAction は配列へ積むだけ）。
//
// 最終的に解決すれば辻褄は合う。問題は、解決するまでの間に記録者が見て判断する
// 数字が実態より小さいままになることで、その数字は記録の中身を左右する:
//   - チームファウル … ペナルティ（5個目以降はFT2本）の判定
//   - 得点           … 第4Q終了時の同点＝延長戦の判定
//
// 数え方をここに1つ置き、表示側と判定側が同じ数を見るようにする。
// 状態そのものは変えない（解決時に incrementTeamFoul が走るので、
// 積む時点でも足すと二重になる）。

import type { PendingAction } from '../types/pendingAction';

/** 得点種別1件あたりの点数。読めない種別は0にして合計を壊さない */
const POINTS_BY_VALUE: Record<string, number> = {
    '2P': 2,
    '3P': 3,
    'FT': 1,
};

/**
 * そのピリオドのチームファウルに、まだ入っていない保留ファウルの数。
 *
 * ピリオドの数え方は解決側（shared.ts の adjustTeamFoul）に合わせる。
 * OT欄は直前ピリオドの数を種にして積み上がる（extendForOT）ため、OT中の通算には
 * 第4Q以降のファウルが含まれる。ここだけ「そのピリオドだけ」を数えると、
 * OTに入った瞬間に保留のぶんが通算から抜け落ちる。
 */
export function pendingTeamFouls(
    pendingActions: PendingAction[],
    teamId: string,
    quarter: number,
): number {
    return pendingActions.filter(p => {
        if (p.actionType !== 'FOUL' || p.teamId !== teamId) return false;
        // OT（5以降）は第4Qからの通算。Q1〜Q4はそのピリオドだけ
        if (quarter > 4) return p.quarter >= 4 && p.quarter <= quarter;
        return p.quarter === quarter;
    }).length;
}

/**
 * そのチームの得点のうち、保留のまま合計に入っていない点数。
 *
 * ピリオドはまたいで通算する。効くのは最終スコア（＝同点判定）なので、
 * チームファウルのようにピリオドで区切る意味がない。
 */
export function pendingTeamPoints(pendingActions: PendingAction[], teamId: string): number {
    return pendingActions.reduce((sum, p) => {
        if (p.actionType !== 'SCORE' || p.teamId !== teamId) return sum;
        return sum + (POINTS_BY_VALUE[p.value] ?? 0);
    }, 0);
}

/**
 * 得点の保留が残っているか。
 *
 * 残っている間は、画面のスコアと「実際に入った点」が食い違う。勝敗・同点が
 * 決まる場面ではその差が結論を変えるので、判定の前に知らせる必要がある。
 */
export function hasPendingScores(pendingActions: PendingAction[]): boolean {
    return pendingActions.some(p => p.actionType === 'SCORE');
}
