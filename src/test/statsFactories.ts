// 選手スタッツ分析まわりのテスト用ファクトリ。
//
// PlayerGameRecord / AggregatedPlayerStats は分析の追加のたびに項目が増える
// （出場クォーター・ファウル・退場数…）。テストごとにオブジェクトリテラルを
// 手書きしていると、項目を1つ足すだけで無関係なテストが5箇所まとめて
// 型エラーになる。既定値をここに集約して、必要な項目だけ上書きする。

import { createInitialStats } from '../types/game';
import type { PlayerStats } from '../types/game';
import type { AggregatedPlayerStats, PlayerGameRecord } from '../utils/playerStatsAnalysis';

export function makeGameRecord(overrides: Partial<PlayerGameRecord> = {}): PlayerGameRecord {
    return {
        gameId: 'g1',
        date: '2026-06-01T00:00:00.000Z',
        opponent: 'X',
        stats: createInitialStats(),
        result: 'win',
        teamScore: 0,
        opponentScore: 0,
        quartersPlayed: 4,
        fouls: 0,
        fouledOut: false,
        ...overrides,
    };
}

/** stats だけ部分指定したい場合のヘルパー（createInitialStats を土台にする） */
export function makeStats(overrides: Partial<PlayerStats> = {}): PlayerStats {
    return { ...createInitialStats(), ...overrides };
}

export function makeAggregatedPlayer(overrides: Partial<AggregatedPlayerStats> = {}): AggregatedPlayerStats {
    const empty = createInitialStats();
    return {
        playerKey: 'p1',
        number: 4,
        name: '選手A',
        gamesPlayed: 1,
        totalQuartersPlayed: 0,
        totalFouls: 0,
        foulOutGames: 0,
        totalStats: empty,
        avgStats: empty,
        stdDevStats: empty,
        reboundsStdDev: 0,
        gameHistory: [],
        ...overrides,
    };
}
