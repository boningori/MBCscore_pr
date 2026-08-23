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

describe('computeTeamTotals（ファウルで与えたFTのクォーター別集計）', () => {
    /** ファウルで与えたFT付きのファウル記録。シューターは teamA の p1 に固定 */
    function foulWithFT(over: Partial<FoulEntry> & { id: string }, quarter = 1): FoulEntry {
        return {
            teamId: 'teamB', playerId: 'p2', playerNumber: 9,
            foulType: 'P', quarter, timestamp: 0, isCoachOrBench: false,
            shooterTeamId: 'teamA', shooterPlayerId: 'p1', shooterPlayerNumber: 4,
            shotSituation: 'none',
            ...over,
        };
    }

    it('1本成功・1本失敗のFTは、失敗分も試投数に数える（症状の再現ケース）', () => {
        const f = foulWithFT({ id: 'f1', freeThrows: 2, freeThrowResults: ['made', 'missed'] });
        const made = score('FT', 1, { sourceFoulId: 'f1' });
        const totals = computeTeamTotals(input({ scoreHistory: [made], foulHistory: [f] }), 1);
        expect(totals.ftMade).toBe(1);
        expect(totals.ftAttempt).toBe(2);
    });

    it('2本とも失敗のFTは、試合の他所に紐付き証拠があれば試投数へ計上する（症状の再現ケース）', () => {
        // 別のファウル(other-foul)が生んだ成功FT。同じ試合に sourceFoulId 付きの
        // 記録があることを示すためだけの存在で、Q2に置いて集計対象から外す
        const otherMade = score('FT', 2, { sourceFoulId: 'other-foul' });
        const f = foulWithFT({ id: 'f2', freeThrows: 2, freeThrowResults: ['missed', 'missed'] }, 1);
        const totals = computeTeamTotals(input({ scoreHistory: [otherMade], foulHistory: [f] }), 1);
        expect(totals.ftMade).toBe(0);
        expect(totals.ftAttempt).toBe(2);
    });

    it('紐付き証拠が試合のどこにも無い（旧データ）ときは補正しない', () => {
        const f = foulWithFT({ id: 'f3', freeThrows: 2, freeThrowResults: ['missed', 'missed'] });
        const totals = computeTeamTotals(input({ foulHistory: [f] }), 1);
        expect(totals.ftAttempt).toBe(0);
    });

    it('freeThrowResultsのmissedは見ない。CONVERT_SCORE_TO_MISSで外しへ直した分はFTAのStatEntryで拾う', () => {
        // freeThrowResults は変換後も ['made','made'] のまま（handleConvertScoreToMiss は書き換えない）
        const f = foulWithFT({ id: 'f4', freeThrows: 2, freeThrowResults: ['made', 'made'] });
        const made = score('FT', 1, { sourceFoulId: 'f4' });
        const convertedMiss: StatEntry = {
            id: 'st1', teamId: 'teamA', playerId: 'p1', playerNumber: 4,
            statType: 'FTA', quarter: 1, timestamp: 0, sourceFoulId: 'f4',
        };
        const totals = computeTeamTotals(
            input({ scoreHistory: [made], statHistory: [convertedMiss], foulHistory: [f] }),
            1,
        );
        expect(totals.ftMade).toBe(1);
        expect(totals.ftAttempt).toBe(2);
    });

    it('オウンゴールにしたFTは、外した分の補正で二重に減らさない', () => {
        const f = foulWithFT({ id: 'f5', freeThrows: 2, freeThrowResults: ['made', 'missed'] });
        const madeOG = score('FT', 1, { sourceFoulId: 'f5', isOwnGoal: true });
        const totals = computeTeamTotals(input({ scoreHistory: [madeOG], foulHistory: [f] }), 1);
        // OGは成功に数えない（既存仕様）。試投は「本数2 − OGで外へ出た1」で1になる
        expect(totals.ftMade).toBe(0);
        expect(totals.ftAttempt).toBe(1);
    });

    it('相手チームが受けたFTは数えない（shooterTeamIdで絞る）', () => {
        const f = foulWithFT({ id: 'f6', freeThrows: 2, freeThrowResults: ['missed', 'missed'], shooterTeamId: 'teamB' });
        const otherMade = score('FT', 1, { sourceFoulId: 'other-foul', teamId: 'teamB' });
        const totals = computeTeamTotals(input({ scoreHistory: [otherMade], foulHistory: [f] }), 1);
        expect(totals.ftAttempt).toBe(0);
    });
});
