// クォーター別得点。スコアヘッダーの表と、クォーター切替の選択肢の両方が使う。
//
// Q1〜Q4 は無得点でも列を出す（公式様式と同じで、空欄も情報になる）。
// 延長は「あった試合にだけ」出す。常に出すと、ほぼすべての試合で空の
// OT列が並ぶことになる。

import type { ScoreEntry } from '../../types/game';
import { MAX_QUARTERS } from '../../types/game';

export interface QuarterScore {
    quarter: number;
    teamA: number;
    teamB: number;
}

/** ピリオド番号だけを見る。スタッツ・ファウルの履歴をまとめて受けるための最小形 */
interface HasQuarter {
    quarter: number;
}

/**
 * 記録のあるクォーターの番号（Q1〜Q4は常に含む）。昇順。
 *
 * 得点履歴だけを見てはいけない。延長が0-0のまま次の延長へ進むのは実際に
 * 起こる —— 同点でなければ試合は終わるので、延長が無得点ならもう1つ延長を
 * するしかない（gameFlowHandlers の handleEndQuarter）。
 * 実測(v1.6.10): Q1とOT2にだけ得点がある試合で [1,2,3,4,6] を返し、
 * スコアヘッダーとクォーター切替がQ4からOT2へ飛んでいた。そのOTで記録した
 * リバウンド・ターンオーバー・ファウルはクォーター別からは参照できない。
 *
 * @param others スタッツ履歴・ファウル履歴など、ピリオドを持つ他の記録
 */
export function recordedQuarters(
    scoreHistory: ScoreEntry[],
    ...others: readonly HasQuarter[][]
): number[] {
    const quarters = new Set<number>();
    for (let q = 1; q <= MAX_QUARTERS; q++) quarters.add(q);
    for (const entry of scoreHistory) quarters.add(entry.quarter);
    for (const history of others) {
        for (const entry of history) quarters.add(entry.quarter);
    }
    return [...quarters].sort((a, b) => a - b);
}

/** @param others recordedQuarters と同じ（行を落とさないため同じものを渡すこと） */
export function computeQuarterScores(
    scoreHistory: ScoreEntry[],
    ...others: readonly HasQuarter[][]
): QuarterScore[] {
    const rows = new Map<number, QuarterScore>();
    for (const quarter of recordedQuarters(scoreHistory, ...others)) {
        rows.set(quarter, { quarter, teamA: 0, teamB: 0 });
    }

    for (const entry of scoreHistory) {
        const row = rows.get(entry.quarter);
        if (!row) continue;
        // teamId は得点が入る側。オウンゴールもここに含まれる
        if (entry.teamId === 'teamA') row.teamA += entry.points;
        else if (entry.teamId === 'teamB') row.teamB += entry.points;
    }

    return [...rows.values()];
}
