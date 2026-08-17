import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { PlayerStatsAnalysis } from './PlayerStatsAnalysis';
import { closeTopModal, hasOpenModal } from '../Modal/modalStack';

// 端末の戻る操作は useScreenHistorySync が受け取り、最前面の層へ閉じる要求を出す
// （closeTopModal）。詳細ビューはローカルstateで履歴に存在しなかったため、
// この要求を受ける層が無く、画面ごとホームまで飛んでいた。
// 画面上の「← 一覧」と同じく、1段だけ戻ること。

function stats() {
    return {
        points: 10, twoPointMade: 5, twoPointAttempt: 9, threePointMade: 0, threePointAttempt: 0,
        freeThrowMade: 0, freeThrowAttempt: 0, offensiveRebounds: 2, defensiveRebounds: 3,
        assists: 2, steals: 1, blocks: 0, turnovers: 1,
        turnoverDD: 0, turnoverTR: 0, turnoverPM: 0, turnoverCM: 0,
    };
}

function seed() {
    const team = {
        id: 't-red', name: 'レッドミニバス', coachName: 'C',
        players: [{
            id: 'p4', number: 4, name: '山田太郎', isCaptain: true,
            stats: stats(), fouls: [], isOnCourt: false,
            quartersPlayed: ['starter', '', '', ''],
        }],
        updatedAt: new Date().toISOString(),
    };
    localStorage.setItem('minibasket-my-teams', JSON.stringify([team]));
    localStorage.setItem('minibasket-game-history', JSON.stringify([{
        id: 'g1', date: new Date(2026, 5, 5).toISOString(), gameName: '第1節',
        teamA: { ...team, color: 'white', teamFouls: [0, 0, 0, 0], timeouts: [] },
        teamB: {
            id: 't-blue', name: 'ブルーミニバス', color: 'blue', coachName: 'C',
            players: [], teamFouls: [0, 0, 0, 0], timeouts: [],
        },
        finalScore: { teamA: 30, teamB: 20 },
        scoreHistory: [], statHistory: [], foulHistory: [],
    }]));
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('選手スタッツ詳細での戻る操作', () => {
    function openDetail() {
        seed();
        render(<PlayerStatsAnalysis onBack={vi.fn()} />);
        fireEvent.click(screen.getByText('#4').closest('button')!);
        expect(screen.getByText('📊 試合平均')).toBeTruthy();
    }

    it('詳細を開いているあいだは戻る操作を受け取る', () => {
        openDetail();
        expect(hasOpenModal()).toBe(true);
    });

    it('戻る操作で一覧へ戻る（画面から抜けない）', () => {
        const onBack = vi.fn();
        seed();
        render(<PlayerStatsAnalysis onBack={onBack} />);
        fireEvent.click(screen.getByText('#4').closest('button')!);

        act(() => { closeTopModal(); });

        expect(screen.getByText('📊 選手スタッツ分析')).toBeTruthy();
        expect(screen.queryByText('📊 試合平均')).toBeNull();
        // 一覧へ戻るだけで、画面そのものは閉じない
        expect(onBack).not.toHaveBeenCalled();
    });

    it('一覧に居るあいだは戻る操作を横取りしない（ホームへ抜けられる）', () => {
        seed();
        render(<PlayerStatsAnalysis onBack={vi.fn()} />);
        expect(hasOpenModal()).toBe(false);
    });
});
