// ファウルの選手付け替え。
//
// 背番号の見間違いは試合中いちばん起きやすい訂正で、ファウルはとくに多い。
// これまで履歴の「編集」はファウル行にも出ていたが、保存しても何も起きなかった
// （ActionHistory の handleEditSave が score/stat しか分岐を持っていなかった）。
// 記録者からは保存できたように見えるので、取り違えたまま試合が終わる。
//
// 付け替えるのは「誰が犯したか」だけ。FT の得点・スタッツは相手チームの
// シューターに付いているのでファウルをした選手が変わっても動かないし、
// チームファウルも同じチーム内の移動では増減しない。ここで動かしてよいのは
// 選手行のファウル記録と履歴エントリの帰属だけ、というのを固定する。

import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import type { Game } from '../types/game';
import { createInitialGame, createTeam, createPlayer } from '../types/game';

function makeGame(): Game {
    const game = createInitialGame();
    const teamA = createTeam('teamA', 'ホーム', 'コーチA', 'A.コーチA');
    teamA.players = [
        createPlayer('a1', 4, '選手A1', true),
        createPlayer('a2', 5, '選手A2'),
    ];
    const teamB = createTeam('teamB', 'ビジター', 'コーチB', 'A.コーチB');
    teamB.players = [
        createPlayer('b1', 6, '選手B1', true),
        createPlayer('b2', 7, '選手B2'),
    ];
    teamA.players.forEach(p => { p.isOnCourt = true; });
    teamB.players.forEach(p => { p.isOnCourt = true; });
    game.teamA = teamA;
    game.teamB = teamB;
    game.phase = 'playing';
    game.currentQuarter = 1;
    return game;
}

const playerA = (state: Game, id: string) => state.teamA.players.find(p => p.id === id)!;

describe('EDIT_FOUL: ファウルをした選手の付け替え', () => {
    it('FTを伴わないファウルを別の選手へ移す', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_FOUL', payload: { teamId: 'teamA', playerId: 'a1', foulType: 'P' },
        });
        const entryId = state.foulHistory[0].id;

        state = gameReducer(state, { type: 'EDIT_FOUL', payload: { entryId, newPlayerId: 'a2' } });

        expect(playerA(state, 'a1').fouls).toEqual([]);
        expect(playerA(state, 'a2').fouls).toEqual(['P']);
        expect(state.foulHistory[0].playerId).toBe('a2');
        expect(state.foulHistory[0].playerNumber).toBe(5);
    });

    it('チームファウルは同じチーム内の移動で増減しない', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_FOUL', payload: { teamId: 'teamA', playerId: 'a1', foulType: 'P' },
        });
        const before = [...state.teamA.teamFouls];

        state = gameReducer(state, {
            type: 'EDIT_FOUL', payload: { entryId: state.foulHistory[0].id, newPlayerId: 'a2' },
        });

        expect(state.teamA.teamFouls).toEqual(before);
    });

    it('FT付きファウルを移しても、相手シューターの得点とスタッツは動かない', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'a1', foulType: 'P',
                shotSituation: '2P', shotMade: false,
                freeThrows: 2, freeThrowResults: ['made', 'made'],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1',
            },
        });
        const shooterBefore = { ...state.teamB.players[0].stats };
        const scoresBefore = state.scoreHistory.length;

        state = gameReducer(state, {
            type: 'EDIT_FOUL', payload: { entryId: state.foulHistory[0].id, newPlayerId: 'a2' },
        });

        expect(state.teamB.players[0].stats).toEqual(shooterBefore);
        expect(state.scoreHistory).toHaveLength(scoresBefore);
        // FT本数を持つ記録（P2）がそのまま移る
        expect(playerA(state, 'a1').fouls).toEqual([]);
        expect(playerA(state, 'a2').fouls).toEqual([{ type: 'P', freeThrows: 2, freeThrowResults: ['made', 'made'] }]);
    });

    it('同じ種類のファウルが複数あっても、指定した1つだけが移る', () => {
        let state = makeGame();
        // a1 に P（FTなし）と P2（FT2本）
        state = gameReducer(state, {
            type: 'ADD_FOUL', payload: { teamId: 'teamA', playerId: 'a1', foulType: 'P' },
        });
        state = gameReducer(state, {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'a1', foulType: 'P',
                shotSituation: 'none', freeThrows: 2, freeThrowResults: ['made', 'missed'],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1',
            },
        });
        const ftEntry = state.foulHistory.find(f => f.freeThrows === 2)!;

        state = gameReducer(state, { type: 'EDIT_FOUL', payload: { entryId: ftEntry.id, newPlayerId: 'a2' } });

        expect(playerA(state, 'a1').fouls).toEqual(['P']);
        expect(playerA(state, 'a2').fouls).toEqual([{ type: 'P', freeThrows: 2, freeThrowResults: ['made', 'missed'] }]);
    });

    it('付け替えたあとに取り消しても、チームファウルと選手の記録が元に戻る', () => {
        const base = makeGame();
        let state = gameReducer(base, {
            type: 'ADD_FOUL', payload: { teamId: 'teamA', playerId: 'a1', foulType: 'P' },
        });
        const entryId = state.foulHistory[0].id;
        state = gameReducer(state, { type: 'EDIT_FOUL', payload: { entryId, newPlayerId: 'a2' } });
        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId } });

        expect(state.teamA.teamFouls).toEqual(base.teamA.teamFouls);
        expect(playerA(state, 'a1').fouls).toEqual([]);
        expect(playerA(state, 'a2').fouls).toEqual([]);
        expect(state.foulHistory).toEqual([]);
    });

    it('存在しない選手・エントリを指定したら何も変えない', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_FOUL', payload: { teamId: 'teamA', playerId: 'a1', foulType: 'P' },
        });
        const entryId = state.foulHistory[0].id;

        expect(gameReducer(state, { type: 'EDIT_FOUL', payload: { entryId, newPlayerId: 'nope' } })).toBe(state);
        expect(gameReducer(state, { type: 'EDIT_FOUL', payload: { entryId: 'nope', newPlayerId: 'a2' } })).toBe(state);
    });

    it('相手チームの選手へは移さない（チームファウルの帰属が変わってしまう）', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_FOUL', payload: { teamId: 'teamA', playerId: 'a1', foulType: 'P' },
        });

        const next = gameReducer(state, {
            type: 'EDIT_FOUL', payload: { entryId: state.foulHistory[0].id, newPlayerId: 'b1' },
        });

        expect(next).toBe(state);
    });

    it('コーチ・ベンチのファウルは付け替えない（移す先の選手行が無い）', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_FOUL', payload: { teamId: 'teamA', playerId: 'COACH', foulType: 'T' },
        });

        const next = gameReducer(state, {
            type: 'EDIT_FOUL', payload: { entryId: state.foulHistory[0].id, newPlayerId: 'a2' },
        });

        expect(next).toBe(state);
    });
});
