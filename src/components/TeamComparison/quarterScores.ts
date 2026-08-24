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

/** 記録のあるクォーターの番号（Q1〜Q4は常に含む）。昇順 */
export function recordedQuarters(scoreHistory: ScoreEntry[]): number[] {
    const quarters = new Set<number>();
    for (let q = 1; q <= MAX_QUARTERS; q++) quarters.add(q);
    for (const entry of scoreHistory) quarters.add(entry.quarter);
    return [...quarters].sort((a, b) => a - b);
}

export function computeQuarterScores(scoreHistory: ScoreEntry[]): QuarterScore[] {
    const rows = new Map<number, QuarterScore>();
    for (const quarter of recordedQuarters(scoreHistory)) {
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
