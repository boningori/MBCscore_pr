// 試合終了の確認モーダルが約束する内容。
//
// 以前は「試合を終了するとデータの編集ができません」と言っていたが、実際に止まるのは
// 記録を増やす操作だけで、アクション履歴からの訂正・削除は終了後も残してある
// （記録し終えてから気づく取り違えを、履歴ごと消さずに直せる唯一の手段のため）。
// 言い切ってしまうと、直せるのに諦めさせる。
//
// 文言と実装が食い違わないよう、両方をここで固定する。
// 「追加は止まる／訂正は残る」を変えるときは、この2つを対で見直すこと。

import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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

/** 第4Q進行中（＝終了ボタンを押せる状態）のセッションを仕込む */
function seedPlayingQ4() {
    const game = createInitialGame();
    game.phase = 'playing';
    game.currentQuarter = 4;
    game.teamA = {
        ...createTeam('teamA', 'テストチーム', 'コーチ'),
        players: [{ ...createPlayer('teamA-player-0', 4, '選手4'), isOnCourt: true }],
    };
    game.teamB = {
        ...createTeam('teamB', '相手チーム', '相手コーチ'),
        players: [{ ...createPlayer('teamB-player-0', 5, '選手5'), isOnCourt: true }],
    };
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game, gameName: '決勝戦', date: '2026-08-28', savedAt: new Date().toISOString(),
    }));
}

/** 試合を再開し、第4Q終了を押して確認モーダルを開く */
async function openEndGameConfirm() {
    render(<App />);
    fireEvent.click(await screen.findByText('試合を再開'));
    fireEvent.click(await screen.findByText(/第4Q終了|Q4終了/));
    return screen.findByText('試合終了の確認');
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    localStorage.setItem('minibasket-last-backup', JSON.stringify({ timestamp: Date.now(), gameCount: 1 }));
    window.history.replaceState(null, '');
    seedPlayingQ4();
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('試合終了の確認モーダルの文言', () => {
    it('止まるのは「新しい記録の追加」だと言う', async () => {
        await openEndGameConfirm();
        expect(screen.getByText(/新しい記録の追加はできません/)).toBeTruthy();
    });

    it('アクション履歴からの訂正・削除は続けられると添える', async () => {
        await openEndGameConfirm();
        expect(screen.getByText(/アクション履歴からの訂正・削除は続けられます/)).toBeTruthy();
    });

    // 実装が追いついていない約束を残さないための番人。
    // 終了後もできることまで「できません」と言うと、直せるのに諦めさせる
    it('「データの編集ができません」とは言わない', async () => {
        await openEndGameConfirm();
        expect(screen.queryByText(/データの編集ができません/)).toBeNull();
    });

    it('終了するか聞いたうえで、戻る道も残す', async () => {
        await openEndGameConfirm();
        expect(screen.getByText(/試合を終了しますか？/)).toBeTruthy();
        expect(screen.getByRole('button', { name: '試合を終了する' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '戻る' })).toBeTruthy();
    });
});

describe('試合終了後にできること・できないこと（文言の裏付け）', () => {
    /** 確認モーダルで終了まで進める */
    async function finishGame() {
        await openEndGameConfirm();
        fireEvent.click(screen.getByRole('button', { name: '試合を終了する' }));
        return screen.findByText('保存して終了');
    }

    it('記録を増やす操作は止まる（アクションボタン・選手カード・交代・ベンチファウル）', async () => {
        await finishGame();

        // 得点・スタッツ
        for (const label of ['2Pシュート', 'フリースロー']) {
            expect((screen.getAllByRole('button', { name: label })[0] as HTMLButtonElement).disabled).toBe(true);
        }
        // 選手カード
        expect((screen.getAllByRole('button', { name: /選手4/ })[0] as HTMLButtonElement).disabled).toBe(true);
        // ベンチ行（ここが抜けていて、終了後に最終スコアを動かせていた）
        for (const label of ['交代', /ベンチ\s*ファウル/]) {
            const buttons = screen.getAllByRole('button', { name: label }) as HTMLButtonElement[];
            expect(buttons.length).toBeGreaterThan(0);
            expect(buttons.every(b => b.disabled)).toBe(true);
        }
    });

    // 記録し終えてから気づく取り違えを直す唯一の手段。塞ぐと、履歴ごと
    // 作り直すしかなくなる
    it('アクション履歴は終了後も開ける（訂正・削除の入口が残る）', async () => {
        await finishGame();
        const historyButtons = screen.getAllByRole('button', { name: 'アクション履歴' }) as HTMLButtonElement[];
        expect(historyButtons.length).toBeGreaterThan(0);
        expect(historyButtons.every(b => b.disabled)).toBe(false);
    });
});
