import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TeamComparison } from './TeamComparison';
import { createPlayer, createTeam } from '../../types/game';
import type { ScoreEntry, StatEntry, Team } from '../../types/game';

afterEach(cleanup);

function team(id: 'teamA' | 'teamB', name: string, color: Team['color'], points: number): Team {
    const t = createTeam(id, name, '');
    t.color = color;
    const p = createPlayer(`${id}-1`, 4, '一郎');
    p.stats.points = points;
    p.stats.twoPointMade = points / 2;
    p.stats.twoPointAttempt = points;
    t.players = [p];
    return t;
}

function score(teamId: string, quarter: number, a: number, b: number): ScoreEntry {
    return {
        id: `s-${Math.random()}`, teamId, playerId: `${teamId}-1`, playerNumber: 4,
        scoreType: '2P', points: 2, quarter, timestamp: 0, runningScoreA: a, runningScoreB: b,
    };
}

function renderComparison(over: { showThreePoint?: boolean; statHistory?: StatEntry[] } = {}) {
    return render(
        <TeamComparison
            teamA={team('teamA', '白チーム', 'white', 10)}
            teamB={team('teamB', '青チーム', 'blue', 6)}
            scoreHistory={[score('teamA', 1, 2, 0), score('teamB', 2, 2, 2)]}
            statHistory={over.statHistory ?? []}
            foulHistory={[]}
            showThreePoint={over.showThreePoint ?? true}
            caption="2026-08-23 県大会"
        />,
    );
}

describe('TeamComparison', () => {
    it('見出し・比較表・ドーナツ・折れ線をすべて出す', () => {
        renderComparison();

        expect(document.querySelector('.comparison-score-header')).toBeTruthy();
        expect(document.querySelector('.comparison-table')).toBeTruthy();
        expect(document.querySelector('.shooting-donuts')).toBeTruthy();
        expect(document.querySelector('.score-evolution')).toBeTruthy();
    });

    it('既定は「全体」が選ばれている', () => {
        renderComparison();

        expect(screen.getByRole('button', { name: '全体' }).classList.contains('active')).toBe(true);
    });

    it('全体では選手スタッツの合計を出す', () => {
        renderComparison();

        const row = document.querySelector('[data-row-key="points"]') as HTMLElement;
        expect(row.textContent).toContain('10');
        expect(row.textContent).toContain('6');
    });

    it('クォーターを選ぶとその範囲だけを出す', () => {
        renderComparison();

        fireEvent.click(screen.getByRole('button', { name: 'Q1' }));

        const row = document.querySelector('[data-row-key="points"]') as HTMLElement;
        // Q1 は teamA の 2点だけ
        expect(row.querySelector('.comparison-value.left')?.textContent).toBe('2');
        expect(row.querySelector('.comparison-value.right')?.textContent).toBe('0');
    });

    it('延長の記録が無ければ OT のボタンを出さない', () => {
        renderComparison();

        expect(screen.queryByRole('button', { name: 'OT' })).toBeNull();
    });

    it('3P未使用の試合では注記を出す', () => {
        renderComparison({ showThreePoint: false });

        expect(screen.getByText('この試合は3Pを使用していません')).toBeTruthy();
    });

    it('3P設定OFFでも記録があれば注記を出さない', () => {
        const threeMissed: StatEntry = {
            id: 't1', teamId: 'teamA', playerId: 'teamA-1', playerNumber: 4, statType: '3PA', quarter: 1, timestamp: 0,
        };
        renderComparison({ showThreePoint: false, statHistory: [threeMissed] });

        expect(screen.queryByText('この試合は3Pを使用していません')).toBeNull();
    });
});

// 無得点の延長。詳細は quarterScores.recordedQuarters のコメント
describe('無得点の延長がある試合', () => {
    const stat = (quarter: number): StatEntry => ({
        id: `st-${quarter}`, teamId: 'teamA', playerId: 'teamA-1', playerNumber: 4,
        statType: 'DREB', quarter, timestamp: 0,
    });

    function renderWithScorelessOT() {
        return render(
            <TeamComparison
                teamA={team('teamA', '白チーム', 'white', 4)}
                teamB={team('teamB', '青チーム', 'blue', 2)}
                // Q1で2-2、OT(5)は無得点、OT2(6)で白が決めた
                scoreHistory={[score('teamA', 1, 2, 0), score('teamB', 1, 2, 2), score('teamA', 6, 4, 2)]}
                statHistory={[stat(5)]}
                foulHistory={[]}
            />,
        );
    }

    it('クォーター切替にOTを出す（Q4からOT2へ飛ばない）', () => {
        renderWithScorelessOT();

        const group = screen.getByRole('group', { name: '表示するクォーター' });
        const labels = [...group.querySelectorAll('button')].map(b => b.textContent);
        expect(labels).toEqual(['全体', 'Q1', 'Q2', 'Q3', 'Q4', 'OT', 'OT2']);
    });

    it('OTを選ぶと、そのOTで記録したスタッツが読める', () => {
        renderWithScorelessOT();

        fireEvent.click(screen.getByRole('button', { name: 'OT' }));

        const row = document.querySelector('[data-row-key="defensiveRebounds"]') as HTMLElement;
        expect(row.textContent).toContain('1');
    });
});
