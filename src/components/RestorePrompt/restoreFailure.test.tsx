// 復元に失敗したとき、画面上は「復元する」を押しても何も起きなかった。
// restoreSnapshot の戻り値を見ず、例外はイベントハンドラ内なので
// ErrorBoundary にも拾われないため、無反応のまま利用者が取り残される。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { RestorePrompt } from './RestorePrompt';
import * as mirrorBackup from '../../utils/mirrorBackup';
import type { MirrorSnapshot } from '../../utils/mirrorBackup';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

const snapshot: MirrorSnapshot = {
    timestamp: Date.now(),
    entries: { 'minibasket-my-teams': '[]' },
};

function renderPrompt() {
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
        ...window.location, reload,
    } as unknown as Location);
    render(<RestorePrompt snapshot={snapshot} onDismiss={vi.fn()} />);
    return reload;
}

describe('RestorePrompt: 復元に失敗したとき', () => {
    it('失敗を画面に伝える', () => {
        vi.spyOn(mirrorBackup, 'restoreSnapshot').mockReturnValue(false);
        renderPrompt();

        fireEvent.click(screen.getByRole('button', { name: '復元する' }));

        expect(screen.getByText(/復元できませんでした/)).toBeTruthy();
    });

    it('失敗したらリロードしない', () => {
        vi.spyOn(mirrorBackup, 'restoreSnapshot').mockReturnValue(false);
        const reload = renderPrompt();

        fireEvent.click(screen.getByRole('button', { name: '復元する' }));

        expect(reload).not.toHaveBeenCalled();
    });

    it('成功したらリロードする', () => {
        vi.spyOn(mirrorBackup, 'restoreSnapshot').mockReturnValue(true);
        const reload = renderPrompt();

        fireEvent.click(screen.getByRole('button', { name: '復元する' }));

        expect(reload).toHaveBeenCalledTimes(1);
        expect(screen.queryByText(/復元できませんでした/)).toBeNull();
    });
});
