import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, within } from '@testing-library/react';
import { ShootingDonuts } from './ShootingDonuts';
import type { TeamTotals } from './teamTotals';

afterEach(cleanup);

function totals(over: Partial<TeamTotals> = {}): TeamTotals {
    return {
        points: 0, twoMade: 0, twoAttempt: 0, threeMade: 0, threeAttempt: 0,
        ftMade: 0, ftAttempt: 0, offensiveRebounds: 0, defensiveRebounds: 0,
        assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0,
        ...over,
    };
}

function donut(shot: string): HTMLElement {
    return document.querySelector(`[data-shot="${shot}"]`) as HTMLElement;
}

describe('ShootingDonuts', () => {
    it('2P・3P・FTの3つを出す', () => {
        render(<ShootingDonuts left={totals()} right={totals()} leftColor="#3b82f6" rightColor="#e2e8f0" threePointUnused={false} />);

        for (const shot of ['2P', '3P', 'FT']) expect(donut(shot)).toBeTruthy();
    });

    it('外周に左チーム、内周に右チームの成功率を持たせる', () => {
        render(
            <ShootingDonuts
                left={totals({ twoMade: 15, twoAttempt: 30 })}
                right={totals({ twoMade: 5, twoAttempt: 20 })}
                leftColor="#3b82f6" rightColor="#e2e8f0" threePointUnused={false}
            />,
        );

        const el = donut('2P');
        expect((el.querySelector('.donut-ring.outer') as HTMLElement).dataset.piePercent).toBe('50');
        expect((el.querySelector('.donut-ring.inner') as HTMLElement).dataset.piePercent).toBe('25');
    });

    it('中央に左右の成功率を出す', () => {
        render(
            <ShootingDonuts
                left={totals({ ftMade: 11, ftAttempt: 13 })}
                right={totals({ ftMade: 5, ftAttempt: 7 })}
                leftColor="#3b82f6" rightColor="#e2e8f0" threePointUnused={false}
            />,
        );

        const el = donut('FT');
        expect(within(el).getByText('84.6%')).toBeTruthy();
        expect(within(el).getByText('71.4%')).toBeTruthy();
    });

    // 数字を2段に並べるだけでは、どちらのチームのものか分からない。
    // リングと同じ色の点を添えて対応を示している
    it('中央の数字にリングと同じ色の点を添える', () => {
        render(
            <ShootingDonuts
                left={totals({ ftMade: 11, ftAttempt: 13 })}
                right={totals({ ftMade: 5, ftAttempt: 7 })}
                leftColor="#3b82f6" rightColor="#e2e8f0" threePointUnused={false}
            />,
        );

        const el = donut('FT');
        const leftDot = el.querySelector('.donut-percent.left .donut-dot') as HTMLElement;
        const rightDot = el.querySelector('.donut-percent.right .donut-dot') as HTMLElement;

        // 外周リング（左チーム）と内周リング（右チーム）の色にそれぞれ揃う
        expect(leftDot.style.backgroundColor).toBe('rgb(59, 130, 246)');
        expect(rightDot.style.backgroundColor).toBe('rgb(226, 232, 240)');
    });

    it('3P未使用の円には点を出さない', () => {
        render(
            <ShootingDonuts
                left={totals()} right={totals()}
                leftColor="#3b82f6" rightColor="#e2e8f0" threePointUnused
            />,
        );

        expect(donut('3P').querySelector('.donut-dot')).toBeNull();
    });

    it('試投0なら「-」を出して比率0にする', () => {
        render(<ShootingDonuts left={totals()} right={totals()} leftColor="#3b82f6" rightColor="#e2e8f0" threePointUnused={false} />);

        const el = donut('2P');
        expect((el.querySelector('.donut-ring.outer') as HTMLElement).dataset.piePercent).toBe('0');
        expect(within(el).getAllByText('-').length).toBe(2);
    });

    it('3P未使用なら円を描かず「未使用」と出す', () => {
        render(<ShootingDonuts left={totals()} right={totals()} leftColor="#3b82f6" rightColor="#e2e8f0" threePointUnused />);

        const el = donut('3P');
        expect(el.classList.contains('is-unavailable')).toBe(true);
        expect(within(el).getByText('未使用')).toBeTruthy();
        expect(el.querySelector('[data-pie-percent]')).toBeNull();
    });

    it('3P未使用でも2PとFTは通常どおり描く', () => {
        render(<ShootingDonuts left={totals({ twoMade: 1, twoAttempt: 2 })} right={totals()} leftColor="#3b82f6" rightColor="#e2e8f0" threePointUnused />);

        expect(donut('2P').querySelector('[data-pie-percent]')).toBeTruthy();
    });
});
