// 起動時に一度走る savedTeamId の書き戻し。
//
// 判定ルール自体は gameHistoryStorage.backfill.test.ts が押さえている。
// ここで見るのは配線 —— 履歴とマイチームを実際に読み、変化したときだけ保存し、
// その結果として「改名しても過去の試合が分析に残る」ようになること。

import { describe, it, expect, beforeEach } from 'vitest';
import { migrateSavedTeamIds } from './savedTeamIdMigration';
import { loadGameHistory, saveGameResult } from './gameHistoryStorage';
import { saveMyTeam, type SavedTeam } from './teamStorage';
import { getMyTeamGames } from './playerStatsAnalysis';
import { createTeam, createPlayer } from '../types/game';

function savedTeam(id: string, name: string): SavedTeam {
    return {
        id, name, coachName: 'コーチ', assistantCoachName: '', players: [],
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

/** savedTeamId を持たない、この改修より前の形の試合を1件保存する */
function recordLegacyGame(myTeamName: string, opponentName = '相手チーム') {
    const mine = createTeam('teamA', myTeamName, 'コーチ');
    mine.isMyTeam = true;
    const player = createPlayer('teamA-player-0', 4, '選手A');
    player.stats = { ...player.stats, points: 10 };
    player.quartersPlayed = ['starter', false, false, false];
    mine.players = [player];

    const other = createTeam('teamB', opponentName, '相手コーチ');
    saveGameResult(`${myTeamName}の試合`, mine, other, [], [], []);
}

beforeEach(() => {
    localStorage.clear();
});

describe('migrateSavedTeamIds', () => {
    it('旧レコードのマイチーム側に登録チームのidを書き戻して保存する', () => {
        saveMyTeam(savedTeam('t6', '6年生チーム'));
        recordLegacyGame('6年生チーム');

        migrateSavedTeamIds();

        expect(loadGameHistory()[0].teamA.savedTeamId).toBe('t6');
    });

    it('書き戻したあとに改名しても、過去の試合が分析に残る', () => {
        saveMyTeam(savedTeam('t6', '6年生チーム'));
        recordLegacyGame('6年生チーム');

        migrateSavedTeamIds();
        saveMyTeam(savedTeam('t6', 'ミニバスクラブ6年')); // 改名

        expect(getMyTeamGames(savedTeam('t6', 'ミニバスクラブ6年'))).toHaveLength(1);
    });

    it('書き戻しても、別のマイチームの試合は混ざらない', () => {
        saveMyTeam(savedTeam('t6', '6年生チーム'));
        saveMyTeam(savedTeam('t5', '5年生チーム'));
        recordLegacyGame('6年生チーム');
        recordLegacyGame('5年生チーム');

        migrateSavedTeamIds();

        const games = getMyTeamGames(savedTeam('t6', 'ミニバスクラブ6年'));
        expect(games).toHaveLength(1);
        expect(games[0].record.teamA.name).toBe('6年生チーム');
    });

    it('書き戻す対象が無ければ履歴を書き換えない', () => {
        saveMyTeam(savedTeam('t6', '6年生チーム'));
        recordLegacyGame('よその中学');
        const before = localStorage.getItem('minibasket-game-history');

        migrateSavedTeamIds();

        expect(localStorage.getItem('minibasket-game-history')).toBe(before);
    });

    it('マイチームが未登録でも落ちない', () => {
        recordLegacyGame('6年生チーム');

        expect(() => migrateSavedTeamIds()).not.toThrow();
        expect(loadGameHistory()[0].teamA.savedTeamId).toBeUndefined();
    });

    it('二度走らせても結果が変わらない', () => {
        saveMyTeam(savedTeam('t6', '6年生チーム'));
        recordLegacyGame('6年生チーム');

        migrateSavedTeamIds();
        const after1 = localStorage.getItem('minibasket-game-history');
        migrateSavedTeamIds();

        expect(localStorage.getItem('minibasket-game-history')).toBe(after1);
    });
});
