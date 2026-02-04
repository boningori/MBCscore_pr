// 選手スタッツ分析ユーティリティ - 個人成長追跡版

import type { PlayerStats } from '../types/game';
import type { GameRecord } from './gameHistoryStorage';
import { loadGameHistory } from './gameHistoryStorage';
import { loadMyTeams, type SavedTeam } from './teamStorage';

// 期間タイプ
export type PeriodType = 'game' | 'month' | 'quarter' | 'year';

// 集計後の選手スタッツ型
export interface AggregatedPlayerStats {
    playerKey: string;        // 識別用キー (名前_ライセンスNo)
    number: number;           // 最新の背番号
    name: string;
    licenseNo?: string;
    gamesPlayed: number;      // 出場試合数
    totalStats: PlayerStats;  // 累積スタッツ
    avgStats: PlayerStats;    // 平均スタッツ
    stdDevStats: PlayerStats; // 標準偏差
    gameHistory: PlayerGameRecord[];  // 試合別履歴
}

// 試合別の選手記録
export interface PlayerGameRecord {
    gameId: string;
    date: string;
    opponent: string;
    stats: PlayerStats;
    result: 'win' | 'loss' | 'draw';
    teamScore: number;
    opponentScore: number;
}

// 期間別の集計結果
export interface PeriodStats {
    periodKey: string;        // "2026-01" (月), "2026-Q1" (四半期), "2026" (年)
    periodLabel: string;      // 表示用ラベル
    startDate: Date;
    endDate: Date;
    gamesPlayed: number;
    totalStats: PlayerStats;
    avgStats: PlayerStats;
    stdDevStats: PlayerStats;
}

// 選手キー生成（名前_ライセンスNo）
export function generatePlayerKey(name: string, licenseNo?: string): string {
    if (licenseNo && licenseNo.trim()) {
        return `${name}_${licenseNo.trim()}`;
    }
    return name;
}

// 空のPlayerStatsを作成
function createEmptyStats(): PlayerStats {
    return {
        points: 0,
        twoPointMade: 0,
        twoPointAttempt: 0,
        threePointMade: 0,
        threePointAttempt: 0,
        freeThrowMade: 0,
        freeThrowAttempt: 0,
        offensiveRebounds: 0,
        defensiveRebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        turnoverDD: 0,
        turnoverTR: 0,
        turnoverPM: 0,
        turnoverCM: 0,
    };
}

// 2つのPlayerStatsを加算
function addStats(a: PlayerStats, b: PlayerStats): PlayerStats {
    return {
        points: a.points + b.points,
        twoPointMade: a.twoPointMade + b.twoPointMade,
        twoPointAttempt: a.twoPointAttempt + b.twoPointAttempt,
        threePointMade: a.threePointMade + b.threePointMade,
        threePointAttempt: a.threePointAttempt + b.threePointAttempt,
        freeThrowMade: a.freeThrowMade + b.freeThrowMade,
        freeThrowAttempt: a.freeThrowAttempt + b.freeThrowAttempt,
        offensiveRebounds: a.offensiveRebounds + b.offensiveRebounds,
        defensiveRebounds: a.defensiveRebounds + b.defensiveRebounds,
        assists: a.assists + b.assists,
        steals: a.steals + b.steals,
        blocks: a.blocks + b.blocks,
        turnovers: a.turnovers + b.turnovers,
        turnoverDD: (a.turnoverDD || 0) + (b.turnoverDD || 0),
        turnoverTR: (a.turnoverTR || 0) + (b.turnoverTR || 0),
        turnoverPM: (a.turnoverPM || 0) + (b.turnoverPM || 0),
        turnoverCM: (a.turnoverCM || 0) + (b.turnoverCM || 0),
    };
}

// PlayerStatsを除算
function divideStats(stats: PlayerStats, divisor: number): PlayerStats {
    if (divisor === 0) return createEmptyStats();
    return {
        points: stats.points / divisor,
        twoPointMade: stats.twoPointMade / divisor,
        twoPointAttempt: stats.twoPointAttempt / divisor,
        threePointMade: stats.threePointMade / divisor,
        threePointAttempt: stats.threePointAttempt / divisor,
        freeThrowMade: stats.freeThrowMade / divisor,
        freeThrowAttempt: stats.freeThrowAttempt / divisor,
        offensiveRebounds: stats.offensiveRebounds / divisor,
        defensiveRebounds: stats.defensiveRebounds / divisor,
        assists: stats.assists / divisor,
        steals: stats.steals / divisor,
        blocks: stats.blocks / divisor,
        turnovers: stats.turnovers / divisor,
        turnoverDD: (stats.turnoverDD || 0) / divisor,
        turnoverTR: (stats.turnoverTR || 0) / divisor,
        turnoverPM: (stats.turnoverPM || 0) / divisor,
        turnoverCM: (stats.turnoverCM || 0) / divisor,
    };
}

// 標準偏差を計算
function calculateStdDev(values: number[], mean: number): number {
    if (values.length < 2) return 0;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
}

