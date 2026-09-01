// 日付が読めない試合レコードを、成長グラフが読める形で扱えること。
//
// 実測(v1.6.14・実ブラウザ): 履歴に date:'not-a-date' の1件を混ぜて選手詳細を開くと、
// 「スタッツの推移」のX軸に次のラベルが出た。
//   月単位     … "not年NaN月"
//   四半期単位 … "not年a"
//   年単位     … "not-a-date年"
// 試合単位だけは formatRecordDate が「読めなければ空文字」を守るので無事だった。
// つまり日付の読めなさに備えているのは表示ヘルパ側だけで、期間キーとラベルを
// 組み立てる getPeriodKey / getPeriodLabel には同じ守りが無かった。
//
// 並び順も NaN 比較になっていた。比較関数が NaN を返すと順序が処理系任せになり、
// 「直近5試合」（gameHistory の先頭5件）が実際の直近と食い違いうる。
//
// 経路は手で編集した／途中で切れたバックアップの取り込み。repairGameRecords が
// date を矯正対象に含めていなかったため、読み側まで素通りしていた。

import { describe, it, expect } from 'vitest';
import { aggregateByPeriod, type PlayerGameRecord } from './playerStatsAnalysis';
import type { PlayerStats } from '../types/game';

function stats(points: number): PlayerStats {
    return {
        points, twoPointMade: 0, twoPointAttempt: 0, threePointMade: 0, threePointAttempt: 0,
        freeThrowMade: 0, freeThrowAttempt: 0, offensiveRebounds: 0, defensiveRebounds: 0,
        assists: 0, steals: 0, blocks: 0, turnovers: 0,
        turnoverDD: 0, turnoverTR: 0, turnoverPM: 0, turnoverCM: 0,
    };
}

function game(gameId: string, date: string, points: number): PlayerGameRecord {
    return {
        gameId, date, opponent: '相手', stats: stats(points),
        result: 'win', teamScore: 40, opponentScore: 20,
        quartersPlayed: 2, fouls: 0, fouledOut: false,
    };
}

describe('aggregateByPeriod: 日付が読めない記録', () => {
    it.each(['month', 'quarter', 'year'] as const)('%s単位のラベルに NaN や生の文字列を出さない', periodType => {
        const periods = aggregateByPeriod([game('g1', 'not-a-date', 8)], periodType);

        expect(periods).toHaveLength(1);
        expect(periods[0].periodLabel).toBe('日付なし');
    });

    it('日付が読める記録とは別の束にする（月をまたいで混ざらない）', () => {
        const periods = aggregateByPeriod(
            [game('g1', '2026-06-06T00:00:00.000Z', 10), game('g2', 'not-a-date', 4)],
            'month',
        );

        expect(periods.map(p => p.periodLabel)).toEqual(['2026年6月', '日付なし']);
        expect(periods.map(p => p.gamesPlayed)).toEqual([1, 1]);
    });

    it('日付が読めない記録どうしは1つの束にまとめる', () => {
        const periods = aggregateByPeriod(
            [game('g1', 'not-a-date', 8), game('g2', '', 4)],
            'month',
        );

        expect(periods).toHaveLength(1);
        expect(periods[0].gamesPlayed).toBe(2);
        expect(periods[0].avgStats.points).toBe(6);
    });

    // 並びは「新しい順」。読めない日付を挟んでも、読める分の前後が崩れないこと
    // （NaN を返す比較関数だと順序が処理系任せになる）
    it('読めない記録は最後（いちばん古い側）へ置き、読める分の並びを崩さない', () => {
        const periods = aggregateByPeriod(
            [
                game('g1', '2026-06-06T00:00:00.000Z', 10),
                game('g2', 'not-a-date', 4),
                game('g3', '2026-08-01T00:00:00.000Z', 12),
            ],
            'month',
        );

        expect(periods.map(p => p.periodLabel)).toEqual(['2026年8月', '2026年6月', '日付なし']);
    });
});
