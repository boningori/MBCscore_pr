import { describe, it, expect, beforeEach } from 'vitest';
import { saveGameResult, loadGameHistory, deleteGameRecord } from './gameHistoryStorage';
import { createTeam, createPlayer } from '../types/game';

// App.tsx と同じく <input type="date"> の YYYY-MM-DD を Date にして渡す
function recordGame(gameName: string, dateStr: string) {
    const teamA = createTeam('teamA', 'マイチーム', 'コーチ');
    teamA.players = [createPlayer('teamA-player-0', 4, '選手A', true)];
    const teamB = createTeam('teamB', '相手チーム', '相手コーチ');
    return saveGameResult(gameName, teamA, teamB, [], [], [], new Date(dateStr));
}

describe('gameHistoryStorage: 試合IDの一意性', () => {
    beforeEach(() => localStorage.clear());

    it('同じ日に複数試合を保存してもIDが衝突しない', () => {
        recordGame('第1試合', '2026-07-04');
        recordGame('第2試合', '2026-07-04');
        recordGame('第3試合', '2026-07-04');

        const ids = loadGameHistory().map(g => g.id);
        expect(new Set(ids).size).toBe(3);
    });
});

// 旧バージョンが書いた、同日の試合が全て同一IDになっている履歴
function seedLegacyHistory() {
    const legacy = [
        { id: 'game-1783209600000', date: '2026-07-05T00:00:00.000Z', gameName: '2日目 第1試合', createdAt: '2026-07-05T02:00:00.000Z', teamA: { name: 'A', players: [] }, teamB: { name: 'B', players: [] }, finalScore: { teamA: 10, teamB: 8 }, scoreHistory: [], statHistory: [], foulHistory: [] },
        { id: 'game-1783209600000', date: '2026-07-05T00:00:00.000Z', gameName: '2日目 第2試合', createdAt: '2026-07-05T04:00:00.000Z', teamA: { name: 'A', players: [] }, teamB: { name: 'C', players: [] }, finalScore: { teamA: 12, teamB: 20 }, scoreHistory: [], statHistory: [], foulHistory: [] },
        { id: 'game-1783123200000', date: '2026-07-04T00:00:00.000Z', gameName: '1日目 第1試合', createdAt: '2026-07-04T02:00:00.000Z', teamA: { name: 'A', players: [] }, teamB: { name: 'D', players: [] }, finalScore: { teamA: 30, teamB: 11 }, scoreHistory: [], statHistory: [], foulHistory: [] },
        { id: 'game-1783123200000', date: '2026-07-04T00:00:00.000Z', gameName: '1日目 第2試合', createdAt: '2026-07-04T04:00:00.000Z', teamA: { name: 'A', players: [] }, teamB: { name: 'E', players: [] }, finalScore: { teamA: 9, teamB: 9 }, scoreHistory: [], statHistory: [], foulHistory: [] },
    ];
    localStorage.setItem('minibasket-game-history', JSON.stringify(legacy));
}

describe('gameHistoryStorage: 既存データの重複ID修復', () => {
    beforeEach(() => localStorage.clear());

    it('重複IDの履歴を読み込むと、件数を保ったままIDが振り直される', () => {
        seedLegacyHistory();

        const history = loadGameHistory();

        expect(history).toHaveLength(4);
        expect(new Set(history.map(g => g.id)).size).toBe(4);
        expect(history.map(g => g.gameName)).toEqual([
            '2日目 第1試合', '2日目 第2試合', '1日目 第1試合', '1日目 第2試合',
        ]);
    });

    it('修復結果が保存され、次回読み込みでもIDが変わらない', () => {
        seedLegacyHistory();

        const first = loadGameHistory().map(g => g.id);
        const second = loadGameHistory().map(g => g.id);

        expect(second).toEqual(first);
    });

    it('修復後は1試合を削除しても同日の他の試合が残る', () => {
        seedLegacyHistory();
        const history = loadGameHistory();

        deleteGameRecord(history[0].id);

        const after = loadGameHistory();
        expect(after).toHaveLength(3);
        expect(after.map(g => g.gameName)).toContain('2日目 第2試合');
    });
});
