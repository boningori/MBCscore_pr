import { describe, it, expect } from 'vitest';
import { getRecentForm, getWinLossSplit } from './playerFormStats';
import type { PlayerGameRecord } from './playerStatsAnalysis';
import type { PlayerStats } from '../types/game';
import { createInitialStats } from '../types/game';

// gameHistoryは日付降順（新しい順）で渡す
function rec(date: string, result: 'win' | 'loss' | 'draw', s: Partial<PlayerStats>): PlayerGameRecord {
    return {
        gameId: date,
        date,
        opponent: 'X',
        stats: { ...createInitialStats(), ...s },
        result,
        teamScore: 0,
        opponentScore: 0,
    };
}

describe('getRecentForm', () => {
    it('6試合ではrecentN=5で直近5試合の平均、isPartial=false', () => {
        // 新しい順: 直近5試合の得点 = 10,10,10,10,10 → 平均10。最古の1試合(0点)は直近から除外
        const gh = [
            rec('2026-06-06', 'win', { points: 10 }),
            rec('2026-06-05', 'win', { points: 10 }),
            rec('2026-06-04', 'win', { points: 10 }),
            rec('2026-06-03', 'win', { points: 10 }),
            rec('2026-06-02', 'win', { points: 10 }),
            rec('2026-06-01', 'win', { points: 0 }),
        ];
        const form = getRecentForm(gh);
        expect(form.recentGames).toBe(5);
        expect(form.isPartial).toBe(false);
        expect(form.recentAvg.points).toBe(10);
        // 通算平均 = 50/6 ≈ 8.33、deltaは正
        expect(form.deltas.points).toBeGreaterThan(0);
    });

    it('3試合ではisPartial=true、直近平均=通算平均、delta=0', () => {
        const gh = [
            rec('2026-06-03', 'win', { points: 8 }),
            rec('2026-06-02', 'win', { points: 4 }),
            rec('2026-06-01', 'win', { points: 6 }),
        ];
        const form = getRecentForm(gh);
        expect(form.recentGames).toBe(3);
        expect(form.isPartial).toBe(true);
        expect(form.recentAvg.points).toBe(6);
        expect(form.overallAvg.points).toBe(6);
        expect(form.deltas.points).toBe(0);
    });

    it('REBはOR+DRで計算される', () => {
        const gh = [rec('2026-06-01', 'win', { offensiveRebounds: 2, defensiveRebounds: 3 })];
        expect(getRecentForm(gh).recentAvg.rebounds).toBe(5);
    });

    it('空配列ではrecentGames=0・全0・isPartial=true', () => {
        const form = getRecentForm([]);
        expect(form.recentGames).toBe(0);
        expect(form.recentAvg.points).toBe(0);
        expect(form.isPartial).toBe(true);
    });

    it('直近が低いとdeltaは負', () => {
        const gh = [
            rec('2026-06-06', 'loss', { points: 2 }),
            rec('2026-06-05', 'loss', { points: 2 }),
            rec('2026-06-04', 'loss', { points: 2 }),
            rec('2026-06-03', 'loss', { points: 2 }),
            rec('2026-06-02', 'loss', { points: 2 }),
            rec('2026-06-01', 'win', { points: 20 }),
        ];
        expect(getRecentForm(gh).deltas.points).toBeLessThan(0);
    });
});

describe('getWinLossSplit', () => {
    it('勝ち2・負け2・引分1: drawは平均に含まれない', () => {
        const gh = [
            rec('2026-06-05', 'win', { points: 10 }),
            rec('2026-06-04', 'win', { points: 20 }),
            rec('2026-06-03', 'loss', { points: 4 }),
            rec('2026-06-02', 'loss', { points: 6 }),
            rec('2026-06-01', 'draw', { points: 100 }),
        ];
        const split = getWinLossSplit(gh);
        expect(split.win.n).toBe(2);
        expect(split.loss.n).toBe(2);
        expect(split.win.avg.points).toBe(15);
        expect(split.loss.avg.points).toBe(5);
    });

    it('勝ちのみ: loss.n=0', () => {
        const gh = [rec('2026-06-01', 'win', { points: 10 })];
        const split = getWinLossSplit(gh);
        expect(split.win.n).toBe(1);
        expect(split.loss.n).toBe(0);
        expect(split.loss.avg.points).toBe(0);
    });

    it('負けのみ: win.n=0', () => {
        const gh = [rec('2026-06-01', 'loss', { points: 10 })];
        const split = getWinLossSplit(gh);
        expect(split.win.n).toBe(0);
        expect(split.loss.n).toBe(1);
    });

    it('空配列: 両方n=0', () => {
        const split = getWinLossSplit([]);
        expect(split.win.n).toBe(0);
        expect(split.loss.n).toBe(0);
    });

    it('STL/TO/REBも勝敗別に集計される', () => {
        const gh = [
            rec('2026-06-02', 'win', { steals: 3, turnovers: 1, offensiveRebounds: 1, defensiveRebounds: 1 }),
            rec('2026-06-01', 'loss', { steals: 1, turnovers: 5 }),
        ];
        const split = getWinLossSplit(gh);
        expect(split.win.avg.steals).toBe(3);
        expect(split.win.avg.rebounds).toBe(2);
        expect(split.loss.avg.turnovers).toBe(5);
    });
});
