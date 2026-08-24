import { describe, it, expect } from 'vitest';
import { isThreePointUnused } from './threePointUsage';
import type { ScoreEntry, StatEntry } from '../../types/game';

const threeMade: ScoreEntry = {
    id: 's1', teamId: 'teamA', playerId: 'p1', playerNumber: 4,
    scoreType: '3P', points: 3, quarter: 1, timestamp: 0, runningScoreA: 3, runningScoreB: 0,
};

const threeMissed: StatEntry = {
    id: 't1', teamId: 'teamA', playerId: 'p1', playerNumber: 4, statType: '3PA', quarter: 1, timestamp: 0,
};

describe('isThreePointUnused', () => {
    it('設定OFFで記録も無ければ未使用', () => {
        expect(isThreePointUnused(false, [], [])).toBe(true);
    });

    it('設定OFFでも成功の記録があれば未使用にしない', () => {
        expect(isThreePointUnused(false, [threeMade], [])).toBe(false);
    });

    it('設定OFFでも外した記録があれば未使用にしない', () => {
        expect(isThreePointUnused(false, [], [threeMissed])).toBe(false);
    });

    it('設定ONなら未使用にしない', () => {
        expect(isThreePointUnused(true, [], [])).toBe(false);
    });

    it('設定が保存されていない古い記録は使用扱い', () => {
        expect(isThreePointUnused(undefined, [], [])).toBe(false);
    });
});
