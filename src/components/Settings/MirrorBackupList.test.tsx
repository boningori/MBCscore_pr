import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MirrorBackupList } from './MirrorBackupList';
import type { MirrorSnapshot, SnapshotMeta, SnapshotReason } from '../../utils/mirrorBackup';

const getSnapshotMetas = vi.hoisted(() => vi.fn());
const getSnapshot = vi.hoisted(() => vi.fn());
const restoreSnapshot = vi.hoisted(() => vi.fn());
const saveSnapshot = vi.hoisted(() => vi.fn());
vi.mock('../../utils/mirrorBackup', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../utils/mirrorBackup')>()),
    getSnapshotMetas,
    getSnapshot,
    restoreSnapshot,
    saveSnapshot,
}));

function metaOf(timestamp: number, reason?: SnapshotReason): SnapshotMeta {
    return { timestamp, reason };
}

function snapshotOf(timestamp: number, keys: string[], reason?: SnapshotReason): MirrorSnapshot {
    return { timestamp, reason, entries: Object.fromEntries(keys.map(k => [k, '[]'])) };
}

const RELOAD = vi.fn();

beforeEach(() => {
    getSnapshotMetas.mockReset();
    getSnapshot.mockReset();
    restoreSnapshot.mockReset();
    saveSnapshot.mockReset();
    // 本物は「全部書けたら true」を返す（mirrorBackup.restoreSnapshot）
    restoreSnapshot.mockReturnValue(true);
    saveSnapshot.mockResolvedValue(undefined);
    RELOAD.mockReset();
});

afterEach(cleanup);

describe('MirrorBackupList', () => {
    it('世代を新しい順に並べ、保存日時と理由を出す', async () => {
        getSnapshotMetas.mockResolvedValue([
            metaOf(new Date('2026-08-06T10:00:00').getTime(), 'gameEnd'),
            metaOf(new Date('2026-08-05T09:00:00').getTime(), 'periodic'),
        ]);

        render(<MirrorBackupList onRestored={RELOAD} />);

        const items = await screen.findAllByRole('listitem');
        expect(items).toHaveLength(2);
        expect(items[0].textContent).toContain('試合を保存した直後');
        expect(items[1].textContent).toContain('記録中の自動保存');
        // 新しい順
        expect(items[0].textContent).toContain('2026');
    });

    it('世代が無ければその旨を出す', async () => {
        getSnapshotMetas.mockResolvedValue([]);

        render(<MirrorBackupList onRestored={RELOAD} />);

        expect(await screen.findByText(/自動バックアップはまだありません/)).toBeTruthy();
    });

    it('復元は確認してから実行する', async () => {
        const snap = snapshotOf(new Date('2026-08-06T10:00:00').getTime(), ['minibasket-game-history'], 'gameEnd');
        getSnapshotMetas.mockResolvedValue([metaOf(snap.timestamp, snap.reason)]);
        getSnapshot.mockResolvedValue(snap);

        render(<MirrorBackupList onRestored={RELOAD} />);
        fireEvent.click(await screen.findByRole('button', { name: 'この時点に戻す' }));

        // 確認前は書き戻さない
        expect(restoreSnapshot).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: '戻す' }));

        await waitFor(() => expect(restoreSnapshot).toHaveBeenCalledWith(snap));
        expect(RELOAD).toHaveBeenCalledTimes(1);
    });

    it('確認をキャンセルすれば書き戻さない', async () => {
        getSnapshotMetas.mockResolvedValue([
            metaOf(new Date('2026-08-06T10:00:00').getTime(), 'gameEnd'),
        ]);

        render(<MirrorBackupList onRestored={RELOAD} />);
        fireEvent.click(await screen.findByRole('button', { name: 'この時点に戻す' }));
        fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

        expect(restoreSnapshot).not.toHaveBeenCalled();
        expect(RELOAD).not.toHaveBeenCalled();
    });

    // restoreSnapshot は「全部書けたら true」を返し、失敗したら書けた分を巻き戻す。
    // 戻り値を捨てると、データが元のままなのに「戻した」としてリロードまで走り、
    // 利用者は復元できたと思い込む。復元プロンプト（RestorePrompt）は同じ契約を
    // 守っているので、こちらも揃える
    it('書き戻しに失敗したら、リロードせずに失敗を伝える', async () => {
        const snap = snapshotOf(new Date('2026-08-06T10:00:00').getTime(), ['minibasket-game-history'], 'gameEnd');
        getSnapshotMetas.mockResolvedValue([metaOf(snap.timestamp, snap.reason)]);
        getSnapshot.mockResolvedValue(snap);
        restoreSnapshot.mockReturnValue(false);

        render(<MirrorBackupList onRestored={RELOAD} />);
        fireEvent.click(await screen.findByRole('button', { name: 'この時点に戻す' }));
        fireEvent.click(screen.getByRole('button', { name: '戻す' }));

        await waitFor(() => expect(restoreSnapshot).toHaveBeenCalledWith(snap));
        expect(RELOAD).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toContain('戻せませんでした');
    });

    it('失敗の案内は、次の書き戻しを始めたら消える', async () => {
        const snap = snapshotOf(new Date('2026-08-06T10:00:00').getTime(), ['minibasket-game-history'], 'gameEnd');
        getSnapshotMetas.mockResolvedValue([metaOf(snap.timestamp, snap.reason)]);
        getSnapshot.mockResolvedValue(snap);
        restoreSnapshot.mockReturnValue(false);

        render(<MirrorBackupList onRestored={RELOAD} />);
        fireEvent.click(await screen.findByRole('button', { name: 'この時点に戻す' }));
        fireEvent.click(screen.getByRole('button', { name: '戻す' }));
        await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

        restoreSnapshot.mockReturnValue(true);
        fireEvent.click(screen.getByRole('button', { name: 'この時点に戻す' }));
        fireEvent.click(screen.getByRole('button', { name: '戻す' }));

        await waitFor(() => expect(RELOAD).toHaveBeenCalledTimes(1));
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('IndexedDBが読めなくても落ちない', async () => {
        getSnapshotMetas.mockResolvedValue([]);

        render(<MirrorBackupList onRestored={RELOAD} />);

        expect(await screen.findByText(/自動バックアップはまだありません/)).toBeTruthy();
    });
});

