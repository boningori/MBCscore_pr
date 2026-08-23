// 得点推移の点列。
//
// X軸は「何本目の得点か」であって経過時間ではない。試合時計を記録していないため
// 時間軸は作れない。ラベルでもそう示すこと。
//
// クォーターを絞ったときは累計のまま該当区間を切り出す。0から描き直すと
// 試合全体のどこを見ているのか分からなくなる。起点はその区間が始まる直前の累計。

import type { ScoreEntry } from '../../types/game';
import type { QuarterFilter } from './teamTotals';

export interface EvolutionPoint {
    index: number;
    teamA: number;
    teamB: number;
}

export interface EvolutionData {
    points: EvolutionPoint[];
    /** クォーターの最初の得点の位置。区切り線とラベルに使う */
    boundaries: { index: number; quarter: number }[];
    /** Y軸の上端。0だとゼロ除算になるので最低1を返す */
    maxScore: number;
}

export function buildEvolutionData(scoreHistory: ScoreEntry[], filter: QuarterFilter): EvolutionData {
    const inRange = filter === 'all' ? scoreHistory : scoreHistory.filter(s => s.quarter === filter);

    // 絞ったクォーターに記録が無いとき、起点はその時点までの最後の累計になる。
    // 空チェックを先に出す（このあとの inRange[0] は空だと undefined になり、
    // indexOf(undefined) が -1 を返すだけの空振りになるため）
    if (inRange.length === 0 && filter !== 'all') {
        const last = scoreHistory.filter(s => s.quarter < filter).at(-1);
        return {
            points: [{ index: 0, teamA: last?.runningScoreA ?? 0, teamB: last?.runningScoreB ?? 0 }],
            boundaries: [],
            maxScore: Math.max(1, last?.runningScoreA ?? 0, last?.runningScoreB ?? 0),
        };
    }

    // 区間の起点。絞り込み時は、その区間の1つ前のエントリの累計から始める
    const startIndex = filter === 'all' ? -1 : scoreHistory.indexOf(inRange[0]) - 1;
    const before = startIndex >= 0 ? scoreHistory[startIndex] : undefined;
    const origin: EvolutionPoint = {
        index: 0,
        teamA: before?.runningScoreA ?? 0,
        teamB: before?.runningScoreB ?? 0,
    };

    const points: EvolutionPoint[] = [origin];
    const boundaries: { index: number; quarter: number }[] = [];
    let previousQuarter = filter === 'all' ? 0 : filter;

    inRange.forEach((entry, i) => {
        points.push({ index: i + 1, teamA: entry.runningScoreA, teamB: entry.runningScoreB });
        if (entry.quarter !== previousQuarter) {
            boundaries.push({ index: i + 1, quarter: entry.quarter });
            previousQuarter = entry.quarter;
        }
    });

    const maxScore = Math.max(1, ...points.map(p => Math.max(p.teamA, p.teamB)));
    return { points, boundaries, maxScore };
}
