// マイチームを複数登録している場合の試合の振り分け。
//
// GameRecord は SavedTeam の id を持たず、isMyTeam は「どちら側がマイチームか」
// しか示さない。フラグだけで拾うと、学年別・男女別に複数チームを見るコーチの
// 環境で別チームの試合まで混ざり、試合数も平均も成長グラフも狂う。

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
 * @param myTeamSide マイチームをどちら側（白=teamA / 青=teamB）に置くか
 */
function recordGame(opts: {
    myTeamName: string;
    playerName: string;
    opponentName?: string;
    myTeamSide?: 'teamA' | 'teamB';
}) {
    const { myTeamName, playerName, opponentName = '相手チーム', myTeamSide = 'teamA' } = opts;
    const mine = createTeam(myTeamSide, myTeamName, 'コーチ');
    mine.isMyTeam = true;
    mine.players = [scoringPlayer(`${myTeamSide}-player-0`, 4, playerName, 10)];

    const otherSide = myTeamSide === 'teamA' ? 'teamB' : 'teamA';
    const other = createTeam(otherSide, opponentName, '相手コーチ');
    other.players = [scoringPlayer(`${otherSide}-player-0`, 6, '相手選手', 8)];

    const teamA = myTeamSide === 'teamA' ? mine : other;
    const teamB = myTeamSide === 'teamA' ? other : mine;
    saveGameResult(`${myTeamName}の試合`, teamA, teamB, [], [], []);
}

beforeEach(() => {
    localStorage.clear();
});

describe('getMyTeamGames: マイチームが複数ある場合', () => {
    it('別のマイチームの試合を拾わない', () => {
        recordGame({ myTeamName: '6年生チーム', playerName: '六年 A' });
        recordGame({ myTeamName: '5年生チーム', playerName: '五年 B' });

        const games = getMyTeamGames(savedTeam('t6', '6年生チーム'));

        expect(games).toHaveLength(1);
        expect(games[0].record.teamA.name).toBe('6年生チーム');
        expect(games[0].isTeamA).toBe(true);
    });

    it('マイチームが青（teamB）側の試合も拾う', () => {
        recordGame({ myTeamName: '6年生チーム', playerName: '六年 A', myTeamSide: 'teamB' });

        const games = getMyTeamGames(savedTeam('t6', '6年生チーム'));

        expect(games).toHaveLength(1);
        expect(games[0].isTeamA).toBe(false);
    });

    it('自分のチームが登場しない試合は拾わない', () => {
        recordGame({ myTeamName: '5年生チーム', playerName: '五年 B' });

        expect(getMyTeamGames(savedTeam('t6', '6年生チーム'))).toHaveLength(0);
    });

    it('紅白戦（両チーム同名）ではisMyTeamの側を採る', () => {
        const teamA = createTeam('teamA', '6年生チーム', 'コーチ');
        teamA.players = [scoringPlayer('teamA-player-0', 4, '紅 A', 10)];
        const teamB = createTeam('teamB', '6年生チーム', 'コーチ');
        teamB.isMyTeam = true;
        teamB.players = [scoringPlayer('teamB-player-0', 5, '白 B', 8)];
        saveGameResult('紅白戦', teamA, teamB, [], [], []);

        const games = getMyTeamGames(savedTeam('t6', '6年生チーム'));

        expect(games).toHaveLength(1);
        expect(games[0].isTeamA).toBe(false);
    });
});

describe('aggregatePlayerStats: マイチームが複数ある場合', () => {
    it('別のマイチームの選手が一覧に現れない', () => {
        recordGame({ myTeamName: '6年生チーム', playerName: '六年 A' });
        recordGame({ myTeamName: '5年生チーム', playerName: '五年 B' });

        const stats = aggregatePlayerStats(savedTeam('t6', '6年生チーム'));

        expect(stats.map(s => s.name)).toEqual(['六年 A']);
        expect(stats[0].gamesPlayed).toBe(1);
    });

    it('マイチームが1つだけなら従来どおり集計できる', () => {
        recordGame({ myTeamName: 'マイチーム', playerName: '選手A' });
        recordGame({ myTeamName: 'マイチーム', playerName: '選手A' });

        const stats = aggregatePlayerStats(savedTeam('t1', 'マイチーム'));

        expect(stats).toHaveLength(1);
        expect(stats[0].gamesPlayed).toBe(2);
        expect(stats[0].totalStats.points).toBe(20);
    });
});
