import { describe, it, expect } from 'vitest';
import { computeQuarterScores, recordedQuarters } from './quarterScores';
import type { ScoreEntry } from '../../types/game';

function score(teamId: string, quarter: number, points: number): ScoreEntry {
    return {
        id: `s-${Math.random()}`, teamId, playerId: 'p1', playerNumber: 4,
        scoreType: points === 3 ? '3P' : points === 2 ? '2P' : 'FT',
        points, quarter, timestamp: 0, runningScoreA: 0, runningScoreB: 0,
    };
}

describe('computeQuarterScores', () => {
    it('記録が無くてもQ1〜Q4を返す', () => {
        expect(computeQuarterScores([])).toEqual([
            { quarter: 1, teamA: 0, teamB: 0 },
            { quarter: 2, teamA: 0, teamB: 0 },
            { quarter: 3, teamA: 0, teamB: 0 },
            { quarter: 4, teamA: 0, teamB: 0 },
        ]);
    });

    it('クォーターごとにチーム別で足す', () => {
        const rows = computeQuarterScores([score('teamA', 1, 2), score('teamA', 1, 3), score('teamB', 1, 2), score('teamA', 3, 1)]);
        expect(rows[0]).toEqual({ quarter: 1, teamA: 5, teamB: 2 });
        expect(rows[2]).toEqual({ quarter: 3, teamA: 1, teamB: 0 });
    });

    it('オウンゴールも得点として数える', () => {
        const og: ScoreEntry = { ...score('teamA', 1, 2), isOwnGoal: true };
        expect(computeQuarterScores([og])[0].teamA).toBe(2);
    });

    it('延長は記録があるときだけ足す', () => {
        expect(computeQuarterScores([]).length).toBe(4);
        const rows = computeQuarterScores([score('teamA', 5, 2)]);
        expect(rows.length).toBe(5);
        expect(rows[4]).toEqual({ quarter: 5, teamA: 2, teamB: 0 });
    });

    it('延長が飛んでいても昇順で返す', () => {
        const rows = computeQuarterScores([score('teamA', 6, 2), score('teamA', 5, 2)]);
        expect(rows.map(r => r.quarter)).toEqual([1, 2, 3, 4, 5, 6]);
    });
});

describe('recordedQuarters', () => {
    it('記録が無ければQ1〜Q4', () => {
        expect(recordedQuarters([])).toEqual([1, 2, 3, 4]);
    });

    it('延長があれば足す', () => {
        expect(recordedQuarters([score('teamA', 5, 2)])).toEqual([1, 2, 3, 4, 5]);
    });
});
