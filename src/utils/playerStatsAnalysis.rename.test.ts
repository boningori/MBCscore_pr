// マイチームを改名しても、改名前に記録した試合が分析から消えないこと。
//
// GameRecord に残るのは記録時点のチーム名だけなので、名前だけで照合すると
// 改名した瞬間に過去の試合が試合数・平均・成長グラフから丸ごと抜ける
// （試合履歴の一覧には残るので、消えたことに気付きにくい）。
// 記録時にマイチーム側へ SavedTeam の id を残し、id があれば id で照合する。

import { describe, it, expect, beforeEach } from 'vitest';
import { aggregatePlayerStats, getMyTeamGames } from './playerStatsAnalysis';
import type { SavedTeam } from './teamStorage';
import { saveGameResult } from './gameHistoryStorage';
import { createTeam, createPlayer } from '../types/game';

function savedTeam(id: string, name: string): SavedTeam {
    return {
        id, name, coachName: 'コーチ', assistantCoachName: '', players: [],
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

function scoringPlayer(id: string, number: number, name: string, points: number) {
    const p = createPlayer(id, number, name);
    p.stats = { ...p.stats, points };
    p.quartersPlayed = ['starter', false, false, false];
    return p;
}

/**
 * 1試合保存する。
 * @param savedTeamId マイチーム側に残す SavedTeam の id（省略＝この改修より前の旧データ）
 * @param opponentSavedTeamId 相手側の id。通常は付かないので省略
 */
function recordGame(opts: {
    myTeamName: string;
    playerName: string;
    savedTeamId?: string;
    opponentName?: string;
    date?: string;
}) {
    const { myTeamName, playerName, savedTeamId, opponentName = '相手チーム', date } = opts;

    const mine = createTeam('teamA', myTeamName, 'コーチ');
    mine.isMyTeam = true;
    mine.savedTeamId = savedTeamId;
    mine.players = [scoringPlayer('teamA-player-0', 4, playerName, 10)];

    const other = createTeam('teamB', opponentName, '相手コーチ');
    other.players = [scoringPlayer('teamB-player-0', 6, '相手選手', 8)];

    saveGameResult(`${myTeamName}の試合`, mine, other, [], [], [], date ? new Date(date) : undefined);
}

beforeEach(() => {
    localStorage.clear();
});

describe('getMyTeamGames: マイチームを改名した場合', () => {
    it('改名前に記録した試合が分析に残る', () => {
        recordGame({ myTeamName: '6年生チーム', playerName: '六年 A', savedTeamId: 't6' });

        const games = getMyTeamGames(savedTeam('t6', 'ミニバスクラブ6年'));

        expect(games).toHaveLength(1);
        expect(games[0].record.teamA.name).toBe('6年生チーム');
        expect(games[0].isTeamA).toBe(true);
    });

    it('改名しても別のマイチームの試合は混ざらない', () => {
        recordGame({ myTeamName: '6年生チーム', playerName: '六年 A', savedTeamId: 't6' });
        recordGame({ myTeamName: '5年生チーム', playerName: '五年 B', savedTeamId: 't5' });

        const games = getMyTeamGames(savedTeam('t6', 'ミニバスクラブ6年'));

        expect(games).toHaveLength(1);
        expect(games[0].record.teamA.name).toBe('6年生チーム');
    });

    it('idを持つ側は、名前が一致してもidが違えば拾わない', () => {
        // 旧名「6年生チーム」を別のマイチームが引き継いだ状況
        recordGame({ myTeamName: '6年生チーム', playerName: '五年 B', savedTeamId: 't5' });

        expect(getMyTeamGames(savedTeam('t6', '6年生チーム'))).toHaveLength(0);
    });

    it('idを持たない旧データは現在の名前で拾う', () => {
        recordGame({ myTeamName: '6年生チーム', playerName: '六年 A' });

        expect(getMyTeamGames(savedTeam('t6', '6年生チーム'))).toHaveLength(1);
    });

    it('相手側にidが無ければ名前で拾える（自分の別チームが相手のとき）', () => {
        recordGame({
            myTeamName: '6年生チーム', playerName: '六年 A', savedTeamId: 't6',
            opponentName: '5年生チーム',
        });

        const games = getMyTeamGames(savedTeam('t5', '5年生チーム'));

        expect(games).toHaveLength(1);
        expect(games[0].isTeamA).toBe(false);
    });
});

describe('aggregatePlayerStats: マイチームを改名した場合', () => {
    it('改名前後の試合を1人の選手として合算する', () => {
        recordGame({ myTeamName: '6年生チーム', playerName: '六年 A', savedTeamId: 't6', date: '2026-04-01' });
        recordGame({ myTeamName: 'ミニバスクラブ6年', playerName: '六年 A', savedTeamId: 't6', date: '2026-05-01' });

        const stats = aggregatePlayerStats(savedTeam('t6', 'ミニバスクラブ6年'));

        expect(stats).toHaveLength(1);
        expect(stats[0].gamesPlayed).toBe(2);
        expect(stats[0].totalStats.points).toBe(20);
    });
});
