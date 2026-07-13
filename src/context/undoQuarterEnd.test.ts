import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import type { Game } from '../types/game';
import { createInitialGame, createTeam, createPlayer } from '../types/game';

// 両チーム2名ずつの試合状態を作るヘルパー
function makeGame(): Game {
    const game = createInitialGame();
    const teamA = createTeam('teamA', 'ホーム', 'コーチA');
    teamA.players = [
        createPlayer('a1', 4, '選手A1', true),
        createPlayer('a2', 5, '選手A2'),
    ];
    const teamB = createTeam('teamB', 'ビジター', 'コーチB');
    teamB.players = [
        createPlayer('b1', 6, '選手B1', true),
        createPlayer('b2', 7, '選手B2'),
    ];
    game.teamA = teamA;
    game.teamB = teamB;
    game.phase = 'playing';
    return game;
}

describe('gameReducer: UNDO_QUARTER_END', () => {
    it('quarterEnd中にUNDO_QUARTER_ENDで前のクォーターのplayingに戻る', () => {
        let state = gameReducer(makeGame(), { type: 'END_QUARTER' });
        expect(state.currentQuarter).toBe(2);
        expect(state.phase).toBe('quarterEnd');

        state = gameReducer(state, { type: 'UNDO_QUARTER_END' });
        expect(state.currentQuarter).toBe(1);
        expect(state.phase).toBe('playing');
    });

    it('新クォーターに記録がある場合は取り消さない(no-op)', () => {
        let state = gameReducer(makeGame(), { type: 'END_QUARTER' });
        // quarterEnd中の記録は次クォーター(Q2)として入る
        state = gameReducer(state, {
            type: 'ADD_SCORE',
            payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' },
        });
        expect(state.scoreHistory[0].quarter).toBe(2);

        const after = gameReducer(state, { type: 'UNDO_QUARTER_END' });
        expect(after.currentQuarter).toBe(2);
        expect(after.phase).toBe('quarterEnd');
    });

    it('playing中(quarterEndでない)は何もしない', () => {
        const state = makeGame();
        const after = gameReducer(state, { type: 'UNDO_QUARTER_END' });
        expect(after).toEqual(state);
    });

    it('OT突入の取り消しでteamFouls/quartersPlayedの延長分も戻る', () => {
        let state = makeGame();
        state.currentQuarter = 4;
        // 同点のままQ4終了 → OT(Q5)がquarterEndで作られる
        state = gameReducer(state, { type: 'END_QUARTER' });
        expect(state.currentQuarter).toBe(5);
        expect(state.teamA.teamFouls).toHaveLength(5);
        expect(state.teamA.players[0].quartersPlayed).toHaveLength(5);

        state = gameReducer(state, { type: 'UNDO_QUARTER_END' });
        expect(state.currentQuarter).toBe(4);
        expect(state.phase).toBe('playing');
        expect(state.teamA.teamFouls).toHaveLength(4);
        expect(state.teamB.teamFouls).toHaveLength(4);
        expect(state.teamA.players[0].quartersPlayed).toHaveLength(4);
    });
});
