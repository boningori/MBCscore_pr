// タイムアウトのチップが指すピリオド。
//
// 記録は「いま進行中のピリオド」に付くが、クォーター終了直後（quarterEnd）は
// currentQuarter が既に次のピリオドを指している。チップも取り消しも
// currentQuarter を見ていたため、インターバル中は「まだ始まっていないピリオドの
// 残り1回」を出すことになり、直前のピリオドで押し間違えたタイムアウトは
// そのまま公式様式に印字されて二度と直せなかった。
//
// タイムアウトはアクション履歴に載らないので、このチップが唯一の訂正経路になる。

import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import type { SavedTeam } from './utils/teamStorage';

function makeTeam(id: string, name: string, label: string, startNumber: number): SavedTeam {
    return {
        id,
        name,
        coachName: 'コーチ',
        assistantCoachName: '',
        players: Array.from({ length: 5 }, (_, i) => ({
            number: startNumber + i,
            name: `${label}${i + 1}`,
            isCaptain: i === 0,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

const myTeam = makeTeam('team-1', 'ホームチーム', 'ホーム', 4);
const opponentTeam = makeTeam('team-2', 'アウェイチーム', 'アウェイ', 11);

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    localStorage.setItem('minibasket-opponent-teams', JSON.stringify([opponentTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
});

afterEach(cleanup);

function selectFive(label: string) {
    for (let n = 1; n <= 5; n++) {
        fireEvent.click(screen.getByRole('button', { name: new RegExp(`${label}${n}`) }));
    }
}

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
    selectFive('ホーム');
    fireEvent.click(screen.getByRole('tab', { name: /青/ }));
    selectFive('アウェイ');
    fireEvent.click(screen.getByRole('button', { name: '試合開始' }));
    await screen.findByText('Q1終了');
}

/** ホーム（白）側のタイムアウトを1つ記録する */
function recordHomeTimeout() {
    const chips = screen.getAllByRole('button', { name: 'タイムアウト' });
    fireEvent.click(chips[0]); // 上段＝白＝ホームチーム
    fireEvent.click(screen.getByRole('button', { name: '確定' }));
}

/** Q1を終えて、スタメン選択画面から記録画面へ戻る（インターバル中の記録画面） */
async function endQuarterAndReturn() {
    fireEvent.click(screen.getByText('Q1終了'));
    fireEvent.click(await screen.findByText('終了する'));
    await screen.findByText('スタメン選択');
    fireEvent.click(screen.getByRole('button', { name: '← 戻る' }));
    await screen.findByText('Q2へ');
}

describe('App: クォーター終了後のタイムアウト取り消し', () => {
    it('Q1のインターバル中も、Q1に記録したタイムアウトのチップが残る', async () => {
        render(<App />);
        await startGame();
        recordHomeTimeout();
        await waitFor(() => {
            expect(screen.getAllByRole('button', { name: /タイムアウトを取り消す/ }).length).toBe(1);
        });

        await endQuarterAndReturn();

        const chip = screen.getByRole('button', { name: /タイムアウトを取り消す/ }) as HTMLButtonElement;
        expect(chip.textContent).toContain('済');
        expect(chip.disabled).toBe(false);
    });

    it('インターバル中のチップは、どのピリオドを指しているかを名前で示す', async () => {
        // 記録画面の他の表示（TFバッジ）は次のピリオドを指している。
        // 何も言わないと、チップだけ前のピリオドを指していることが読み取れない
        render(<App />);
        await startGame();
        recordHomeTimeout();
        await endQuarterAndReturn();

        expect(screen.getByRole('button', { name: 'Q1のタイムアウトを取り消す' })).toBeTruthy();
    });

    it('取り消すとQ1の記録が消え、Q2開始後もチップは「残1」に戻る', async () => {
        render(<App />);
        await startGame();
        recordHomeTimeout();
        await endQuarterAndReturn();

        fireEvent.click(screen.getByRole('button', { name: /タイムアウトを取り消す/ }));
        // 確認モーダルは取り消す対象のピリオドを名指しする
        expect(screen.getByText(/ホームチーム の Q1 のタイムアウトを取り消します/)).toBeTruthy();
        // 終わったピリオドの取り消しは一方通行。「もう一度記録できます」のままだと、
        // やり直せると思って取り消してしまう
        expect(screen.getByText(/Q1は終了しているため、取り消すと記録し直せません/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '取り消す' }));

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /タイムアウトを取り消す/ })).toBeNull();
        });

        // Q2を開始すると、Q2ぶんの「残1」が両チームに出る
        fireEvent.click(screen.getByText('Q2へ'));
        await waitFor(() => {
            expect(screen.getAllByRole('button', { name: 'タイムアウト' }).length).toBe(2);
        });
    });

    it('インターバル中に新しいタイムアウトは記録させない', async () => {
        // インターバルにタイムアウトは取れない。記録していないチームのチップは
        // 出さず、押せるものを置かない
        render(<App />);
        await startGame();
        await endQuarterAndReturn();

        expect(screen.queryByRole('button', { name: 'タイムアウト' })).toBeNull();
        expect(screen.queryByRole('button', { name: /タイムアウトを取り消す/ })).toBeNull();
    });

    it('進行中は従来どおり、当該ピリオドを名前に付けずに扱える', async () => {
        render(<App />);
        await startGame();
        recordHomeTimeout();

        // 進行中のチップが指すのは「いまのピリオド」で曖昧さが無いため、名前は据え置く
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'タイムアウトを取り消す' })).toBeTruthy();
        });

        // 進行中なら取り消したぶんを入れ直せるので、案内も従来どおり
        fireEvent.click(screen.getByRole('button', { name: 'タイムアウトを取り消す' }));
        expect(screen.getByText('取り消すと、このクォーターにもう一度記録できます')).toBeTruthy();
    });
});
