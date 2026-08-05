import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { act } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
    throw new Error('意図的な失敗');
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    // ReactはError Boundaryが拾った例外もconsole.errorへ出す。
    // 想定内なのでテスト出力を汚さないよう黙らせる
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => { });
    localStorage.clear();
});

afterEach(() => {
    consoleError.mockRestore();
    cleanup();
    vi.clearAllMocks();
});

function renderCrashed() {
    render(
        <ErrorBoundary>
            <Boom />
        </ErrorBoundary>
    );
}

describe('ErrorBoundary', () => {
    it('子が落ちたら復帰手段を示す', () => {
        renderCrashed();

        expect(screen.getByRole('button', { name: '再読み込み' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'エラー情報をコピー' })).toBeTruthy();
    });

    it('コピーの結果を画面内で知らせる（alertを使わない）', async () => {
        // この画面が出ている時点でAppは落ちており、ToastContainerも道連れで
        // 消えているため showToast は無反応になる。かといって alert は
        // アプリの他の通知と作法が違ううえ、PWAでは出方が端末任せになる。
        // 自前のUIの中で知らせるのが唯一この場面で確実に働く
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

        renderCrashed();
        await act(async () => {
            screen.getByRole('button', { name: 'エラー情報をコピー' }).click();
        });

        await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/コピーしました/));
        expect(alertSpy).not.toHaveBeenCalled();
        alertSpy.mockRestore();
    });

    it('コピーに失敗したら画面内でその旨を知らせる', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });
        const writeText = vi.fn().mockRejectedValue(new Error('denied'));
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

        renderCrashed();
        await act(async () => {
            screen.getByRole('button', { name: 'エラー情報をコピー' }).click();
        });

        await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/失敗/));
        expect(alertSpy).not.toHaveBeenCalled();
        alertSpy.mockRestore();
    });
});
