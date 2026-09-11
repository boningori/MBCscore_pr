// 全画面ボタンを出すのは、全画面が使える端末だけにする。
//
// useFullscreen の toggleFullScreen は requestFullscreen / webkit / ms / moz を
// 順に試し、どれも無ければ何もせずに try を抜ける。例外が出ないので catch の
// トーストも出ず、isFullScreen も false のまま——押しても無反応・無通知になる。
// iOS / iPadOS の Safari は任意要素の Fullscreen API を持たないため、
// このアプリの主対象でそれが起きる。
//
// 置き場所はホームのヘッダーと記録画面のヘッダーの2か所。どちらも
// 「タブレット横向きのフルモード推奨」の導線上にあり、目立つ。
// 押せるものだけを箱にする、という作りに合わせて出し分ける。

import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { createInitialGame, createTeam, createPlayer } from './types/game';

const FULLSCREEN_LABEL = '全画面表示';

const KEYS = [
    'fullscreenEnabled',
    'webkitFullscreenEnabled',
    'mozFullScreenEnabled',
    'msFullscreenEnabled',
] as const;

const saved = new Map<string, PropertyDescriptor | undefined>();

/** 全画面APIの有無を差し替える（jsdom は既定で fullscreenEnabled を持たない） */
function setFullscreenEnabled(enabled: boolean) {
    for (const key of KEYS) {
        if (!saved.has(key)) saved.set(key, Object.getOwnPropertyDescriptor(document, key));
        Object.defineProperty(document, key, {
            configurable: true,
            get: () => (key === 'fullscreenEnabled' ? enabled : undefined),
        });
    }
}

const myTeam = {
    id: 'team-1',
    name: 'テストチーム',
    coachName: 'コーチ',
    assistantCoachName: '',
    players: [{ number: 4, name: '選手4', isCaptain: true }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

function seedPlaying() {
    const game = createInitialGame();
    game.phase = 'playing';
    game.currentQuarter = 1;
    game.teamA = {
        ...createTeam('teamA', 'テストチーム', 'コーチ'),
        players: [{ ...createPlayer('teamA-player-0', 4, '選手4'), isOnCourt: true }],
    };
    game.teamB = {
        ...createTeam('teamB', '相手チーム', '相手コーチ'),
        players: [{ ...createPlayer('teamB-player-0', 5, '選手5'), isOnCourt: true }],
    };
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game, gameName: '練習試合', date: '2026-09-11', savedAt: new Date().toISOString(),
    }));
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    localStorage.setItem('minibasket-last-backup', JSON.stringify({ timestamp: Date.now(), gameCount: 1 }));
    window.history.replaceState(null, '');
    seedPlaying();
});

afterEach(() => {
    cleanup();
    for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(document, key, descriptor);
        else delete (document as unknown as Record<string, unknown>)[key];
    }
    saved.clear();
});

describe('ホームの全画面ボタン', () => {
    it('対応端末では出す', () => {
        setFullscreenEnabled(true);
        render(<App />);

        expect(screen.getByRole('button', { name: FULLSCREEN_LABEL })).toBeTruthy();
    });

    it('非対応端末（iOS Safari など）では出さない', () => {
        setFullscreenEnabled(false);
        render(<App />);

        expect(screen.queryByRole('button', { name: FULLSCREEN_LABEL })).toBeNull();
    });
});

describe('記録画面の全画面ボタン', () => {
    it('対応端末では出す', async () => {
        setFullscreenEnabled(true);
        render(<App />);
        fireEvent.click(await screen.findByText('試合を再開'));

        expect(screen.getByRole('button', { name: FULLSCREEN_LABEL })).toBeTruthy();
    });

    it('非対応端末では出さない', async () => {
        setFullscreenEnabled(false);
        render(<App />);
        fireEvent.click(await screen.findByText('試合を再開'));

        expect(screen.queryByRole('button', { name: FULLSCREEN_LABEL })).toBeNull();
    });

    // 残りのヘッダー操作まで巻き添えで消えていないことを確かめる
    it('非対応端末でも、ほかのヘッダー操作は残る', async () => {
        setFullscreenEnabled(false);
        render(<App />);
        fireEvent.click(await screen.findByText('試合を再開'));

        expect(screen.getByRole('button', { name: 'スコアシート' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'ホームへ戻る' })).toBeTruthy();
    });
});
