import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { WinLossSplit } from './WinLossSplit';
import type { PlayerGameRecord } from '../../utils/playerStatsAnalysis';
import type { PlayerStats } from '../../types/game';
import { makeGameRecord, makeStats } from '../../test/statsFactories';

afterEach(cleanup);

function rec(date: string, result: 'win' | 'loss' | 'draw', s: Partial<PlayerStats>): PlayerGameRecord {
    return makeGameRecord({ gameId: date, date, result, stats: makeStats(s) });
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

    // 引き分けの試合が勝ちにも負けにも入らず、表から消えていた。
    // n の合計が試合数と合わず、どこへ行ったのか画面から分からない
    it('引き分けがあれば列を出す', () => {
        const gh = [
            rec('2026-06-03', 'win', { points: 10 }),
            rec('2026-06-02', 'loss', { points: 4 }),
            rec('2026-06-01', 'draw', { points: 6 }),
        ];
        render(<WinLossSplit gameHistory={gh} />);

        expect(screen.getByText(/引分 \(n=1\)/)).toBeTruthy();
    });

    it('引き分けの平均を出す', () => {
        const gh = [
            rec('2026-06-02', 'draw', { points: 6 }),
            rec('2026-06-01', 'draw', { points: 8 }),
        ];
        render(<WinLossSplit gameHistory={gh} />);

        expect(screen.getByText('7.0')).toBeTruthy();
    });

    // ミニバスで引き分けはまれ。0件のときに空の列を足すと表が読みにくくなる
    it('引き分けが無ければ列を出さない', () => {
        const gh = [
            rec('2026-06-02', 'win', { points: 10 }),
            rec('2026-06-01', 'loss', { points: 4 }),
        ];
        render(<WinLossSplit gameHistory={gh} />);

        expect(screen.queryByText(/引分/)).toBeNull();
    });
});
