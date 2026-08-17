// 選手詳細の派生統計: 直近フォーム・勝敗別スプリット（純粋関数）

import type { PlayerGameRecord } from './playerStatsAnalysis';

export interface FormStats {
    points: number;
    rebounds: number;   // OR + DR
    assists: number;
}

export interface RecentForm {
    recentGames: number;   // 実際に集計した試合数 = min(recentN, 全試合数)
    recentAvg: FormStats;
    overallAvg: FormStats;
    deltas: FormStats;     // recentAvg - overallAvg
    isPartial: boolean;    // recentGames < recentN
    /**
     * 全試合が直近ウィンドウに収まっているか（試合数 <= recentN）。
     *
     * このとき直近平均と通算平均は同じ集合なので、差は必ず0になる。
     * 「vs 通算平均」と称して ±0.0 を並べると、実際には毎試合伸びている選手が
     * 「通算と変わらない」と読めてしまう（実測: 6→8→10→12→14点の5試合で
     * 全項目が ± 0.0）。比較が成立しないことは呼び出し側が明示する必要がある。
     */
    coversAllGames: boolean;
    /** 比較が成立し始める試合数（= recentN + 1）。案内文で使う */
    comparableFrom: number;
}

export interface SplitStats {
    points: number;
    rebounds: number;   // OR + DR
    assists: number;
    steals: number;
    turnovers: number;
}

export interface WinLossSplit {
    win: { n: number; avg: SplitStats };
    loss: { n: number; avg: SplitStats };
    // 引き分けも返す。以前は勝ち・負けだけを抜き出していたため引き分けの試合が
    // どちらにも入らず表から消え、nの合計が試合数と合わなかった
    draw: { n: number; avg: SplitStats };
}

const reb = (r: PlayerGameRecord) => r.stats.offensiveRebounds + r.stats.defensiveRebounds;

function avgForm(games: PlayerGameRecord[]): FormStats {
    const n = games.length;
    if (n === 0) return { points: 0, rebounds: 0, assists: 0 };
    const sum = games.reduce(
        (a, g) => ({
            points: a.points + g.stats.points,
            rebounds: a.rebounds + reb(g),
            assists: a.assists + g.stats.assists,
        }),
        { points: 0, rebounds: 0, assists: 0 },
    );
    return { points: sum.points / n, rebounds: sum.rebounds / n, assists: sum.assists / n };
}

/**
 * 直近フォームを計算する。
 * @param gameHistory 日付降順（新しい順）で並んだ試合履歴。直近N試合はこの並びの先頭から取る。
 *   （`aggregatePlayerStats` は降順ソート済みのgameHistoryを返す。）
 * @param recentN 直近とみなす試合数（デフォルト5）。
 */
export function getRecentForm(gameHistory: PlayerGameRecord[], recentN = 5): RecentForm {
    const recentGames = Math.min(recentN, gameHistory.length);
    const recentAvg = avgForm(gameHistory.slice(0, recentGames));
    const overallAvg = avgForm(gameHistory);
    return {
        recentGames,
        recentAvg,
        overallAvg,
        deltas: {
            points: recentAvg.points - overallAvg.points,
            rebounds: recentAvg.rebounds - overallAvg.rebounds,
            assists: recentAvg.assists - overallAvg.assists,
        },
        isPartial: recentGames < recentN,
        coversAllGames: gameHistory.length <= recentN,
        comparableFrom: recentN + 1,
    };
}

function avgSplit(games: PlayerGameRecord[]): SplitStats {
    const n = games.length;
    if (n === 0) return { points: 0, rebounds: 0, assists: 0, steals: 0, turnovers: 0 };
    const sum = games.reduce(
        (a, g) => ({
            points: a.points + g.stats.points,
            rebounds: a.rebounds + reb(g),
            assists: a.assists + g.stats.assists,
            steals: a.steals + g.stats.steals,
            turnovers: a.turnovers + g.stats.turnovers,
        }),
        { points: 0, rebounds: 0, assists: 0, steals: 0, turnovers: 0 },
    );
    return {
        points: sum.points / n,
        rebounds: sum.rebounds / n,
        assists: sum.assists / n,
        steals: sum.steals / n,
        turnovers: sum.turnovers / n,
    };
}

export function getWinLossSplit(gameHistory: PlayerGameRecord[]): WinLossSplit {
    const of = (result: PlayerGameRecord['result']) => {
        const games = gameHistory.filter(g => g.result === result);
        return { n: games.length, avg: avgSplit(games) };
    };
    return { win: of('win'), loss: of('loss'), draw: of('draw') };
}
