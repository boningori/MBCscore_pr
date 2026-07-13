import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import type { Game } from '../types/game';
import { createInitialGame, createTeam, createPlayer } from '../types/game';

function makeGame(): Game {
    const game = createInitialGame();
    const teamA = createTeam('teamA', 'ホーム', 'コーチA');
    teamA.players = [createPlayer('a1', 4, '選手A1', true)];
    const teamB = createTeam('teamB', 'ビジター', 'コーチB');
    teamB.players = [createPlayer('b1', 6, '選手B1', true)];
    game.teamA = teamA;
    game.teamB = teamB;
    game.phase = 'playing';
    return game;
}

// ワンタップUndo用: 呼び出し側が生成したentryIdをエントリに使えること
describe('gameReducer: 明示的なentryId指定', () => {
    it('ADD_SCOREでentryIdを指定するとその値がエントリIDになる', () => {
        const state = gameReducer(makeGame(), {
            type: 'ADD_SCORE',
            payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P', entryId: 'my-score-id' },
        });
        expect(state.scoreHistory[0].id).toBe('my-score-id');
    });

    it('ADD_STATでentryIdを指定するとその値がエントリIDになる', () => {
        const state = gameReducer(makeGame(), {
            type: 'ADD_STAT',
            payload: { teamId: 'teamA', playerId: 'a1', statType: 'AST', entryId: 'my-stat-id' },
        });
        expect(state.statHistory[0].id).toBe('my-stat-id');
    });

    it('entryId未指定なら従来通り自動生成される', () => {
        const state = gameReducer(makeGame(), {
            type: 'ADD_SCORE',
            payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' },
        });
        expect(state.scoreHistory[0].id).toBeTruthy();
    });
});
