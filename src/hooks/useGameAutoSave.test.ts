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

// PWAはOSに凍結・破棄されうる。デバウンス待ちの500msに入ったまま
// アプリが落とされると、直前の得点やファウルがどこにも残らない。
// 「画面が隠れた」時点は端末が奪われる直前なので、そこで必ず書き出す。
describe('useGameAutoSave: 離脱時の書き出し', () => {
    /** 画面が隠れた（他アプリへ切り替え・ホームに戻る等） */
    function hidePage() {
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'hidden',
        });
        act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    }

    it('デバウンスを待たずに保存する', () => {
        const game = makeGame('playing', 3);
        renderHook(() => useGameAutoSave(game, 'game', '練習試合', '2026-08-06', game.phase));

        // タイマーを進めずに離脱
        hidePage();

        expect(loadGameSession()?.game.currentQuarter).toBe(3);
    });

    it('pagehideでも保存する', () => {
        const game = makeGame('playing', 4);
        renderHook(() => useGameAutoSave(game, 'game', '練習試合', '2026-08-06', game.phase));

        act(() => { window.dispatchEvent(new Event('pagehide')); });

        expect(loadGameSession()?.game.currentQuarter).toBe(4);
    });

    it('保存対象でない画面では離脱しても保存しない', () => {
        const game = makeGame('finished', 4);
        renderHook(() => useGameAutoSave(game, 'home', '練習試合', '2026-08-06', game.phase));

        hidePage();

        expect(loadGameSession()).toBeNull();
    });

    it('最新の状態を書き出す（デバウンス中の変更を取りこぼさない）', () => {
        const { rerender } = renderHook(
            ({ game }: { game: Game }) => useGameAutoSave(game, 'game', '練習試合', '2026-08-06', game.phase),
            { initialProps: { game: makeGame('playing', 1) } },
        );
        flushDebounce();

        // Q2へ進んだ直後、デバウンスが終わる前に離脱
        rerender({ game: makeGame('playing', 2) });
        hidePage();

        expect(loadGameSession()?.game.currentQuarter).toBe(2);
    });
});

// 試合画面からホームへ抜けるのはアプリ内の「中断」導線。visibilitychange も
// pagehide も飛ばないため、デバウンス待ちの書き込みはクリーンアップで
// 捨てられていた。記録した直後にホームへ抜けて「試合を再開」すると、
// その1点が消える経路になっていた。
describe('useGameAutoSave: 試合系画面から離れるとき', () => {
    it('デバウンス待ちの記録を書き切ってからホームへ移る', () => {
        const { rerender } = renderHook(
            ({ game, screen }: { game: Game; screen: string }) =>
                useGameAutoSave(game, screen, '練習試合', '2026-08-06', game.phase),
            { initialProps: { game: makeGame('playing', 1), screen: 'game' } },
        );
        flushDebounce();
        expect(loadGameSession()?.game.currentQuarter).toBe(1);

        // Q2の記録が入った直後（デバウンス中）にホームへ抜ける
        rerender({ game: makeGame('playing', 2), screen: 'game' });
        rerender({ game: makeGame('playing', 2), screen: 'home' });

        expect(loadGameSession()?.game.currentQuarter).toBe(2);
    });

    // 「保存して終了」「保存せずにホームへ」は clearGameSession のあとホームへ移る。
    // そこで書き戻すと、終わったはずの試合が「再開できる中断試合」として蘇る
    it('終了済みの試合は書き戻さない（終了・破棄した試合を蘇らせない）', () => {
        const { rerender } = renderHook(
            ({ game, screen }: { game: Game; screen: string }) =>
                useGameAutoSave(game, screen, '練習試合', '2026-08-06', game.phase),
            { initialProps: { game: makeGame('playing', 4), screen: 'game' } },
        );
        flushDebounce();

        // 試合終了 → 保存してセッションを消す → ホームへ、の順を再現する
        rerender({ game: makeGame('finished', 4), screen: 'game' });
        localStorage.clear();
        rerender({ game: makeGame('finished', 4), screen: 'home' });

        expect(loadGameSession()).toBeNull();
    });

    it('一度書き切ったら、ホームで再描画されても繰り返し書き込まない', () => {
        const { rerender } = renderHook(
            ({ game, screen }: { game: Game; screen: string }) =>
                useGameAutoSave(game, screen, '練習試合', '2026-08-06', game.phase),
            { initialProps: { game: makeGame('playing', 2), screen: 'game' } },
        );
        rerender({ game: makeGame('playing', 2), screen: 'home' });
        expect(loadGameSession()?.game.currentQuarter).toBe(2);

        localStorage.clear();
        rerender({ game: makeGame('playing', 3), screen: 'home' });

        expect(loadGameSession()).toBeNull();
    });
});
