// 公式様式のファウル欄は選手1人につき5枠しかない（RunningScoresheet は
// [0,1,2,3,4] の5マスしか描かない）。6個目以降は様式から無言で消える。
//
// アプリは6個目を止めない。練習試合では相手チームの同意のうえで失格者が
// 出続ける運用があり（useFoulOutNotice のコメント）、そこで実際に起きる
// ファウルとチームファウルを落とすわけにいかないため。
// 代わりに、記録者へ確認・警告を出すためにこの判定を使う。

import { MAX_PERSONAL_FOULS } from '../types/game';
import type { FoulType, FoulRecord } from '../types/game';

/**
 * あと1つ記録すると、公式様式のファウル欄（5枠）に収まらなくなるか。
 *
 * 判定は個数だけで決める。失格判定（getDisqualification）を流用してはいけない。
 * 失格は D 1つ・T/U 2回でも成立し、どちらも5個目より先に来るため、
 * まだ枠に収まる3個目・4個目にまで警告が出て、本当に止めたい場面の
 * 重みが薄れる。
 */
export function wouldOverflowFoulColumns(
    fouls: (FoulType | FoulRecord)[] | undefined,
): boolean {
    return (fouls?.length ?? 0) >= MAX_PERSONAL_FOULS;
}
