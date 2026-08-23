import { describe, it, expect } from 'vitest';
import { computeTeamTotals, type TeamTotalsInput } from './teamTotals';
import { createTeam } from '../../types/game';
import type { FoulEntry, ScoreEntry, StatEntry, StatType } from '../../types/game';

function score(scoreType: ScoreEntry['scoreType'], quarter: number, extra: Partial<ScoreEntry> = {}): ScoreEntry {
    const points = scoreType === '3P' ? 3 : scoreType === '2P' ? 2 : 1;
    return {
        id: `s-${Math.random()}`, teamId: 'teamA', playerId: 'p1', playerNumber: 4,
        scoreType, points, quarter, timestamp: 0, runningScoreA: 0, runningScoreB: 0,
        ...extra,
    };
}

function stat(statType: StatType, quarter: number, teamId = 'teamA'): StatEntry {
    return { id: `t-${Math.random()}`, teamId, playerId: 'p1', playerNumber: 4, statType, quarter, timestamp: 0 };
}

function foul(quarter: number, isCoachOrBench = false): FoulEntry {
    return {
        id: `f-${Math.random()}`, teamId: 'teamA', playerId: isCoachOrBench ? null : 'p1',
        playerNumber: isCoachOrBench ? -1 : 4, foulType: 'P', quarter, timestamp: 0, isCoachOrBench,
    };
}

function input(over: Partial<TeamTotalsInput> = {}): TeamTotalsInput {
    return {
        team: createTeam('teamA', '白チーム', ''),
        teamId: 'teamA',
        scoreHistory: [], statHistory: [], foulHistory: [],
        ...over,
    };
}

describe('computeTeamTotals（クォーター別）', () => {
    it('指定したクォーターの得点だけ数える', () => {
        const totals = computeTeamTotals(input({ scoreHistory: [score('2P', 1), score('2P', 2), score('3P', 2)] }), 2);
        expect(totals.points).toBe(5);
    });

    it('相手チームの記録は数えない', () => {
        const other = score('2P', 1, { teamId: 'teamB' });
        expect(computeTeamTotals(input({ scoreHistory: [score('2P', 1), other] }), 1).points).toBe(2);
    });

    it('試投数は成功と外しの合計になる', () => {
        const totals = computeTeamTotals(
            input({ scoreHistory: [score('2P', 1), score('2P', 1)], statHistory: [stat('2PA', 1), stat('2PA', 1), stat('2PA', 1)] }),
            1,
        );
        expect(totals.twoMade).toBe(2);
        expect(totals.twoAttempt).toBe(5);
    });

    it('3PとFTも同じように数える', () => {
        const totals = computeTeamTotals(
            input({ scoreHistory: [score('3P', 1), score('FT', 1)], statHistory: [stat('3PA', 1), stat('FTA', 1)] }),
            1,
        );
        expect(totals.threeMade).toBe(1);
        expect(totals.threeAttempt).toBe(2);
        expect(totals.ftMade).toBe(1);
        expect(totals.ftAttempt).toBe(2);
    });

    it('オウンゴールは得点に数えるがシュート成績には数えない', () => {
        const totals = computeTeamTotals(input({ scoreHistory: [score('2P', 1, { isOwnGoal: true })] }), 1);
        expect(totals.points).toBe(2);
        expect(totals.twoMade).toBe(0);
        expect(totals.twoAttempt).toBe(0);
    });

    it('リバウンド・AST・ST・BS・TOを数える', () => {
        const totals = computeTeamTotals(
            input({ statHistory: [stat('OREB', 1), stat('DREB', 1), stat('AST', 1), stat('STL', 1), stat('BLK', 1), stat('TO:DD', 1)] }),
            1,
        );
        expect(totals.offensiveRebounds).toBe(1);
        expect(totals.defensiveRebounds).toBe(1);
        expect(totals.assists).toBe(1);
        expect(totals.steals).toBe(1);
        expect(totals.blocks).toBe(1);
        expect(totals.turnovers).toBe(1);
    });

    it('選手不明の記録もクォーター別に数える', () => {
        const unknown: StatEntry = { id: 'u1', teamId: 'teamA', playerId: 'unknown', playerNumber: -1, statType: 'AST', quarter: 3, timestamp: 0 };
        expect(computeTeamTotals(input({ statHistory: [unknown] }), 3).assists).toBe(1);
    });

    it('コーチ・ベンチのファウルは数えない', () => {
        const totals = computeTeamTotals(input({ foulHistory: [foul(1), foul(1), foul(1, true)] }), 1);
        expect(totals.fouls).toBe(2);
    });

    it('延長のクォーターも数えられる', () => {
        expect(computeTeamTotals(input({ scoreHistory: [score('2P', 5)] }), 5).points).toBe(2);
    });
});
