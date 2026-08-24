import { describe, it, expect } from 'vitest';
import { sumUnknownStats } from './unknownStats';
import type { StatEntry, StatType } from '../types/game';

function entry(statType: StatType, teamId = 'teamA', playerId = 'unknown'): StatEntry {
    return { id: `${statType}-${Math.random()}`, teamId, playerId, playerNumber: -1, statType, quarter: 1, timestamp: 0 };
}

describe('sumUnknownStats', () => {
    it('対象が無ければ null を返す', () => {
        expect(sumUnknownStats([], 'teamA')).toBeNull();
    });

    it('選手が決まっている記録は数えない', () => {
        expect(sumUnknownStats([entry('AST', 'teamA', 'p1')], 'teamA')).toBeNull();
    });

    it('相手チームの記録は数えない', () => {
        expect(sumUnknownStats([entry('AST', 'teamB')], 'teamA')).toBeNull();
    });

    it('種別ごとに数える', () => {
        const stats = sumUnknownStats([entry('OREB'), entry('DREB'), entry('AST'), entry('2PA')], 'teamA');
        expect(stats?.offensiveRebounds).toBe(1);
        expect(stats?.defensiveRebounds).toBe(1);
        expect(stats?.assists).toBe(1);
        expect(stats?.twoPointAttempt).toBe(1);
    });

    it('TOの内訳は合計にも足す', () => {
        const stats = sumUnknownStats([entry('TO:DD'), entry('TO:PM')], 'teamA');
        expect(stats?.turnovers).toBe(2);
        expect(stats?.turnoverDD).toBe(1);
        expect(stats?.turnoverPM).toBe(1);
    });
});
