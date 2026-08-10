// 出場時間で均した指標（純粋関数）。
//
// ミニバスは全員出場ルールがあり、同じ「1試合」でも1Qだけの選手と4Q出た選手が
// 混ざる。試合平均だけを見ると、出場が長い選手ほど過小に、短い選手ほど過大に
// 見える。出場クォーター数で割った値を併記して、比べられるようにする。
//
// OTは3分で通常Qの6分より短いが、ここでは1クォーターとして数える。
// ミニバスでOTに入る試合は稀で、区別すると計算も表示も複雑になるわりに
// 動く幅が小さいため。

export interface WorkloadInput {
    gamesPlayed: number;
    totalQuartersPlayed: number;
    points: number;
    rebounds: number;
    assists: number;
}

export interface Workload {
    /** 1試合あたりの出場クォーター数 */
    quartersPerGame: number;
    /** 1クォーターあたりのスタッツ */
    perQuarter: { points: number; rebounds: number; assists: number };
}

/**
 * 出場クォーターで均した指標を返す。
 *
 * 出場クォーターが1つも記録されていなければ null。
 * 出場クォーターを記録し始める前の試合しか無い選手がこれに当たる。
 * 0で割らないためだけでなく、「出していい数字が無い」ことを呼び出し側に
 * 伝えるためにも、0ではなく null を返す。
 */
export function getWorkload(input: WorkloadInput): Workload | null {
    const { gamesPlayed, totalQuartersPlayed, points, rebounds, assists } = input;
    if (gamesPlayed <= 0 || totalQuartersPlayed <= 0) return null;

    return {
        quartersPerGame: quartersPerGame(totalQuartersPlayed, gamesPlayed),
        perQuarter: {
            points: points / totalQuartersPlayed,
            rebounds: rebounds / totalQuartersPlayed,
            assists: assists / totalQuartersPlayed,
        },
    };
}

function quartersPerGame(totalQuarters: number, games: number): number {
    return totalQuarters / games;
}
