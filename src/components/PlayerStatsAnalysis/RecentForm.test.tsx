import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RecentForm } from './RecentForm';
import type { PlayerGameRecord } from '../../utils/playerStatsAnalysis';
import type { PlayerStats } from '../../types/game';
import { makeGameRecord, makeStats } from '../../test/statsFactories';

afterEach(cleanup);

function rec(date: string, s: Partial<PlayerStats>): PlayerGameRecord {
    return makeGameRecord({ gameId: date, date, stats: makeStats(s) });
}

describe('RecentForm', () => {
    it('試合が0件ならnullを返し何も描画しない', () => {
        const { container } = render(<RecentForm gameHistory={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it('見出しと得点/REB/ASTのラベルを描画する', () => {
        render(<RecentForm gameHistory={[rec('2026-06-01', { points: 10 })]} />);
        expect(screen.getByText('🔥 直近フォーム')).toBeTruthy();
        expect(screen.getByText('得点')).toBeTruthy();
        expect(screen.getByText('REB')).toBeTruthy();
        expect(screen.getByText('AST')).toBeTruthy();
    });

    it('5試合未満はデータ不足の注記を出す', () => {
        render(<RecentForm gameHistory={[rec('2026-06-01', { points: 10 })]} />);
        expect(screen.getByText(/データ不足/)).toBeTruthy();
    });

    it('直近が通算より高い得点はupクラス（↑）で表示される', () => {
        const gh = [
            rec('2026-06-06', { points: 10 }), rec('2026-06-05', { points: 10 }),
            rec('2026-06-04', { points: 10 }), rec('2026-06-03', { points: 10 }),
            rec('2026-06-02', { points: 10 }), rec('2026-06-01', { points: 0 }),
        ];
        const { container } = render(<RecentForm gameHistory={gh} />);
        expect(container.querySelector('.recent-form-card.up')).toBeTruthy();
    });

    it('flatバケットでは「± 0.0」を表示し「-0.0」を出さない', () => {
        const gh = Array.from({ length: 6 }, (_, i) => rec(`2026-06-0${i + 1}`, { points: 8 }));
        render(<RecentForm gameHistory={gh} />);
        expect(screen.queryByText(/-0\.0/)).toBeNull();
        expect(screen.getAllByText(/± 0\.0/).length).toBeGreaterThan(0);
    });
});
