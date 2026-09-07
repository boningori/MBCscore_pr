// App レベルで交代そのものを主題にしたテストが無かった。
// 一括交代は onSubstitute を人数分呼ぶ作りなので、その展開が
// 実際に reducer まで届いてコート上の5人が入れ替わることを通しで確かめる
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import App from './App';
import type { SavedTeam } from './utils/teamStorage';

function makeTeam(id: string, name: string, label: string, startNumber: number, count: number): SavedTeam {
    return {
        id,
        name,
        coachName: 'コーチ',
        assistantCoachName: '',
        players: Array.from({ length: count }, (_, i) => ({
            number: startNumber + i,
            name: `${label}${i + 1}`,
            isCaptain: i === 0,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

// 9人にしておく。10人にすると `ホーム1` が `ホーム10` にも部分一致して
// getByRole が「複数見つかった」で落ちる
const myTeam = makeTeam('team-1', 'ホームチーム', 'ホーム', 4, 9);
const opponentTeam = makeTeam('team-2', 'アウェイチーム', 'アウェイ', 20, 5);

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    localStorage.setItem('minibasket-opponent-teams', JSON.stringify([opponentTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
});

afterEach(cleanup);

/** 試合設定ウィザードを進めてQ1を開始する */
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

    // 白: ホーム1〜5、青: アウェイ1〜5 をスタメンにする
    for (const label of ['ホーム', 'アウェイ']) {
        if (label === 'アウェイ') {
            fireEvent.click(screen.getByRole('tab', { name: /青/ }));
        }
        for (let n = 1; n <= 5; n++) {
            fireEvent.click(screen.getByRole('button', { name: new RegExp(`${label}${n}`) }));
        }
    }
    fireEvent.click(screen.getByRole('button', { name: '試合開始' }));
    await waitFor(() => {
        expect(document.querySelector('.team-panel.team-a .mini-player-card')).toBeTruthy();
    });
}

describe('App: 複数人の一括交代', () => {
    it('3人まとめて交代すると、コート上の5人が正しく入れ替わる', async () => {
        const { container } = render(<App />);
        await startGame();

        // 自チームの交代モーダルを開く
        fireEvent.click(screen.getAllByRole('button', { name: /交代/ })[0]);
        await screen.findByText(/選手交代/);

        // モーダル内に絞る。コート上の選手（ホーム1〜3）はモーダルの外の
        // team-panel にも同じ名前のボタンがあり、screen だけで探すと
        // 「複数見つかった」で落ちる
        const modal = screen.getByRole('dialog');

        // コートから3人、ベンチから3人
        for (const name of ['ホーム1', 'ホーム2', 'ホーム3', 'ホーム6', 'ホーム7', 'ホーム8']) {
            fireEvent.click(within(modal).getByRole('button', { name: new RegExp(name) }));
        }

        const confirm = within(modal).getByRole('button', { name: '交代実行' }) as HTMLButtonElement;
        expect(confirm.disabled).toBe(false);
        fireEvent.click(confirm);

        // 案内が3人分をまとめて伝える
        expect(document.querySelector('.substitution-note-sub')?.textContent)
            .toContain('3人交代しました');

        fireEvent.click(within(modal).getByRole('button', { name: '完了' }));

        // コート上は5人のまま。入った3人が居て、下がった3人は居ない
        await waitFor(() => {
            expect(container.querySelectorAll('.team-panel.team-a .mini-player-card').length).toBe(5);
        });
        const courtText = container.querySelector('.team-panel.team-a')!.textContent ?? '';
        for (const stillIn of ['ホーム4', 'ホーム5', 'ホーム6', 'ホーム7', 'ホーム8']) {
            expect(courtText).toContain(stillIn);
        }
        for (const out of ['ホーム1', 'ホーム2', 'ホーム3']) {
            expect(courtText).not.toContain(out);
        }
    });
});
