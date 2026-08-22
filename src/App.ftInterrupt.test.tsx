// FT入力中の中断を通しで見る。
//
// 単体テストではコールバックが呼ばれることまでしか見えない。ここで見たいのは
// 「重なり順」と「入力が残ること」。オーバーレイの z-index は全て 1000 で、
// どちらが上かは DOM の並び順だけで決まるため、App の JSX の並びが崩れると
// 交代モーダルがファウル入力の下に潜って操作できなくなる。

import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import App from './App';
import { createInitialGame, createTeam, createPlayer } from './types/game';

const myTeam = {
    id: 'team-1',
    name: 'テストチーム',
    coachName: 'コーチ',
    assistantCoachName: '',
    players: [{ number: 4, name: '選手4', isCaptain: true }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

/** 進行中の試合。teamA は既に4チームファウル＝次のPからペナルティ（FT2本） */
function seedPlayingSession() {
    const game = createInitialGame();
    game.phase = 'playing';
    game.currentQuarter = 1;
    game.teamA = {
        ...createTeam('teamA', 'テストチーム', 'コーチ'),
        players: [{ ...createPlayer('teamA-player-0', 4, '選手4'), isOnCourt: true }],
        teamFouls: [4, 0, 0, 0],
    };
    game.teamB = {
        ...createTeam('teamB', '相手チーム', '相手コーチ'),
        players: [
            { ...createPlayer('teamB-player-0', 5, '選手5'), isOnCourt: true },
            { ...createPlayer('teamB-player-1', 6, '選手6'), isOnCourt: false },
        ],
    };
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game, gameName: '第1節', date: '2026-08-22', savedAt: new Date().toISOString(),
    }));
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    seedPlayingSession();
    window.history.replaceState(null, '');
});

afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    cleanup();
});

/**
 * 中断ブロックのチーム選択ボタンを押す。
 * チーム名はスコアボードのラベルにも出ているので、画面全体から探すと
 * 別の要素を掴んでしまう。中断ブロックの中だけを見る
 */
function clickInterruptTeam(name: string) {
    const select = document.querySelector('.interrupt-team-select') as HTMLElement;
    fireEvent.click(within(select).getByText(name));
}

/** 試合を再開し、選手4のファウル→シューター選択→FT結果入力まで進める */
async function goToFtResult() {
    render(<App />);
    fireEvent.click(await screen.findByText('試合を再開'));
    fireEvent.click(await screen.findByLabelText(/#4 選手4/));
    fireEvent.click(await screen.findByText('ファウル'));
    fireEvent.keyDown(screen.getByText('パーソナルファウル').closest('button')!, { key: 'Enter' });
    fireEvent.click(await screen.findByText('選手5'));
    fireEvent.click(screen.getByText('次へ'));
    expect(screen.getByText('シューター: #5 選手5')).toBeTruthy();
}

describe('FT入力中の中断（App 通し）', () => {
    it('交代モーダルがファウル入力より後ろに描画される（上に重なる）', async () => {
        await goToFtResult();
        fireEvent.click(screen.getByText('🔄 選手交代'));
        clickInterruptTeam('相手チーム');

        const foulOverlay = document.querySelector('.foul-input-flow-overlay')!;
        const subModal = document.querySelector('.substitution-modal')!;
        expect(foulOverlay).toBeTruthy();
        expect(subModal).toBeTruthy();
        // 交代モーダルが DOM 上で後 ＝ 同じ z-index でも上に来る
        const position = foulOverlay.compareDocumentPosition(subModal);
        expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('タイムアウトモーダルもファウル入力より後ろに描画される', async () => {
        await goToFtResult();
        fireEvent.click(screen.getByText('⏱ タイムアウト'));
        clickInterruptTeam('テストチーム');

        const foulOverlay = document.querySelector('.foul-input-flow-overlay')!;
        const timeoutOverlay = document.querySelector('.timeout-modal-overlay')!;
        expect(timeoutOverlay).toBeTruthy();
        const position = foulOverlay.compareDocumentPosition(timeoutOverlay);
        expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('交代を実行して閉じた後、FT入力の状態が残りシューター候補が更新される', async () => {
        await goToFtResult();
        fireEvent.click(screen.getAllByText('○ 成功')[0]);
        expect(screen.getByText('結果: 1/2 成功 (+1点)')).toBeTruthy();

        fireEvent.click(screen.getByText('🔄 選手交代'));
        clickInterruptTeam('相手チーム');

        // 交代モーダルの中だけを見る。選手名は選手カードにも出るため、
        // 画面全体から探すと別の要素を掴む
        const modal = within(document.querySelector('.substitution-modal') as HTMLElement);
        fireEvent.click(modal.getByText('選手5'));  // OUT
        fireEvent.click(modal.getByText('選手6'));  // IN
        fireEvent.click(modal.getByText('交代実行'));
        // 交代してもモーダルは閉じない仕様なので、明示的に閉じる
        fireEvent.click(modal.getByLabelText('閉じる'));

        // FT結果入力に戻り、1本目の入力が残っている
        expect(screen.getByText('結果: 1/2 成功 (+1点)')).toBeTruthy();
        // シューターが下がったので注意が出る
        expect(screen.getByText(/シューターが交代でコートを離れました/)).toBeTruthy();
        expect(screen.getByText('シューター: #5 選手5')).toBeTruthy();
    });

    it('ベンチファウルの入力からでも交代モーダルが上に重なる', async () => {
        render(<App />);
        fireEvent.click(await screen.findByText('試合を再開'));
        // teamA（テストチーム）のベンチファウル
        fireEvent.click(screen.getAllByText('ベンチファウル')[0]);
        fireEvent.click(await screen.findByText('コーチ (C)'));
        // benchFoulMode はシューター選択から始まる（FT1本）
        fireEvent.click(await screen.findByText('選手5'));

        expect(screen.getByText('試合の中断')).toBeTruthy();
        fireEvent.click(screen.getByText('🔄 選手交代'));
        clickInterruptTeam('相手チーム');

        const foulOverlay = document.querySelector('.foul-input-flow-overlay')!;
        const subModal = document.querySelector('.substitution-modal')!;
        expect(subModal).toBeTruthy();
        // ここが Step 6 の並び替えで守りたいところ。
        // 並びが元のままだと交代モーダルがファウル入力の下に潜る
        const position = foulOverlay.compareDocumentPosition(subModal);
        expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
});
