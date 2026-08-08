// ハーフタイムの太線の位置を決めるための、前半（Q1-Q2）ファウル数の集計。
//
// 太線は「前半終了時点でどこまで記入済みだったか」を示す区切りなので、
// player.fouls.length（現在の合計）ではなく前半分だけを数える必要がある。
// 合計で数えると後半にファウルが増えるたびに線が右へ動いてしまう。

import type { FoulEntry } from '../../types/game';

/** 前半とみなすクォーター（Q1・Q2） */
const FIRST_HALF_LAST_QUARTER = 2;

/** シート上のファウル記入欄の数。前半分がこれを超えても最後の枠で頭打ちにする */
export const FOUL_CELL_COUNT = 5;

/**
 * 選手の前半（Q1-Q2）ファウル数を返す。記入欄の数で頭打ちにする。
 *
 * ファウル欄のセル f は playerFoulHistory[f] に対応する前提で色分けされており
 * （ファウルは時系列に積まれるため）、ここもその前提に揃えている。
 */
export function countFirstHalfFouls(foulHistory: FoulEntry[], playerId: string): number {
    let count = 0;
    for (const entry of foulHistory) {
        if (entry.playerId === playerId && entry.quarter <= FIRST_HALF_LAST_QUARTER) {
            count++;
        }
    }
    return Math.min(count, FOUL_CELL_COUNT);
}
