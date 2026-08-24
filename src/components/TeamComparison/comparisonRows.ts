// 比較表の行データ。表示コンポーネントは、ここで決まった文字列と比率を描くだけにする。
//
// バーの長さの決め方が3種類ある。
//   割合の行     … 0〜100%の絶対スケール。48.4%と44.8%がほぼ同じ長さで出るのが正しく、
//                   左右の最大値で割ると僅差が大差に見える
//   シュートの実数行 … 長さは「試投数」、そのうち「成功数」が占める分を塗る（fill）。
//                   成功数だけで長さを決めていたときは、3/20 のバーが 2/4 より長くなり、
//                   すぐ下の 15.0% vs 50.0% の行と勝敗が食い違っていた
//   その他の実数行 … その行の左右の大きい方を1とした相対スケール
//
// 勝敗（leader）を出さない行が2種類ある。どちらも「1つの勝敗に畳めない」ため。
//   シュートの実数行 … 成功数と試投数の2つの数字を持つ。良し悪しは下の割合の行が示す
//   試投が少ない割合の行 … 1/1 の 100% が 9/10 の 90% に勝ってしまう
//
// 濃色にする側は基本的に値が大きい方だが、TOとファウルだけは少ない方にする。
// 多い方を強調すると意味が逆に読める。この2行はラベルに「↓」を出して、
// 少ない方が良いことを画面上でも示す。

import type { TeamTotals } from './teamTotals';

export interface ComparisonRow {
    key: string;
    label: string;
    leftText: string;
    rightText: string;
    /** 0〜1。バーの長さ */
    leftRatio: number;
    rightRatio: number;
    /**
     * 0〜1。バーのうち塗りつぶす割合。
     * シュートの実数行だけ1未満になる（長さ＝試投数、塗り＝成功数）。
     * それ以外の行は1で、従来どおり全体が塗られる
     */
    leftFill: number;
    rightFill: number;
    /** 濃色にする側。'none' は「引き分け」または「勝敗を出さない行」 */
    leader: 'left' | 'right' | 'none';
    /** 少ない方が良い行か。ラベルに「↓」を出す */
    lowerIsBetter: boolean;
    /** この試合では記録し得ない行（3P未使用）。バーを描かない */
    unavailable: boolean;
}

/**
 * 割合で勝敗を出すのに要る最低試投数（左右とも）。
 *
 * これを設けないと 1/1 の 100.0% が 9/10 の 90.0% に勝つ。ミニバスは
 * フリースローの本数が少なく、クォーターで絞るとさらに減るので、実際に
 * よく起きる。5本に満たない側があるときは勝敗を出さない（数字は出す）。
 */
const MIN_ATTEMPTS_FOR_PERCENT_LEADER = 5;

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
        // 実数はバー全体が値そのもの。塗り分けるものが無い
        leftFill: 1, rightFill: 1,
        leader: leaderOf(left, right, direction),
        lowerIsBetter: direction === 'lower',
        unavailable: false,
    };
}

/**
 * シュートの実数行（成功/試投）。
 *
 * バーの長さは試投数、塗りは成功数の割合にする。表示している「3/20」の
 * 両方の数字がバーに現れるので、数字とバーが食い違わない。
 *
 * 勝敗は出さない。成功数で決めると 3/20 が 2/4 に勝ち、試投数で決めると
 * 「たくさん打った方が勝ち」になる。どちらも意味を成さないので、
 * 良し悪しの判断はすぐ下の割合の行に委ねる。
 */
function shotRow(key: string, label: string, left: [number, number], right: [number, number]): ComparisonRow {
    return {
        key, label,
        leftText: shotText(left[0], left[1]),
        rightText: shotText(right[0], right[1]),
        ...ratios(left[1], right[1]),
        leftFill: percentRatio(left[0], left[1]),
        rightFill: percentRatio(right[0], right[1]),
        leader: 'none',
        lowerIsBetter: false,
        unavailable: false,
    };
}