// 試合履歴から選手スタッツの標準偏差を計算
function calculateStatsStdDev(gameHistory: PlayerGameRecord[], avgStats: PlayerStats): PlayerStats {
    if (gameHistory.length < 2) return createEmptyStats();

    return {
        points: calculateStdDev(gameHistory.map(g => g.stats.points), avgStats.points),
        twoPointMade: calculateStdDev(gameHistory.map(g => g.stats.twoPointMade), avgStats.twoPointMade),
        twoPointAttempt: calculateStdDev(gameHistory.map(g => g.stats.twoPointAttempt), avgStats.twoPointAttempt),
        threePointMade: calculateStdDev(gameHistory.map(g => g.stats.threePointMade), avgStats.threePointMade),
        threePointAttempt: calculateStdDev(gameHistory.map(g => g.stats.threePointAttempt), avgStats.threePointAttempt),
        freeThrowMade: calculateStdDev(gameHistory.map(g => g.stats.freeThrowMade), avgStats.freeThrowMade),
        freeThrowAttempt: calculateStdDev(gameHistory.map(g => g.stats.freeThrowAttempt), avgStats.freeThrowAttempt),
        offensiveRebounds: calculateStdDev(gameHistory.map(g => g.stats.offensiveRebounds), avgStats.offensiveRebounds),
        defensiveRebounds: calculateStdDev(gameHistory.map(g => g.stats.defensiveRebounds), avgStats.defensiveRebounds),
        assists: calculateStdDev(gameHistory.map(g => g.stats.assists), avgStats.assists),
        steals: calculateStdDev(gameHistory.map(g => g.stats.steals), avgStats.steals),
        blocks: calculateStdDev(gameHistory.map(g => g.stats.blocks), avgStats.blocks),
        turnovers: calculateStdDev(gameHistory.map(g => g.stats.turnovers), avgStats.turnovers),
        turnoverDD: calculateStdDev(gameHistory.map(g => g.stats.turnoverDD || 0), avgStats.turnoverDD || 0),
        turnoverTR: calculateStdDev(gameHistory.map(g => g.stats.turnoverTR || 0), avgStats.turnoverTR || 0),
        turnoverPM: calculateStdDev(gameHistory.map(g => g.stats.turnoverPM || 0), avgStats.turnoverPM || 0),
        turnoverCM: calculateStdDev(gameHistory.map(g => g.stats.turnoverCM || 0), avgStats.turnoverCM || 0),
    };
}

// 試合履歴からマイチームの試合を抽出
export function getMyTeamGames(myTeam: SavedTeam): { record: GameRecord; isTeamA: boolean }[] {
    const history = loadGameHistory();
    const result: { record: GameRecord; isTeamA: boolean }[] = [];

    for (const record of history) {
        if (record.teamA.name === myTeam.name || record.teamA.isMyTeam) {
            result.push({ record, isTeamA: true });
        } else if (record.teamB.name === myTeam.name || record.teamB.isMyTeam) {
            result.push({ record, isTeamA: false });
        }
    }

    return result;
}

// 選手別スタッツを集計
export function aggregatePlayerStats(
    myTeam: SavedTeam,
    startDate?: Date,
    endDate?: Date
): AggregatedPlayerStats[] {
    const games = getMyTeamGames(myTeam);
    const playerMap = new Map<string, AggregatedPlayerStats>();

    for (const { record, isTeamA } of games) {
        const gameDate = new Date(record.date);
        if (startDate && gameDate < startDate) continue;
        if (endDate && gameDate > endDate) continue;

        const myTeamData = isTeamA ? record.teamA : record.teamB;
        const opponentData = isTeamA ? record.teamB : record.teamA;
        const myScore = record.finalScore[isTeamA ? 'teamA' : 'teamB'];
        const opponentScore = record.finalScore[isTeamA ? 'teamB' : 'teamA'];

        const result: 'win' | 'loss' | 'draw' =
            myScore > opponentScore ? 'win' :
                myScore < opponentScore ? 'loss' : 'draw';

        for (const player of myTeamData.players) {
            // 氏名 + ライセンスNo. で識別
            const key = generatePlayerKey(player.name, player.licenseNo);

            const hasStats = player.stats.points > 0 ||
                player.stats.twoPointAttempt > 0 ||
                player.stats.threePointAttempt > 0 ||
                player.stats.freeThrowAttempt > 0 ||
                player.stats.offensiveRebounds > 0 ||
                player.stats.defensiveRebounds > 0 ||
                player.stats.assists > 0 ||
                player.stats.steals > 0 ||
                player.stats.blocks > 0 ||
                player.stats.turnovers > 0;
            const hasPlayedQuarters = player.quartersPlayed?.some(q => q !== false);

            if (!hasStats && !hasPlayedQuarters) continue;

            const gameRecord: PlayerGameRecord = {
                gameId: record.id,
                date: record.date,
                opponent: opponentData.name,
                stats: { ...player.stats },
                result,
                teamScore: myScore,
                opponentScore: opponentScore,
            };

            if (!playerMap.has(key)) {
                playerMap.set(key, {
                    playerKey: key,
                    number: player.number,
                    name: player.name,
                    licenseNo: player.licenseNo,
                    gamesPlayed: 0,
                    totalStats: createEmptyStats(),
                    avgStats: createEmptyStats(),
                    stdDevStats: createEmptyStats(),
                    gameHistory: [],
                });
            }

            const aggregated = playerMap.get(key)!;
            aggregated.gamesPlayed += 1;
            aggregated.totalStats = addStats(aggregated.totalStats, player.stats);
            aggregated.gameHistory.push(gameRecord);
            // 最新の背番号を更新
            if (new Date(record.date) > new Date(aggregated.gameHistory[0]?.date || '1900-01-01')) {
                aggregated.number = player.number;
            }
        }
    }

    // 平均と標準偏差を計算
    for (const aggregated of playerMap.values()) {
        aggregated.avgStats = divideStats(aggregated.totalStats, aggregated.gamesPlayed);
        aggregated.stdDevStats = calculateStatsStdDev(aggregated.gameHistory, aggregated.avgStats);
        aggregated.gameHistory.sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );
    }

    return Array.from(playerMap.values()).sort((a, b) => a.number - b.number);
}

