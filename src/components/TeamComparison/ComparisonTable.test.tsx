import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ComparisonTable } from './ComparisonTable';
import { buildComparisonRows } from './comparisonRows';
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

function renderTable(left: TeamTotals, right: TeamTotals, threePointUnused = false) {
    const rows = buildComparisonRows(left, right, { threePointUnused });
    return render(
        <ComparisonTable rows={rows} leftColor="#3b82f6" rightColor="#e2e8f0" animate={false} threePointUnused={threePointUnused} />,
    );
}

function rowEl(key: string): HTMLElement {
    return document.querySelector(`[data-row-key="${key}"]`) as HTMLElement;
}

describe('ComparisonTable', () => {
    it('行のラベルと左右の値を出す', () => {
        renderTable(totals({ points: 85 }), totals({ points: 42 }));

        const row = rowEl('points');
        expect(row.textContent).toContain('PTS');
        expect(row.textContent).toContain('85');
        expect(row.textContent).toContain('42');
    });

    it('バーの幅を比率どおりに出す', () => {
        renderTable(totals({ points: 50 }), totals({ points: 25 }));

        const row = rowEl('points');
        expect((row.querySelector('.comparison-bar.left') as HTMLElement).style.width).toBe('100%');
        expect((row.querySelector('.comparison-bar.right') as HTMLElement).style.width).toBe('50%');
    });

    it('優勢な側に is-leader が付く', () => {
        renderTable(totals({ points: 50 }), totals({ points: 25 }));

        const row = rowEl('points');
        expect(row.querySelector('.comparison-bar.left')?.classList.contains('is-leader')).toBe(true);
        expect(row.querySelector('.comparison-bar.right')?.classList.contains('is-leader')).toBe(false);
    });

    // 勝っている側にはピンクの枠が付く（濃淡だけでは見分けづらいため）。
    // 枠を持つようになったので、長さ0のバーを残すと枠だけが4pxの点として
    // 浮き、描画の壊れに見える
    it('値が0の側はバーそのものを描かない', () => {
        renderTable(totals({ steals: 6 }), totals({ steals: 0 }));

        const row = rowEl('steals');
        expect(row.querySelector('.comparison-bar.left')).toBeTruthy();
        expect(row.querySelector('.comparison-bar.right')).toBeNull();
    });

    it('0が勝っている側でもバーを描かない（TOは少ない方が勝ち）', () => {
        renderTable(totals({ turnovers: 0 }), totals({ turnovers: 5 }));

        const row = rowEl('turnovers');
        // 左が勝っているが長さは0なので、枠だけが残ってはいけない
        expect(row.querySelector('.comparison-bar.left')).toBeNull();
        expect(row.querySelector('.comparison-bar.right')).toBeTruthy();
    });

    it('左右とも0の行はどちらのバーも描かない', () => {
        renderTable(totals(), totals());

        const row = rowEl('points');
        expect(row.querySelectorAll('.comparison-bar').length).toBe(0);
    });

    it('TOは少ない側に is-leader が付く', () => {
        renderTable(totals({ turnovers: 9 }), totals({ turnovers: 20 }));

        const row = rowEl('turnovers');
        expect(row.querySelector('.comparison-bar.left')?.classList.contains('is-leader')).toBe(true);
    });

    it('3P未使用の行は「—」でバーを描かない', () => {
        renderTable(totals(), totals(), true);

        const row = rowEl('threePoint');
        expect(row.classList.contains('is-unavailable')).toBe(true);
        expect(row.textContent).toContain('—');
        expect(row.querySelector('.comparison-bar')).toBeNull();
    });

    it('3P未使用のとき注記を1回だけ出す', () => {
        renderTable(totals(), totals(), true);

        expect(screen.getAllByText('この試合は3Pを使用していません').length).toBe(1);
    });

    it('3Pを使う試合では注記を出さない', () => {
        renderTable(totals(), totals(), false);

        expect(screen.queryByText('この試合は3Pを使用していません')).toBeNull();
    });

    it('animate が false なら初期幅から最終幅で描く', () => {
        renderTable(totals({ points: 50 }), totals({ points: 25 }));

        expect(document.querySelector('.comparison-table')?.classList.contains('is-animating')).toBe(false);
    });
});
