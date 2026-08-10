import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PlayerCardList } from './PlayerCardList';
import type { PlayerStats } from '../../types/game';
import type { AggregatedPlayerStats } from '../../utils/playerStatsAnalysis';
import { makeAggregatedPlayer, makeStats } from '../../test/statsFactories';

function makePlayer(overrides: {
    totalStats?: Partial<PlayerStats>;
    gamesPlayed?: number;
    totalQuartersPlayed?: number;
} = {}): AggregatedPlayerStats {
    return makeAggregatedPlayer({
        name: '山田太郎',
        gamesPlayed: overrides.gamesPlayed ?? 4,
        totalQuartersPlayed: overrides.totalQuartersPlayed ?? 0,
        totalStats: makeStats(overrides.totalStats),
    });
}

afterEach(cleanup);

describe('選手カードのFG%', () => {
    // 単位を文字列の外に置いていたため、試投0の選手が「-%」と表示されていた
    it('シュート試投が0なら「-」だけを出す（-%にしない）', () => {
        render(<PlayerCardList players={[makePlayer()]} onPlayerClick={vi.fn()} />);

        expect(screen.getByText('-')).toBeTruthy();
        expect(screen.queryByText('-%')).toBeNull();
    });

    it('試投があれば百分率を出す', () => {
        render(
            <PlayerCardList
                players={[makePlayer({ totalStats: { twoPointMade: 3, twoPointAttempt: 6 } })]}
                onPlayerClick={vi.fn()}
            />,
        );

        expect(screen.getByText('50%')).toBeTruthy();
    });
});

describe('選手カードの平均出場クォーター', () => {
    it('出場クォーターが記録されていれば併記する', () => {
        render(
            <PlayerCardList
                players={[makePlayer({ gamesPlayed: 4, totalQuartersPlayed: 10 })]}
                onPlayerClick={vi.fn()}
            />,
        );

        expect(screen.getByText('平均2.5Q')).toBeTruthy();
    });

    // 旧データしか無い選手に 0.0Q と出すと「出ていない」と誤読される
    it('出場クォーターが未記録なら何も出さない', () => {
        render(
            <PlayerCardList
                players={[makePlayer({ gamesPlayed: 4, totalQuartersPlayed: 0 })]}
                onPlayerClick={vi.fn()}
            />,
        );

        expect(screen.queryByText(/平均.*Q/)).toBeNull();
    });
});
