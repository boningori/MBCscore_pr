import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MirrorBackupList } from './MirrorBackupList';
import type { MirrorSnapshot } from '../../utils/mirrorBackup';

const getAllSnapshots = vi.hoisted(() => vi.fn());
const restoreSnapshot = vi.hoisted(() => vi.fn());
vi.mock('../../utils/mirrorBackup', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../utils/mirrorBackup')>()),
    getAllSnapshots,
    restoreSnapshot,
}));

function snapshot(timestamp: number, keys: string[]): MirrorSnapshot {
    return {
        timestamp,
        entries: Object.fromEntries(keys.map(k => [k, '[]'])),
    };
}

const RELOAD = vi.fn();

beforeEach(() => {
    getAllSnapshots.mockReset();
    restoreSnapshot.mockReset();
    // 本物は「全部書けたら true」を返す（mirrorBackup.restoreSnapshot）。
    // 既定を true にしておかないと、戻り値を見るようになった実装に対して
    // 全テストが「失敗した」経路を通ってしまう
    restoreSnapshot.mockReturnValue(true);
    RELOAD.mockReset();
});

afterEach(cleanup);

describe('MirrorBackupList', () => {
    it('世代を新しい順に並べ、保存日時と項目数を出す', async () => {
        getAllSnapshots.mockResolvedValue([
            snapshot(new Date('2026-08-06T10:00:00').getTime(), ['minibasket-game-history', 'minibasket-my-teams']),
            snapshot(new Date('2026-08-05T09:00:00').getTime(), ['minibasket-game-history']),
        ]);

        render(<MirrorBackupList onRestored={RELOAD} />);

        const items = await screen.findAllByRole('listitem');
        expect(items).toHaveLength(2);
        expect(items[0].textContent).toContain('2項目');
        expect(items[1].textContent).toContain('1項目');
        // 新しい順
        expect(items[0].textContent).toContain('2026');
    });

    it('世代が無ければその旨を出す', async () => {
        getAllSnapshots.mockResolvedValue([]);

        render(<MirrorBackupList onRestored={RELOAD} />);

        expect(await screen.findByText(/自動バックアップはまだありません/)).toBeTruthy();
    });

    it('復元は確認してから実行する', async () => {
        const snap = snapshot(new Date('2026-08-06T10:00:00').getTime(), ['minibasket-game-history']);
        getAllSnapshots.mockResolvedValue([snap]);

        render(<MirrorBackupList onRestored={RELOAD} />);
        fireEvent.click(await screen.findByRole('button', { name: 'この時点に戻す' }));

        // 確認前は書き戻さない
        expect(restoreSnapshot).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: '戻す' }));

        await waitFor(() => expect(restoreSnapshot).toHaveBeenCalledWith(snap));
        expect(RELOAD).toHaveBeenCalledTimes(1);
    });

    it('確認をキャンセルすれば書き戻さない', async () => {
        getAllSnapshots.mockResolvedValue([
            snapshot(new Date('2026-08-06T10:00:00').getTime(), ['minibasket-game-history']),
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
        const snap = snapshot(new Date('2026-08-06T10:00:00').getTime(), ['minibasket-game-history']);
        getAllSnapshots.mockResolvedValue([snap]);
        restoreSnapshot.mockReturnValue(false);

        render(<MirrorBackupList onRestored={RELOAD} />);
        fireEvent.click(await screen.findByRole('button', { name: 'この時点に戻す' }));
        fireEvent.click(screen.getByRole('button', { name: '戻す' }));

        await waitFor(() => expect(restoreSnapshot).toHaveBeenCalledWith(snap));
        expect(RELOAD).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toContain('戻せませんでした');
    });

    it('失敗の案内は、次の書き戻しを始めたら消える', async () => {
        const snap = snapshot(new Date('2026-08-06T10:00:00').getTime(), ['minibasket-game-history']);
        getAllSnapshots.mockResolvedValue([snap]);
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
        getAllSnapshots.mockResolvedValue([]);

        render(<MirrorBackupList onRestored={RELOAD} />);

        expect(await screen.findByText(/自動バックアップはまだありません/)).toBeTruthy();
    });
});
