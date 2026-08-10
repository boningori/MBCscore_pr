import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveGameResult, loadGameHistory, deleteGameRecord } from './gameHistoryStorage';
import { createTeam, createPlayer } from '../types/game';

// App.tsx と同じく <input type="date"> の YYYY-MM-DD を Date にして渡す
function recordGame(gameName: string, dateStr: string) {
    const teamA = createTeam('teamA', 'マイチーム', 'コーチ');
    teamA.players = [createPlayer('teamA-player-0', 4, '選手A', true)];
    const teamB = createTeam('teamB', '相手チーム', '相手コーチ');
    return saveGameResult(gameName, teamA, teamB, [], [], [], new Date(dateStr));
}

// setItem のスパイは、途中でアサーションが落ちると復元されないまま
// 後続のテストへ漏れる（実際に他4件を巻き込んだ）。ここで必ず戻す
afterEach(() => vi.restoreAllMocks());

/** localStorage への書き込みを失敗させる */
function failStorageWrites() {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
    });
}

// 呼び出し側は保存の成否を見て「中断セッションを消してよいか」を決める。
// 失敗を握りつぶすと、履歴にもセッションにも残らない試合が生まれる
describe('gameHistoryStorage: 保存の成否を返す', () => {
    beforeEach(() => localStorage.clear());

    it('保存できたら saved: true と保存したレコードを返す', () => {
        const result = recordGame('第1試合', '2026-07-04');

        expect(result.saved).toBe(true);
        expect(result.record.gameName).toBe('第1試合');
        expect(loadGameHistory()).toHaveLength(1);
    });

    it('保存できなかったら saved: false を返す', () => {
        failStorageWrites();

        const result = recordGame('保存できない試合', '2026-07-04');

        expect(result.saved).toBe(false);
        // レコード自体は返す（呼び出し側が再試行やバックアップに使えるように）
        expect(result.record.gameName).toBe('保存できない試合');

        vi.restoreAllMocks();
        expect(loadGameHistory()).toHaveLength(0);
    });
});

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

describe('試合ごとの設定の保存', () => {
    // 5分制か6分制か、3P入力を使ったかは「記録を読むときの前提」。
    // 保存していなかったため、履歴から開いた時点で分からなくなっていた
    it('showThreePoint と quarterMinutes を記録に残す', () => {
        const { record } = saveGameResult(
            'テスト', createTeam('teamA','マイチーム','コーチ'), createTeam('teamB','相手チーム','相手コーチ'), [], [], [],
            new Date('2026-06-05'), undefined, [],
            { showThreePoint: true, quarterMinutes: 5 },
        );

        expect(record.showThreePoint).toBe(true);
        expect(record.quarterMinutes).toBe(5);
        expect(loadGameHistory()[0].quarterMinutes).toBe(5);
    });

    it('渡さなければ項目を作らない（旧レコードと同じ形のまま）', () => {
        const { record } = saveGameResult(
            'テスト', createTeam('teamA','マイチーム','コーチ'), createTeam('teamB','相手チーム','相手コーチ'), [], [], [], new Date('2026-06-05'),
        );

        expect('showThreePoint' in record).toBe(false);
        expect('quarterMinutes' in record).toBe(false);
    });
});
