import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import type { Game } from '../types/game';
import { createInitialGame, createTeam, createPlayer } from '../types/game';

// 交代と記録の訂正は、どちらもランニングスコア・出場記録の整合性に直結する。
// 訂正は「押し間違えた直後」に必ず使われる操作で、ここが壊れると
// 公式記録として提出するスコアシートが静かに狂う。

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

/** a1をコート上・スターター、a2をベンチにした状態を作る */
function withStarterOnCourt(): Game {
    const game = makeGame();
    game.teamA.players = game.teamA.players.map(p =>
        p.id === 'a1'
            ? { ...p, isOnCourt: true, quartersPlayed: ['starter', null, null, null] }
            : { ...p, isOnCourt: false }
    );
    return game;
}

const playerA = (state: Game, id: string) => state.teamA.players.find(p => p.id === id)!;

describe('gameReducer: SUBSTITUTE_PLAYER', () => {
    it('入った選手がコート上、出た選手がベンチになる', () => {
        const state = gameReducer(withStarterOnCourt(), {
            type: 'SUBSTITUTE_PLAYER',
            payload: { teamId: 'teamA', playerInId: 'a2', playerOutId: 'a1' },
        });

        expect(playerA(state, 'a2').isOnCourt).toBe(true);
        expect(playerA(state, 'a1').isOnCourt).toBe(false);
    });

    it('初めての途中出場はそのクォーターが「途中出場(sub)」になる', () => {
        const state = gameReducer(withStarterOnCourt(), {
            type: 'SUBSTITUTE_PLAYER',
            payload: { teamId: 'teamA', playerInId: 'a2', playerOutId: 'a1' },
        });

        expect(playerA(state, 'a2').quartersPlayed[0]).toBe('sub');
    });

    it('スターターが一度退いて同じQに戻ると「both」になる', () => {
        // スコアシートで×表示になる区分。ミニバスの出場Q数え上げの根拠になるため、
        // starter→ベンチ→復帰を'sub'に上書きしてはいけない
        const out = gameReducer(withStarterOnCourt(), {
            type: 'SUBSTITUTE_PLAYER',
            payload: { teamId: 'teamA', playerInId: 'a2', playerOutId: 'a1' },
        });
        const back = gameReducer(out, {
            type: 'SUBSTITUTE_PLAYER',
            payload: { teamId: 'teamA', playerInId: 'a1', playerOutId: 'a2' },
        });

        expect(playerA(back, 'a1').quartersPlayed[0]).toBe('both');
    });

    it('相手チームには影響しない', () => {
        const before = withStarterOnCourt();
        const state = gameReducer(before, {
            type: 'SUBSTITUTE_PLAYER',
            payload: { teamId: 'teamA', playerInId: 'a2', playerOutId: 'a1' },
        });

        expect(state.teamB).toEqual(before.teamB);
    });
});

describe('gameReducer: CONVERT_SCORE_TO_MISS', () => {
    /** a1が2P成功を1本決めた状態 */
    function withMadeTwo() {
        return gameReducer(makeGame(), {
            type: 'ADD_SCORE',
            payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' },
        });
    }

    it('得点が取り消され、試投数は残る', () => {
        // 成功1本をミスに訂正しても「打った」事実は変わらないので
        // 2PAは1のまま。ここを一緒に減らすとFG%が過大になる
        const scored = withMadeTwo();
        const state = gameReducer(scored, {
            type: 'CONVERT_SCORE_TO_MISS',
            payload: { entryId: scored.scoreHistory[0].id, newMissType: '2PA' },
        });

        const p = playerA(state, 'a1');
        expect(p.stats.points).toBe(0);
        expect(p.stats.twoPointMade).toBe(0);
        expect(p.stats.twoPointAttempt).toBe(1);
    });

    it('得点履歴から消え、スタッツ履歴にミスとして残る', () => {
        const scored = withMadeTwo();
        const state = gameReducer(scored, {
            type: 'CONVERT_SCORE_TO_MISS',
            payload: { entryId: scored.scoreHistory[0].id, newMissType: '2PA' },
        });

        expect(state.scoreHistory).toHaveLength(0);
        expect(state.statHistory).toHaveLength(1);
        expect(state.statHistory[0].statType).toBe('2PA');
        expect(state.statHistory[0].playerId).toBe('a1');
    });

    it('2P成功を3Pミスへ訂正すると、2Pの試投も3Pへ移る', () => {
        // 距離の判定違いの訂正。2PA側に残ると同じシュートを二重に数えてしまう
        const scored = withMadeTwo();
        const state = gameReducer(scored, {
            type: 'CONVERT_SCORE_TO_MISS',
            payload: { entryId: scored.scoreHistory[0].id, newMissType: '3PA' },
        });

        const p = playerA(state, 'a1');
        expect(p.stats.twoPointAttempt).toBe(0);
        expect(p.stats.threePointAttempt).toBe(1);
        expect(p.stats.threePointMade).toBe(0);
        expect(p.stats.points).toBe(0);
    });

    it('存在しないIDなら何も変えない', () => {
        const scored = withMadeTwo();
        const state = gameReducer(scored, {
            type: 'CONVERT_SCORE_TO_MISS',
            payload: { entryId: 'missing', newMissType: '2PA' },
        });

        expect(state).toEqual(scored);
    });
});

describe('gameReducer: CONVERT_MISS_TO_SCORE', () => {
    /** a1が2Pを1本外した状態 */
    function withMissedTwo() {
        return gameReducer(makeGame(), {
            type: 'ADD_STAT',
            payload: { teamId: 'teamA', playerId: 'a1', statType: '2PA' },
        });
    }

    it('得点が入り、試投数は増えない', () => {
        const missed = withMissedTwo();
        const state = gameReducer(missed, {
            type: 'CONVERT_MISS_TO_SCORE',
            payload: { entryId: missed.statHistory[0].id, newScoreType: '2P' },
        });

        const p = playerA(state, 'a1');
        expect(p.stats.points).toBe(2);
        expect(p.stats.twoPointMade).toBe(1);
        expect(p.stats.twoPointAttempt).toBe(1);
    });

    it('スタッツ履歴から消え、得点履歴にランニングスコア付きで入る', () => {
        const missed = withMissedTwo();
        const state = gameReducer(missed, {
            type: 'CONVERT_MISS_TO_SCORE',
            payload: { entryId: missed.statHistory[0].id, newScoreType: '2P' },
        });

        expect(state.statHistory).toHaveLength(0);
        expect(state.scoreHistory).toHaveLength(1);
        expect(state.scoreHistory[0].points).toBe(2);
        expect(state.scoreHistory[0].runningScoreA).toBe(2);
        expect(state.scoreHistory[0].runningScoreB).toBe(0);
    });
});

describe('gameReducer: ADD_TIMEOUT', () => {
    it('現在のクォーターに、指定チームのぶんだけ記録される', () => {
        const state = gameReducer({ ...makeGame(), currentQuarter: 2 }, {
            type: 'ADD_TIMEOUT',
            payload: { teamId: 'teamA', elapsedMinutes: 3 },
        });

        expect(state.teamA.timeouts).toHaveLength(1);
        expect(state.teamA.timeouts[0].quarter).toBe(2);
        expect(state.teamA.timeouts[0].elapsedMinutes).toBe(3);
        expect(state.teamB.timeouts).toHaveLength(0);
    });
});

describe('gameReducer: END_GAME', () => {
    it('試合終了に遷移する', () => {
        const state = gameReducer(makeGame(), { type: 'END_GAME', payload: {} });
        expect(state.phase).toBe('finished');
    });
});