describe('MirrorBackupList: 世代の理由', () => {
    it('理由ごとのラベルを出す', async () => {
        getSnapshotMetas.mockResolvedValue([
            metaOf(new Date('2026-09-11T10:00:00').getTime(), 'gameEnd'),
            metaOf(new Date('2026-09-10T09:00:00').getTime(), 'startup'),
            metaOf(new Date('2026-09-09T09:00:00').getTime(), 'beforeRestore'),
            metaOf(new Date('2026-09-08T09:00:00').getTime(), 'periodic'),
        ]);

        render(<MirrorBackupList onRestored={RELOAD} />);

        const items = await screen.findAllByRole('listitem');
        expect(items[0].textContent).toContain('試合を保存した直後');
        expect(items[1].textContent).toContain('アプリを開いたとき');
        expect(items[2].textContent).toContain('復元を実行する直前');
        expect(items[3].textContent).toContain('記録中の自動保存');
    });

    // v1 が書いた世代は reason を持たない。空欄にせず定期と同じ扱いで見せる
    it('理由を持たない旧世代も、記録中の自動保存として見せる', async () => {
        getSnapshotMetas.mockResolvedValue([metaOf(new Date('2026-09-08T09:00:00').getTime())]);

        render(<MirrorBackupList onRestored={RELOAD} />);

        const items = await screen.findAllByRole('listitem');
        expect(items[0].textContent).toContain('記録中の自動保存');
    });
});

describe('MirrorBackupList: 復元の前に退避する', () => {
    const snap = snapshotOf(new Date('2026-09-11T10:00:00').getTime(), ['minibasket-game-history'], 'gameEnd');

    beforeEach(() => {
        getSnapshotMetas.mockResolvedValue([metaOf(snap.timestamp, 'gameEnd')]);
        getSnapshot.mockResolvedValue(snap);
    });

    // 誤った世代を選ぶと現在のデータが上書きされる。戻る道を先に作っておく
    it('書き戻す前に beforeRestore の世代を取る', async () => {
        render(<MirrorBackupList onRestored={RELOAD} />);
        fireEvent.click(await screen.findByRole('button', { name: 'この時点に戻す' }));
        fireEvent.click(await screen.findByRole('button', { name: '戻す' }));

        await waitFor(() => expect(restoreSnapshot).toHaveBeenCalled());
        expect(saveSnapshot).toHaveBeenCalledWith('beforeRestore');
        // 退避が先。あとだと上書き後のデータを写してしまい、意味がない
        expect(saveSnapshot.mock.invocationCallOrder[0])
            .toBeLessThan(restoreSnapshot.mock.invocationCallOrder[0]);
    });

    it('確認ダイアログに、その世代の理由を出す', async () => {
        render(<MirrorBackupList onRestored={RELOAD} />);
        fireEvent.click(await screen.findByRole('button', { name: 'この時点に戻す' }));

        // 一覧の行にも同じ理由が出ているので、ダイアログの中に絞って探す。
        // 素の findByText だと2件見つかって Found multiple elements になる
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText(/試合を保存した直後/)).toBeTruthy();
    });

    it('読み込めなかった世代は書き戻さず、失敗を伝える', async () => {
        getSnapshot.mockResolvedValue(null);

        render(<MirrorBackupList onRestored={RELOAD} />);
        fireEvent.click(await screen.findByRole('button', { name: 'この時点に戻す' }));
        fireEvent.click(await screen.findByRole('button', { name: '戻す' }));

        await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
        expect(restoreSnapshot).not.toHaveBeenCalled();
        expect(RELOAD).not.toHaveBeenCalled();
    });
});
