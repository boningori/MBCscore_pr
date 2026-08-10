import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PlayerStatsAnalysis } from './PlayerStatsAnalysis';

// 試合のない期間で絞り込むと集計結果が空になり、「試合データがありません」の
// 早期returnに落ちていた。この分岐は期間の入力欄も解除ボタンも描画しないため、
// 一度絞り込むと画面から期間を戻せなくなる（allPlayersHidden と同じ袋小路）。
// しかも試合はあるので案内の文面も事実と違う。

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
            stats: stats(), fouls: [], isOnCourt: false, quartersPlayed: ['starter', '', '', ''],
        }],
        updatedAt: new Date().toISOString(),
    };
    localStorage.setItem('minibasket-my-teams', JSON.stringify([team]));
    localStorage.setItem('minibasket-game-history', JSON.stringify([{
        id: 'g1', date: new Date(Date.UTC(2026, 5, 5)).toISOString(), gameName: '第1節',
        teamA: { ...team, color: 'white', teamFouls: [0, 0, 0, 0], timeouts: [], isMyTeam: true, savedTeamId: 't-red' },
        teamB: {
            id: 't-blue', name: 'ブルーミニバス', color: 'blue', coachName: 'C',
            players: [], teamFouls: [0, 0, 0, 0], timeouts: [],
        },
        finalScore: { teamA: 30, teamB: 20 },
        scoreHistory: [], statHistory: [], foulHistory: [],
    }]));
}

/** 試合が1件も入らない期間に絞り込む */
function filterToEmptyPeriod() {
    fireEvent.change(screen.getByLabelText('データ表示期間の開始日'), {
        target: { value: '2027-01-01' },
    });
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('試合のない期間で絞り込んだとき', () => {
    it('期間の入力欄が残る（袋小路にしない）', () => {
        seed();
        render(<PlayerStatsAnalysis onBack={() => { }} />);
        filterToEmptyPeriod();

        expect(screen.getByLabelText('データ表示期間の開始日')).toBeTruthy();
        expect(screen.getByLabelText('データ表示期間の終了日')).toBeTruthy();
    });

    it('期間を解除するボタンが残る', () => {
        seed();
        render(<PlayerStatsAnalysis onBack={() => { }} />);
        filterToEmptyPeriod();

        expect(screen.getByRole('button', { name: '期間の絞り込みを解除' })).toBeTruthy();
    });

    it('解除すると選手が戻ってくる', () => {
        seed();
        render(<PlayerStatsAnalysis onBack={() => { }} />);
        filterToEmptyPeriod();
        expect(screen.queryByText('山田太郎')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: '期間の絞り込みを解除' }));

        expect(screen.getByText('山田太郎')).toBeTruthy();
    });

    it('「試合データがありません」とは言わない（試合はある）', () => {
        seed();
        render(<PlayerStatsAnalysis onBack={() => { }} />);
        filterToEmptyPeriod();

        expect(screen.queryByText('試合データがありません')).toBeNull();
        expect(screen.getByText('この期間に試合がありません')).toBeTruthy();
    });
});
