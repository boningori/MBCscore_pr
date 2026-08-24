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

    // 成功数だけでバーを引いていたときは、3/20 のバーが 2/4 より長くなり、
    // すぐ下の 15.0% vs 50.0% の行と勝敗が食い違っていた
    it('シュートの実数行は、長さが試投数・塗りが成功の割合になる', () => {
        const rows = buildComparisonRows(
            totals({ twoMade: 3, twoAttempt: 20 }),
            totals({ twoMade: 2, twoAttempt: 4 }),
            opts,
        );

        const r = rowOf(rows, 'twoPoint');
        // 長さは試投数（20 と 4）で決まる
        expect(r.leftRatio).toBe(1);
        expect(r.rightRatio).toBeCloseTo(4 / 20);
        // 塗りは成功率
        expect(r.leftFill).toBeCloseTo(3 / 20);
        expect(r.rightFill).toBeCloseTo(2 / 4);
    });

    it('シュートの実数行では勝敗を出さない（良し悪しは割合の行が示す）', () => {
        // 左右とも試投は足りているので、割合の行のほうには勝敗が付く
        const rows = buildComparisonRows(
            totals({ twoMade: 3, twoAttempt: 20 }),
            totals({ twoMade: 5, twoAttempt: 10 }),
            opts,
        );

        expect(rowOf(rows, 'twoPoint').leader).toBe('none');
        expect(rowOf(rows, 'twoPercent').leader).toBe('right');
    });

    it('試投が少ないと割合の行でも勝敗を出さない（1/1が9/10に勝たない）', () => {
        const rows = buildComparisonRows(
            totals({ ftMade: 1, ftAttempt: 1 }),
            totals({ ftMade: 9, ftAttempt: 10 }),
            opts,
        );

        const p = rowOf(rows, 'freeThrowPercent');
        // 数字そのものは出す
        expect(p.leftText).toBe('100.0%');
        expect(p.rightText).toBe('90.0%');
        // が、1本しか打っていない側を勝ちにはしない
        expect(p.leader).toBe('none');
    });

    it('左右とも試投が足りていれば割合の行に勝敗が付く', () => {
        const rows = buildComparisonRows(
            totals({ ftMade: 3, ftAttempt: 5 }),
            totals({ ftMade: 4, ftAttempt: 10 }),
            opts,
        );

        expect(rowOf(rows, 'freeThrowPercent').leader).toBe('left');
    });

    it('実数の行は塗りが全体（塗り分けるものが無い）', () => {
        const rows = buildComparisonRows(totals({ points: 50 }), totals({ points: 25 }), opts);

        const pts = rowOf(rows, 'points');
        expect(pts.leftFill).toBe(1);
        expect(pts.rightFill).toBe(1);
    });

    it('TOとファウルだけ lowerIsBetter が立つ', () => {
        const rows = buildComparisonRows(totals(), totals(), opts);

        const marked = rows.filter(r => r.lowerIsBetter).map(r => r.key);
        expect(marked).toEqual(['turnovers', 'fouls']);
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

    // 3Pを使わない試合では FG は 2FG と同じ数字にしかならない。
    // 同じ値の行を2組並べると別の指標に見えて誤読を招く
    it('3P未使用のときFGの行は出さない', () => {
        const rows = buildComparisonRows(totals({ twoMade: 3, twoAttempt: 6 }), totals(), { threePointUnused: true });
        const keys = rows.map(r => r.key);
        expect(keys).not.toContain('fieldGoal');
        expect(keys).not.toContain('fieldGoalPercent');
    });

    it('3P未使用でも2FGの行は残す（実際に打ったのは2点シュートなので）', () => {
        const rows = buildComparisonRows(totals({ twoMade: 3, twoAttempt: 6 }), totals(), { threePointUnused: true });
        expect(rowOf(rows, 'twoPoint').leftText).toBe('3/6');
    });

    it('3Pを使う試合ではFGの行を出す（2P+3Pの合計）', () => {
        const rows = buildComparisonRows(
            totals({ twoMade: 3, twoAttempt: 6, threeMade: 1, threeAttempt: 4 }),
            totals(),
            opts,
        );
        expect(rowOf(rows, 'fieldGoal').leftText).toBe('4/10');
    });

    it('試投0の実数行は「0/0」ではなく「-」にする（StatsPanelのformatShotと同じ表記）', () => {
        const rows = buildComparisonRows(totals(), totals(), opts);
        for (const key of ['fieldGoal', 'twoPoint', 'threePoint', 'freeThrow']) {
            const row = rowOf(rows, key);
            expect(row.leftText).toBe('-');
            expect(row.rightText).toBe('-');
        }
    });
});
