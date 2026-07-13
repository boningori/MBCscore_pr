import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { WinLossSplit } from './WinLossSplit';
import type { PlayerGameRecord } from '../../utils/playerStatsAnalysis';
import type { PlayerStats } from '../../types/game';
import { createInitialStats } from '../../types/game';

afterEach(cleanup);

function rec(date: string, result: 'win' | 'loss' | 'draw', s: Partial<PlayerStats>): PlayerGameRecord {
    return { gameId: date, date, opponent: 'X', stats: { ...createInitialStats(), ...s }, result, teamScore: 0, opponentScore: 0 };
}

describe('WinLossSplit', () => {
    it('見出しと5行のラベルを描画する', () => {
        render(<WinLossSplit gameHistory={[rec('2026-06-01', 'win', { points: 10 })]} />);
        expect(screen.getByText('⚖️ 勝敗別スプリット')).toBeTruthy();
        expect(screen.getByText('得点')).toBeTruthy();
        expect(screen.getByText('STL')).toBeTruthy();
        expect(screen.getByText('TO')).toBeTruthy();
    });

    it('勝ち・負けの試合数を見出しに表示する', () => {
        const gh = [
            rec('2026-06-02', 'win', { points: 10 }),
            rec('2026-06-01', 'loss', { points: 4 }),
        ];
        render(<WinLossSplit gameHistory={gh} />);
        expect(screen.getByText(/勝ち \(n=1\)/)).toBeTruthy();
        expect(screen.getByText(/負け \(n=1\)/)).toBeTruthy();
    });

    it('勝ちのみの場合、負け列は「—」で注記を出す', () => {
        render(<WinLossSplit gameHistory={[rec('2026-06-01', 'win', { points: 10 })]} />);
        expect(screen.getAllByText('—').length).toBeGreaterThan(0);
        expect(screen.getByText(/両方の試合が必要/)).toBeTruthy();
    });
});