// 期間キーを生成
function getPeriodKey(date: Date, periodType: PeriodType): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    switch (periodType) {
        case 'month':
            return `${year}-${month.toString().padStart(2, '0')}`;
        case 'quarter':
            const quarter = Math.ceil(month / 3);
            return `${year}-Q${quarter}`;
        case 'year':
            return `${year}`;
        default:
            return date.toISOString().split('T')[0];
    }
}

// 期間ラベルを生成
function getPeriodLabel(periodKey: string, periodType: PeriodType): string {
    switch (periodType) {
        case 'month':
            const [year, month] = periodKey.split('-');
            return `${year}年${parseInt(month)}月`;
        case 'quarter':
            const [y, q] = periodKey.split('-');
            return `${y}年${q}`;
        case 'year':
            return `${periodKey}年`;
        default:
            return periodKey;
    }
}

// 選手の期間別スタッツを集計
export function aggregateByPeriod(
    gameHistory: PlayerGameRecord[],
    periodType: PeriodType
): PeriodStats[] {
    if (periodType === 'game') {
        // 試合単位はそのまま返す
        return gameHistory.map(game => ({
            periodKey: game.gameId,
            periodLabel: formatDate(game.date),
            startDate: new Date(game.date),
            endDate: new Date(game.date),
            gamesPlayed: 1,
            totalStats: { ...game.stats },
            avgStats: { ...game.stats },
            stdDevStats: createEmptyStats(),
        }));
    }

    const periodMap = new Map<string, { games: PlayerGameRecord[]; startDate: Date; endDate: Date }>();

    for (const game of gameHistory) {
        const date = new Date(game.date);
        const key = getPeriodKey(date, periodType);

        if (!periodMap.has(key)) {
            periodMap.set(key, { games: [], startDate: date, endDate: date });
        }
        const period = periodMap.get(key)!;
        period.games.push(game);
        if (date < period.startDate) period.startDate = date;
        if (date > period.endDate) period.endDate = date;
    }

    const result: PeriodStats[] = [];

    for (const [key, { games, startDate, endDate }] of periodMap) {
        const totalStats = games.reduce((acc, g) => addStats(acc, g.stats), createEmptyStats());
        const avgStats = divideStats(totalStats, games.length);
        const stdDevStats = calculateStatsStdDev(games, avgStats);

        result.push({
            periodKey: key,
            periodLabel: getPeriodLabel(key, periodType),
            startDate,
            endDate,
            gamesPlayed: games.length,
            totalStats,
            avgStats,
            stdDevStats,
        });
    }

    // 期間順にソート（新しい順）
    return result.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
}

// 日付フォーマット
function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
}

// 登録済みマイチーム一覧を取得
export function getAvailableMyTeams(): SavedTeam[] {
    return loadMyTeams();
}

// チームの戦績サマリー
export interface TeamRecord {
    wins: number;
    losses: number;
    draws: number;
    totalGames: number;
}

export function getTeamRecord(myTeam: SavedTeam, startDate?: Date, endDate?: Date): TeamRecord {
    const games = getMyTeamGames(myTeam);
    let wins = 0, losses = 0, draws = 0;

    for (const { record, isTeamA } of games) {
        const gameDate = new Date(record.date);
        if (startDate && gameDate < startDate) continue;
        if (endDate && gameDate > endDate) continue;

        const myScore = record.finalScore[isTeamA ? 'teamA' : 'teamB'];
        const opponentScore = record.finalScore[isTeamA ? 'teamB' : 'teamA'];

        if (myScore > opponentScore) wins++;
        else if (myScore < opponentScore) losses++;
        else draws++;
    }

    return { wins, losses, draws, totalGames: wins + losses + draws };
}
