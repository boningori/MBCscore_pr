import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
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
    // 前のテストの履歴stateをリセット
    window.history.replaceState(null, '');
});

afterEach(cleanup);

describe('App: ブラウザ履歴と画面遷移の同期', () => {
    it('起動時にホーム画面を履歴stateへ記録する', async () => {
        render(<App />);
        await screen.findByText('新規試合開始');
        expect(window.history.state?.appScreen).toBe('home');
    });

    it('画面遷移で履歴エントリが追加される', async () => {
        render(<App />);
        fireEvent.click(await screen.findByText('マイチーム管理'));
        expect(await screen.findByText('+ 新規チーム作成')).toBeTruthy();
        expect(window.history.state?.appScreen).toBe('myTeamManager');
    });

    it('popstate（戻るボタン）で前の画面に戻る', async () => {
        render(<App />);
        fireEvent.click(await screen.findByText('マイチーム管理'));
        await screen.findByText('+ 新規チーム作成');

        fireEvent.popState(window, { state: { appScreen: 'home' } });

        expect(await screen.findByText('新規試合開始')).toBeTruthy();
    });

    it('popstateのstateが無い場合はホームへ戻る', async () => {
        render(<App />);
        fireEvent.click(await screen.findByText('マイチーム管理'));
        await screen.findByText('+ 新規チーム作成');

        fireEvent.popState(window, { state: null });

        expect(await screen.findByText('新規試合開始')).toBeTruthy();
    });

    it('表示できる試合がないのに試合画面へ戻ろうとした場合はホームを表示し履歴stateも修正する', async () => {
        render(<App />);
        await screen.findByText('新規試合開始');

        fireEvent.popState(window, { state: { appScreen: 'game' } });

        expect(await screen.findByText('新規試合開始')).toBeTruthy();
        expect(window.history.state?.appScreen).toBe('home');
    });

    it('アプリ内の戻るボタンで積んだ履歴エントリがポップされ、スタックが増え続けない', async () => {
        render(<App />);
        fireEvent.click(await screen.findByText('マイチーム管理'));
        await screen.findByText('+ 新規チーム作成');
        expect(window.history.state?.appScreen).toBe('myTeamManager');

        // 画面ごと抜ける戻るは行き先を名乗る（ホームへ帰る画面はどれも「← ホーム」）
        fireEvent.click(screen.getByRole('button', { name: '← ホーム' }));

        expect(await screen.findByText('新規試合開始')).toBeTruthy();
        // history.back()は非同期でエントリがポップされる
        await waitFor(() => expect(window.history.state?.appScreen).toBe('home'));
    });
});
