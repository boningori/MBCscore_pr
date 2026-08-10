import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { AggregatedPlayerStats } from '../../utils/playerStatsAnalysis';
import { makeAggregatedPlayer } from '../../test/statsFactories';
import { DetailView } from './DetailView';

const exportElement = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());
vi.mock('../../utils/pdfExport', () => ({ exportElement }));
vi.mock('../Toast/toastApi', () => ({ showToast }));

function makePlayer(): AggregatedPlayerStats {
    return makeAggregatedPlayer({ name: '選手A1', gamesPlayed: 3 });
}

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>(res => { resolve = res; });
    return { promise, resolve };
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

describe('DetailView の出力操作', () => {
    it('出力中は両方の出力ボタンを押せなくする', async () => {
        const d = deferred<void>();
        exportElement.mockReturnValue(d.promise);
        render(<DetailView player={makePlayer()} teamId="teamA" isHidden={false} onToggleHidden={() => { }} />);

        act(() => { pdfButton().click(); });

        await waitFor(() => expect(pdfButton().disabled).toBe(true));
        expect(jpegButton().disabled).toBe(true);

        await act(async () => { d.resolve(); await d.promise; });
        expect(pdfButton().disabled).toBe(false);
    });

    it('出力に失敗したらエラーを知らせる', async () => {
        exportElement.mockRejectedValue(new Error('canvas allocation failed'));
        render(<DetailView player={makePlayer()} teamId="teamA" isHidden={false} onToggleHidden={() => { }} />);

        await act(async () => { pdfButton().click(); });

        await waitFor(() => {
            expect(showToast).toHaveBeenCalledWith(expect.stringContaining('失敗'), 'error');
        });
        expect(pdfButton().disabled).toBe(false);
    });
});
