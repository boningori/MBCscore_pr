// 選手ごとのフィールドが欠けた試合レコードで、集計が落ちないこと。
//
// 実測: 履歴の1レコードで1選手の stats を落とすと、選手スタッツ分析が
// 「Cannot read properties of undefined (reading 'points')」で落ち、
// ErrorBoundary によってアプリ全体がエラー画面に置き換わる。データは
// localStorage に残っているのでリロードしても再発し、しかもエラー画面は
// どのレコードが原因かを示さないため、利用者には直しようがない。
//
// 経路はバックアップJSONのインポート（dataBackup の sanitizeImportedGame は
// 「players が配列でオブジェクトであること」までしか矯正しない）。
// 取り込み側を直しても、既に入ってしまったデータは読み側が耐える必要がある。

import { describe, it, expect, beforeEach } from 'vitest';
import { aggregatePlayerStats, getTeamRecord } from './playerStatsAnalysis';
import { loadGameHistory, saveGameHistory, saveGameResult } from './gameHistoryStorage';
import type { SavedTeam } from './teamStorage';
import { createTeam, createPlayer } from '../types/game';
import type { Player } from '../types/game';

const myTeam: SavedTeam = {
    id: 'team-1',
    name: 'マイチーム',
    coachName: 'コーチ',
    assistantCoachName: '',
    players: [
        { number: 4, name: '選手A', isCaptain: true },
        { number: 5, name: '選手B', isCaptain: false },
    ],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
};

/** 選手A（10点）と選手B の2人が出場した試合を1件保存する */
function recordGame(date: Date) {
    const teamA = createTeam('teamA', 'マイチーム', 'コーチ');
    teamA.isMyTeam = true;
    teamA.savedTeamId = myTeam.id;
    const a = createPlayer('teamA-player-0', 4, '選手A', true);
    a.stats.points = 10;
    a.quartersPlayed = ['starter', 'starter', false, false];
    const b = createPlayer('teamA-player-1', 5, '選手B');
    b.stats.points = 4;
    b.quartersPlayed = ['starter', false, false, false];
    teamA.players = [a, b];

    const teamB = createTeam('teamB', '相手チーム', '相手コーチ');
    const opponent = createPlayer('teamB-player-0', 6, '相手選手', true);
    opponent.stats.points = 8;
    teamB.players = [opponent];

    saveGameResult('テスト大会', teamA, teamB, [], [], [], date);
}

/** 保存済みの最新レコードから、指定した選手のフィールドを1つ落とす */
function breakPlayerField(index: number, field: keyof Player) {
    const history = loadGameHistory();
    const player = history[0].teamA.players[index] as Partial<Player>;
    delete player[field];
    saveGameHistory(history);
}

describe('選手のフィールドが欠けた試合レコード', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('stats を持たない選手がいても集計が落ちない', () => {
        recordGame(new Date('2026-07-10'));
        breakPlayerField(0, 'stats');

        expect(() => aggregatePlayerStats(myTeam)).not.toThrow();
    });

    it('壊れた選手以外の集計は従来どおり出る', () => {
        recordGame(new Date('2026-07-10'));
        breakPlayerField(0, 'stats');

        const stats = aggregatePlayerStats(myTeam);
        const b = stats.find(p => p.name === '選手B');
        expect(b?.gamesPlayed).toBe(1);
        expect(b?.totalStats.points).toBe(4);
    });

    it('stats が欠けた選手も、出場クォーターが残っていれば0点として数える', () => {
        // 記録が壊れているのは stats だけで、出場した事実は残っている。
        // 一覧から丸ごと消すと、チームサマリーの試合数と食い違ううえ、
        // 「なぜこの選手だけ居ないのか」が画面から読めない
        recordGame(new Date('2026-07-10'));
        breakPlayerField(0, 'stats');

        const a = aggregatePlayerStats(myTeam).find(p => p.name === '選手A');
        expect(a?.gamesPlayed).toBe(1);
        expect(a?.totalStats.points).toBe(0);
        expect(a?.totalQuartersPlayed).toBe(2);
    });

    it('fouls / quartersPlayed が欠けていても落ちない', () => {
        recordGame(new Date('2026-07-10'));
        breakPlayerField(0, 'fouls');
        breakPlayerField(1, 'quartersPlayed');

        expect(() => aggregatePlayerStats(myTeam)).not.toThrow();
        expect(getTeamRecord(myTeam).totalGames).toBe(1);
    });

    it('壊れたレコードが混ざっていても、正常なレコードの通算は変わらない', () => {
        recordGame(new Date('2026-07-10'));
        recordGame(new Date('2026-07-17'));
        breakPlayerField(0, 'stats'); // 新しい方の1件だけ壊す

        const a = aggregatePlayerStats(myTeam).find(p => p.name === '選手A');
        expect(a?.gamesPlayed).toBe(2);
        expect(a?.totalStats.points).toBe(10);
    });
});

// 期間の絞り込みは new Date(record.date) の大小で判定している。
// 読めない日付は Invalid Date になり、< も > も false を返すため、
// どの期間で絞ってもすり抜けていた。
// 実測(v1.6.10): 日付を壊した1件が「2030年のみ」の絞り込みでも 1件・
// gamesPlayed 1 として出る。チームサマリーの試合数・勝率も同じ。
// repairGameRecords は gameName と配列は矯正するが date は見ていない。
describe('日付が読めない試合レコード', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    /** 保存済みの最新レコードの日付を、読めない文字列にする */
    function breakDate() {
        const history = loadGameHistory();
        history[0].date = 'こわれた日付';
        saveGameHistory(history);
    }

    it('期間で絞ったら、日付の読めない試合は入れない', () => {
        recordGame(new Date('2026-07-10'));
        breakDate();

        const stats = aggregatePlayerStats(myTeam, new Date('2030-01-01'), new Date('2030-12-31'));

        expect(stats).toHaveLength(0);
    });

    it('チームの戦績でも同じく除く', () => {
        recordGame(new Date('2026-07-10'));
        breakDate();

        expect(getTeamRecord(myTeam, new Date('2030-01-01'), new Date('2030-12-31')).totalGames).toBe(0);
    });

    it('片側だけの絞り込みでも除く', () => {
        recordGame(new Date('2026-07-10'));
        breakDate();

        expect(aggregatePlayerStats(myTeam, new Date('2030-01-01'))).toHaveLength(0);
        expect(aggregatePlayerStats(myTeam, undefined, new Date('2000-01-01'))).toHaveLength(0);
    });

    it('絞り込みが無ければ従来どおり通算に含める（記録を消さない）', () => {
        recordGame(new Date('2026-07-10'));
        breakDate();

        const stats = aggregatePlayerStats(myTeam);
        expect(stats.find(p => p.name === '選手A')?.gamesPlayed).toBe(1);
        expect(getTeamRecord(myTeam).totalGames).toBe(1);
    });

    it('健全なレコードは絞り込みで従来どおり残る', () => {
        recordGame(new Date('2026-07-10'));

        const stats = aggregatePlayerStats(myTeam, new Date('2026-07-01'), new Date('2026-07-31'));
        expect(stats.find(p => p.name === '選手A')?.gamesPlayed).toBe(1);
    });
});
