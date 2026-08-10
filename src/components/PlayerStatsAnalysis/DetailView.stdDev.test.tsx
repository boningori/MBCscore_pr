import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DetailView } from './DetailView';
import type { AggregatedPlayerStats } from '../../utils/playerStatsAnalysis';
import { makeAggregatedPlayer, makeStats } from '../../test/statsFactories';

vi.mock('../../utils/pdfExport', () => ({ exportElement: vi.fn() }));
vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

// 「±は標準偏差（ばらつき）」と書いて数字を出す以上、2試合の差分を
// ばらつきとして見せるのは誤解を招く。試合数が足りないうちは出さない。

function makePlayer(gamesPlayed: number): AggregatedPlayerStats {
    return makeAggregatedPlayer({
        name: '山田太郎',
        gamesPlayed,
        totalStats: makeStats({ points: 10 * gamesPlayed }),
        avgStats: makeStats({ points: 10 }),
        stdDevStats: makeStats({ points: 3 }),
        reboundsStdDev: 1.5,
    });
}

afterEach(cleanup);

describe('試合平均の±（標準偏差）', () => {
    it('3試合以上なら表示する', () => {
        render(<DetailView player={makePlayer(3)} teamId="t" isHidden={false} onToggleHidden={vi.fn()} />);

        expect(screen.getByText('±3.0')).toBeTruthy();
        expect(screen.getByText('±は標準偏差（ばらつき）')).toBeTruthy();
    });

    it('2試合では表示しない', () => {
        render(<DetailView player={makePlayer(2)} teamId="t" isHidden={false} onToggleHidden={vi.fn()} />);

        expect(screen.queryByText(/^±/)).toBeNull();
    });

    it('2試合では見出しの注記も「±」の説明にしない', () => {
        render(<DetailView player={makePlayer(2)} teamId="t" isHidden={false} onToggleHidden={vi.fn()} />);

        expect(screen.queryByText('±は標準偏差（ばらつき）')).toBeNull();
        expect(screen.getByText(/3試合以上/)).toBeTruthy();
    });

    it('1試合でも落ちない', () => {
        render(<DetailView player={makePlayer(1)} teamId="t" isHidden={false} onToggleHidden={vi.fn()} />);

        expect(screen.queryByText(/^±/)).toBeNull();
    });
});
