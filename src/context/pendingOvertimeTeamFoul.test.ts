import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import type { Game } from '../types/game';
import { createInitialGame, createTeam, createPlayer } from '../types/game';
import { createPendingAction } from '../types/pendingAction';

// OT欄のチームファウルは第4Qからの通算（END_QUARTER の extendForOT）。
// 保留アクションは記録された当時のピリオドへ後から足すため、第4Qの保留を
// OT中に解決すると、通算であるOT欄に伝わらず1つ足りないままになっていた。
// ペナルティ判定はOT欄を見ているので、5個目でFTになるべき場面が素通りする。

/** 第4Qでチームファウルを3つ犯し、そのままOTへ入った状態を作る */
function inOvertimeAfterFourthQuarterFouls(): Game {
    const game = createInitialGame();
    const teamA = createTeam('teamA', 'ホーム', 'コーチA');
    teamA.players = [
        { ...createPlayer('a1', 4, '選手A1', true), isOnCourt: true },
        { ...createPlayer('a2', 5, '選手A2'), isOnCourt: true },
    ];
    const teamB = createTeam('teamB', 'ビジター', 'コーチB');
    teamB.players = [{ ...createPlayer('b1', 6, '選手B1', true), isOnCourt: true }];
    game.teamA = teamA;
    game.teamB = teamB;
    game.phase = 'playing';
    game.currentQuarter = 4;

    let state: Game = game;
    for (let i = 0; i < 3; i++) {
        state = gameReducer(state, {
            type: 'ADD_FOUL',
            payload: { teamId: 'teamA', playerId: 'a1', foulType: 'P' },
        });
    }
    // 同点のままQ4終了 → OTへ（teamFoulsに5枠目が積まれる）
    state = gameReducer(state, { type: 'END_QUARTER' });
    expect(state.currentQuarter).toBe(5);
    expect(state.teamA.teamFouls).toEqual([0, 0, 0, 3, 3]);
    return state;
}

function pendingFoulInQuarter(quarter: number) {
    return createPendingAction('FOUL', 'P', 'teamA', quarter, [
        { id: 'a1', number: 4, name: '選手A1' },
        { id: 'a2', number: 5, name: '選手A2' },
    ]);
}

describe('保留ファウルの解決とOTのチームファウル通算', () => {
    it('RESOLVE_PENDING_ACTION: 第4Qの保留はOT欄にも伝わる', () => {
        const pending = pendingFoulInQuarter(4);
        let state = gameReducer(inOvertimeAfterFourthQuarterFouls(), {
            type: 'ADD_PENDING_ACTION',
            payload: pending,
        });

        state = gameReducer(state, {
            type: 'RESOLVE_PENDING_ACTION',
            payload: { pendingActionId: pending.id, playerId: 'a2' },
        });

        expect(state.teamA.teamFouls).toEqual([0, 0, 0, 4, 4]);
    });

    it('RESOLVE_PENDING_ACTION_WITH_FOUL_TYPE: 第4Qの保留はOT欄にも伝わる', () => {
        const pending = pendingFoulInQuarter(4);
        let state = gameReducer(inOvertimeAfterFourthQuarterFouls(), {
            type: 'ADD_PENDING_ACTION',
            payload: pending,
        });

        state = gameReducer(state, {
            type: 'RESOLVE_PENDING_ACTION_WITH_FOUL_TYPE',
            payload: { pendingActionId: pending.id, playerId: 'a2', foulType: 'P' },
        });

        expect(state.teamA.teamFouls).toEqual([0, 0, 0, 4, 4]);
    });

    it('RESOLVE_PENDING_ACTION_WITH_FREE_THROWS: 第4Qの保留はOT欄にも伝わる', () => {
        const pending = pendingFoulInQuarter(4);
        let state = gameReducer(inOvertimeAfterFourthQuarterFouls(), {
            type: 'ADD_PENDING_ACTION',
            payload: pending,
        });

        state = gameReducer(state, {
            type: 'RESOLVE_PENDING_ACTION_WITH_FREE_THROWS',
            payload: {
                pendingActionId: pending.id,
                playerId: 'a2',
                foulType: 'P',
                shotSituation: 'none',
                freeThrows: 0,
                freeThrowResults: [],
                shooterTeamId: 'teamB',
                shooterPlayerId: 'b1',
            },
        });

        expect(state.teamA.teamFouls).toEqual([0, 0, 0, 4, 4]);
    });

    it('第1〜3Qの保留はその枠だけを増やす（各Qは独立）', () => {
        const pending = pendingFoulInQuarter(2);
        let state = gameReducer(inOvertimeAfterFourthQuarterFouls(), {
            type: 'ADD_PENDING_ACTION',
            payload: pending,
        });

        state = gameReducer(state, {
            type: 'RESOLVE_PENDING_ACTION',
            payload: { pendingActionId: pending.id, playerId: 'a2' },
        });

        expect(state.teamA.teamFouls).toEqual([0, 1, 0, 3, 3]);
    });

    it('OT中に解決したぶんも取り消せる（加算と減算が対になっている）', () => {
        const pending = pendingFoulInQuarter(4);
        let state = gameReducer(inOvertimeAfterFourthQuarterFouls(), {
            type: 'ADD_PENDING_ACTION',
            payload: pending,
        });
        state = gameReducer(state, {
            type: 'RESOLVE_PENDING_ACTION',
            payload: { pendingActionId: pending.id, playerId: 'a2' },
        });

        const added = state.foulHistory[state.foulHistory.length - 1];
        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId: added.id } });

        expect(state.teamA.teamFouls).toEqual([0, 0, 0, 3, 3]);
    });
});
