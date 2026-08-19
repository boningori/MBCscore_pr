// 記録の付け替え先が、その記録のチームに居ない選手だった場合。
//
// EDIT_SCORE / EDIT_STAT は「元の選手から引く」処理と「新しい選手へ足す」処理を
// どちらも entry.teamId のチームに対して走らせている。相手チームの選手IDを
// 渡すと、引く側だけが当たって足す側はどの選手にも当たらず、スタッツが黙って
// 消える（得点なら、スコアボードの合計だけが減って得点履歴は残る＝様式と食い違う）。
//
// 変換系（CONVERT_SCORE_TO_MISS / CONVERT_MISS_TO_SCORE）には同じ事故を防ぐ
// resolveTargetPlayer が既にあるのに、編集系だけ素通しだった。いまの
// ActionHistory はチームごとに描かれ、そのチームの名簿しか EditActionModal に
// 渡さないので画面からは踏めないが、守りは経路ごとに揃えておく。

import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import type { Game } from '../types/game';
import { createInitialGame, createTeam, createPlayer } from '../types/game';

function makeGame(): Game {
    const game = createInitialGame();
    const teamA = createTeam('teamA', 'ホーム', 'コーチA', 'A.コーチA');
    teamA.players = [createPlayer('a1', 4, '選手A1', true), createPlayer('a2', 5, '選手A2')];
    const teamB = createTeam('teamB', 'ビジター', 'コーチB', 'A.コーチB');
    teamB.players = [createPlayer('b1', 6, '選手B1', true)];
    teamA.players.forEach(p => { p.isOnCourt = true; });
    teamB.players.forEach(p => { p.isOnCourt = true; });
    game.teamA = teamA;
    game.teamB = teamB;
    game.phase = 'playing';
    return game;
}

const boardScore = (state: Game, team: 'teamA' | 'teamB') =>
    state[team].players.reduce((sum, p) => sum + p.stats.points, 0);
const sheetScore = (state: Game, team: 'teamA' | 'teamB') =>
    state.scoreHistory.filter(e => e.teamId === team).reduce((sum, e) => sum + e.points, 0);

describe('EDIT_SCORE: 付け替え先がそのチームに居ない', () => {
    it('得点を相手チームの選手へ移そうとしても、元の選手に残す', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' },
        });

        state = gameReducer(state, {
            type: 'EDIT_SCORE',
            payload: { entryId: state.scoreHistory[0].id, newPlayerId: 'b1', newScoreType: '2P' },
        });

        expect(state.teamA.players.find(p => p.id === 'a1')!.stats.points).toBe(2);
        expect(state.teamB.players.find(p => p.id === 'b1')!.stats.points).toBe(0);
        expect(state.scoreHistory[0].playerId).toBe('a1');
    });

    it('スコアボードと得点履歴が食い違わない', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' },
        });

        state = gameReducer(state, {
            type: 'EDIT_SCORE',
            payload: { entryId: state.scoreHistory[0].id, newPlayerId: 'b1', newScoreType: '3P' },
        });

        expect(boardScore(state, 'teamA')).toBe(sheetScore(state, 'teamA'));
        expect(boardScore(state, 'teamB')).toBe(sheetScore(state, 'teamB'));
    });

    it('選手は据え置きでも、種別の変更は反映する', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' },
        });

        state = gameReducer(state, {
            type: 'EDIT_SCORE',
            payload: { entryId: state.scoreHistory[0].id, newPlayerId: 'b1', newScoreType: '3P' },
        });

        const a1 = state.teamA.players.find(p => p.id === 'a1')!;
        expect(a1.stats.points).toBe(3);
        expect(a1.stats.threePointMade).toBe(1);
        expect(a1.stats.twoPointMade).toBe(0);
        expect(state.scoreHistory[0].scoreType).toBe('3P');
    });

    it('同じチーム内の付け替えはこれまでどおり動く', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' },
        });

        state = gameReducer(state, {
            type: 'EDIT_SCORE',
            payload: { entryId: state.scoreHistory[0].id, newPlayerId: 'a2', newScoreType: '2P' },
        });

        expect(state.teamA.players.find(p => p.id === 'a1')!.stats.points).toBe(0);
        expect(state.teamA.players.find(p => p.id === 'a2')!.stats.points).toBe(2);
        expect(state.scoreHistory[0].playerId).toBe('a2');
    });
});

describe('EDIT_STAT: 付け替え先がそのチームに居ない', () => {
    it('スタッツを相手チームの選手へ移そうとしても、元の選手に残す', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_STAT', payload: { teamId: 'teamA', playerId: 'a1', statType: 'OREB' },
        });

        state = gameReducer(state, {
            type: 'EDIT_STAT',
            payload: { entryId: state.statHistory[0].id, newPlayerId: 'b1', newStatType: 'OREB' },
        });

        expect(state.teamA.players.find(p => p.id === 'a1')!.stats.offensiveRebounds).toBe(1);
        expect(state.teamB.players.find(p => p.id === 'b1')!.stats.offensiveRebounds).toBe(0);
        expect(state.statHistory[0].playerId).toBe('a1');
    });

    it('選手は据え置きでも、種別の変更は反映する', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_STAT', payload: { teamId: 'teamA', playerId: 'a1', statType: 'OREB' },
        });

        state = gameReducer(state, {
            type: 'EDIT_STAT',
            payload: { entryId: state.statHistory[0].id, newPlayerId: 'b1', newStatType: 'AST' },
        });

        const a1 = state.teamA.players.find(p => p.id === 'a1')!;
        expect(a1.stats.offensiveRebounds).toBe(0);
        expect(a1.stats.assists).toBe(1);
        expect(state.statHistory[0].statType).toBe('AST');
    });

    // 保留を「選手不明」で解決した記録は playerId が名簿の誰でもない。
    // ここへ選手を割り当てるのが唯一の導線なので、塞いではいけない
    it('選手不明の記録には、そのチームの選手を割り当てられる', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_STAT', payload: { teamId: 'teamA', playerId: 'unknown', statType: 'OREB' },
        });

        state = gameReducer(state, {
            type: 'EDIT_STAT',
            payload: { entryId: state.statHistory[0].id, newPlayerId: 'a2', newStatType: 'OREB' },
        });

        expect(state.teamA.players.find(p => p.id === 'a2')!.stats.offensiveRebounds).toBe(1);
        expect(state.statHistory[0].playerId).toBe('a2');
    });
});
