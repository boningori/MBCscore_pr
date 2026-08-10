import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Workload } from './Workload';
import { makeAggregatedPlayer, makeStats } from '../../test/statsFactories';

afterEach(cleanup);

describe('1クォーターあたり', () => {
    // 分子が全試合・分母が出場Q記録のある試合、と対象が食い違っていたため、
    // 出場Q未記録の試合の得点まで割られて必ず過大になっていた
    // （実測: 2Q出場10点＋Q未記録10点で 10.0点/Q）
    it('出場Qが記録された試合だけの累計で割る', () => {
        render(
            <Workload
                player={makeAggregatedPlayer({
                    gamesPlayed: 2,
                    totalQuartersPlayed: 2,
                    gamesWithQuarters: 1,
                    totalStats: makeStats({ points: 20 }),
                    statsWithQuarters: makeStats({ points: 10 }),
                })}
            />,
        );

        expect(screen.getByText('5.0')).toBeTruthy();
        expect(screen.queryByText('10.0')).toBeNull();
    });

    // 一部の試合しか対象になっていないことを言わないと、
    // 試合平均と並んだときに同じ母数だと誤読される
    it('対象になった試合数が全試合より少なければ注記する', () => {
        render(
            <Workload
                player={makeAggregatedPlayer({
                    gamesPlayed: 5,
                    totalQuartersPlayed: 4,
                    gamesWithQuarters: 2,
                    totalStats: makeStats({ points: 50 }),
                    statsWithQuarters: makeStats({ points: 20 }),
                })}
            />,
        );

        expect(screen.getByText(/5試合中2試合/)).toBeTruthy();
    });

    it('全試合に出場Qの記録があれば注記しない', () => {
        render(
            <Workload
                player={makeAggregatedPlayer({
                    gamesPlayed: 2,
                    totalQuartersPlayed: 4,
                    gamesWithQuarters: 2,
                    totalStats: makeStats({ points: 20 }),
                    statsWithQuarters: makeStats({ points: 20 }),
                })}
            />,
        );

        expect(screen.queryByText(/試合中/)).toBeNull();
    });

    it('出場Qの記録が1試合も無ければ何も出さない', () => {
        const { container } = render(
            <Workload
                player={makeAggregatedPlayer({
                    gamesPlayed: 3,
                    totalQuartersPlayed: 0,
                    gamesWithQuarters: 0,
                    totalStats: makeStats({ points: 30 }),
                })}
            />,
        );

        expect(container.querySelector('.workload-section')).toBeNull();
    });
});
