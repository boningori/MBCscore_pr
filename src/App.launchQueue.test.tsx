import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import App from './App';

// manifest の launch_handler は 'focus-existing'。既存ウィンドウにフォーカスを
// 戻すだけで navigate しないため、起動中にショートカットを押したときの遷移は
// launchQueue の consumer が担う。これが無いとショートカットが無反応になる。

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

/** App が登録した consumer を捕まえるためのスタブ */
function stubLaunchQueue() {
    let consumer: ((params: { targetURL: string }) => void) | null = null;
    (window as Window).launchQueue = {
        setConsumer: (c: (params: { targetURL: string }) => void) => {
            consumer = c;
        },
    };
    return {
        /** 起動中にショートカットが押された状況を再現する */
        launch(targetURL: string) {
            if (!consumer) throw new Error('consumerが登録されていない');
            act(() => consumer!({ targetURL }));
        },
        isRegistered: () => consumer !== null,
    };
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    // 復元プロンプトをスキップ
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    window.history.replaceState({}, '', '/MBCscore_pr/');
});

afterEach(() => {
    cleanup();
    delete (window as Window).launchQueue;
});

describe('App: 起動中のショートカット（launchQueue）', () => {
    it('consumerを登録する', async () => {
        const queue = stubLaunchQueue();
        render(<App />);
        await screen.findByText('新規試合開始');
        expect(queue.isRegistered()).toBe(true);
    });

    it('履歴ショートカットで履歴画面へ移る', async () => {
        const queue = stubLaunchQueue();
        render(<App />);
        await screen.findByText('新規試合開始');

        queue.launch('https://example.com/MBCscore_pr/?s=history');

        // 見出しで判定する。同名のホームのタイル文言と取り違えないため
        expect(await screen.findByRole('heading', { name: /試合履歴/ })).toBeTruthy();
    });

    it('スタッツショートカットで選手スタッツ画面へ移る', async () => {
        const queue = stubLaunchQueue();
        render(<App />);
        await screen.findByText('新規試合開始');

        queue.launch('https://example.com/MBCscore_pr/?s=playerStats');

        // 見出しは絵文字付き（📊 選手スタッツ分析）なので部分一致で見る
        expect(await screen.findByRole('heading', { name: /選手スタッツ分析/ })).toBeTruthy();
    });

    it('進行中セッションが無ければ新規試合ショートカットで試合設定へ進む', async () => {
        const queue = stubLaunchQueue();
        render(<App />);
        await screen.findByText('新規試合開始');

        queue.launch('https://example.com/MBCscore_pr/?s=newGame');

        expect(await screen.findByText('基本情報')).toBeTruthy();
        expect(screen.queryByText('進行中の試合があります')).toBeNull();
    });

    it('進行中セッションがあると新規試合ショートカットでも警告モーダルを出す（記録を勝手に消さない）', async () => {
        localStorage.setItem(
            'minibasket-game-session',
            JSON.stringify({ game: {}, gameName: 'x', date: 'x', savedAt: 'x' }),
        );
        const queue = stubLaunchQueue();
        render(<App />);
        await screen.findByText('新規試合開始');

        queue.launch('https://example.com/MBCscore_pr/?s=newGame');

        expect(await screen.findByText('進行中の試合があります')).toBeTruthy();
        expect(screen.queryByText('基本情報')).toBeNull();
    });

    it('未知の遷移先では画面を動かさない', async () => {
        const queue = stubLaunchQueue();
        render(<App />);
        await screen.findByText('新規試合開始');

        queue.launch('https://example.com/MBCscore_pr/?s=settings');

        expect(screen.getByText('新規試合開始')).toBeTruthy();
    });

    it('launchQueue非対応の環境でも落ちない', async () => {
        delete (window as Window).launchQueue;
        const onError = vi.fn();
        window.addEventListener('error', onError);

        render(<App />);

        expect(await screen.findByText('新規試合開始')).toBeTruthy();
        expect(onError).not.toHaveBeenCalled();
        window.removeEventListener('error', onError);
    });
});
