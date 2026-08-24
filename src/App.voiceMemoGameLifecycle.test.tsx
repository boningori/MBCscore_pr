import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { createInitialGame, createTeam, createPlayer } from './types/game';
import type { SavedTeam } from './utils/teamStorage';
import { VOICE_MEMO_STORAGE_KEY } from './utils/voiceMemoStorage';

// マイチーム（白）・対戦チーム（青）を試合設定ウィザードなしで即選択できるよう、
// マイチーム管理／対戦履歴のストレージへ直接投入する（App.quarterLineup.test.tsx と同じ手法）
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

/** 音声メモを1件、文字起こし済みとしてsessionStorageへ仕込む */
function seedVoiceMemo(quarter = 1) {
    sessionStorage.setItem(VOICE_MEMO_STORAGE_KEY, JSON.stringify([
        { id: 'vm-1', quarter, createdAt: 1000, status: 'done', text: '青5シュートミス' },
    ]));
}

function storedMemoCount(): number {
    const raw = sessionStorage.getItem(VOICE_MEMO_STORAGE_KEY);
    if (!raw) return 0;
    return JSON.parse(raw).length;
}

/** 進行中（Q2プレイ中）の中断セッションを仕込む（App.gameFinishSave.test.tsx と同じ手法） */
function seedPlayingSession() {
    const game = createInitialGame();
    game.phase = 'playing';
    game.currentQuarter = 2;
    game.teamA = { ...createTeam('teamA', 'テストチーム', 'コーチ'), players: [
        { ...createPlayer('teamA-player-0', 4, '選手4'), isOnCourt: true },
    ] };
    game.teamB = { ...createTeam('teamB', '相手チーム', '相手コーチ'), players: [
        { ...createPlayer('teamB-player-0', 5, '選手5'), isOnCourt: true },
    ] };
    sessionStorage.setItem(VOICE_MEMO_STORAGE_KEY, JSON.stringify([
        { id: 'vm-1', quarter: 2, createdAt: 1000, status: 'done', text: '青5シュートミス' },
    ]));
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game, gameName: '練習試合', date: '2026-08-06', savedAt: new Date().toISOString(),
    }));
}

/** 試合設定ウィザードを最後まで進めてQ1スタメン選択画面を表示する
 *（App.quarterLineup.test.tsx の proceedToLineup と同じ手順。
 *  handleGameSetupComplete はStep5の「スタメン選択へ」で呼ばれる） */
async function proceedToLineup() {
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
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    localStorage.setItem('minibasket-opponent-teams', JSON.stringify([opponentTeam]));
    // 復元プロンプトをスキップ
    sessionStorage.setItem('mbc-restore-dismissed', '1');
});

afterEach(cleanup);

describe('App: 音声メモの寿命は試合単位', () => {
    // ホームボタンは「中断」であって「破棄」ではない。中断中は同じ試合へ
    // 戻ってくる可能性があるため、音声メモも残っていなければならない
    it('試合中にホームボタンで戻っても（中断）、音声メモは消えない', async () => {
        seedPlayingSession();
        render(<App />);
        fireEvent.click(await screen.findByText('試合を再開'));

        fireEvent.click(await screen.findByRole('button', { name: 'ホームへ戻る' }));

        await screen.findByText('試合を再開');
        expect(storedMemoCount()).toBe(1);
    });

    // 新規試合を開始すると、それまでの試合セッションは別の試合に置き換わる。
    // 音声メモを持ち越すと、前の試合のプレーを今の試合のスタッツとして
    // 手入力してしまいかねない（クォーター番号も前の試合のまま表示され続ける）
    it('新規試合を開始すると、音声メモは消える', async () => {
        seedVoiceMemo();
        render(<App />);
        expect(storedMemoCount()).toBe(1);

        await proceedToLineup();

        expect(storedMemoCount()).toBe(0);
    });
});
