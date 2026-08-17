import type { ScoreEntry } from '../../types/game';

/**
 * OT欄は直前ピリオドの数を種にして積み上がる（gameFlowHandlers の extendForOT）。
 * つまりOT欄には第4Qで犯したファウルが含まれている。第4Q以降のファウルを
 * 足し引きするときは、それを含んでいる後続のOT欄もまとめて動かさないと
 * 通算がずれ、ペナルティ判定（OT欄を見ている）が狂う。
 * Q1〜Q3は互いに独立なので、その枠だけを動かす。
 */
function adjustTeamFoul(teamFouls: number[], quarter: number, delta: number): number[] {
    const next = [...teamFouls];
    const apply = (index: number) => {
        if (index < 0 || index >= next.length) return;
        if (delta < 0 && next[index] <= 0) return;
        next[index] += delta;
    };

    apply(quarter - 1);
    if (quarter >= 4) {
        for (let i = quarter; i < next.length; i++) apply(i);
    }
    return next;
}

/**
 * 指定ピリオドのチームファウルを1つ増やした配列を返す。
 *
 * 現在のピリオドに足すぶんには最後の枠なので伝播先は無いが、保留アクションは
 * 記録された当時のピリオドへ後から足す。第4Qの保留をOT中に解決すると、
 * OT欄（第4Qからの通算）に伝わらず通算が1つ足りないままになっていた。
 * 減算側（decrementTeamFoul）とここを対にしておく。
 */
export function incrementTeamFoul(teamFouls: number[], quarter: number): number[] {
    return adjustTeamFoul(teamFouls, quarter, 1);
}

/** 指定ピリオドのチームファウルを1つ減らした配列を返す（0未満にはしない） */
export function decrementTeamFoul(teamFouls: number[], quarter: number): number[] {
    return adjustTeamFoul(teamFouls, quarter, -1);
}

// ヘルパー関数: ランニングスコアを再計算
export function recalculateRunningScores(
    scoreHistory: ScoreEntry[]
): ScoreEntry[] {
    // タイムスタンプ順にソート
    const sorted = [...scoreHistory].sort((a, b) => a.timestamp - b.timestamp);

    let runningA = 0;
    let runningB = 0;

    return sorted.map(entry => {
        runningA += entry.teamId === 'teamA' ? entry.points : 0;
        runningB += entry.teamId === 'teamB' ? entry.points : 0;
        return {
            ...entry,
            runningScoreA: runningA,
            runningScoreB: runningB,
        };
    });
}
