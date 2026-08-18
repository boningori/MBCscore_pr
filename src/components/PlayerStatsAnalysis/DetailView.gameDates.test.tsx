// 「試合別詳細」の日付は M/D だけを出していた。
//
// 同じ画面のすぐ下にある成長グラフは、年をまたぐときだけ年を添える
// （chartXLabel.buildXLabels）。表だけがその規則を持っていなかったため、
// 2シーズンぶんの記録では前年6/1と今年6/1が同じ「6/1」で並び、しかも
// 一覧は日付降順（今年→前年）なので「8/1, 7/20, 6/1, 7/5, 6/1」と
// 並び順が壊れているように見えていた（実測）。
// 学年をまたいで数年ぶん記録するのがこのアプリの目的なので、既定表示で常に起きる。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { DetailView } from './DetailView';
import type { AggregatedPlayerStats } from '../../utils/playerStatsAnalysis';
import { makeAggregatedPlayer, makeGameRecord, makeStats } from '../../test/statsFactories';

vi.mock('../../utils/pdfExport', () => ({ exportElement: vi.fn() }));
vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

/** aggregatePlayerStats と同じく日付降順のgameHistoryを渡す */
function playerWithDates(dates: string[]): AggregatedPlayerStats {
    return makeAggregatedPlayer({
        name: '山田太郎',
        gamesPlayed: dates.length,
        totalStats: makeStats({ points: 10 * dates.length }),
        avgStats: makeStats({ points: 10 }),
        gameHistory: dates.map((date, i) => makeGameRecord({
            gameId: `g${i}`,
            date: `${date}T00:00:00.000Z`,
            stats: makeStats({ points: 10 }),
        })),
    });
}

function gameDates(): string[] {
    return [...document.querySelectorAll('.game-history-compact .game-date')]
        .map(el => el.textContent ?? '');
}

afterEach(cleanup);

describe('試合別詳細の日付', () => {
    it('同じ年のうちは月日だけを出す（幅が狭いので冗長にしない）', () => {
        render(
            <DetailView
                player={playerWithDates(['2026-08-01', '2026-07-20', '2026-06-01'])}
                teamId="t" isHidden={false} onToggleHidden={vi.fn()}
            />,
        );

        expect(gameDates()).toEqual(['8/1', '7/20', '6/1']);
    });

    it('年をまたぐと年を添える（同じ月日が2行並んで並び順が壊れて見える）', () => {
        render(
            <DetailView
                player={playerWithDates(['2026-08-01', '2026-06-01', '2025-07-05', '2025-06-01'])}
                teamId="t" isHidden={false} onToggleHidden={vi.fn()}
            />,
        );

        expect(gameDates()).toEqual(["'26 8/1", "'26 6/1", "'25 7/5", "'25 6/1"]);
    });

    it('成長グラフのX軸と同じ表記にする（同じ画面で書き分けない）', () => {
        render(
            <DetailView
                player={playerWithDates(['2026-06-01', '2025-06-01'])}
                teamId="t" isHidden={false} onToggleHidden={vi.fn()}
            />,
        );

        const xLabels = [...document.querySelectorAll('.x-axis .x-label')]
            .map(el => el.textContent ?? '');
        // グラフは古い順、表は新しい順なので、集合として一致することを見る
        expect(new Set(gameDates())).toEqual(new Set(xLabels.slice(0, 2)));
    });

    it('日付が読めない記録があっても他の行の判定を壊さない', () => {
        const player = playerWithDates(['2026-06-01', '2025-06-01']);
        player.gameHistory[1] = { ...player.gameHistory[1], date: '' };

        render(<DetailView player={player} teamId="t" isHidden={false} onToggleHidden={vi.fn()} />);

        expect(gameDates()).toEqual(['6/1', '']);
    });
});
