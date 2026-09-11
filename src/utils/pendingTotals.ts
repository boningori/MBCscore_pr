// 保留アクションの集計。
//
// 保留は「何が起きたかは分かっているが、誰がやったかは決まっていない」記録で、
// 解決されるまでチームファウルにも選手スタッツにも入らない
// （handleAddPendingAction は配列へ積むだけ）。
//
// 最終的に解決すれば辻褄は合う。問題は、解決するまでの間に記録者が見て判断する
// 数字が実態より小さいままになることで、その数字は記録の中身を左右する。
//
// チームファウルは数を足して見せる。ペナルティ（5個目以降はFT2本）の判定に
// 直接効き、しかもその判定はファウルが起きた瞬間に要るためである。
//
// 得点は足さない。保留は「番号を取り逃した」ときの一時置き場で、次のデッドボールで
// ベンチに聞けば解決する。いっぽう暫定の点をスコアに出すと、確定した点との区別が
// 常時つきまとう。効くのは第4Q終了時の同点＝延長戦の判定なので、そこで
// 「残っているか」だけを見て知らせれば足りる（hasPendingScores）。
//
// どちらも状態そのものは変えない（解決時に incrementTeamFoul が走るので、
// 積む時点でも足すと二重になる）。

import type { PendingAction } from '../types/pendingAction';

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
 * 得点の保留が残っているか。
 *
 * 残っている間は、画面のスコアと「実際に入った点」が食い違う。勝敗・同点が
 * 決まる場面ではその差が結論を変えるので、判定の前に知らせる必要がある。
 */
export function hasPendingScores(pendingActions: PendingAction[]): boolean {
    return pendingActions.some(p => p.actionType === 'SCORE');
}
