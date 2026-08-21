// 打っていない種別のシューティング行が「0/0」と出ていた。
//
// アプリの他の場所は、試投0を「打っていない」と分かる形で書いている——
// 試合中のチーム統計は formatShot が `-` を返し（StatsPanel）、一覧のカードは
// 分母ごと省く（PlayerCardList の「単位は数字があるときだけ付ける」）。
// 詳細だけが「0/0」で、率の欄の `-` と食い違っていた。
//
// ミニバスは既定で3Pを使わない（試合設定の showThreePoint が false）ため、
// この行はほぼ全選手・全試合で 0/0 のまま並ぶ。実際に打っていない記録と、
// 記録し損ねた0本を見分けられない書き方は、分析画面としてよくない。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, within } from '@testing-library/react';
import { DetailView } from './DetailView';
import type { PlayerStats } from '../../types/game';
import { makeAggregatedPlayer, makeStats } from '../../test/statsFactories';

vi.mock('../../utils/pdfExport', () => ({ exportElement: vi.fn() }));
vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

afterEach(cleanup);

function renderDetail(totalStats: Partial<PlayerStats>): void {
    const player = makeAggregatedPlayer({
        name: '山田太郎',
        gamesPlayed: 4,
        totalStats: makeStats(totalStats),
    });
    render(<DetailView player={player} teamId="t" isHidden={false} onToggleHidden={vi.fn()} />);
}

function shootingRow(label: string): HTMLElement {
    const row = [...document.querySelectorAll('.shooting-bar-row')]
        .find(r => r.querySelector('.shooting-label')?.textContent === label);
    if (!row) throw new Error(`シューティングに「${label}」の行が無い`);
    return row as HTMLElement;
}

describe('選手詳細のシューティング: 試投が無い種別', () => {
    it('分母を出さない（率の「-」だけで打っていないことを示す）', () => {
        renderDetail({ twoPointMade: 3, twoPointAttempt: 6 });

        const row = shootingRow('3P');
        expect(within(row).getByText('-')).toBeTruthy();
        expect(within(row).queryByText('0/0')).toBeNull();
        expect(row.querySelector('.shooting-made')?.textContent).toBe('');
    });

    it('試投があれば従来どおり成功数／試投数を出す', () => {
        renderDetail({ twoPointMade: 3, twoPointAttempt: 6 });

        const row = shootingRow('2P');
        expect(within(row).getByText('50%')).toBeTruthy();
        expect(within(row).getByText('3/6')).toBeTruthy();
    });

    // 打って全部外した選手は「0/8」。打っていない選手と混同してはいけない
    it('全部外していても試投があれば分母を出す', () => {
        renderDetail({ twoPointMade: 0, twoPointAttempt: 8 });

        const row = shootingRow('2P');
        expect(within(row).getByText('0%')).toBeTruthy();
        expect(within(row).getByText('0/8')).toBeTruthy();
    });

    it('FGも同じ扱い（2Pも3Pも打っていなければ分母を出さない）', () => {
        renderDetail({ freeThrowMade: 2, freeThrowAttempt: 4 });

        const row = shootingRow('FG');
        expect(within(row).queryByText('0/0')).toBeNull();
        expect(row.querySelector('.shooting-made')?.textContent).toBe('');
    });
});
