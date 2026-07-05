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

describe('gameReducer: ADD_SCORE', () => {
    it('2Pで得点+2、2P成功/試投が+1され、履歴にランニングスコアが記録される', () => {
        const state = gameReducer(makeGame(), {
            type: 'ADD_SCORE',
            payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' },
        });
        const p = state.teamA.players.find(p => p.id === 'a1')!;
        expect(p.stats.points).toBe(2);
        expect(p.stats.twoPointMade).toBe(1);
        expect(p.stats.twoPointAttempt).toBe(1);
        expect(state.scoreHistory).toHaveLength(1);
        expect(state.scoreHistory[0].points).toBe(2);
        expect(state.scoreHistory[0].runningScoreA).toBe(2);
        expect(state.scoreHistory[0].runningScoreB).toBe(0);
    });

    it('3PとFTの得点・成功数が正しく加算される', () => {
        let state = makeGame();
        state = gameReducer(state, { type: 'ADD_SCORE', payload: { teamId: 'teamB', playerId: 'b1', scoreType: '3P' } });
        state = gameReducer(state, { type: 'ADD_SCORE', payload: { teamId: 'teamB', playerId: 'b1', scoreType: 'FT' } });
        const p = state.teamB.players.find(p => p.id === 'b1')!;
        expect(p.stats.points).toBe(4);
        expect(p.stats.threePointMade).toBe(1);
        expect(p.stats.freeThrowMade).toBe(1);
        expect(state.scoreHistory[1].runningScoreB).toBe(4);
    });
});

describe('gameReducer: ADD_STAT / REMOVE_SCORE', () => {
    it('TO:DDでturnoversとturnoverDDが両方+1される', () => {
        const state = gameReducer(makeGame(), {
            type: 'ADD_STAT',
            payload: { teamId: 'teamA', playerId: 'a2', statType: 'TO:DD' },
        });
        const p = state.teamA.players.find(p => p.id === 'a2')!;
        expect(p.stats.turnovers).toBe(1);
        expect(p.stats.turnoverDD).toBe(1);
        expect(state.statHistory).toHaveLength(1);
    });

    it('REMOVE_SCOREで得点と履歴が取り消される', () => {
        let state = gameReducer(makeGame(), {
            type: 'ADD_SCORE',
            payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' },
        });
        const entryId = state.scoreHistory[0].id;
        state = gameReducer(state, { type: 'REMOVE_SCORE', payload: { entryId } });
        const p = state.teamA.players.find(p => p.id === 'a1')!;
        expect(p.stats.points).toBe(0);
        expect(p.stats.twoPointMade).toBe(0);
        expect(state.scoreHistory).toHaveLength(0);
    });
});

describe('gameReducer: ADD_FOUL', () => {
    it('選手ファウルで当該Qのチームファウルと選手ファウル履歴が+1される', () => {
        const state = gameReducer(makeGame(), {
            type: 'ADD_FOUL',
            payload: { teamId: 'teamA', playerId: 'a1', foulType: 'P' },
        });
        expect(state.teamA.teamFouls[0]).toBe(1);
        const p = state.teamA.players.find(p => p.id === 'a1')!;
        expect(p.fouls).toHaveLength(1);
        expect(state.foulHistory).toHaveLength(1);
        expect(state.foulHistory[0].isCoachOrBench).toBe(false);
    });

    it('コーチテクニカルはチームファウルに加算されない', () => {
        const state = gameReducer(makeGame(), {
            type: 'ADD_FOUL',
            payload: { teamId: 'teamA', playerId: 'COACH', foulType: 'T' },
        });
        expect(state.teamA.teamFouls[0]).toBe(0);
        expect(state.teamA.coachFouls).toEqual(['T']);
        expect(state.foulHistory[0].isCoachOrBench).toBe(true);
        expect(state.foulHistory[0].coachFoulTarget).toBe('COACH');
    });
});

describe('gameReducer: END_QUARTER / END_GAME', () => {
    it('Q1終了でQ2・quarterEndフェーズになる', () => {
        const state = gameReducer(makeGame(), { type: 'END_QUARTER' });
        expect(state.currentQuarter).toBe(2);
        expect(state.phase).toBe('quarterEnd');
    });

    it('Q4終了時に点差があれば試合終了になる', () => {
        let state = makeGame();
        state.currentQuarter = 4;
        state = gameReducer(state, { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' } });
        state = gameReducer(state, { type: 'END_QUARTER' });
        expect(state.phase).toBe('finished');
        expect(state.endTime).not.toBeNull();
    });

    it('Q4終了時に同点ならオーバータイム(Q5)に入り、チームファウル枠が拡張される', () => {
        let state = makeGame();
        state.currentQuarter = 4;
        state = gameReducer(state, { type: 'END_QUARTER' });
        expect(state.currentQuarter).toBe(5);
        expect(state.phase).toBe('quarterEnd');
        expect(state.teamA.teamFouls).toHaveLength(5);
        expect(state.teamB.teamFouls).toHaveLength(5);
        expect(state.teamA.players[0].quartersPlayed).toHaveLength(5);
    });
});
