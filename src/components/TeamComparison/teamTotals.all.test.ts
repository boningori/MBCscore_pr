import { describe, it, expect } from 'vitest';
import { computeTeamTotals, type TeamTotalsInput } from './teamTotals';
import { createPlayer, createTeam } from '../../types/game';
import type { FoulRecord, StatEntry, StatType, Team } from '../../types/game';

function teamWith(players: ReturnType<typeof createPlayer>[]): Team {
    const team = createTeam('teamA', '白チーム', '');
    team.players = players;
    return team;
}

function input(team: Team, statHistory: StatEntry[] = []): TeamTotalsInput {
    return { team, teamId: 'teamA', scoreHistory: [], statHistory, foulHistory: [] };
}

function unknownEntry(statType: StatType): StatEntry {
    return { id: `u-${statType}`, teamId: 'teamA', playerId: 'unknown', playerNumber: -1, statType, quarter: 1, timestamp: 0 };
}

const P = (): FoulRecord => ({ type: 'P', freeThrows: 0 });

describe('computeTeamTotals（全体）', () => {
    it('選手が居なければ全項目0', () => {
        const totals = computeTeamTotals(input(teamWith([])), 'all');
        expect(totals.points).toBe(0);
        expect(totals.twoAttempt).toBe(0);
        expect(totals.fouls).toBe(0);
    });

    it('選手スタッツを合計する', () => {
        const a = createPlayer('p1', 4, '一郎');
        a.stats.points = 10;
        a.stats.twoPointMade = 3;
        a.stats.twoPointAttempt = 7;
        a.stats.offensiveRebounds = 2;
        const b = createPlayer('p2', 5, '二郎');
        b.stats.points = 5;
        b.stats.twoPointMade = 1;
        b.stats.twoPointAttempt = 4;
        b.stats.defensiveRebounds = 6;

        const totals = computeTeamTotals(input(teamWith([a, b])), 'all');
        expect(totals.points).toBe(15);
        expect(totals.twoMade).toBe(4);
        expect(totals.twoAttempt).toBe(11);
        expect(totals.offensiveRebounds).toBe(2);
        expect(totals.defensiveRebounds).toBe(6);
    });

    it('選手不明で記録した分も足す', () => {
        const a = createPlayer('p1', 4, '一郎');
        a.stats.assists = 2;

        const totals = computeTeamTotals(input(teamWith([a]), [unknownEntry('AST'), unknownEntry('AST')]), 'all');
        expect(totals.assists).toBe(4);
    });

    it('ファウルは選手のファウル履歴の長さを合計する', () => {
        const a = createPlayer('p1', 4, '一郎');
        a.fouls = [P(), P(), P()];
        const b = createPlayer('p2', 5, '二郎');
        b.fouls = [P()];

        expect(computeTeamTotals(input(teamWith([a, b])), 'all').fouls).toBe(4);
    });
});