function percentRow(key: string, label: string, left: [number, number], right: [number, number]): ComparisonRow {
    const leftRatio = percentRatio(left[0], left[1]);
    const rightRatio = percentRatio(right[0], right[1]);
    // 試投が少ないうちは割合で優劣を語れない（MIN_ATTEMPTS_FOR_PERCENT_LEADER）
    const comparable = Math.min(left[1], right[1]) >= MIN_ATTEMPTS_FOR_PERCENT_LEADER;
    return {
        key, label,
        leftText: percentText(left[0], left[1]),
        rightText: percentText(right[0], right[1]),
        // 割合は絶対スケール。相対にすると僅差が大差に見える
        leftRatio, rightRatio,
        leftFill: 1, rightFill: 1,
        leader: comparable ? leaderOf(leftRatio, rightRatio, 'higher') : 'none',
        lowerIsBetter: false,
        unavailable: false,
    };
}

/** 3Pを使わない試合の行。行そのものは残し、値の代わりにEMダッシュ（—）を出す */
function unavailableRow(key: string, label: string): ComparisonRow {
    return {
        key, label, leftText: '—', rightText: '—',
        leftRatio: 0, rightRatio: 0, leftFill: 0, rightFill: 0,
        leader: 'none', lowerIsBetter: false, unavailable: true,
    };
}

export function buildComparisonRows(left: TeamTotals, right: TeamTotals, options: BuildOptions): ComparisonRow[] {
    const fg = (t: TeamTotals): [number, number] =>
        [t.twoMade + t.threeMade, t.twoAttempt + t.threeAttempt];

    return [
        countRow('points', 'PTS', left.points, right.points),
        // 3Pを使わない試合では、すべてのシュートが2点なので FG は 2P と
        // 同じ数字になる。同じ値の行を2組並べても情報は増えず、別々の指標に
        // 見えて誤読を招くだけなので出さない。
        // 3Pの行のほうは「—」で残す。あちらは「0本だった」のか「使っていない」
        // のかを区別するために要る（threePointUsage.ts 参照）
        ...(options.threePointUnused ? [] : [
            shotRow('fieldGoal', 'FG', fg(left), fg(right)),
            percentRow('fieldGoalPercent', 'FG%', fg(left), fg(right)),
        ]),
        shotRow('twoPoint', '2P', [left.twoMade, left.twoAttempt], [right.twoMade, right.twoAttempt]),
        percentRow('twoPercent', '2P%', [left.twoMade, left.twoAttempt], [right.twoMade, right.twoAttempt]),
        options.threePointUnused
            ? unavailableRow('threePoint', '3P')
            : shotRow('threePoint', '3P', [left.threeMade, left.threeAttempt], [right.threeMade, right.threeAttempt]),
        options.threePointUnused
            ? unavailableRow('threePercent', '3P%')
            : percentRow('threePercent', '3P%', [left.threeMade, left.threeAttempt], [right.threeMade, right.threeAttempt]),
        shotRow('freeThrow', 'FT', [left.ftMade, left.ftAttempt], [right.ftMade, right.ftAttempt]),
        percentRow('freeThrowPercent', 'FT%', [left.ftMade, left.ftAttempt], [right.ftMade, right.ftAttempt]),
        countRow('rebounds', 'REB', left.offensiveRebounds + left.defensiveRebounds, right.offensiveRebounds + right.defensiveRebounds),
        countRow('offensiveRebounds', 'OR', left.offensiveRebounds, right.offensiveRebounds),
        countRow('defensiveRebounds', 'DR', left.defensiveRebounds, right.defensiveRebounds),
        countRow('assists', 'AST', left.assists, right.assists),
        countRow('turnovers', 'TO', left.turnovers, right.turnovers, 'lower'),
        countRow('steals', 'STL', left.steals, right.steals),
        countRow('blocks', 'BLK', left.blocks, right.blocks),
        countRow('fouls', 'F', left.fouls, right.fouls, 'lower'),
    ];
}
