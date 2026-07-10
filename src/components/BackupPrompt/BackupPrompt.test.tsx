import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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
