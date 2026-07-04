import { describe, it, expect, beforeEach } from 'vitest';
import { aggregatePlayerStats, generatePlayerKey } from './playerStatsAnalysis';
import type { SavedTeam } from './teamStorage';
import { saveGameResult } from './gameHistoryStorage';
import { createTeam, createPlayer } from '../types/game';

const myTeam: SavedTeam = {
    id: 'team-1',
    name: 'マイチーム',
    coachName: 'コーチ',
    assistantCoachName: '',
    players: [{ number: 4, name: '選手A', isCaptain: true }],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
};

// 選手Aがpoints得点した試合を1件保存するヘルパー
function recordGame(points: number, opponentPoints: number, date: Date) {
    const teamA = createTeam('teamA', 'マイチーム', 'コーチ');
    teamA.isMyTeam = true;
    const player = createPlayer('teamA-player-0', 4, '選手A', true);
    player.stats.points = points;
    teamA.players = [player];

    const teamB = createTeam('teamB', '相手チーム', '相手コーチ');
    const opponent = createPlayer('teamB-player-0', 6, '相手選手', true);
    opponent.stats.points = opponentPoints;
    teamB.players = [opponent];

    saveGameResult('テスト大会', teamA, teamB, [], [], [], date);
}

describe('playerStatsAnalysis', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('generatePlayerKey: ライセンスNoがあれば名前_番号、なければ名前のみ', () => {
        expect(generatePlayerKey('選手A', 'AB123')).toBe('選手A_AB123');
        expect(generatePlayerKey('選手A')).toBe('選手A');
    });

    it('複数試合の合計・平均・出場試合数・勝敗が正しく集計される', () => {
        recordGame(10, 5, new Date('2026-06-01'));  // 勝ち
        recordGame(20, 30, new Date('2026-06-08')); // 負け

        const stats = aggregatePlayerStats(myTeam);
        expect(stats).toHaveLength(1);
        const playerA = stats[0];
        expect(playerA.name).toBe('選手A');
        expect(playerA.gamesPlayed).toBe(2);
        expect(playerA.totalStats.points).toBe(30);
        expect(playerA.avgStats.points).toBe(15);
        expect(playerA.gameHistory.map(g => g.result).sort()).toEqual(['loss', 'win']);
    });

    it('期間フィルタで範囲外の試合は集計されない', () => {
        recordGame(10, 5, new Date('2026-05-01'));
        recordGame(20, 5, new Date('2026-06-15'));

        const stats = aggregatePlayerStats(myTeam, new Date('2026-06-01'));
        expect(stats[0].gamesPlayed).toBe(1);
        expect(stats[0].totalStats.points).toBe(20);
    });
});
