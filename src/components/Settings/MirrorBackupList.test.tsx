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

    it('IndexedDBが読めなくても落ちない', async () => {
        getAllSnapshots.mockResolvedValue([]);

        render(<MirrorBackupList onRestored={RELOAD} />);

        expect(await screen.findByText(/自動バックアップはまだありません/)).toBeTruthy();
    });
});
