// OTのチームファウルは第4Qからの通算。取り消しも通算をたどる必要がある。
//
// END_QUARTER は「OTは第4Qの延長」として、直前ピリオドの数を種にして
// 新しい枠を足す（gameFlowHandlers の extendForOT）。つまり OT の枠には
// 第4Qで犯したファウルが含まれている。
//
// ところが取り消しは entry.quarter の枠1つしか減らしていなかった。
// OTに入ってから第4Qの誤記録を消すと、第4Q欄だけ減ってOT欄は水増しの
// まま残る。ペナルティ判定はOT欄を見ているので、本来より早くFTになる。

import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import { createInitialGame, createTeam, createPlayer } from '../types/game';
import type { Game, Team } from '../types/game';

function team(id: string): Team {
    const t = createTeam(id, `T-${id}`, 'コーチ');
    t.players = [{ ...createPlayer(`${id}-1`, 4, 'A'), isOnCourt: true }];
    return t;
}

/** 第4Qでa個・OTでb個のファウルを犯した状態まで進める */
function playIntoOvertime(q4: number, ot: number): Game {
    let s: Game = {
        ...createInitialGame(),
        teamA: team('teamA'), teamB: team('teamB'),
        currentQuarter: 4, phase: 'playing',
    };
    for (let i = 0; i < q4; i++) {
        s = gameReducer(s, { type: 'ADD_FOUL', payload: { teamId: 'teamA', playerId: 'teamA-1', foulType: 'P' } });
    }
    // 同点なのでOTへ（第4Qの数を種にして枠が増える）
    s = gameReducer(s, { type: 'END_QUARTER' });
    for (let i = 0; i < ot; i++) {
        s = gameReducer(s, { type: 'ADD_FOUL', payload: { teamId: 'teamA', playerId: 'teamA-1', foulType: 'P' } });
    }
    return s;
}

const removeFoulInQuarter = (s: Game, quarter: number): Game => {
    const entry = s.foulHistory.find(f => f.quarter === quarter)!;
    return gameReducer(s, { type: 'REMOVE_FOUL', payload: { entryId: entry.id } });
};

describe('OTに入ったあとのチームファウル取り消し', () => {
    it('第4Qのファウルを消すとOT欄の通算も減る', () => {
        const s = playIntoOvertime(2, 1);
        expect(s.teamA.teamFouls).toEqual([0, 0, 0, 2, 3]);

        const next = removeFoulInQuarter(s, 4);

        expect(next.teamA.teamFouls).toEqual([0, 0, 0, 1, 2]);
    });

    it('OTで犯したファウルを消しても第4Q欄は動かさない', () => {
        const s = playIntoOvertime(2, 1);

        const next = removeFoulInQuarter(s, 5);

        expect(next.teamA.teamFouls).toEqual([0, 0, 0, 2, 2]);
    });

    it('OTが2回目でも、第4Qの取り消しが後続のOT欄すべてに伝わる', () => {
        let s = playIntoOvertime(2, 1);
        s = gameReducer(s, { type: 'END_QUARTER' });  // OT2へ（0-0のまま）
        s = gameReducer(s, { type: 'ADD_FOUL', payload: { teamId: 'teamA', playerId: 'teamA-1', foulType: 'P' } });
        expect(s.teamA.teamFouls).toEqual([0, 0, 0, 2, 3, 4]);

        const next = removeFoulInQuarter(s, 4);

        expect(next.teamA.teamFouls).toEqual([0, 0, 0, 1, 2, 3]);
    });

    it('OT1のファウルを消すとOT2の通算も減るが、それ以前は動かない', () => {
        let s = playIntoOvertime(2, 1);
        s = gameReducer(s, { type: 'END_QUARTER' });
        s = gameReducer(s, { type: 'ADD_FOUL', payload: { teamId: 'teamA', playerId: 'teamA-1', foulType: 'P' } });

        const next = removeFoulInQuarter(s, 5);

        expect(next.teamA.teamFouls).toEqual([0, 0, 0, 2, 2, 3]);
    });

    it('通常クォーターどうしは独立（第2Qの取り消しは第3Q以降に響かない）', () => {
        let s: Game = {
            ...createInitialGame(),
            teamA: team('teamA'), teamB: team('teamB'),
            currentQuarter: 2, phase: 'playing',
        };
        s = gameReducer(s, { type: 'ADD_FOUL', payload: { teamId: 'teamA', playerId: 'teamA-1', foulType: 'P' } });
        s = gameReducer({ ...s, currentQuarter: 3 }, { type: 'ADD_FOUL', payload: { teamId: 'teamA', playerId: 'teamA-1', foulType: 'P' } });
        expect(s.teamA.teamFouls).toEqual([0, 1, 1, 0]);

        const next = removeFoulInQuarter(s, 2);

        expect(next.teamA.teamFouls).toEqual([0, 0, 1, 0]);
    });
});
