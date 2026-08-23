// 比較表の行データ。表示コンポーネントは、ここで決まった文字列と比率を描くだけにする。
//
// バーの長さの決め方が2種類あるのは意図的。
//   割合の行 … 0〜100%の絶対スケール。48.4%と44.8%がほぼ同じ長さで出るのが正しく、
//              左右の最大値で割ると僅差が大差に見える
//   実数の行 … その行の左右の大きい方を1とした相対スケール
//
// 濃色にする側（leader）は基本的に値が大きい方だが、TOとファウルだけは
// 少ない方にする。多い方を強調すると意味が逆に読める。

import type { TeamTotals } from './teamTotals';

export interface ComparisonRow {
    key: string;
    label: string;
    leftText: string;
    rightText: string;
    /** 0〜1。バーの長さ */
    leftRatio: number;
    rightRatio: number;
    /** 濃色にする側 */
    leader: 'left' | 'right' | 'none';
    /** この試合では記録し得ない行（3P未使用）。バーを描かない */
    unavailable: boolean;
}

export interface BuildOptions {
    /** 3Pを使わない試合か（設定OFFかつ記録0件のときだけ true） */
    threePointUnused: boolean;
}

/** 試投0のときは割合を出さない。0.0% と「打っていない」は違う */
function percentText(made: number, attempt: number): string {
    if (attempt === 0) return '-';
    return `${((made / attempt) * 100).toFixed(1)}%`;
}

function percentRatio(made: number, attempt: number): number {
    return attempt === 0 ? 0 : made / attempt;
}

// 試投0のときは「0/0」ではなく「-」にする。隣に並ぶ StatsPanel の
// formatShot と表記を揃える（割合の行はpercentTextで既に揃っている）
function shotText(made: number, attempt: number): string {
    if (attempt === 0) return '-';
    return `${made}/${attempt}`;
}

type Direction = 'higher' | 'lower';

function ratios(left: number, right: number): { leftRatio: number; rightRatio: number } {
    const max = Math.max(left, right);
    if (max <= 0) return { leftRatio: 0, rightRatio: 0 };
    return { leftRatio: left / max, rightRatio: right / max };
}

function leaderOf(left: number, right: number, direction: Direction): ComparisonRow['leader'] {
    if (left === right) return 'none';
    const leftWins = direction === 'higher' ? left > right : left < right;
    return leftWins ? 'left' : 'right';
}

function countRow(key: string, label: string, left: number, right: number, direction: Direction = 'higher'): ComparisonRow {
    return {
        key, label,
        leftText: String(left),
        rightText: String(right),
        ...ratios(left, right),
        leader: leaderOf(left, right, direction),
        unavailable: false,
    };
}

function shotRow(key: string, label: string, left: [number, number], right: [number, number]): ComparisonRow {
    return {
        key, label,
        leftText: shotText(left[0], left[1]),
        rightText: shotText(right[0], right[1]),
        ...ratios(left[0], right[0]),
        leader: leaderOf(left[0], right[0], 'higher'),
        unavailable: false,
    };
}

function percentRow(key: string, label: string, left: [number, number], right: [number, number]): ComparisonRow {
    const leftRatio = percentRatio(left[0], left[1]);
    const rightRatio = percentRatio(right[0], right[1]);
    return {
        key, label,
        leftText: percentText(left[0], left[1]),
        rightText: percentText(right[0], right[1]),
        // 割合は絶対スケール。相対にすると僅差が大差に見える
        leftRatio, rightRatio,
        leader: leaderOf(leftRatio, rightRatio, 'higher'),
        unavailable: false,
    };
}

/** 3Pを使わない試合の行。行そのものは残し、値の代わりにEMダッシュ（—）を出す */
function unavailableRow(key: string, label: string): ComparisonRow {
    return { key, label, leftText: '—', rightText: '—', leftRatio: 0, rightRatio: 0, leader: 'none', unavailable: true };
}

export function buildComparisonRows(left: TeamTotals, right: TeamTotals, options: BuildOptions): ComparisonRow[] {
    const fg = (t: TeamTotals): [number, number] =>
        [t.twoMade + t.threeMade, t.twoAttempt + t.threeAttempt];

    return [
        countRow('points', 'PTS', left.points, right.points),
        // 3Pを使わない試合では、すべてのシュートが2点なので FG は 2FG と
        // 同じ数字になる。同じ値の行を2組並べても情報は増えず、別々の指標に
        // 見えて誤読を招くだけなので出さない。
        // 3Pの行のほうは「—」で残す。あちらは「0本だった」のか「使っていない」
        // のかを区別するために要る（threePointUsage.ts 参照）
        ...(options.threePointUnused ? [] : [
            shotRow('fieldGoal', 'FGM-FGA', fg(left), fg(right)),
            percentRow('fieldGoalPercent', 'FG%', fg(left), fg(right)),
        ]),
        shotRow('twoPoint', '2FG', [left.twoMade, left.twoAttempt], [right.twoMade, right.twoAttempt]),
        percentRow('twoPercent', '2FG%', [left.twoMade, left.twoAttempt], [right.twoMade, right.twoAttempt]),
        options.threePointUnused
            ? unavailableRow('threePoint', '3FG')
            : shotRow('threePoint', '3FG', [left.threeMade, left.threeAttempt], [right.threeMade, right.threeAttempt]),
        options.threePointUnused
            ? unavailableRow('threePercent', '3FG%')
            : percentRow('threePercent', '3FG%', [left.threeMade, left.threeAttempt], [right.threeMade, right.threeAttempt]),
        shotRow('freeThrow', 'FT', [left.ftMade, left.ftAttempt], [right.ftMade, right.ftAttempt]),
        percentRow('freeThrowPercent', 'FT%', [left.ftMade, left.ftAttempt], [right.ftMade, right.ftAttempt]),
        countRow('rebounds', 'REB', left.offensiveRebounds + left.defensiveRebounds, right.offensiveRebounds + right.defensiveRebounds),
        countRow('offensiveRebounds', 'OR', left.offensiveRebounds, right.offensiveRebounds),
        countRow('defensiveRebounds', 'DR', left.defensiveRebounds, right.defensiveRebounds),
        countRow('assists', 'AST', left.assists, right.assists),
        countRow('turnovers', 'TO', left.turnovers, right.turnovers, 'lower'),
        countRow('steals', 'ST', left.steals, right.steals),
        countRow('blocks', 'BS', left.blocks, right.blocks),
        countRow('fouls', 'F', left.fouls, right.fouls, 'lower'),
    ];
}
