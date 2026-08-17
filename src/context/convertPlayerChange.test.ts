import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import type { Game } from '../types/game';
import { createInitialGame, createTeam, createPlayer } from '../types/game';

// 「誰の記録か」と「成功かミスか」を同時に間違えるのは、記録中いちばん多い訂正。
// 変換だけを反映して選手の付け替えを捨てると、訂正したつもりの利用者に
// 何も告げないまま別の選手のスタッツが狂う。

function makeGame(): Game {
    const game = createInitialGame();
    const teamA = createTeam('teamA', 'ホーム', 'コーチA');
    teamA.players = [
        createPlayer('a1', 4, '選手A1', true),
        createPlayer('a2', 5, '選手A2'),
    ];
    game.teamA = teamA;
    game.teamB = createTeam('teamB', 'ビジター', 'コーチB');
    game.phase = 'playing';
    return game;
}

const playerA = (state: Game, id: string) => state.teamA.players.find(p => p.id === id)!;

describe('CONVERT_SCORE_TO_MISS: 選手の付け替えを伴う訂正', () => {
    function withMadeTwo() {
        return gameReducer(makeGame(), {
            type: 'ADD_SCORE',
            payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' },
        });
    }

    it('newPlayerId を渡すと、ミスの試投が新しい選手に付く', () => {
        const scored = withMadeTwo();
        const state = gameReducer(scored, {
            type: 'CONVERT_SCORE_TO_MISS',
            payload: { entryId: scored.scoreHistory[0].id, newMissType: '2PA', newPlayerId: 'a2' },
        });

        expect(playerA(state, 'a1').stats.points).toBe(0);
        expect(playerA(state, 'a1').stats.twoPointAttempt).toBe(0);
        expect(playerA(state, 'a2').stats.twoPointAttempt).toBe(1);
        expect(playerA(state, 'a2').stats.twoPointMade).toBe(0);
    });

    it('新しい選手のスタッツ履歴として残る', () => {
        const scored = withMadeTwo();
        const state = gameReducer(scored, {
            type: 'CONVERT_SCORE_TO_MISS',
            payload: { entryId: scored.scoreHistory[0].id, newMissType: '2PA', newPlayerId: 'a2' },
        });

        expect(state.statHistory[0].playerId).toBe('a2');
        expect(state.statHistory[0].playerNumber).toBe(5);
    });

    it('newPlayerId が無ければ元の選手のまま（既存の呼び出しを壊さない）', () => {
        const scored = withMadeTwo();
        const state = gameReducer(scored, {
            type: 'CONVERT_SCORE_TO_MISS',
            payload: { entryId: scored.scoreHistory[0].id, newMissType: '2PA' },
        });

        expect(state.statHistory[0].playerId).toBe('a1');
        expect(playerA(state, 'a1').stats.twoPointAttempt).toBe(1);
    });

    it('チームに居ない選手IDは無視して元の選手に付ける', () => {
        const scored = withMadeTwo();
        const state = gameReducer(scored, {
            type: 'CONVERT_SCORE_TO_MISS',
            payload: { entryId: scored.scoreHistory[0].id, newMissType: '2PA', newPlayerId: 'b1' },
        });

        expect(state.statHistory[0].playerId).toBe('a1');
        expect(playerA(state, 'a1').stats.twoPointAttempt).toBe(1);
    });
});

describe('CONVERT_MISS_TO_SCORE: 選手の付け替えを伴う訂正', () => {
    function withMissedTwo() {
        return gameReducer(makeGame(), {
            type: 'ADD_STAT',
            payload: { teamId: 'teamA', playerId: 'a1', statType: '2PA' },
        });
    }

    it('newPlayerId を渡すと、得点が新しい選手に付く', () => {
        const missed = withMissedTwo();
        const state = gameReducer(missed, {
            type: 'CONVERT_MISS_TO_SCORE',
            payload: { entryId: missed.statHistory[0].id, newScoreType: '2P', newPlayerId: 'a2' },
        });

        expect(playerA(state, 'a1').stats.twoPointAttempt).toBe(0);
        expect(playerA(state, 'a2').stats.points).toBe(2);
        expect(playerA(state, 'a2').stats.twoPointMade).toBe(1);
        expect(playerA(state, 'a2').stats.twoPointAttempt).toBe(1);
    });

    it('得点履歴の選手と背番号も差し替わる', () => {
        const missed = withMissedTwo();
        const state = gameReducer(missed, {
            type: 'CONVERT_MISS_TO_SCORE',
            payload: { entryId: missed.statHistory[0].id, newScoreType: '2P', newPlayerId: 'a2' },
        });

        expect(state.scoreHistory[0].playerId).toBe('a2');
        expect(state.scoreHistory[0].playerNumber).toBe(5);
        // チーム得点は変わらないのでランニングスコアも同じ
        expect(state.scoreHistory[0].runningScoreA).toBe(2);
    });

    it('newPlayerId が無ければ元の選手のまま（既存の呼び出しを壊さない）', () => {
        const missed = withMissedTwo();
        const state = gameReducer(missed, {
            type: 'CONVERT_MISS_TO_SCORE',
            payload: { entryId: missed.statHistory[0].id, newScoreType: '2P' },
        });

        expect(state.scoreHistory[0].playerId).toBe('a1');
        expect(playerA(state, 'a1').stats.points).toBe(2);
    });
});
