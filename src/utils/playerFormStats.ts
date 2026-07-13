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
    const wins = gameHistory.filter(g => g.result === 'win');
    const losses = gameHistory.filter(g => g.result === 'loss');
    return {
        win: { n: wins.length, avg: avgSplit(wins) },
        loss: { n: losses.length, avg: avgSplit(losses) },
    };
}
