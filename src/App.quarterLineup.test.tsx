import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import type { SavedTeam } from './utils/teamStorage';

// マイチーム（白）・対戦チーム（青）を試合設定ウィザードなしで即選択できるよう、
// マイチーム管理／対戦履歴のストレージへ直接投入する
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
    // 対戦履歴に投入しておくと、対戦チーム選択ステップで一覧から即選択できる
    localStorage.setItem('minibasket-opponent-teams', JSON.stringify([opponentTeam]));
    // 復元プロンプトをスキップ
    sessionStorage.setItem('mbc-restore-dismissed', '1');
});

afterEach(cleanup);

/** 選手カード（role=button）をクリックして5名選ぶ */
function selectFive(label: string) {
    for (let n = 1; n <= 5; n++) {
        fireEvent.click(screen.getByRole('button', { name: new RegExp(`${label}${n}`) }));
    }
}

describe('App: クォーター開始時のスタメン一括反映（白・青どちらからでも登録可）', () => {
    it('青タブから先に5名、続けて白タブで5名選んで開始すると、両チーム5名ずつが1回でコート上に反映される', async () => {
        const { container } = render(<App />);

        fireEvent.click(await screen.findByText('新規試合開始'));

        // Step1: 基本情報（日付は自動入力済みなのでそのまま次へ）
        await screen.findByText('基本情報');
        fireEvent.click(screen.getByRole('button', { name: '次へ' }));

        // Step2: マイチーム選択
        await screen.findByText('マイチーム選択');
        fireEvent.click(screen.getByText('ホームチーム'));

        // Step3: 出場選手確認（5名とも出場のままで次へ）
        await screen.findByText('出場選手確認');
        fireEvent.click(screen.getByRole('button', { name: '次へ' }));

        // Step4: 対戦チーム選択（対戦履歴から選択）
        await screen.findByText('対戦チームを選択');
        fireEvent.click(screen.getByText('アウェイチーム'));

        // Step5: 設定確認 → スタメン選択へ
        await screen.findByText('設定確認');
        fireEvent.click(screen.getByRole('button', { name: 'スタメン選択へ' }));

        // Q1スタメン選択画面。マイチーム(白)が既定タブだが、まず青タブへ切り替えて先に選ぶ
        await screen.findByText('スタメン選択');
        fireEvent.click(screen.getByRole('tab', { name: /青/ }));
        selectFive('アウェイ');

        // 片方だけでは開始できない（中間状態の確認）
        expect((screen.getByRole('button', { name: '試合開始' }) as HTMLButtonElement).disabled).toBe(true);

        fireEvent.click(screen.getByRole('tab', { name: /白/ }));
        selectFive('ホーム');

        const startBtn = screen.getByRole('button', { name: '試合開始' }) as HTMLButtonElement;
        expect(startBtn.disabled).toBe(false);
        fireEvent.click(startBtn);

        // ゲーム画面: 両チームとも5名ずつがコート上表示される（SET_TEAMSが1回で両チームに反映された証拠）
        await waitFor(() => {
            expect(container.querySelectorAll('.team-panel.team-a .mini-player-card').length).toBe(5);
        });
        expect(container.querySelectorAll('.team-panel.team-b .mini-player-card').length).toBe(5);

        // 選択した選手が実際にコート上表示に含まれる（白・青双方）
        expect(screen.getByRole('button', { name: /ホーム1/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /ホーム5/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /アウェイ1/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /アウェイ5/ })).toBeTruthy();
    });
});
