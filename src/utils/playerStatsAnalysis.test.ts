import { describe, it, expect, beforeEach } from 'vitest';
import { aggregatePlayerStats, generatePlayerKey } from './playerStatsAnalysis';
import type { SavedTeam } from './teamStorage';
import { saveGameResult } from './gameHistoryStorage';
import { createTeam, createPlayer } from '../types/game';
import type { QuarterPlayType, FoulRecord } from '../types/game';

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
function recordGame(
    points: number,
    opponentPoints: number,
    date: Date,
    rebounds?: { off: number; def: number },
    quarters?: QuarterPlayType[],
) {
    const teamA = createTeam('teamA', 'マイチーム', 'コーチ');
    teamA.isMyTeam = true;
    const player = createPlayer('teamA-player-0', 4, '選手A', true);
    player.stats.points = points;
    if (rebounds) {
        player.stats.offensiveRebounds = rebounds.off;
        player.stats.defensiveRebounds = rebounds.def;
    }
    if (quarters) {
        player.quartersPlayed = quarters;
    }
    teamA.players = [player];

    const teamB = createTeam('teamB', '相手チーム', '相手コーチ');
    const opponent = createPlayer('teamB-player-0', 6, '相手選手', true);
    opponent.stats.points = opponentPoints;
    teamB.players = [opponent];

    saveGameResult('テスト大会', teamA, teamB, [], [], [], date);
}

/** 同じ選手（同名・同ライセンス）が背番号を変えて出場した試合を1件保存する */
function recordGameWithNumber(number: number, date: Date) {
    const teamA = createTeam('teamA', 'マイチーム', 'コーチ');
    teamA.isMyTeam = true;
    const player = createPlayer('teamA-player-0', number, '選手A', true, undefined, 'L001');
    player.stats.points = 10;
    teamA.players = [player];

    const teamB = createTeam('teamB', '相手チーム', '相手コーチ');
    teamB.players = [createPlayer('teamB-player-0', 6, '相手選手', true)];

    saveGameResult('テスト大会', teamA, teamB, [], [], [], date);
}

