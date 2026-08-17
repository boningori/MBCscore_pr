import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PlayerStatsAnalysis } from './PlayerStatsAnalysis';
import { loadHiddenPlayers } from '../../utils/playerStatsAnalysis';

// 同姓同名でライセンスNo.が無い選手は、名簿内で衝突したときだけ背番号込みの
// キーで分けている（buildPlayerKeys）。非表示の保存・判定が氏名から
// キーを組み直していると、片方を非表示にしたつもりで2人とも消える。
// 集計が使っているキー（playerKey）と同じものを使うこと。

function stats(points: number) {
    return {
        points, twoPointMade: 0, twoPointAttempt: 0, threePointMade: 0, threePointAttempt: 0,
        freeThrowMade: 0, freeThrowAttempt: 0, offensiveRebounds: 0, defensiveRebounds: 0,
        assists: 0, steals: 0, blocks: 0, turnovers: 0,
        turnoverDD: 0, turnoverTR: 0, turnoverPM: 0, turnoverCM: 0,
    };
}

function player(id: string, number: number, points: number) {
    return {
        id, number, name: '佐藤', isCaptain: false,
        stats: stats(points), fouls: [], isOnCourt: false,
        quartersPlayed: ['starter', '', '', ''],
    };
}

function seed() {
    const team = {
        id: 't-red', name: 'レッドミニバス', coachName: 'C',
        players: [player('p4', 4, 10), player('p7', 7, 2)],
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
        finalScore: { teamA: 12, teamB: 20 }, gameInfo: { venue: '体育館' },
        scoreHistory: [], statHistory: [], foulHistory: [], quarterMinutes: 6, showThreePoint: false,
    }]));
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('同姓同名の選手の非表示切り替え', () => {
    it('片方だけを非表示にでき、もう片方は一覧に残る', () => {
        seed();
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        // #4 の詳細を開いて非表示にする
        fireEvent.click(screen.getByText('#4').closest('button')!);
        fireEvent.click(screen.getByLabelText('佐藤を選手スタッツ一覧に表示する'));
        fireEvent.click(screen.getByText('一覧'));

        expect(screen.queryByText('#4')).toBeNull();
        expect(screen.getByText('#7')).toBeTruthy();
        expect(loadHiddenPlayers('t-red')).toHaveLength(1);
    });
});
