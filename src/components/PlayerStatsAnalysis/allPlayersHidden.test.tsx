import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PlayerStatsAnalysis } from './PlayerStatsAnalysis';

// チームの選手を全員「選手スタッツ一覧に非表示」にすると、非表示を除外した後の
// 配列が空になり「試合データがありません」の早期returnに落ちていた。
// 実際にはデータはあり、しかもこの分岐では非表示選手トグルが描画されないため
// UIから元に戻す手段が無くなる（袋小路）。

function stats() {
    return {
        points: 10, twoPointMade: 5, twoPointAttempt: 9, threePointMade: 0, threePointAttempt: 0,
        freeThrowMade: 0, freeThrowAttempt: 0, offensiveRebounds: 2, defensiveRebounds: 3,
        assists: 2, steals: 1, blocks: 0, turnovers: 1,
        turnoverDD: 0, turnoverTR: 0, turnoverPM: 0, turnoverCM: 0,
    };
}

function player() {
    return {
        id: 'p4', number: 4, name: '山田太郎', courtName: '山田', isCaptain: true,
        stats: stats(), fouls: [], isOnCourt: false, quartersPlayed: ['starter', '', '', ''],
    };
}

function seed({ hideAll }: { hideAll: boolean }) {
    const team = {
        id: 't-red', name: 'レッドミニバス', coachName: 'C',
        players: [player()], updatedAt: new Date().toISOString(),
    };
    localStorage.setItem('minibasket-my-teams', JSON.stringify([team]));
    localStorage.setItem('minibasket-game-history', JSON.stringify([{
        id: 'g1', date: new Date(2026, 5, 5).toISOString(), gameName: '第1節',
        teamA: { ...team, color: 'white', teamFouls: [0, 0, 0, 0], timeouts: [] },
        teamB: {
            id: 't-blue', name: 'ブルーミニバス', color: 'blue', coachName: 'C',
            players: [], teamFouls: [0, 0, 0, 0], timeouts: [],
        },
        finalScore: { teamA: 30, teamB: 20 }, gameInfo: { venue: '体育館' },
        scoreHistory: [], statHistory: [], foulHistory: [], quarterMinutes: 6, showThreePoint: false,
    }]));
    if (hideAll) {
        localStorage.setItem('minibasket-hidden-players', JSON.stringify({ 't-red': ['山田太郎'] }));
    }
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('全選手を非表示にしたとき', () => {
    it('「試合データがありません」とは言わない（データはある）', () => {
        seed({ hideAll: true });
        render(<PlayerStatsAnalysis onBack={() => { }} />);
        expect(screen.queryByText('試合データがありません')).toBeNull();
    });

    it('非表示選手を戻すトグルが出る（袋小路にしない）', () => {
        seed({ hideAll: true });
        render(<PlayerStatsAnalysis onBack={() => { }} />);
        expect(screen.getByText(/非表示選手/)).toBeTruthy();
    });

    it('本当に試合データが無いときは従来どおり案内する', () => {
        localStorage.setItem('minibasket-my-teams', JSON.stringify([{
            id: 't-red', name: 'レッドミニバス', coachName: 'C',
            players: [player()], updatedAt: new Date().toISOString(),
        }]));
        render(<PlayerStatsAnalysis onBack={() => { }} />);
        expect(screen.getByText('試合データがありません')).toBeTruthy();
    });
});
