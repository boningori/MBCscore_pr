import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import { createInitialGame, createTeam } from '../types/game';
import type { Game } from '../types/game';

// クォーター時間（6分/5分）の試合ごと設定
describe('gameReducer: quarterMinutes（クォーター時間）', () => {
    it('createInitialGameのデフォルトは6分', () => {
        expect(createInitialGame().quarterMinutes).toBe(6);
    });

    it('SET_TEAMSでquarterMinutes:5を渡すとstateに反映される', () => {
        const state = gameReducer(createInitialGame(), {
            type: 'SET_TEAMS',
            payload: {
                teamA: createTeam('teamA', 'ホーム', 'コーチA'),
                teamB: createTeam('teamB', 'ビジター', 'コーチB'),
                quarterMinutes: 5,
            },
        });
        expect(state.quarterMinutes).toBe(5);
    });

    it('SET_TEAMSでquarterMinutes未指定なら現在値を維持する', () => {
        const base: Game = { ...createInitialGame(), quarterMinutes: 5 };
        const state = gameReducer(base, {
            type: 'SET_TEAMS',
            payload: {
                teamA: createTeam('teamA', 'ホーム', 'コーチA'),
                teamB: createTeam('teamB', 'ビジター', 'コーチB'),
            },
        });
        expect(state.quarterMinutes).toBe(5);
    });

    it('SET_QUARTER_MINUTESで切り替えられる', () => {
        const game = createInitialGame();
        const five = gameReducer(game, { type: 'SET_QUARTER_MINUTES', payload: { quarterMinutes: 5 } });
        expect(five.quarterMinutes).toBe(5);
        const six = gameReducer(five, { type: 'SET_QUARTER_MINUTES', payload: { quarterMinutes: 6 } });
        expect(six.quarterMinutes).toBe(6);
    });

    it('RESTORE_GAMEでquarterMinutesが無い試合は6に補完される', () => {
        const legacy = createInitialGame();
        // 既存データを模擬: フィールドを削除
        delete (legacy as Partial<Game>).quarterMinutes;
        const state = gameReducer(createInitialGame(), {
            type: 'RESTORE_GAME',
            payload: { game: legacy },
        });
        expect(state.quarterMinutes).toBe(6);
    });

    it('RESTORE_GAMEで明示的な5分は保持される（6に上書きしない）', () => {
        const saved: Game = { ...createInitialGame(), quarterMinutes: 5 };
        const state = gameReducer(createInitialGame(), {
            type: 'RESTORE_GAME',
            payload: { game: saved },
        });
        expect(state.quarterMinutes).toBe(5);
    });
});
