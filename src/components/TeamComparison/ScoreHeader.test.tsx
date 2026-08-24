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

        // スコアラインと表の行見出しの両方にチーム名が出ていることを個別に検証。
        // within を使うことで、表の行見出しが誤って消えても検出できる。
        const scoreline = document.querySelector('.comparison-scoreline') as HTMLElement;
        const table = document.querySelector('.quarter-score-table') as HTMLElement;

        // 左チーム名がスコアラインと表の両方に
        expect(within(scoreline).getByText('福岡第一')).toBeTruthy();
        expect(within(table).getByText('福岡第一')).toBeTruthy();

        // 右チーム名もスコアラインと表の両方に
        expect(within(scoreline).getByText('中部大第一')).toBeTruthy();
        expect(within(table).getByText('中部大第一')).toBeTruthy();

        // 合計スコアの検証。
        // header.textContent には Q1〜Q4 の見出しも含まれるため、'2' は
        // 常に "Q2" に、'3' は常に "Q3" にも一致してしまい、0-0でも通っていた。
        // スコア自体を描く要素だけを見る
        const leftScore = document.querySelector('.comparison-score.left') as HTMLElement;
        const rightScore = document.querySelector('.comparison-score.right') as HTMLElement;
        expect(leftScore.textContent).toBe('2');
        expect(rightScore.textContent).toBe('3');
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
