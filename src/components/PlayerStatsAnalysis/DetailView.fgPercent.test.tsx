// 選手詳細にFG%（フィールドゴール成功率）が無かった。
//
// 一覧のカードは FG を出し、並べ替えにも「FG%が高い順」がある。
// ところが詳細を開くと 2P / 3P / FT の内訳しかなく、一覧で見て
// 並べ替えた根拠の数字が消えていた。
// FGは2P+3P（FTは含めない）。一覧の計算と同じ定義で出す。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { DetailView } from './DetailView';
import type { PlayerStats } from '../../types/game';
import type { AggregatedPlayerStats } from '../../utils/playerStatsAnalysis';
import { makeAggregatedPlayer, makeStats } from '../../test/statsFactories';

vi.mock('../../utils/pdfExport', () => ({ exportElement: vi.fn() }));
vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

afterEach(cleanup);

function renderDetail(totalStats: Partial<PlayerStats>): AggregatedPlayerStats {
    const player = makeAggregatedPlayer({
        name: '山田太郎',
        gamesPlayed: 4,
        totalStats: makeStats(totalStats),
    });
    render(<DetailView player={player} teamId="t" isHidden={false} onToggleHidden={vi.fn()} />);
    return player;
}

/** シューティングのカードから、指定ラベルの行を取り出す */
function shootingRow(label: string): HTMLElement {
    const row = [...document.querySelectorAll('.shooting-bar-row')]
        .find(r => r.querySelector('.shooting-label')?.textContent === label);
    if (!row) throw new Error(`シューティングに「${label}」の行が無い`);
    return row as HTMLElement;
}

describe('選手詳細のFG%', () => {
    it('2Pと3Pを合わせた成功率を出す', () => {
        // 2P 4/10、3P 2/5 → FG 6/15 = 40%
        renderDetail({
            twoPointMade: 4, twoPointAttempt: 10,
            threePointMade: 2, threePointAttempt: 5,
        });

        const row = shootingRow('FG');
        expect(within(row).getByText('40%')).toBeTruthy();
        expect(within(row).getByText('6/15')).toBeTruthy();
    });

    // FTはフィールドゴールではない。混ぜると一覧のFG%と食い違う
    it('FTはFGに含めない', () => {
        // 2P 1/2、FT 10/10 → FG は 1/2 = 50%（FTを混ぜれば 11/12 になってしまう）
        renderDetail({
            twoPointMade: 1, twoPointAttempt: 2,
            freeThrowMade: 10, freeThrowAttempt: 10,
        });

        const row = shootingRow('FG');
        expect(within(row).getByText('50%')).toBeTruthy();
    });

    it('試投が無ければ率は出さず「-」にする', () => {
        renderDetail({ freeThrowMade: 1, freeThrowAttempt: 2 });

        const row = shootingRow('FG');
        expect(within(row).getByText('-')).toBeTruthy();
    });

    it('内訳の2P・3P・FTは従来どおり残す', () => {
        renderDetail({ twoPointMade: 4, twoPointAttempt: 10 });

        expect(shootingRow('2P')).toBeTruthy();
        expect(shootingRow('3P')).toBeTruthy();
        expect(shootingRow('FT')).toBeTruthy();
    });

    it('FGが2P+3Pであることを画面に書いておく', () => {
        renderDetail({ twoPointMade: 4, twoPointAttempt: 10 });

        expect(screen.getByText(/2P\+3P/)).toBeTruthy();
    });
});
