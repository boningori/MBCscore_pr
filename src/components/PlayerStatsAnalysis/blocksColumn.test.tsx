// 「試合別詳細」にブロックの列が無かった。
//
// 同じ画面の「パフォーマンス」「累計記録」「推移グラフ」にはブロックが出るのに、
// 表だけ PTS/REB/AST/STL で止まっていて、どの試合のブロックだったのかを
// 遡れなかった。STLと対になる守備の記録なので、片方だけ落とす理由がない。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { DetailView } from './DetailView';
import { makeAggregatedPlayer, makeGameRecord, makeStats } from '../../test/statsFactories';

vi.mock('../../utils/pdfExport', () => ({ exportElement: vi.fn() }));
vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

function renderDetail(blocksByGame: number[]) {
    const player = makeAggregatedPlayer({
        name: '山田太郎',
        gamesPlayed: blocksByGame.length,
        totalStats: makeStats({ blocks: blocksByGame.reduce((a, b) => a + b, 0) }),
        gameHistory: blocksByGame.map((blocks, i) => makeGameRecord({
            gameId: `g${i}`,
            date: `2026-0${6 + i}-01T00:00:00.000Z`,
            stats: makeStats({ steals: 1, blocks }),
        })),
    });
    render(<DetailView player={player} teamId="t" isHidden={false} onToggleHidden={vi.fn()} />);
}

const headerLabels = () =>
    [...document.querySelectorAll('.game-history-header .stats-header span')]
        .map(el => el.textContent);

const blockCells = () =>
    [...document.querySelectorAll('.game-history-compact .stat-blk')]
        .map(el => el.textContent);

afterEach(cleanup);

describe('試合別詳細のブロック列', () => {
    it('見出しに BLK が出る（STLの隣）', () => {
        renderDetail([2]);
        expect(headerLabels()).toEqual(['PTS', 'REB', 'AST', 'STL', 'BLK']);
    });

    it('試合ごとのブロック数が出る', () => {
        renderDetail([2, 0, 3]);
        expect(blockCells()).toEqual(['2', '0', '3']);
    });

    // 「ブロック」は累計記録タイルとパフォーマンス行の両方に出る文言なので、
    // 累計記録グリッドの中だけを見る
    const totalBlocks = () =>
        [...document.querySelectorAll('.total-stats-grid .total-stat')]
            .find(el => el.querySelector('.label')?.textContent === 'ブロック')
            ?.querySelector('.value')?.textContent;

    it('表の合計が累計記録と一致する', () => {
        renderDetail([2, 0, 3]);
        const sum = blockCells().reduce((a, b) => a + Number(b), 0);
        expect(sum).toBe(5);
        expect(totalBlocks()).toBe('5');
    });
});
