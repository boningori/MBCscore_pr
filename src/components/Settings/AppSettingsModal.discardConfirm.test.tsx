import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AppSettingsModal } from './AppSettingsModal';

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

const BACKUP_JSON = JSON.stringify({
    version: '2.0',
    exportDate: new Date().toISOString(),
    appName: 'MBCscore',
    data: { myTeams: [{ id: 't1', name: 'テストミニバス', players: [] }] },
});

/** ファイルを読み込ませて「復元待ち」の状態を作る */
async function makePendingImport(container: HTMLElement) {
    fireEvent.click(screen.getByRole('button', { name: /データ管理/ }));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([BACKUP_JSON], 'MBCscore_backup.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText('📋 インポート内容の確認');
}

describe('設定モーダル: 読み込み済みデータを抱えたまま閉じるとき', () => {
    it('インポート待ちが無ければそのまま閉じる', () => {
        const onClose = vi.fn();
        render(<AppSettingsModal isOpen onClose={onClose} />);

        fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('確認はネイティブのconfirmではなくアプリ内のダイアログで出す', async () => {
        // window.confirm はアプリの他の確認（DeleteConfirmModal 等）と作法が違い、
        // PWAでは出方も端末任せになる。ここだけOS標準が出るのを避ける
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const onClose = vi.fn();
        const { container } = render(<AppSettingsModal isOpen onClose={onClose} />);
        await makePendingImport(container);

        fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

        expect(confirmSpy).not.toHaveBeenCalled();
        // 確認を挟むので、この時点ではまだ閉じない
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByText(/破棄して閉じますか/)).toBeTruthy();
        confirmSpy.mockRestore();
    });

    it('確認で「破棄して閉じる」を選べば閉じる', async () => {
        const onClose = vi.fn();
        const { container } = render(<AppSettingsModal isOpen onClose={onClose} />);
        await makePendingImport(container);
        fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

        fireEvent.click(screen.getByRole('button', { name: '破棄して閉じる' }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('確認で打ち消せば閉じず、読み込んだ内容も残る', async () => {
        const onClose = vi.fn();
        const { container } = render(<AppSettingsModal isOpen onClose={onClose} />);
        await makePendingImport(container);
        fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

        fireEvent.click(screen.getByRole('button', { name: '編集に戻る' }));

        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByText('📋 インポート内容の確認')).toBeTruthy();
    });
});
