import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { AppSettingsModal } from './AppSettingsModal';

// 復元パネルがトリガーボタンより「前」に描画されていると、スマホ幅では
// パネルが画面外（上）に挿入され、しかもスクロールアンカリングでボタンが
// 動かないため「押しても何も起こらない」ように見える。実測では375x812で
// 確認パネルがy=-455、インポート実行ボタンがy=-130と完全に画面外だった。
// jsdomではレイアウトを測れないため、原因であるDOM順序を直接固定する。

afterEach(cleanup);

beforeEach(() => {
    localStorage.clear();
});

/** a が b より後ろ（文書順）にあるか */
function isAfter(a: Element, b: Element): boolean {
    return (b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

const BACKUP_JSON = JSON.stringify({
    version: '2.0',
    exportDate: new Date().toISOString(),
    appName: 'MBCscore',
    data: {
        myTeams: [{ id: 't1', name: 'テストミニバス', players: [] }],
    },
});

describe('AppSettingsModal 復元UIの配置', () => {
    it('ファイル選択後、インポート確認パネルは「ファイルから復元」ボタンより後ろに出る', async () => {
        const { container } = render(<AppSettingsModal isOpen onClose={() => { }} />);

        const fileBtn = screen.getByRole('button', { name: /ファイルから復元/ });
        const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
        const file = new File([BACKUP_JSON], 'MBCscore_backup.json', { type: 'application/json' });

        fireEvent.change(input, { target: { files: [file] } });

        const panel = await screen.findByText('📋 インポート内容の確認');
        const panelRoot = panel.closest('.import-confirm-panel')!;

        expect(isAfter(panelRoot, fileBtn)).toBe(true);
    });

    it('「データを貼り付けて復元」押下後、貼り付けパネルはボタンより後ろに出る', async () => {
        const { container } = render(<AppSettingsModal isOpen onClose={() => { }} />);

        const pasteBtn = screen.getByRole('button', { name: /データを貼り付けて復元/ });
        fireEvent.click(pasteBtn);

        const panel = container.querySelector('.text-import-panel')!;
        expect(panel).toBeTruthy();
        expect(isAfter(panel, pasteBtn)).toBe(true);
    });

    it('復元パネルは表示時に自分をスクロール表示する', async () => {
        // scrollIntoView の空実装は src/test/setup.ts が入れている
        const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');

        const { container } = render(<AppSettingsModal isOpen onClose={() => { }} />);
        const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
        const file = new File([BACKUP_JSON], 'MBCscore_backup.json', { type: 'application/json' });

        fireEvent.change(input, { target: { files: [file] } });

        await screen.findByText('📋 インポート内容の確認');
        await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    });
});

describe('AppSettingsModal フッターの「保存」', () => {
    it('インポートと無関係であることが分かるラベルになっている', () => {
        render(<AppSettingsModal isOpen onClose={() => { }} />);
        // 「保存」だけだと復元の確定ボタンと誤読される
        expect(screen.getByRole('button', { name: '設定を保存' })).toBeTruthy();
    });

    it('インポート確認中に閉じようとすると破棄確認を出す', async () => {
        const onClose = vi.fn();
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

        const { container } = render(<AppSettingsModal isOpen onClose={onClose} />);
        const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
        const file = new File([BACKUP_JSON], 'MBCscore_backup.json', { type: 'application/json' });
        fireEvent.change(input, { target: { files: [file] } });
        await screen.findByText('📋 インポート内容の確認');

        fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

        expect(confirmSpy).toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        confirmSpy.mockRestore();
    });
});
