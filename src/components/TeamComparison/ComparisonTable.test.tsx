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

    it('少ない方が良い行のラベルに↓を出す', () => {
        renderTable(totals({ turnovers: 9 }), totals({ turnovers: 20 }));

        const arrow = rowEl('turnovers').querySelector('.lower-is-better') as HTMLElement;
        expect(arrow).toBeTruthy();
        expect(arrow.textContent).toBe('↓');
        // 矢印だけでは伝わらないので読み上げ用の名前を持たせる
        expect(arrow.getAttribute('aria-label')).toBe('少ない方が良い');
    });

    it('多い方が良い行には↓を出さない', () => {
        renderTable(totals({ points: 50 }), totals({ points: 25 }));

        expect(rowEl('points').querySelector('.lower-is-better')).toBeNull();
    });

    it('シュートの実数行は成功分だけを濃く塗る', () => {
        renderTable(totals({ twoMade: 3, twoAttempt: 20 }), totals({ twoMade: 2, twoAttempt: 4 }));

        const bar = rowEl('twoPoint').querySelector('.comparison-bar.left') as HTMLElement;
        const made = bar.querySelector('.comparison-bar-made') as HTMLElement;
        // バー全体が試投数、その15%が成功分
        expect(bar.style.width).toBe('100%');
        expect(made.style.width).toBe('15%');
    });

    it('勝敗を出さない行は、どちらのバーも淡くしない', () => {
        // 勝敗が付かないのは「引き分け」ではなく「判定していない」ため、
        // 負けたように見せてはいけない
        renderTable(totals({ twoMade: 3, twoAttempt: 20 }), totals({ twoMade: 2, twoAttempt: 4 }));

        const row = rowEl('twoPoint');
        for (const side of ['left', 'right']) {
            const bar = row.querySelector(`.comparison-bar.${side}`) as HTMLElement;
            expect(bar.style.opacity).toBe('1');
        }
    });

    it('勝敗が付く行では負けた側だけ淡くする', () => {
        renderTable(totals({ points: 50 }), totals({ points: 25 }));

        const row = rowEl('points');
        expect((row.querySelector('.comparison-bar.left') as HTMLElement).style.opacity).toBe('1');
        expect(Number((row.querySelector('.comparison-bar.right') as HTMLElement).style.opacity)).toBeLessThan(1);
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
