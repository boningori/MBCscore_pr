import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import type { Game } from '../types/game';
import { createInitialGame, createTeam } from '../types/game';

// タイムアウトは記録するとチップが「済」になって押せなくなり、アクション履歴にも
// 載らないため、経過分を間違えても試合中ずっと直せなかった。誤った分数は
// そのまま公式様式のタイムアウト欄とPDFに残る。

function makeGame(): Game {
    const game = createInitialGame();
    game.teamA = createTeam('teamA', 'ホーム', 'コーチA');
    game.teamB = createTeam('teamB', 'ビジター', 'コーチB');
    game.phase = 'playing';
    return game;
}

describe('gameReducer: REMOVE_TIMEOUT', () => {
    it('指定チーム・指定クォーターのタイムアウトを取り消す', () => {
        const recorded = gameReducer({ ...makeGame(), currentQuarter: 2 }, {
            type: 'ADD_TIMEOUT',
            payload: { teamId: 'teamA', elapsedMinutes: 3 },
        });
        expect(recorded.teamA.timeouts).toHaveLength(1);

        const state = gameReducer(recorded, {
            type: 'REMOVE_TIMEOUT',
            payload: { teamId: 'teamA', quarter: 2 },
        });

        expect(state.teamA.timeouts).toHaveLength(0);
    });

    it('相手チームのタイムアウトには触れない', () => {
        let state = gameReducer({ ...makeGame(), currentQuarter: 1 }, {
            type: 'ADD_TIMEOUT',
            payload: { teamId: 'teamA', elapsedMinutes: 2 },
        });
        state = gameReducer(state, {
            type: 'ADD_TIMEOUT',
            payload: { teamId: 'teamB', elapsedMinutes: 4 },
        });

        const removed = gameReducer(state, {
            type: 'REMOVE_TIMEOUT',
            payload: { teamId: 'teamA', quarter: 1 },
        });

        expect(removed.teamA.timeouts).toHaveLength(0);
        expect(removed.teamB.timeouts).toEqual([{ quarter: 1, elapsedMinutes: 4 }]);
    });

    it('他のクォーターのタイムアウトは残る', () => {
        let state = gameReducer({ ...makeGame(), currentQuarter: 1 }, {
            type: 'ADD_TIMEOUT',
            payload: { teamId: 'teamA', elapsedMinutes: 2 },
        });
        state = gameReducer({ ...state, currentQuarter: 3 }, {
            type: 'ADD_TIMEOUT',
            payload: { teamId: 'teamA', elapsedMinutes: 5 },
        });

        const removed = gameReducer(state, {
            type: 'REMOVE_TIMEOUT',
            payload: { teamId: 'teamA', quarter: 3 },
        });

        expect(removed.teamA.timeouts).toEqual([{ quarter: 1, elapsedMinutes: 2 }]);
    });

    it('同じクォーターに複数あるときは最後の1つだけ取り消す', () => {
        // 通常はUIが1本に制限するが、復元したデータには複数入りうる。
        // まとめて消すと、取り消したつもりのない記録まで失う
        const base = makeGame();
        base.teamA = {
            ...base.teamA,
            timeouts: [
                { quarter: 2, elapsedMinutes: 1 },
                { quarter: 2, elapsedMinutes: 4 },
            ],
        };

        const state = gameReducer(base, {
            type: 'REMOVE_TIMEOUT',
            payload: { teamId: 'teamA', quarter: 2 },
        });

        expect(state.teamA.timeouts).toEqual([{ quarter: 2, elapsedMinutes: 1 }]);
    });

    it('該当が無ければ何も変えない', () => {
        const base = makeGame();
        const state = gameReducer(base, {
            type: 'REMOVE_TIMEOUT',
            payload: { teamId: 'teamA', quarter: 4 },
        });

        expect(state).toEqual(base);
    });
});
