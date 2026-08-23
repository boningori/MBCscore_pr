import { describe, it, expect } from 'vitest';
import { buildComparisonRows, type ComparisonRow } from './comparisonRows';
import type { TeamTotals } from './teamTotals';

function totals(over: Partial<TeamTotals> = {}): TeamTotals {
    return {
        points: 0, twoMade: 0, twoAttempt: 0, threeMade: 0, threeAttempt: 0,
        ftMade: 0, ftAttempt: 0, offensiveRebounds: 0, defensiveRebounds: 0,
        assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0,
        ...over,
    };
}

function rowOf(rows: ComparisonRow[], key: string): ComparisonRow {
    const row = rows.find(r => r.key === key);
    if (!row) throw new Error(`行が無い: ${key}`);
    return row;
}

const opts = { threePointUnused: false };

describe('buildComparisonRows', () => {
    it('実数の行は大きい方を1とした比率になる', () => {
        const rows = buildComparisonRows(totals({ points: 85 }), totals({ points: 42 }), opts);
        const pts = rowOf(rows, 'points');
        expect(pts.leftRatio).toBe(1);
        expect(pts.rightRatio).toBeCloseTo(42 / 85);
        expect(pts.leader).toBe('left');
    });

    it('左右とも0なら比率は両方0で、優劣も付けない', () => {
        const pts = rowOf(buildComparisonRows(totals(), totals(), opts), 'points');
        expect(pts.leftRatio).toBe(0);
        expect(pts.rightRatio).toBe(0);
        expect(pts.leader).toBe('none');
    });

    it('割合の行は0〜100%の絶対スケールになる', () => {
        const rows = buildComparisonRows(
            totals({ twoMade: 15, twoAttempt: 30 }),
            totals({ twoMade: 5, twoAttempt: 20 }),
            opts,
        );
        const pct = rowOf(rows, 'twoPercent');
        expect(pct.leftText).toBe('50.0%');
        expect(pct.leftRatio).toBeCloseTo(0.5);
        expect(pct.rightRatio).toBeCloseTo(0.25);
    });

    it('試投0の割合は「-」にして比率0にする', () => {
        const pct = rowOf(buildComparisonRows(totals(), totals(), opts), 'twoPercent');
        expect(pct.leftText).toBe('-');
        expect(pct.leftRatio).toBe(0);
    });

    it('FGは2Pと3Pの合計で出す', () => {
        const rows = buildComparisonRows(
            totals({ twoMade: 3, twoAttempt: 6, threeMade: 1, threeAttempt: 4 }),
            totals(),
            opts,
        );
        expect(rowOf(rows, 'fieldGoal').leftText).toBe('4/10');
    });

    it('REBはOR+DRで出す', () => {
        const rows = buildComparisonRows(totals({ offensiveRebounds: 15, defensiveRebounds: 27 }), totals(), opts);
        expect(rowOf(rows, 'rebounds').leftText).toBe('42');
    });

    it('TOは少ない方を強調する', () => {
        const to = rowOf(buildComparisonRows(totals({ turnovers: 9 }), totals({ turnovers: 20 }), opts), 'turnovers');
        expect(to.leader).toBe('left');
        // バーの長さは値そのものなので、多い側が長い
        expect(to.rightRatio).toBe(1);
    });

    it('ファウルも少ない方を強調する', () => {
        const f = rowOf(buildComparisonRows(totals({ fouls: 12 }), totals({ fouls: 4 }), opts), 'fouls');
        expect(f.leader).toBe('right');
    });

    it('3P未使用なら3Pの行は「—」でバーを描かない', () => {
        const rows = buildComparisonRows(totals(), totals(), { threePointUnused: true });
        for (const key of ['threePoint', 'threePercent']) {
            const row = rowOf(rows, key);
            expect(row.leftText).toBe('—');
            expect(row.rightText).toBe('—');
            expect(row.leftRatio).toBe(0);
            expect(row.rightRatio).toBe(0);
            expect(row.leader).toBe('none');
            expect(row.unavailable).toBe(true);
        }
    });

    it('3P未使用でも行そのものは消さない', () => {
        const rows = buildComparisonRows(totals(), totals(), { threePointUnused: true });
        expect(rows.map(r => r.key)).toContain('threePoint');
    });

    it('3P未使用のときFGは2Pだけで出す', () => {
        const rows = buildComparisonRows(totals({ twoMade: 3, twoAttempt: 6 }), totals(), { threePointUnused: true });
        expect(rowOf(rows, 'fieldGoal').leftText).toBe('3/6');
    });
});
