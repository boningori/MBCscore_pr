// 試合はあるのに選手の記録が1件も無いとき、「試合データがありません」に
// 落ちていた。
//
// すぐ上のチームサマリーは「1試合」と出ているので、同じ画面が同時に
// 「試合がある」「試合データがない」と言うことになる。しかも文面が
// 「試合を記録すると選手スタッツが表示されます」なので、記録済みの
// 利用者に対して「まだ記録していない」と案内してしまう。
//
// これは選手を割り当てないまま試合を終えた場合に起きる（保留のまま保存、
// スタメンを確定しないまま記録、など）。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PlayerStatsAnalysis } from './PlayerStatsAnalysis';
import { createInitialStats } from '../../types/game';

/** 選手は名簿にいるが、スタッツも出場クォーターも記録されていない試合 */
function seedGameWithoutPlayerRecords() {
    const team = {
        id: 't-red', name: 'レッドミニバス', coachName: 'C',
        players: [{
            id: 'p4', number: 4, name: '山田太郎', isCaptain: true,
            stats: createInitialStats(), fouls: [], isOnCourt: false,
            quartersPlayed: [false, false, false, false],
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

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('試合はあるが選手の記録が無いとき', () => {
    it('チームサマリーは試合があると言っている', () => {
        seedGameWithoutPlayerRecords();
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        const total = document.querySelector('.record-stat.total') as HTMLElement;
        expect(total.textContent).toBe('1試合');
    });

    it('「試合データがありません」とは言わない（試合はある）', () => {
        seedGameWithoutPlayerRecords();
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        expect(screen.queryByText('試合データがありません')).toBeNull();
    });

    it('選手の記録が無いことを伝える', () => {
        seedGameWithoutPlayerRecords();
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        expect(screen.getByText('選手の記録がありません')).toBeTruthy();
    });

    it('試合が1件も無ければ従来どおり「試合データがありません」', () => {
        localStorage.setItem('minibasket-my-teams', JSON.stringify([{
            id: 't-red', name: 'レッドミニバス', coachName: 'C', players: [],
            updatedAt: new Date().toISOString(),
        }]));
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        expect(screen.getByText('試合データがありません')).toBeTruthy();
    });
});
