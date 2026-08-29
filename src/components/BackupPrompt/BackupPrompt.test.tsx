import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { BackupPrompt } from './BackupPrompt';

afterEach(cleanup);

describe('BackupPrompt', () => {
    it('「今すぐ保存」でonBackupが呼ばれる', () => {
        const onBackup = vi.fn();
        const onDismiss = vi.fn();
        render(<BackupPrompt onBackup={onBackup} onDismiss={onDismiss} />);
        fireEvent.click(screen.getByRole('button', { name: /今すぐ保存/ }));
        expect(onBackup).toHaveBeenCalledTimes(1);
    });

    it('「あとで」でonDismissが呼ばれる', () => {
        const onBackup = vi.fn();
        const onDismiss = vi.fn();
        render(<BackupPrompt onBackup={onBackup} onDismiss={onDismiss} />);
        fireEvent.click(screen.getByRole('button', { name: /あとで/ }));
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });
});

// 督促の画面で失敗を握ると、バックアップが無いまま「保存した」と思わせる。
// 以前は App 側が `await shareBackup()` の戻り値を捨てていて、失敗しても
// 案内が黙って閉じていた。
describe('BackupPrompt: 保存に失敗したとき', () => {
    it('閉じずに、やり直せることを伝える', async () => {
        const onBackup = vi.fn(async () => false);
        const onDismiss = vi.fn();
        render(<BackupPrompt onBackup={onBackup} onDismiss={onDismiss} />);

        fireEvent.click(screen.getByRole('button', { name: /今すぐ保存/ }));

        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(onDismiss).not.toHaveBeenCalled();
        // もう一度押せる
        expect((screen.getByRole('button', { name: /今すぐ保存/ }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('成功したときは何も出さない（閉じるのは呼び出し側）', async () => {
        const onBackup = vi.fn(async () => true);
        render(<BackupPrompt onBackup={onBackup} onDismiss={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /今すぐ保存/ }));
        await waitFor(() => expect(onBackup).toHaveBeenCalled());

        expect(screen.queryByRole('alert')).toBeNull();
    });

    // 全データのJSON化と共有シートで数秒かかる。連打で二重に走らせない
    it('保存中は二重に走らせない', async () => {
        let resolve!: (v: boolean) => void;
        const onBackup = vi.fn(() => new Promise<boolean>(r => { resolve = r; }));
        render(<BackupPrompt onBackup={onBackup} onDismiss={vi.fn()} />);

        const save = screen.getByRole('button', { name: /今すぐ保存/ });
        fireEvent.click(save);
        await waitFor(() => expect(screen.getByRole('button', { name: /保存中/ })).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: /保存中/ }));

        expect(onBackup).toHaveBeenCalledTimes(1);
        resolve(true);
    });
});
