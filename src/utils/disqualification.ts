// 選手がコートに戻れない状態かどうかの判定（純粋関数）。
//
// これまでは「ファウル5個」だけを退場として扱っていた。しかし競技規則では
// 次のいずれでも失格になり、いずれも5個より先に来る:
//   - D（ディスクォリファイイング）1つ
//   - U（アンスポーツマンライク）2つ / T（テクニカル）2つ / T+U
// 判定が抜けていたため、Dを記録してもスタメン選択に「退場」が出ず、
// 次のクォーターで何の警告もなくコートへ戻せていた。
//
// 出場を止めることはしない（LineupTeamPanel のコメントにある方針どおり、
// 練習試合では合意のうえで続行することがある）。伝えるだけにする。

import { MAX_PERSONAL_FOULS, getFoulType } from '../types/game';
import type { FoulType, FoulRecord } from '../types/game';

export type DisqualificationReason =
    | 'disqualifying'  // D 1つ
    | 'twoSevere'      // U/T が合わせて2つ
    | 'fiveFouls';     // パーソナル含めて5つ

/** 失格・退場の理由。該当しなければ null */
export function getDisqualification(fouls: (FoulType | FoulRecord)[]): DisqualificationReason | null {
    const types = fouls.map(getFoulType);

    // 重い理由から順に返す。5個目でもあるDは「D」と伝えたほうが正確
    if (types.includes('D')) return 'disqualifying';
    if (types.filter(t => t === 'T' || t === 'U').length >= 2) return 'twoSevere';
    if (fouls.length >= MAX_PERSONAL_FOULS) return 'fiveFouls';
    return null;
}

/** コートに戻れない状態か */
export function isDisqualified(fouls: (FoulType | FoulRecord)[]): boolean {
    return getDisqualification(fouls) !== null;
}

/** スタメン選択のチップなど、狭い場所に出す短いラベル */
export function shortDisqualificationLabel(reason: DisqualificationReason): string {
    switch (reason) {
        case 'disqualifying': return '失格(D)';
        case 'twoSevere': return '失格(2回)';
        case 'fiveFouls': return '退場';
    }
}

/** トーストなど、理由まで伝えられる場所の文言 */
export function disqualificationMessage(reason: DisqualificationReason): string {
    switch (reason) {
        case 'disqualifying': return 'ディスクォリファイイングファウルで失格です';
        case 'twoSevere': return 'テクニカル／アンスポーツマンライク2回で失格です';
        case 'fiveFouls': return `${MAX_PERSONAL_FOULS}ファウル（退場）です`;
    }
}
