import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { createInitialGame, createTeam, createPlayer } from './types/game';

const shareBackup = vi.hoisted(() => vi.fn(async () => true));
vi.mock('./utils/dataBackup', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./utils/dataBackup')>()),
    shareBackup,
}));

const myTeam = {
    id: 'team-1',
    name: 'テストチーム',
    coachName: 'コーチ',
    assistantCoachName: '',
    players: [{ number: 4, name: '選手4', isCaptain: true }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

/** 試合終了直後（保存待ち）の中断セッションを仕込む */
function seedFinishedSession(options: { endTime?: Date } = {}) {
    const game = createInitialGame();
    game.phase = 'finished';
    game.currentQuarter = 4;
    game.endTime = options.endTime ?? null;
    game.teamA = { ...createTeam('teamA', 'テストチーム', 'コーチ'), players: [
        { ...createPlayer('teamA-player-0', 4, '選手4'), isOnCourt: true },
    ] };
    game.teamB = { ...createTeam('teamB', '相手チーム', '相手コーチ'), players: [
        { ...createPlayer('teamB-player-0', 5, '選手5'), isOnCourt: true },
    ] };
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game, gameName: '決勝戦', date: '2026-08-06', savedAt: new Date().toISOString(),
    }));
}

/** ホーム→「試合を再開」で、試合終了オーバーレイまで進める */
async function openFinishedGame() {
    render(<App />);
    fireEvent.click(await screen.findByText('試合を再開'));
    return screen.findByText('保存して終了');
}

/** 進行中（Q2プレイ中）の中断セッションを仕込む */
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
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game, gameName: '練習試合', date: '2026-08-06', savedAt: new Date().toISOString(),
    }));
}

/** localStorage への書き込みを失敗させる */
function failStorageWrites() {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
    });
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    // 保存に成功するとバックアップ督促が全画面で挟まる（isBackupDue）。
    // ここで見たいのは保存とセッション削除の順序なので、督促は出ない状態にする
    localStorage.setItem('minibasket-last-backup', JSON.stringify({ timestamp: Date.now(), gameCount: 1 }));
    window.history.replaceState(null, '');
    shareBackup.mockClear();
    seedFinishedSession();
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('App: 試合終了時の保存', () => {
    it('保存できたら履歴に残り、中断セッションを消してホームへ戻る', async () => {
        fireEvent.click(await openFinishedGame());

        expect(await screen.findByText('新規試合開始')).toBeTruthy();
        expect(localStorage.getItem('minibasket-game-session')).toBeNull();
        const history = JSON.parse(localStorage.getItem('minibasket-game-history') ?? '[]');
        expect(history).toHaveLength(1);
        expect(history[0].gameName).toBe('決勝戦');
    });

    // 公式様式の「試合終了時間」は GameInfoModal で入れられ、試合中のスコアシートには
    // 出るのに、GameRecord に持ち場が無く保存で消えていた。履歴から出したPDFだけ
    // createdAt（保存を押した時刻）に化ける
    it('試合終了時間も履歴に残す', async () => {
        const endTime = new Date('2026-08-06T11:45:00');
        seedFinishedSession({ endTime });

        fireEvent.click(await openFinishedGame());

        await screen.findByText('新規試合開始');
        const history = JSON.parse(localStorage.getItem('minibasket-game-history') ?? '[]');
        expect(history[0].endTime).toBe(endTime.toISOString());
    });

    // 保存に失敗したのにセッションを消すと、履歴にもセッションにも残らない
    // 試合が生まれる。記録した1試合がまるごと消えるので、消す前に成否を見る
    it('保存に失敗したら中断セッションを消さない', async () => {
        const button = await openFinishedGame();
        failStorageWrites();

        fireEvent.click(button);

        await screen.findByText('試合を保存できませんでした');
        expect(localStorage.getItem('minibasket-game-session')).not.toBeNull();
    });

    it('保存に失敗したらホームへ戻らず、試合終了画面に留まる', async () => {
        const button = await openFinishedGame();
        failStorageWrites();

        fireEvent.click(button);

        await screen.findByText('試合を保存できませんでした');
        expect(screen.queryByText('新規試合開始')).toBeNull();
    });

    it('保存に失敗したらその場でバックアップを取れる', async () => {
        const button = await openFinishedGame();
        failStorageWrites();
        fireEvent.click(button);
        await screen.findByText('試合を保存できませんでした');

        fireEvent.click(screen.getByRole('button', { name: /バックアップ/ }));

        await waitFor(() => expect(shareBackup).toHaveBeenCalledTimes(1));
    });

    it('容量を空けてから再試行すれば保存できる', async () => {
        const button = await openFinishedGame();
        failStorageWrites();
        fireEvent.click(button);
        await screen.findByText('試合を保存できませんでした');

        // 利用者が他アプリのデータを消すなどして容量が空いた状況
        vi.restoreAllMocks();
        fireEvent.click(screen.getByRole('button', { name: 'もう一度保存する' }));

        expect(await screen.findByText('新規試合開始')).toBeTruthy();
        expect(localStorage.getItem('minibasket-game-session')).toBeNull();
        expect(JSON.parse(localStorage.getItem('minibasket-game-history') ?? '[]')).toHaveLength(1);
    });
});

describe('App: 保存せずに破棄', () => {
    // 確認ダイアログが「※この操作は取り消せません」と言う以上、
    // 中断セッションも消して本当に戻せなくする。残っていると
    // ホームの「試合を再開」から復活し、文言と挙動が食い違う
    it('破棄を確定したら中断セッションも消える', async () => {
        await openFinishedGame();

        fireEvent.click(screen.getByText('保存せずにホームへ'));
        fireEvent.click(await screen.findByText('保存せずに戻る'));

        expect(await screen.findByText('新規試合開始')).toBeTruthy();
        expect(localStorage.getItem('minibasket-game-session')).toBeNull();
        expect(JSON.parse(localStorage.getItem('minibasket-game-history') ?? '[]')).toHaveLength(0);
    });

    it('破棄をキャンセルしたら中断セッションは残る', async () => {
        await openFinishedGame();

        fireEvent.click(screen.getByText('保存せずにホームへ'));
        fireEvent.click(await screen.findByText('キャンセル'));

        expect(screen.getByText('保存して終了')).toBeTruthy();
        expect(localStorage.getItem('minibasket-game-session')).not.toBeNull();
    });

    // 破棄と違い、試合中のホームボタンは「中断」であって「破棄」ではない。
    // handleBackToHome は両方から呼ばれるので、消す処理を共通化しないこと
    it('試合中にホームボタンで戻っても中断セッションは残る', async () => {
        seedPlayingSession();
        render(<App />);
        fireEvent.click(await screen.findByText('試合を再開'));

        fireEvent.click(await screen.findByRole('button', { name: 'ホームへ戻る' }));

        expect(await screen.findByText('試合を再開')).toBeTruthy();
        expect(localStorage.getItem('minibasket-game-session')).not.toBeNull();
    });
});
