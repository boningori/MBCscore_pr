import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { Game } from '../../types/game';
import { createInitialGame, createTeam, createPlayer } from '../../types/game';
import { RunningScoresheet } from './RunningScoresheet';

const exportElement = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());
vi.mock('../../utils/pdfExport', () => ({
    exportElement,
    generateScoresheetFilename: () => 'sheet',
}));
vi.mock('../Toast/toastApi', () => ({ showToast }));

function makeGame(): Game {
    const game = createInitialGame();
    const teamA = createTeam('teamA', 'ホーム', 'コーチA');
    teamA.players = [createPlayer('a1', 4, '選手A1', true)];
    const teamB = createTeam('teamB', 'ビジター', 'コーチB');
    teamB.players = [createPlayer('b1', 5, '選手B1', true)];
    return { ...game, teamA, teamB };
}

function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

// jest-dom は導入していないため disabled は素のプロパティで確かめる
const pdfButton = () => screen.getByRole('button', { name: /PDF/ }) as HTMLButtonElement;
const jpegButton = () => screen.getByRole('button', { name: /JPEG/ }) as HTMLButtonElement;

beforeEach(() => {
    exportElement.mockReset();
    showToast.mockReset();
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('RunningScoresheet の出力操作', () => {
    it('出力中はPDF・JPEGの両方のボタンを押せなくする', async () => {
        // 出力は数秒かかる。押せたままだとhtml2canvasが並行して走り、
        // 大きなcanvasを二重に確保してタブレットのメモリを圧迫する
        const d = deferred<void>();
        exportElement.mockReturnValue(d.promise);
        render(<RunningScoresheet game={makeGame()} />);

        act(() => { pdfButton().click(); });

        await waitFor(() => expect(pdfButton().disabled).toBe(true));
        expect(jpegButton().disabled).toBe(true);

        await act(async () => { d.resolve(); await d.promise; });
        expect(pdfButton().disabled).toBe(false);
    });

    it('出力中であることを画面に示す', async () => {
        const d = deferred<void>();
        exportElement.mockReturnValue(d.promise);
        render(<RunningScoresheet game={makeGame()} />);

        act(() => { pdfButton().click(); });

        await waitFor(() => expect(screen.getByText(/出力中/)).toBeTruthy());

        await act(async () => { d.resolve(); await d.promise; });
    });

    it('出力に失敗したらエラーを知らせ、操作を再開できる', async () => {
        exportElement.mockRejectedValue(new Error('canvas allocation failed'));
        render(<RunningScoresheet game={makeGame()} />);

        await act(async () => { pdfButton().click(); });

        await waitFor(() => {
            expect(showToast).toHaveBeenCalledWith(expect.stringContaining('失敗'), 'error');
        });
        expect(pdfButton().disabled).toBe(false);
    });

    it('成功したら完了を知らせる', async () => {
        exportElement.mockResolvedValue(undefined);
        render(<RunningScoresheet game={makeGame()} />);

        await act(async () => { pdfButton().click(); });

        await waitFor(() => {
            expect(showToast).toHaveBeenCalledWith(expect.stringContaining('PDF'), 'success');
        });
    });
});
