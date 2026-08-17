// 合計行のシュート表記だけが選手行と揃っていなかった。
//
// 選手行は formatShot を通していて、試投0なら「-」になる。ところが
// 合計行は made/attempt を直接書いていたため、誰も打っていない種別が
// 「0/0」と出ていた。3Pを使わない試合ではこの列がずっと 0/0 で埋まる。

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { StatsPanel } from './StatsPanel';
import { createPlayer } from '../../types/game';
import type { Player } from '../../types/game';

afterEach(cleanup);

function player(over: Partial<Player['stats']> = {}): Player {
    const p = createPlayer('p4', 4, '選手4');
    p.stats = { ...p.stats, ...over };
    return p;
}

const totalRow = () => document.querySelector('.stats-total') as HTMLElement;

describe('合計行のシュート表記', () => {
    it('試投が無い種別は「-」にする（0/0にしない）', () => {
        render(<StatsPanel players={[player({ twoPointMade: 2, twoPointAttempt: 5 })]} teamName="白チーム" />);

        expect(within(totalRow()).queryByText('0/0')).toBeNull();
        // 2P以外（3P・FT）は試投0なので「-」が2つ
        expect(within(totalRow()).getAllByText('-')).toHaveLength(2);
    });

    it('試投があれば従来どおり made/attempt を出す', () => {
        render(<StatsPanel players={[player({ twoPointMade: 2, twoPointAttempt: 5 })]} teamName="白チーム" />);

        expect(within(totalRow()).getByText('2/5')).toBeTruthy();
    });

    it('選手行と合計行で同じ書き方になる', () => {
        render(<StatsPanel players={[player({ freeThrowMade: 1, freeThrowAttempt: 3 })]} teamName="白チーム" />);

        const playerRow = screen.getByText('選手4').closest('.stats-row') as HTMLElement;
        const cells = (row: HTMLElement) =>
            [...row.querySelectorAll('.stats-col')].slice(1, 4).map(c => c.textContent);
        expect(cells(totalRow())).toEqual(cells(playerRow));
    });
});
