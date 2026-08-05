import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import type { SavedTeam } from './utils/teamStorage';

function makeTeam(id: string, name: string, label: string, startNumber: number): SavedTeam {
    return {
        id, name, coachName: 'コーチ', assistantCoachName: '',
        players: Array.from({ length: 5 }, (_, i) => ({
            number: startNumber + i, name: `${label}${i + 1}`, isCaptain: i === 0,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

const myTeam = makeTeam('team-1', 'ホームチーム', 'ホーム', 4);
const opponentTeam = makeTeam('team-2', 'アウェイチーム', 'アウェイ', 11);

const release = vi.fn(async () => { });
const request = vi.fn(async () => ({
    released: false,
    release,
    addEventListener: () => { },
    removeEventListener: () => { },
}));

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    localStorage.setItem('minibasket-opponent-teams', JSON.stringify([opponentTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    request.mockClear();
    release.mockClear();
    Object.defineProperty(navigator, 'wakeLock', {
        value: { request }, configurable: true, writable: true,
    });
});

afterEach(cleanup);

function selectFive(label: string) {
    for (let n = 1; n <= 5; n++) {
        fireEvent.click(screen.getByRole('button', { name: new RegExp(`${label}${n}`) }));
    }
}

async function startGame() {
    fireEvent.click(await screen.findByText('新規試合開始'));
    await screen.findByText('基本情報');
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    await screen.findByText('マイチーム選択');
    fireEvent.click(screen.getByText('ホームチーム'));
    await screen.findByText('出場選手確認');
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    await screen.findByText('対戦チームを選択');
    fireEvent.click(screen.getByText('アウェイチーム'));
    await screen.findByText('設定確認');
    fireEvent.click(screen.getByRole('button', { name: 'スタメン選択へ' }));
    await screen.findByText('スタメン選択');
    selectFive('ホーム');
    fireEvent.click(screen.getByRole('tab', { name: /青/ }));
    selectFive('アウェイ');
    fireEvent.click(screen.getByRole('button', { name: '試合開始' }));
}

describe('App: 記録中の画面スリープ抑止', () => {
    it('ホーム画面では画面を点けっぱなしにしない', async () => {
        render(<App />);
        await screen.findByText('新規試合開始');
        expect(request).not.toHaveBeenCalled();
    });

    it('試合画面に入ったら画面を点けたままにする', async () => {
        const { container } = render(<App />);
        await startGame();

        await waitFor(() => {
            expect(container.querySelectorAll('.team-panel.team-a .mini-player-card').length).toBe(5);
        });
        await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    });

    it('ホームへ戻ったら解放する', async () => {
        const { container } = render(<App />);
        await startGame();
        await waitFor(() => {
            expect(container.querySelectorAll('.team-panel.team-a .mini-player-card').length).toBe(5);
        });
        await waitFor(() => expect(request).toHaveBeenCalled());

        fireEvent.click(screen.getByRole('button', { name: 'ホームへ戻る' }));

        await waitFor(() => expect(release).toHaveBeenCalled());
    });
});
