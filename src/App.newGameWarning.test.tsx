import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import App from './App';

// ホームメニューを表示させるためのマイチームデータ
const myTeam = {
    id: 'team-1',
    name: 'テストチーム',
    coachName: 'コーチ',
    assistantCoachName: '',
    players: Array.from({ length: 6 }, (_, i) => ({
        number: i + 4,
        name: `選手${i + 4}`,
        isCaptain: i === 0,
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    // 復元プロンプトをスキップ
    sessionStorage.setItem('mbc-restore-dismissed', '1');
});

afterEach(cleanup);

describe('App: 新規試合開始時のセッション上書き警告', () => {
    it('進行中セッションが無ければ警告なしで試合設定に進む', async () => {
        render(<App />);
        fireEvent.click(await screen.findByText('新規試合開始'));
        expect(await screen.findByText('基本情報')).toBeTruthy();
        expect(screen.queryByText('進行中の試合があります')).toBeNull();
    });

    it('進行中セッションがあると警告モーダルを表示し、すぐには設定に進まない', async () => {
        localStorage.setItem('minibasket-game-session', JSON.stringify({ game: {}, gameName: 'x', date: 'x', savedAt: 'x' }));
        render(<App />);
        fireEvent.click(await screen.findByText('新規試合開始'));
        expect(await screen.findByText('進行中の試合があります')).toBeTruthy();
        expect(screen.queryByText('基本情報')).toBeNull();
    });

    it('警告モーダルの「新規試合を開始」で試合設定に進む', async () => {
        localStorage.setItem('minibasket-game-session', JSON.stringify({ game: {}, gameName: 'x', date: 'x', savedAt: 'x' }));
        render(<App />);
        fireEvent.click(await screen.findByText('新規試合開始'));
        fireEvent.click(await screen.findByText('新規試合を開始'));
        expect(await screen.findByText('基本情報')).toBeTruthy();
    });

    it('警告モーダルの「キャンセル」でホームに留まる', async () => {
        localStorage.setItem('minibasket-game-session', JSON.stringify({ game: {}, gameName: 'x', date: 'x', savedAt: 'x' }));
        render(<App />);
        fireEvent.click(await screen.findByText('新規試合開始'));
        fireEvent.click(await screen.findByText('キャンセル'));
        expect(screen.queryByText('進行中の試合があります')).toBeNull();
        expect(await screen.findByText('新規試合開始')).toBeTruthy();
    });
});
