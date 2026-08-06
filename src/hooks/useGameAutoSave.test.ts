import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useGameAutoSave } from './useGameAutoSave';
import { loadGameSession } from '../utils/gameSessionStorage';
import { createInitialGame, createTeam, createPlayer } from '../types/game';
import type { Game } from '../types/game';

// 保存対象を判別できる最小の試合状態
function makeGame(phase: Game['phase'], quarter: number): Game {
    const game = createInitialGame();
    const teamA = createTeam('teamA', 'ホーム', 'コーチA');
    teamA.players = [createPlayer('a1', 4, '選手A1', true)];
    const teamB = createTeam('teamB', 'ビジター', 'コーチB');
    teamB.players = [createPlayer('b1', 6, '選手B1', true)];
    game.teamA = teamA;
    game.teamB = teamB;
    game.phase = phase;
    game.currentQuarter = quarter;
    return game;
}

beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    localStorage.clear();
});

/** デバウンス(500ms)を消化する */
function flushDebounce() {
    act(() => { vi.advanceTimersByTime(600); });
}

describe('useGameAutoSave', () => {
    it('試合画面での変更を保存する', () => {
        const game = makeGame('playing', 1);
        renderHook(() => useGameAutoSave(game, 'game', '練習試合', '2026-08-06', game.phase));
        flushDebounce();

        expect(loadGameSession()?.game.currentQuarter).toBe(1);
    });

    it('クォーター終了でスタメン選択へ移っても、終了後の状態が保存される', () => {
        // Q1をプレイ中 → 保存済み
        const { rerender } = renderHook(
            ({ game, screen }: { game: Game; screen: string }) =>
                useGameAutoSave(game, screen, '練習試合', '2026-08-06', game.phase),
            { initialProps: { game: makeGame('playing', 1), screen: 'game' } },
        );
        flushDebounce();

        // Q1終了 → quarterLineup へ遷移（App.tsx の handleQuarterEnd と同じ順序）
        rerender({ game: makeGame('quarterEnd', 2), screen: 'quarterLineup' });
        flushDebounce();

        const saved = loadGameSession();
        expect(saved?.game.phase).toBe('quarterEnd');
        expect(saved?.game.currentQuarter).toBe(2);
    });

    it('スコアシート画面での試合情報の変更も保存される', () => {
        const { rerender } = renderHook(
            ({ game, screen }: { game: Game; screen: string }) =>
                useGameAutoSave(game, screen, '練習試合', '2026-08-06', game.phase),
            { initialProps: { game: makeGame('playing', 3), screen: 'game' } },
        );
        flushDebounce();

        const edited = makeGame('playing', 3);
        edited.gameInfo = { ...edited.gameInfo, venue: '市民体育館' };
        rerender({ game: edited, screen: 'scoresheet' });
        flushDebounce();

        expect(loadGameSession()?.game.gameInfo.venue).toBe('市民体育館');
    });

    it('試合系でない画面では保存しない（終了後にホームで復活させない）', () => {
        const game = makeGame('finished', 4);
        renderHook(() => useGameAutoSave(game, 'home', '練習試合', '2026-08-06', game.phase));
        flushDebounce();

        expect(loadGameSession()).toBeNull();
    });

    it('setup中は保存しない', () => {
        const game = makeGame('setup', 1);
        renderHook(() => useGameAutoSave(game, 'game', '練習試合', '2026-08-06', game.phase));
        flushDebounce();

        expect(loadGameSession()).toBeNull();
    });
});
