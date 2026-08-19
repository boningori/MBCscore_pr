// 手動で統合したカードが1枚にまとまること。
//
// 自動の名寄せ（buildIdentityAliases）は氏名を手掛かりにするので、氏名そのものが
// 動くケース（全角/半角スペース、誤字の訂正、コートネーム）は救えない。
// そこは利用者が統合して直す。手動が常に自動判定に勝つ。

import { describe, it, expect, beforeEach } from 'vitest';
import { aggregatePlayerStats } from './playerStatsAnalysis';
import { saveMergedPlayers } from './mergedPlayers';
import type { SavedTeam } from './teamStorage';
import { saveGameResult } from './gameHistoryStorage';
import { createTeam, createPlayer } from '../types/game';

const MY_TEAM: SavedTeam = {
    id: 't1', name: 'チーム', coachName: 'C', assistantCoachName: '',
    players: [{ number: 4, uniformNumber: 4, name: '佐藤 太郎', isCaptain: false }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

function recordGame(name: string, number: number, points: number, date: string) {
    const p = createPlayer('p', number, name);
    p.stats = { ...p.stats, points };
    p.quartersPlayed = ['starter', 'starter', false, false];
    const mine = createTeam('teamA', MY_TEAM.name, 'C');
    mine.isMyTeam = true;
    mine.savedTeamId = MY_TEAM.id;
    mine.players = [p];
    const other = createTeam('teamB', '相手', 'C');
    other.players = [createPlayer('b', 9, '相手')];
    saveGameResult('試合', mine, other, [], [], [], new Date(date));
}

beforeEach(() => localStorage.clear());

describe('手動統合の反映', () => {
    it('統合すると1枚になり、通算・試合数・出場Qが合算される', () => {
        recordGame('佐藤　太郎', 4, 10, '2026-04-01'); // 全角スペース
        recordGame('佐藤 太郎', 4, 8, '2026-06-01');
        expect(aggregatePlayerStats(MY_TEAM)).toHaveLength(2);

        saveMergedPlayers(MY_TEAM.id, { '佐藤　太郎': '佐藤 太郎' });
        const result = aggregatePlayerStats(MY_TEAM);

        expect(result).toHaveLength(1);
        expect(result[0].playerKey).toBe('佐藤 太郎');
        expect(result[0].gamesPlayed).toBe(2);
        expect(result[0].totalStats.points).toBe(18);
        expect(result[0].totalQuartersPlayed).toBe(4);
    });

    it('試合別履歴が日付の新しい順に並んだまま合算される', () => {
        recordGame('佐藤　太郎', 4, 10, '2026-04-01');
        recordGame('佐藤 太郎', 4, 8, '2026-06-01');
        saveMergedPlayers(MY_TEAM.id, { '佐藤　太郎': '佐藤 太郎' });

        const dates = aggregatePlayerStats(MY_TEAM)[0].gameHistory.map(g => g.date.slice(0, 10));

        expect(dates).toEqual(['2026-06-01', '2026-04-01']);
    });

    it('代表の氏名と背番号は代表キーの記録のうちいちばん新しいものを使う', () => {
        // 代表キー側の記録のほうが古くても、代表の表記を使う
        recordGame('佐藤 太郎', 4, 10, '2026-04-01');
        recordGame('タロウ', 7, 8, '2026-06-01');
        saveMergedPlayers(MY_TEAM.id, { 'タロウ': '佐藤 太郎' });

        const result = aggregatePlayerStats(MY_TEAM);

        expect(result[0].name).toBe('佐藤 太郎');
        expect(result[0].number).toBe(4);
    });

    it('代表キーの記録が1件も無ければ、組の中でいちばん新しい記録の表記を使う', () => {
        recordGame('タロウ', 7, 8, '2026-06-01');
        saveMergedPlayers(MY_TEAM.id, { 'タロウ': '佐藤 太郎' });

        const result = aggregatePlayerStats(MY_TEAM);

        expect(result).toHaveLength(1);
        expect(result[0].playerKey).toBe('佐藤 太郎');
        expect(result[0].name).toBe('タロウ');
        expect(result[0].number).toBe(7);
    });

    it('期間で絞っても統合は外れない', () => {
        recordGame('佐藤　太郎', 4, 10, '2026-04-01');
        recordGame('佐藤 太郎', 4, 8, '2026-06-01');
        saveMergedPlayers(MY_TEAM.id, { '佐藤　太郎': '佐藤 太郎' });

        const result = aggregatePlayerStats(MY_TEAM, new Date('2026-05-01T00:00:00.000Z'));

        expect(result).toHaveLength(1);
        expect(result[0].gamesPlayed).toBe(1);
    });

    it('統合したキーを非表示にすると一覧から消える', () => {
        recordGame('佐藤　太郎', 4, 10, '2026-04-01');
        recordGame('佐藤 太郎', 4, 8, '2026-06-01');
        saveMergedPlayers(MY_TEAM.id, { '佐藤　太郎': '佐藤 太郎' });
        localStorage.setItem('minibasket-hidden-players', JSON.stringify({ [MY_TEAM.id]: ['佐藤 太郎'] }));

        expect(aggregatePlayerStats(MY_TEAM)).toHaveLength(0);
        expect(aggregatePlayerStats(MY_TEAM, undefined, undefined, { includeHidden: true })).toHaveLength(1);
    });

    it('記録に存在しないキーが対応表に残っていても壊れない', () => {
        recordGame('佐藤 太郎', 4, 8, '2026-06-01');
        saveMergedPlayers(MY_TEAM.id, { '居ない人': '別の居ない人' });

        const result = aggregatePlayerStats(MY_TEAM);

        expect(result.map(r => r.playerKey)).toEqual(['佐藤 太郎']);
    });

    it('別チームの対応表は効かない', () => {
        recordGame('佐藤　太郎', 4, 10, '2026-04-01');
        recordGame('佐藤 太郎', 4, 8, '2026-06-01');
        saveMergedPlayers('別チーム', { '佐藤　太郎': '佐藤 太郎' });

        expect(aggregatePlayerStats(MY_TEAM)).toHaveLength(2);
    });
});
