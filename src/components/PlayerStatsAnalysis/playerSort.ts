// 選手一覧の並べ替え。
//
// 一覧は背番号順に固定されていて、「誰が伸びているか」「誰がよく決めているか」を
// 一覧のまま掴めなかった（1人ずつ詳細を開くしかない）。
// 表示順を変えるだけで、集計値そのものには手を触れない。

import type { AggregatedPlayerStats } from '../../utils/playerStatsAnalysis';

export type PlayerSortKey = 'number' | 'points' | 'rebounds' | 'assists' | 'fgPercent' | 'quarters';

// ラベルには基準（平均か通算か）を書く。
// 得点・REB・ASTは avgStats、出場Qは通算で並べているのに、どれも
// 「◯が多い順」だった。「得点が多い順」で1試合30点の選手が10試合100点の
// 選手より上に来るのに、ラベルからはそう読めない。
export const PLAYER_SORT_OPTIONS: { key: PlayerSortKey; label: string }[] = [
    { key: 'number', label: '背番号順' },
    { key: 'points', label: '平均得点が多い順' },
    { key: 'rebounds', label: '平均REBが多い順' },
    { key: 'assists', label: '平均ASTが多い順' },
    { key: 'fgPercent', label: 'FG%が高い順' },
    { key: 'quarters', label: '通算出場Qが多い順' },
];

const rebounds = (p: AggregatedPlayerStats) =>
    p.avgStats.offensiveRebounds + p.avgStats.defensiveRebounds;

/**
 * FG%順で「率が定まっている」とみなす最低試投数（規定試投）。
 *
 * 下限を置かないと、1試合で1本だけ決めた選手が 18/22 の選手より上に来る
 * （実測）。カードに出るのは率だけなので、一覧からは見分けられない。
 * 「誰がよく決めているか」を掴むための並び順が、いちばん外れる形になる。
 *
 * 実在のスポーツの規定打席・規定試投と同じ考え方で、試合数に比例させる。
 * 固定本数（例: 5本）だと、記録が1〜2試合しかない時期に全員が下限割れして
 * 並び順そのものが機能しなくなる。
 *
 * 分母は「一覧でいちばん多く出場した選手の試合数」。チームの試合数そのものは
 * ここに渡ってこないが、全員出場が基本のミニバスではほぼ一致する。
 * 期間で絞れば絞ったぶんだけ下限も下がるので、どの期間でも並びが空にならない。
 */
function qualifyingAttempts(players: AggregatedPlayerStats[]): number {
    return players.reduce((max, p) => Math.max(max, p.gamesPlayed), 0);
}

/**
 * FG成功率。試投が無い・規定試投に満たなければ null。
 *
 * 0として扱うと「まだ打っていない選手」と「打って全部外した選手」が
 * 区別できなくなるうえ、前者が上位に混ざると一番決めた選手を探せない。
 * 下限割れも同じ「値なし」に寄せる —— 率そのものは出せても、順位を
 * 付けられるだけの根拠が無いという意味では同じため。
 * カードには分母（1/1）が出ているので、下にいる理由は一覧から読める。
 */
function fgPercent(p: AggregatedPlayerStats, minAttempts: number): number | null {
    const attempts = p.totalStats.twoPointAttempt + p.totalStats.threePointAttempt;
    if (attempts === 0 || attempts < minAttempts) return null;
    return (p.totalStats.twoPointMade + p.totalStats.threePointMade) / attempts;
}

/** 大きいほど上に来る値。null は「値なし」として最後に回す */
function sortValue(p: AggregatedPlayerStats, key: PlayerSortKey, minAttempts: number): number | null {
    switch (key) {
        case 'number': return null;
        case 'points': return p.avgStats.points;
        case 'rebounds': return rebounds(p);
        case 'assists': return p.avgStats.assists;
        case 'fgPercent': return fgPercent(p, minAttempts);
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

    // 規定試投は一覧全体から決まる。並べ替えのたびに1回だけ求める
    const minAttempts = key === 'fgPercent' ? qualifyingAttempts(players) : 0;

    return [...players].sort((a, b) => {
        const av = sortValue(a, key, minAttempts);
        const bv = sortValue(b, key, minAttempts);
        // 値なしは常に下。値なし同士は背番号順
        if (av === null && bv === null) return byNumber(a, b);
        if (av === null) return 1;
        if (bv === null) return -1;
        if (av !== bv) return bv - av;
        return byNumber(a, b);
    });
}
