// 選手一覧の並べ替え。
//
// 一覧は背番号順に固定されていて、「誰が伸びているか」「誰がよく決めているか」を
// 一覧のまま掴めなかった（1人ずつ詳細を開くしかない）。
// 表示順を変えるだけで、集計値そのものには手を触れない。

import type { AggregatedPlayerStats } from '../../utils/playerStatsAnalysis';

export type PlayerSortKey = 'number' | 'points' | 'rebounds' | 'assists' | 'fgPercent' | 'quarters';

export const PLAYER_SORT_OPTIONS: { key: PlayerSortKey; label: string }[] = [
    { key: 'number', label: '背番号順' },
    { key: 'points', label: '得点が多い順' },
    { key: 'rebounds', label: 'REBが多い順' },
    { key: 'assists', label: 'ASTが多い順' },
    { key: 'fgPercent', label: 'FG%が高い順' },
    { key: 'quarters', label: '出場Qが多い順' },
];

const rebounds = (p: AggregatedPlayerStats) =>
    p.avgStats.offensiveRebounds + p.avgStats.defensiveRebounds;

/**
 * FG成功率。試投が無ければ null。
 *
 * 0として扱うと「まだ打っていない選手」と「打って全部外した選手」が
 * 区別できなくなるうえ、前者が上位に混ざると一番決めた選手を探せない。
 */
function fgPercent(p: AggregatedPlayerStats): number | null {
    const attempts = p.totalStats.twoPointAttempt + p.totalStats.threePointAttempt;
    if (attempts === 0) return null;
    return (p.totalStats.twoPointMade + p.totalStats.threePointMade) / attempts;
}

/** 大きいほど上に来る値。null は「値なし」として最後に回す */
function sortValue(p: AggregatedPlayerStats, key: PlayerSortKey): number | null {
    switch (key) {
        case 'number': return null;
        case 'points': return p.avgStats.points;
        case 'rebounds': return rebounds(p);
        case 'assists': return p.avgStats.assists;
        case 'fgPercent': return fgPercent(p);
        case 'quarters': return p.totalQuartersPlayed;
    }
}

/**
 * 表示順に並べ替えた新しい配列を返す（元の配列は変えない）。
 *
 * 同値のときは背番号順にして、並びが呼び出しごとに揺れないようにする。
 */
export function sortPlayers(
    players: AggregatedPlayerStats[],
    key: PlayerSortKey,
): AggregatedPlayerStats[] {
    const byNumber = (a: AggregatedPlayerStats, b: AggregatedPlayerStats) => a.number - b.number;
    if (key === 'number') return [...players].sort(byNumber);

    return [...players].sort((a, b) => {
        const av = sortValue(a, key);
        const bv = sortValue(b, key);
        // 値なしは常に下。値なし同士は背番号順
        if (av === null && bv === null) return byNumber(a, b);
        if (av === null) return 1;
        if (bv === null) return -1;
        if (av !== bv) return bv - av;
        return byNumber(a, b);
    });
}
