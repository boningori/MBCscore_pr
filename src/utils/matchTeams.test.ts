// 試合開始時の白/青チーム組み立て。
//
// マイチーム側にだけ savedTeamId を残すのがここの肝。これを入れ忘れると、
// 保存後は名前でしか登録チームと結び付かず、改名で過去の試合が分析から消える。

import { describe, it, expect } from 'vitest';
import { buildMatchTeams } from './matchTeams';
import type { SavedTeam } from './teamStorage';

function savedTeam(id: string, name: string): SavedTeam {
    return {
        id, name, coachName: `${name}コーチ`, assistantCoachName: '',
        players: [
            { number: 4, bibNumber: 14, uniformNumber: 4, name: '選手A', isCaptain: true },
            { number: 5, bibNumber: 15, uniformNumber: 5, name: '選手B', isCaptain: false },
        ],
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

const mine = savedTeam('t6', '6年生チーム');
const opponent = savedTeam('opp-1', '相手チーム');

describe('buildMatchTeams', () => {
    it('マイチームが白なら、teamA にだけ savedTeamId が入る', () => {
        const { teamA, teamB } = buildMatchTeams({
            myTeam: mine, opponentTeam: opponent, myTeamColor: 'white', numberType: 'uniform',
        });

        expect(teamA.savedTeamId).toBe('t6');
        expect(teamB.savedTeamId).toBeUndefined();
    });

    it('マイチームが青なら、teamB にだけ savedTeamId が入る', () => {
        const { teamA, teamB } = buildMatchTeams({
            myTeam: mine, opponentTeam: opponent, myTeamColor: 'blue', numberType: 'uniform',
        });

        expect(teamB.savedTeamId).toBe('t6');
        expect(teamA.savedTeamId).toBeUndefined();
    });

    it('白=teamA・青=teamB に固定し、isMyTeam を自分側に立てる', () => {
        const { teamA, teamB } = buildMatchTeams({
            myTeam: mine, opponentTeam: opponent, myTeamColor: 'blue', numberType: 'uniform',
        });

        expect(teamA.color).toBe('white');
        expect(teamA.name).toBe('相手チーム');
        expect(teamA.isMyTeam).toBe(false);
        expect(teamB.color).toBe('blue');
        expect(teamB.name).toBe('6年生チーム');
        expect(teamB.isMyTeam).toBe(true);
    });

    it('番号タイプはマイチーム側にだけ適用する', () => {
        const { teamA, teamB } = buildMatchTeams({
            myTeam: mine, opponentTeam: opponent, myTeamColor: 'white', numberType: 'bib',
        });

        expect(teamA.players.map(p => p.number)).toEqual([14, 15]); // ビブス番号
        expect(teamB.players.map(p => p.number)).toEqual([4, 5]);   // 相手は number のまま
    });

    it('コート上の選手はクリアする（スタメンはQ1で選ぶ）', () => {
        const { teamA, teamB } = buildMatchTeams({
            myTeam: mine, opponentTeam: opponent, myTeamColor: 'white', numberType: 'uniform',
        });

        expect([...teamA.players, ...teamB.players].every(p => !p.isOnCourt)).toBe(true);
    });
});
