// 同姓（ライセンスNo.未入力）の選手が、試合ごとに別人へ割れないこと。
//
// 識別キーは氏名＋ライセンスNo.。ライセンスNo.は任意入力なので、未入力だと
// 氏名だけになる。名簿内で衝突したときは背番号を足して分けるが、その判定を
// 「その試合の名簿の中」だけで行っていたため、同姓の相方が欠席した試合では
// キーが氏名だけに戻り、同一人物の履歴が2枚のカードに割れていた
// （実測: 2試合で「佐藤」「佐藤#4」「佐藤#7」の3人が並ぶ）。
// 割れたカードはどちらも通算・平均・成長グラフが実態と違う。

import { describe, it, expect, beforeEach } from 'vitest';
import { aggregatePlayerStats } from './playerStatsAnalysis';
import type { SavedTeam } from './teamStorage';
import { saveGameResult } from './gameHistoryStorage';
import { createTeam, createPlayer } from '../types/game';

const MY_TEAM: SavedTeam = {
    id: 't6', name: '6年生チーム', coachName: 'コーチ', assistantCoachName: '', players: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

function scorer(id: string, number: number, name: string, points: number) {
    const p = createPlayer(id, number, name);
    p.stats = { ...p.stats, points };
    p.quartersPlayed = ['starter', false, false, false];
    return p;
}

function recordGame(players: ReturnType<typeof scorer>[], date: string) {
    const mine = createTeam('teamA', MY_TEAM.name, 'コーチ');
    mine.isMyTeam = true;
    mine.savedTeamId = MY_TEAM.id;
    mine.players = players;
    const other = createTeam('teamB', '相手', 'コーチ');
    other.players = [scorer('b0', 6, '相手選手', 0)];
    saveGameResult('試合', mine, other, [], [], [], new Date(date));
}

beforeEach(() => localStorage.clear());

describe('同姓選手の識別キー', () => {
    it('相方が欠席した試合も同じ選手として集計される', () => {
        // 第1節: 佐藤が2人（名簿内で衝突）
        recordGame([scorer('p4', 4, '佐藤', 10), scorer('p7', 7, '佐藤', 6)], '2026-06-01');
        // 第2節: #7 が欠席（この試合の名簿だけ見ると衝突しない）
        recordGame([scorer('p4', 4, '佐藤', 8)], '2026-06-08');

        const result = aggregatePlayerStats(MY_TEAM);

        expect(result.map(r => r.playerKey)).toEqual(['佐藤#4', '佐藤#7']);
        const p4 = result.find(r => r.number === 4)!;
        expect(p4.gamesPlayed).toBe(2);
        expect(p4.totalStats.points).toBe(18);
        expect(p4.avgStats.points).toBe(9);
        const p7 = result.find(r => r.number === 7)!;
        expect(p7.gamesPlayed).toBe(1);
        expect(p7.totalStats.points).toBe(6);
    });

    it('期間で絞ってもキーが変わらない', () => {
        recordGame([scorer('p4', 4, '佐藤', 10), scorer('p7', 7, '佐藤', 6)], '2026-06-01');
        recordGame([scorer('p4', 4, '佐藤', 8)], '2026-07-06');

        // 衝突していた試合を範囲から外しても、#4 は #4 のまま
        const july = aggregatePlayerStats(MY_TEAM, new Date(Date.UTC(2026, 6, 1)));

        expect(july.map(r => r.playerKey)).toEqual(['佐藤#4']);
        expect(july[0].gamesPlayed).toBe(1);
    });

    it('同姓が居なければキーは氏名のまま（既存の非表示設定を壊さない）', () => {
        recordGame([scorer('p4', 4, '田中', 10), scorer('p7', 7, '鈴木', 6)], '2026-06-01');

        const result = aggregatePlayerStats(MY_TEAM);

        expect(result.map(r => r.playerKey)).toEqual(['田中', '鈴木']);
    });

    it('ライセンスNo.があれば同姓でも背番号は付かない', () => {
        const a = scorer('p4', 4, '佐藤', 10);
        a.licenseNo = '001';
        const b = scorer('p7', 7, '佐藤', 6);
        b.licenseNo = '002';
        recordGame([a, b], '2026-06-01');

        const result = aggregatePlayerStats(MY_TEAM);

        expect(result.map(r => r.playerKey)).toEqual(['佐藤_001', '佐藤_002']);
    });
});

// 試合に載る背番号は、試合設定で選んだ番号タイプで決まる（getPlayerNumber）。
// 同姓はその番号でキーを分けているため、ビブスで記録した試合とユニフォームで
// 記録した試合とで同一人物が2枚のカードに割れていた
// （実測: 「佐藤#4」「佐藤#7」「佐藤#10」「佐藤#12」の4人が並ぶ）。
describe('同姓選手の識別キー: ビブスとユニフォームの取り違え', () => {
    const withRoster = (players: SavedTeam['players']): SavedTeam => ({ ...MY_TEAM, players });

    const rosterPlayer = (name: string, bibNumber: number, uniformNumber: number) =>
        ({ number: uniformNumber, bibNumber, uniformNumber, name, isCaptain: false });

    it('番号タイプを切り替えても同じ選手として集計される', () => {
        const team = withRoster([
            rosterPlayer('佐藤', 4, 10),
            rosterPlayer('佐藤', 7, 12),
        ]);
        // 第1節はビブス番号で記録
        recordGame([scorer('p4', 4, '佐藤', 10), scorer('p7', 7, '佐藤', 6)], '2026-06-01');
        // 第2節はユニフォーム番号で記録（同じ2人）
        recordGame([scorer('p4', 10, '佐藤', 8), scorer('p7', 12, '佐藤', 4)], '2026-06-08');

        const result = aggregatePlayerStats(team);

        // 代表番号（ユニフォーム）に寄せて2人にまとまる
        expect(result.map(r => r.playerKey).sort()).toEqual(['佐藤#10', '佐藤#12']);
        const sato10 = result.find(r => r.playerKey === '佐藤#10')!;
        expect(sato10.gamesPlayed).toBe(2);
        expect(sato10.totalStats.points).toBe(18);
        const sato12 = result.find(r => r.playerKey === '佐藤#12')!;
        expect(sato12.gamesPlayed).toBe(2);
        expect(sato12.totalStats.points).toBe(10);
    });

    it('どちらの選手の番号か決められないときは寄せない（別人を混ぜない）', () => {
        // 一方のビブス番号(7)が、もう一方のユニフォーム番号(7)と同じ
        const team = withRoster([
            rosterPlayer('佐藤', 4, 10),
            rosterPlayer('佐藤', 9, 7),
        ]);
        recordGame([scorer('p4', 4, '佐藤', 10), scorer('p7', 7, '佐藤', 6)], '2026-06-01');

        const result = aggregatePlayerStats(team);

        // 4 は一意なので寄せる。7 は決められないので記録どおりに残す
        expect(result.map(r => r.playerKey).sort()).toEqual(['佐藤#10', '佐藤#7']);
    });

    it('名簿に居ない選手（退団後など）は記録どおりの番号で分ける', () => {
        const team = withRoster([rosterPlayer('佐藤', 4, 10)]);
        recordGame([scorer('p4', 4, '佐藤', 10), scorer('p7', 7, '佐藤', 6)], '2026-06-01');

        const result = aggregatePlayerStats(team);

        expect(result.map(r => r.playerKey).sort()).toEqual(['佐藤#10', '佐藤#7']);
    });
});

// ライセンスNo.は任意入力で、名簿に後から書き足されることが多い
// （JBA登録番号の下3桁。大会の申込みが近づいてから入れる、など）。
// 識別キーは氏名＋ライセンスNo.なので、入力した瞬間にキーが変わり、
// 入力前に記録した試合が別人のカードとして分かれてしまう
// （実測: 2試合で「佐藤 太郎_123(1試合 8点)」「佐藤 太郎(1試合 10点)」の2枚。
// どちらも通算・平均・成長グラフが実態と食い違う）。
describe('同姓選手の識別キー: ライセンスNo.を後から入力した場合', () => {
    const withRoster = (players: SavedTeam['players']): SavedTeam => ({ ...MY_TEAM, players });
    const rosterPlayer = (name: string, number: number, licenseNo?: string) =>
        ({ number, uniformNumber: number, name, licenseNo, isCaptain: false });

    const licensed = (id: string, number: number, name: string, points: number, licenseNo?: string) => {
        const p = scorer(id, number, name, points);
        p.licenseNo = licenseNo;
        return p;
    };

    it('入力前後の試合が同じ選手として合算される', () => {
        const team = withRoster([rosterPlayer('佐藤 太郎', 4, '123')]);
        recordGame([licensed('p4', 4, '佐藤 太郎', 10)], '2026-04-01');
        recordGame([licensed('p4', 4, '佐藤 太郎', 8, '123')], '2026-06-01');

        const result = aggregatePlayerStats(team);

        expect(result.map(r => r.playerKey)).toEqual(['佐藤 太郎_123']);
        expect(result[0].gamesPlayed).toBe(2);
        expect(result[0].totalStats.points).toBe(18);
    });

    it('名簿に同姓同名が2人いて片方だけ未入力なら寄せない（別人を混ぜない）', () => {
        const team = withRoster([
            rosterPlayer('佐藤 太郎', 4, '123'),
            rosterPlayer('佐藤 太郎', 7),
        ]);
        recordGame([licensed('p4', 4, '佐藤 太郎', 10), licensed('p7', 7, '佐藤 太郎', 6)], '2026-06-01');

        const result = aggregatePlayerStats(team);

        // 記録どおりのキーで分かれたまま（背番号で分離される）
        expect(result).toHaveLength(2);
        expect(result[0].playerKey).not.toBe(result[1].playerKey);
    });

    it('名簿に居ない選手（退団後など）は記録どおりのキーのまま', () => {
        const team = withRoster([rosterPlayer('佐藤 太郎', 4, '123')]);
        recordGame([licensed('p9', 9, '田中 次郎', 6)], '2026-06-01');

        const result = aggregatePlayerStats(team);

        expect(result.map(r => r.playerKey)).toEqual(['田中 次郎']);
    });

    it('ライセンスNo.を使っていないチームのキーは変わらない', () => {
        const team = withRoster([rosterPlayer('佐藤 太郎', 4)]);
        recordGame([licensed('p4', 4, '佐藤 太郎', 10)], '2026-06-01');

        const result = aggregatePlayerStats(team);

        expect(result.map(r => r.playerKey)).toEqual(['佐藤 太郎']);
    });
});

// ライセンスNo.は3桁を手入力するので打ち間違いが起きる。気づいて直すと、
// 直す前に記録した試合が別人のカードとして残ってしまう。名簿から消した場合も同じ。
// 「後から入力した」場合だけを救っても、この2つが残ると割れたままになる。
describe('同姓選手の識別キー: ライセンスNo.を書き換え・削除した場合', () => {
    const withRoster = (players: SavedTeam['players']): SavedTeam => ({ ...MY_TEAM, players });
    const rosterPlayer = (name: string, number: number, licenseNo?: string) =>
        ({ number, uniformNumber: number, name, licenseNo, isCaptain: false });

    const licensed = (id: string, number: number, name: string, points: number, licenseNo?: string) => {
        const p = scorer(id, number, name, points);
        p.licenseNo = licenseNo;
        return p;
    };

    it('打ち間違いを直したあとも、直す前の試合を同じ選手として合算する', () => {
        const team = withRoster([rosterPlayer('佐藤 太郎', 4, '456')]);
        recordGame([licensed('p4', 4, '佐藤 太郎', 10, '123')], '2026-04-01'); // 打ち間違い
        recordGame([licensed('p4', 4, '佐藤 太郎', 8, '456')], '2026-06-01');  // 訂正後

        const result = aggregatePlayerStats(team);

        expect(result.map(r => r.playerKey)).toEqual(['佐藤 太郎_456']);
        expect(result[0].gamesPlayed).toBe(2);
        expect(result[0].totalStats.points).toBe(18);
    });

    it('名簿からライセンスNo.を消しても合算する', () => {
        const team = withRoster([rosterPlayer('佐藤 太郎', 4)]);
        recordGame([licensed('p4', 4, '佐藤 太郎', 10, '123')], '2026-04-01');
        recordGame([licensed('p4', 4, '佐藤 太郎', 8)], '2026-06-01');

        const result = aggregatePlayerStats(team);

        expect(result.map(r => r.playerKey)).toEqual(['佐藤 太郎']);
        expect(result[0].gamesPlayed).toBe(2);
        expect(result[0].totalStats.points).toBe(18);
    });

    it('未入力・打ち間違い・訂正後が混ざっても1人にまとまる', () => {
        const team = withRoster([rosterPlayer('佐藤 太郎', 4, '456')]);
        recordGame([licensed('p4', 4, '佐藤 太郎', 6)], '2026-04-01');
        recordGame([licensed('p4', 4, '佐藤 太郎', 10, '123')], '2026-05-01');
        recordGame([licensed('p4', 4, '佐藤 太郎', 8, '456')], '2026-06-01');

        const result = aggregatePlayerStats(team);

        expect(result.map(r => r.playerKey)).toEqual(['佐藤 太郎_456']);
        expect(result[0].gamesPlayed).toBe(3);
        expect(result[0].totalStats.points).toBe(24);
    });

    // ライセンスNo.は本来ひとりに1つ。名簿で別々の番号を割り当てて区別している
    // 2人を、記録側の番号違いだけで混ぜてはいけない
    it('名簿で別のライセンスNo.が割り当てられている同姓同名は混ぜない', () => {
        const team = withRoster([
            rosterPlayer('佐藤 太郎', 4, '123'),
            rosterPlayer('佐藤 太郎', 7, '456'),
        ]);
        recordGame([licensed('p4', 4, '佐藤 太郎', 10, '123'), licensed('p7', 7, '佐藤 太郎', 6, '456')], '2026-06-01');

        const result = aggregatePlayerStats(team);

        expect(result.map(r => r.playerKey).sort()).toEqual(['佐藤 太郎_123', '佐藤 太郎_456']);
    });
});
