import { describe, it, expect } from 'vitest';
import { buildEvolutionData } from './scoreEvolution';
import type { ScoreEntry } from '../../types/game';

function entry(quarter: number, runningScoreA: number, runningScoreB: number): ScoreEntry {
    return {
        id: `s-${runningScoreA}-${runningScoreB}-${Math.random()}`,
        teamId: 'teamA', playerId: 'p1', playerNumber: 4,
        scoreType: '2P', points: 2, quarter, timestamp: 0, runningScoreA, runningScoreB,
    };
}

describe('buildEvolutionData', () => {
    it('記録が無ければ原点だけを返す', () => {
        const data = buildEvolutionData([], 'all');
        expect(data.points).toEqual([{ index: 0, teamA: 0, teamB: 0 }]);
        expect(data.maxScore).toBe(1);
    });

    it('累計得点をそのまま点にする', () => {
        const data = buildEvolutionData([entry(1, 2, 0), entry(1, 2, 3), entry(1, 5, 3)], 'all');
        expect(data.points).toEqual([
            { index: 0, teamA: 0, teamB: 0 },
            { index: 1, teamA: 2, teamB: 0 },
            { index: 2, teamA: 2, teamB: 3 },
            { index: 3, teamA: 5, teamB: 3 },
        ]);
        expect(data.maxScore).toBe(5);
    });

    it('クォーターの変わり目を記録する', () => {
        const data = buildEvolutionData([entry(1, 2, 0), entry(2, 4, 0), entry(3, 6, 0)], 'all');
        expect(data.boundaries).toEqual([
            { index: 1, quarter: 1 },
            { index: 2, quarter: 2 },
            { index: 3, quarter: 3 },
        ]);
    });

    it('クォーターを絞ると、その区間だけを累計のまま切り出す', () => {
        const data = buildEvolutionData([entry(1, 2, 0), entry(1, 4, 0), entry(2, 6, 3), entry(2, 8, 3)], 2);
        // 起点は 2Q が始まる直前の累計（1Q終了時点）
        expect(data.points[0]).toEqual({ index: 0, teamA: 4, teamB: 0 });
        expect(data.points[data.points.length - 1]).toEqual({ index: 2, teamA: 8, teamB: 3 });
    });

    it('絞ったクォーターに記録が無ければ、その直前の累計だけを返す', () => {
        const data = buildEvolutionData([entry(1, 2, 0)], 3);
        expect(data.points).toEqual([{ index: 0, teamA: 2, teamB: 0 }]);
    });
});
