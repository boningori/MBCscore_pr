import { describe, it, expect } from 'vitest';
import { createTeam } from '../types/game';
import { resolveMyTeamSide, orderByMyTeam } from './myTeamSide';

/** isMyTeam だけを差し替えた2チームを作る */
function pair(aIsMine: boolean | undefined, bIsMine: boolean | undefined) {
    const teamA = createTeam('teamA', 'ホーム', 'コーチA');
    const teamB = createTeam('teamB', 'ビジター', 'コーチB');
    teamA.isMyTeam = aIsMine;
    teamB.isMyTeam = bIsMine;
    return { teamA, teamB };
}

describe('resolveMyTeamSide', () => {
    it('teamA だけが自分なら teamA', () => {
        const { teamA, teamB } = pair(true, false);
        expect(resolveMyTeamSide(teamA, teamB)).toBe('teamA');
    });

    it('teamB だけが自分なら teamB', () => {
        const { teamA, teamB } = pair(false, true);
        expect(resolveMyTeamSide(teamA, teamB)).toBe('teamB');
    });

    it('両方が自分（紅白戦）なら null', () => {
        const { teamA, teamB } = pair(true, true);
        expect(resolveMyTeamSide(teamA, teamB)).toBeNull();
    });

    it('どちらにも印が無い（旧データ）なら null', () => {
        const { teamA, teamB } = pair(undefined, undefined);
        expect(resolveMyTeamSide(teamA, teamB)).toBeNull();
    });

    it('false と undefined が混ざっても「印が無い」として null', () => {
        const { teamA, teamB } = pair(false, undefined);
        expect(resolveMyTeamSide(teamA, teamB)).toBeNull();
    });
});

describe('orderByMyTeam', () => {
    it('teamA が自分なら teamA が先', () => {
        expect(orderByMyTeam('teamA')).toEqual(['teamA', 'teamB']);
    });

    it('teamB が自分なら teamB が先', () => {
        expect(orderByMyTeam('teamB')).toEqual(['teamB', 'teamA']);
    });

    it('決められない（null）なら従来どおり teamA が先', () => {
        expect(orderByMyTeam(null)).toEqual(['teamA', 'teamB']);
    });
});
