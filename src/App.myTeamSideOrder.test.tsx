import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
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

/** タブ名で選んで5名登録する（色ではなくチーム名で引く。色は入れ替わるため） */
function selectFiveOn(teamName: string, label: string) {
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(teamName) }));
    for (let n = 1; n <= 5; n++) {
        fireEvent.click(screen.getByRole('button', { name: new RegExp(`${label}${n}`) }));
    }
}

/**
 * ウィザードを通して記録画面まで進める。
 * swapColors=true でマイチームが青（＝teamB）になる。
 */
async function startGame(swapColors: boolean) {
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
    if (swapColors) {
        fireEvent.click(screen.getByRole('button', { name: /チームカラー入れ替え/ }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'スタメン選択へ' }));

    await screen.findByText('スタメン選択');
    selectFiveOn('ホームチーム', 'ホーム');
    selectFiveOn('アウェイチーム', 'アウェイ');
    fireEvent.click(screen.getByRole('button', { name: '試合開始' }));

    await waitFor(() => {
        expect(document.querySelectorAll('.team-panel').length).toBe(2);
    });
}

/** 記録画面の2つのチームパネルを、DOMに現れる順で返す */
function panelsInOrder(): string[] {
    return Array.from(document.querySelectorAll('.team-panel'))
        .map(el => el.getAttribute('data-team-id')!);
}

describe('記録画面: マイチームを左に固定する', () => {
    it('マイチームが青(teamB)でも先に描かれる', async () => {
        render(<App />);
        await startGame(true);

        expect(panelsInOrder()).toEqual(['teamB', 'teamA']);
        expect(document.querySelector('.team-panel')!.className).toContain('panel-left');
    });

    it('マイチームが白(teamA)なら従来どおり teamA が先', async () => {
        render(<App />);
        await startGame(false);

        expect(panelsInOrder()).toEqual(['teamA', 'teamB']);
        expect(document.querySelector('.team-panel')!.className).toContain('panel-left');
    });

    it('マイチーム側にだけ虹と読み上げラベルが付く', async () => {
        render(<App />);
        await startGame(true);

        const rainbow = document.querySelectorAll('.team-name.is-my-team');
        expect(rainbow).toHaveLength(1);
        expect(rainbow[0].textContent).toBe('ホームチーム');
        expect(rainbow[0].closest('.team-panel')!.getAttribute('data-team-id')).toBe('teamB');

        const srLabels = screen.getAllByText('マイチーム');
        // パネルヘッダーとスコアボードの2か所
        expect(srLabels).toHaveLength(2);
        srLabels.forEach(el => expect(el.className).toContain('sr-only'));
    });

    it('相手チーム側には虹が付かない', async () => {
        render(<App />);
        await startGame(true);

        const opponentPanel = document.querySelector('.team-panel[data-team-id="teamA"]')!;
        expect(opponentPanel.querySelector('.is-my-team')).toBeNull();
    });
});

/** 統計表示（📊トグル）の選手別スタッツパネルが、DOMに現れる順で返すチーム名 */
function statsPanelTitlesInOrder(): string[] {
    return Array.from(document.querySelectorAll('.stats-panel-title'))
        .map(el => el.textContent ?? '');
}

describe('試合中の統計表示: 選手別スタッツもマイチームを先にする', () => {
    it('マイチームが青(teamB)でも選手別スタッツが先に描かれる', async () => {
        render(<App />);
        await startGame(true);

        fireEvent.click(screen.getByRole('button', { name: 'チーム統計' }));

        expect(statsPanelTitlesInOrder()).toEqual(['ホームチーム 統計', 'アウェイチーム 統計']);
    });

    it('マイチームが白(teamA)なら従来どおり teamA が先', async () => {
        render(<App />);
        await startGame(false);

        fireEvent.click(screen.getByRole('button', { name: 'チーム統計' }));

        expect(statsPanelTitlesInOrder()).toEqual(['ホームチーム 統計', 'アウェイチーム 統計']);
    });
});
