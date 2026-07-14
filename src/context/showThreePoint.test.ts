import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import { createInitialGame } from '../types/game';

// 試合中の3P設定変更（設定確認ステップで見落としてもリカバリ可能にする）
describe('gameReducer: SET_SHOW_THREE_POINT', () => {
    it('showThreePointを切り替えられる', () => {
        const game = { ...createInitialGame(), showThreePoint: false };
        const on = gameReducer(game, { type: 'SET_SHOW_THREE_POINT', payload: { showThreePoint: true } });
        expect(on.showThreePoint).toBe(true);
        const off = gameReducer(on, { type: 'SET_SHOW_THREE_POINT', payload: { showThreePoint: false } });
        expect(off.showThreePoint).toBe(false);
    });
});
