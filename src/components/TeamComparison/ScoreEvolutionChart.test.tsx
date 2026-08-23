import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ScoreEvolutionChart } from './ScoreEvolutionChart';
import { buildEvolutionData } from './scoreEvolution';
import type { ScoreEntry } from '../../types/game';

afterEach(cleanup);

function entry(quarter: number, a: number, b: number): ScoreEntry {
    return {
        id: `s-${a}-${b}-${Math.random()}`, teamId: 'teamA', playerId: 'p1', playerNumber: 4,
        scoreType: '2P', points: 2, quarter, timestamp: 0, runningScoreA: a, runningScoreB: b,
    };
}

function renderChart(history: ScoreEntry[]) {
    return render(
        <ScoreEvolutionChart data={buildEvolutionData(history, 'all')} leftColor="#3b82f6" rightColor="#e2e8f0" />,
    );
}

describe('ScoreEvolutionChart', () => {
    it('両チームの折れ線を描く', () => {
        renderChart([entry(1, 2, 0), entry(1, 2, 3)]);

        expect(document.querySelectorAll('.score-evolution polyline').length).toBe(2);
    });

    it('線の色を属性に直接書く（出力で色が消えないため）', () => {
        renderChart([entry(1, 2, 0)]);

        const polylines = [...document.querySelectorAll('.score-evolution polyline')] as SVGElement[];
        const leftColorLine = polylines.find(p => p.getAttribute('stroke') === '#3b82f6');
        const rightColorLine = polylines.find(p => p.getAttribute('stroke') === '#e2e8f0');

        // 左色（自チーム）と右色（相手チーム）の線がそれぞれ1本ずつ存在する
        expect(leftColorLine).toBeTruthy();
        expect(rightColorLine).toBeTruthy();
        expect(leftColorLine?.getAttribute('stroke')).not.toContain('var(');
        expect(rightColorLine?.getAttribute('stroke')).not.toContain('var(');
        expect(leftColorLine?.getAttribute('fill')).toBe('none');
        expect(rightColorLine?.getAttribute('fill')).toBe('none');
    });

    it('クォーターの区切り線とラベルを出す', () => {
        renderChart([entry(1, 2, 0), entry(2, 4, 0)]);

        expect(document.querySelectorAll('.score-evolution .quarter-boundary').length).toBe(2);
        const labels = [...document.querySelectorAll('.score-evolution text')].map(t => t.textContent);
        expect(labels).toContain('Q1');
        expect(labels).toContain('Q2');
    });

    it('記録が無くても落ちない', () => {
        renderChart([]);

        expect(document.querySelector('.score-evolution')).toBeTruthy();
    });

    it('X軸が時間ではないと分かる説明を出す', () => {
        const { getByText } = renderChart([entry(1, 2, 0)]);

        expect(getByText('横軸は得点の順番（試合時計ではありません）')).toBeTruthy();
    });

    it('自チーム（左色）の線が相手チーム（右色）の線より上に重なる', () => {
        renderChart([entry(1, 2, 0)]);

        const polylines = [...document.querySelectorAll('.score-evolution polyline')] as SVGElement[];
        const leftColorIndex = polylines.findIndex(p => p.getAttribute('stroke') === '#3b82f6');
        const rightColorIndex = polylines.findIndex(p => p.getAttribute('stroke') === '#e2e8f0');

        // SVGは後に書いたものが上に重なるため、左色（自チーム）が後ろ側にあるべき
        expect(leftColorIndex).toBeGreaterThan(rightColorIndex);
    });
});