/** 指定したファウルを持つ試合を1件保存する */
function recordGameWithFouls(date: Date, fouls: FoulRecord[]) {
    const teamA = createTeam('teamA', 'マイチーム', 'コーチ');
    teamA.isMyTeam = true;
    const player = createPlayer('teamA-player-0', 4, '選手A', true);
    player.stats.points = 10;
    player.fouls = fouls;
    teamA.players = [player];

    const teamB = createTeam('teamB', '相手チーム', '相手コーチ');
    teamB.players = [createPlayer('teamB-player-0', 6, '相手選手', true)];

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

    // 標準偏差は加算できない。OR側とDR側の偏差が打ち消し合う配分だと、
    // stdDev(OR)+stdDev(DR) は実際のばらつきを大きく外す
    it('リバウンドの標準偏差は試合ごとのOR+DRから計算する', () => {
        recordGame(0, 0, new Date('2026-06-01'), { off: 4, def: 0 });
        recordGame(0, 0, new Date('2026-06-08'), { off: 0, def: 4 });

        const playerA = aggregatePlayerStats(myTeam)[0];

        // どちらの試合もREBは4なのでばらつきは0。
        // OR/DRを別々に出すと 2 + 2 = 4 になってしまう
        expect(playerA.avgStats.offensiveRebounds + playerA.avgStats.defensiveRebounds).toBe(4);
        expect(playerA.reboundsStdDev).toBe(0);
    });

    it('リバウンドの標準偏差は実際にばらついていれば0にならない', () => {
        recordGame(0, 0, new Date('2026-06-01'), { off: 1, def: 1 }); // REB 2
        recordGame(0, 0, new Date('2026-06-08'), { off: 3, def: 3 }); // REB 6

        const playerA = aggregatePlayerStats(myTeam)[0];

        // 平均4、偏差±2
        expect(playerA.reboundsStdDev).toBe(2);
    });

    it('1試合しかなければリバウンドの標準偏差は0', () => {
        recordGame(0, 0, new Date('2026-06-01'), { off: 2, def: 3 });

        expect(aggregatePlayerStats(myTeam)[0].reboundsStdDev).toBe(0);
    });

    // ミニバスは全員出場ルールで出場時間の差が大きい。1Qだけ出た試合と4Q出た試合を
    // 同じ「1試合」として平均すると、エースほど過小・控えほど過大に見える
    it('出場クォーター数を試合ごとと通算で集計する', () => {
        recordGame(10, 0, new Date('2026-06-01'), undefined, ['starter', 'sub', false, false]);
        recordGame(20, 0, new Date('2026-06-08'), undefined, ['starter', 'both', 'sub', false]);

        const playerA = aggregatePlayerStats(myTeam)[0];

        expect(playerA.totalQuartersPlayed).toBe(5);
        // gameHistory は新しい順
        expect(playerA.gameHistory.map(g => g.quartersPlayed)).toEqual([3, 2]);
    });

    it('OTに出た分も出場クォーターに数える', () => {
        recordGame(10, 0, new Date('2026-06-01'), undefined, ['starter', 'sub', 'sub', 'sub', 'starter']);

        expect(aggregatePlayerStats(myTeam)[0].totalQuartersPlayed).toBe(5);
    });

    it('出場クォーターが記録されていない旧データは0のまま（推測しない）', () => {
        recordGame(10, 0, new Date('2026-06-01'), undefined, [false, false, false, false]);

        const playerA = aggregatePlayerStats(myTeam)[0];
        // 得点があるので集計対象には入るが、出場Qは水増ししない
        expect(playerA.gamesPlayed).toBe(1);
        expect(playerA.totalQuartersPlayed).toBe(0);
    });

    // 背番号は「いちばん新しい試合のもの」を出したい。以前は push 済みの
    // gameHistory[0]（＝最初に走査した試合）を基準に比較していたため、
    // 基準より新しい試合が複数あると最大日付ではなく最後に走査したものが勝っていた。
    // 履歴は保存順で並ぶので、過去の試合を後から入力すると日付順と食い違う
    it('背番号は最新の試合のものを使う（記録した順に関係なく）', () => {
        // 履歴は保存順（新しく保存したものが先頭）で並ぶので、
        // この保存順だと配列は [4/15, 6/1, 5/1] になる。
        // 走査は 4/15 が基準になり、そのあと 6/1 → 5/1 と続く。
        // 「基準より新しいものを見るたび上書き」だと最後の 5/1 が勝ってしまう
        recordGameWithNumber(5, new Date('2026-05-01'));
        recordGameWithNumber(7, new Date('2026-06-01'));
        recordGameWithNumber(4, new Date('2026-04-15'));

        // いちばん新しいのは 6/1 の #7
        expect(aggregatePlayerStats(myTeam)[0].number).toBe(7);
    });

    it('日付順に記録した場合も最新の背番号になる', () => {
        recordGameWithNumber(4, new Date('2026-04-15'));
        recordGameWithNumber(5, new Date('2026-05-01'));
        recordGameWithNumber(7, new Date('2026-06-01'));

        expect(aggregatePlayerStats(myTeam)[0].number).toBe(7);
    });

    // ファウルは PlayerStats に無いので集計から漏れていた。
    // 試合中のTeamPanelには出るのに、成長を追う画面にだけ無かった
    it('ファウル数を試合ごとと通算で集計する', () => {
        recordGameWithFouls(new Date('2026-06-01'), [{ type: 'P', freeThrows: 0 }, { type: 'P', freeThrows: 0 }]);
        recordGameWithFouls(new Date('2026-06-08'), [{ type: 'U', freeThrows: 2 }]);

        const playerA = aggregatePlayerStats(myTeam)[0];

        expect(playerA.totalFouls).toBe(3);
        // gameHistory は新しい順
        expect(playerA.gameHistory.map(g => g.fouls)).toEqual([1, 2]);
    });

    it('退場・失格した試合数を数える', () => {
        const five = Array.from({ length: 5 }, () => ({ type: 'P' as const, freeThrows: 0 }));
        recordGameWithFouls(new Date('2026-06-01'), five);                       // 5ファウル
        recordGameWithFouls(new Date('2026-06-08'), [{ type: 'D', freeThrows: 2 }]); // 失格
        recordGameWithFouls(new Date('2026-06-15'), [{ type: 'P', freeThrows: 0 }]); // 通常

        expect(aggregatePlayerStats(myTeam)[0].foulOutGames).toBe(2);
    });

    it('ファウルが無い選手は0', () => {
        recordGame(10, 0, new Date('2026-06-01'));

        const playerA = aggregatePlayerStats(myTeam)[0];
        expect(playerA.totalFouls).toBe(0);
        expect(playerA.foulOutGames).toBe(0);
    });

    it('期間フィルタで範囲外の試合は集計されない', () => {
        recordGame(10, 5, new Date('2026-05-01'));
        recordGame(20, 5, new Date('2026-06-15'));

        const stats = aggregatePlayerStats(myTeam, new Date('2026-06-01'));
        expect(stats[0].gamesPlayed).toBe(1);
        expect(stats[0].totalStats.points).toBe(20);
    });
});
