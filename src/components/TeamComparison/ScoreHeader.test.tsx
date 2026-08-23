import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { ScoreHeader } from './ScoreHeader';
import { computeQuarterScores } from './quarterScores';
import type { ScoreEntry } from '../../types/game';

afterEach(cleanup);

function score(teamId: string, quarter: number, points: number): ScoreEntry {
    return {
        id: `s-${Math.random()}`, teamId, playerId: 'p1', playerNumber: 4,
        scoreType: points === 3 ? '3P' : points === 2 ? '2P' : 'FT',
        points, quarter, timestamp: 0, runningScoreA: 0, runningScoreB: 0,
    };
}

function renderHeader(history: ScoreEntry[], caption = '2026-08-23 県大会 市民体育館') {
    return render(
        <ScoreHeader
            leftName="福岡第一" leftColor="#3b82f6"
            rightName="中部大第一" rightColor="#e2e8f0"
            quarterScores={computeQuarterScores(history)}
            caption={caption}
        />,
    );
}

describe('ScoreHeader', () => {
    it('チーム名と合計スコアを出す', () => {
        renderHeader([score('teamA', 1, 2), score('teamB', 1, 3)]);

        // チーム名はスコアライン（凡例）とクォーター表の行見出しの2箇所に
        // 意図的に重複して出るため、getByText ではなく getAllByText で数える
        expect(screen.getAllByText('福岡第一').length).toBeGreaterThan(0);
        expect(screen.getAllByText('中部大第一').length).toBeGreaterThan(0);
        const header = document.querySelector('.comparison-score-header') as HTMLElement;
        expect(header.textContent).toContain('2');
        expect(header.textContent).toContain('3');
    });

    it('見出しの説明文を出す', () => {
        renderHeader([], '2026-08-23 県大会 市民体育館');

        expect(screen.getByText('2026-08-23 県大会 市民体育館')).toBeTruthy();
    });

    it('クォーター表の見出しを Q1〜Q4 と T で出す', () => {
        renderHeader([]);

        const table = document.querySelector('.quarter-score-table') as HTMLElement;
        for (const label of ['Q1', 'Q2', 'Q3', 'Q4', 'T']) {
            expect(within(table).getByText(label)).toBeTruthy();
        }
    });

    it('延長があれば OT の列を足す', () => {
        renderHeader([score('teamA', 5, 2)]);

        const table = document.querySelector('.quarter-score-table') as HTMLElement;
        expect(within(table).getByText('OT')).toBeTruthy();
    });

    it('延長が無ければ OT の列は出さない', () => {
        renderHeader([]);

        const table = document.querySelector('.quarter-score-table') as HTMLElement;
        expect(within(table).queryByText('OT')).toBeNull();
    });
});
