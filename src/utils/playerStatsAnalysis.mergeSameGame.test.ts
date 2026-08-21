// 同じ試合に一緒に出ている2枚は、統合の対象にしない。
//
// 1人の選手が1試合の名簿に2回載ることはないので、同じ試合に並んでいる2枚は
// 別人だと確定できる。それを1枚にまとめると、その試合が2回数えられて
// 通算・平均・標準偏差・1Qあたり・直近フォーム・勝敗別・成長グラフが
// まとめてずれ、試合別詳細と推移グラフには同じ試合の行が2本並ぶ
// （実測: 一緒に出た2試合を統合すると gamesPlayed が 4 になった）。
//
// 自動の名寄せは collectCollidingKeys が同じ判定で背番号を足して分けているが、
// 手動の統合（mergedPlayers）はその後に適用されるため保護を素通りしていた。

import { describe, it, expect, beforeEach } from 'vitest';
import { aggregatePlayerStats, effectiveMergedKeys } from './playerStatsAnalysis';
import { saveMergedPlayers, mergeKeys } from './mergedPlayers';
import { findMergeCandidates, sharesSameGame } from '../components/PlayerStatsAnalysis/mergeCandidates';
import type { SavedTeam } from './teamStorage';
import { saveGameResult } from './gameHistoryStorage';
import { createTeam, createPlayer } from '../types/game';

// 名簿に残っている「佐藤」は1人だけ（もう1人は卒業して名簿から消した想定）。
// この状態が、同姓2人を見分ける手掛かりを名簿から奪う
const MY_TEAM: SavedTeam = {
    id: 't6', name: '6年生チーム', coachName: 'コーチ', assistantCoachName: '',
    players: [{ number: 4, name: '佐藤', isCaptain: false }],
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

/** 同姓の2人が2試合とも一緒に出ている */
function recordTwoGamesTogether() {
    recordGame([scorer('p4', 4, '佐藤', 10), scorer('p7', 7, '佐藤', 6)], '2026-06-01');
    recordGame([scorer('p4', 4, '佐藤', 8), scorer('p7', 7, '佐藤', 4)], '2026-06-08');
}

beforeEach(() => localStorage.clear());

describe('同じ試合に並んでいる2枚', () => {
    it('統合の候補として提案しない', () => {
        recordTwoGamesTogether();
        const players = aggregatePlayerStats(MY_TEAM);
        expect(players.map(p => p.playerKey)).toEqual(['佐藤#4', '佐藤#7']);

        expect(findMergeCandidates(players, MY_TEAM.players.map(p => p.name))).toEqual([]);
    });

    it('sharesSameGame が組の重なりを検出する', () => {
        recordTwoGamesTogether();
        const [p4, p7] = aggregatePlayerStats(MY_TEAM);

        expect(sharesSameGame([p4, p7])).toBe(true);
        expect(sharesSameGame([p4])).toBe(false);
    });

    it('対応表に残っていても集計へは適用しない（既に統合済みの環境の修復）', () => {
        recordTwoGamesTogether();
        saveMergedPlayers(MY_TEAM.id, mergeKeys({}, ['佐藤#4', '佐藤#7'], '佐藤#4'));

        const result = aggregatePlayerStats(MY_TEAM);

        // 2枚のまま。試合数も実際の出場どおり
        expect(result.map(p => p.playerKey)).toEqual(['佐藤#4', '佐藤#7']);
        for (const card of result) {
            expect(card.gamesPlayed).toBe(2);
            expect(new Set(card.gameHistory.map(g => g.gameId)).size).toBe(card.gameHistory.length);
        }
        expect(result[0].totalStats.points).toBe(18);
        expect(result[1].totalStats.points).toBe(10);
    });

    it('適用しない統合には「統合済み」の印を出さない', () => {
        recordTwoGamesTogether();
        saveMergedPlayers(MY_TEAM.id, mergeKeys({}, ['佐藤#4', '佐藤#7'], '佐藤#4'));

        // 対応表には残っている（詳細から「統合を解除」して片付けられる）が、
        // 集計は適用していないので一覧の印としては出さない
        expect(effectiveMergedKeys(MY_TEAM)).toEqual(new Set());
    });

    it('一緒に出ていない2枚の統合はこれまでどおり効く', () => {
        // 第1節は「佐藤」表記、第2節はライセンスNo.を入れて別キーになった想定。
        // 同じ試合には並んでいないので統合してよい
        recordGame([scorer('p4', 4, '佐藤', 10)], '2026-06-01');
        const mine = createTeam('teamA', MY_TEAM.name, 'コーチ');
        mine.isMyTeam = true;
        mine.savedTeamId = MY_TEAM.id;
        const withCourtName = scorer('p4', 4, 'さとう', 8);
        mine.players = [withCourtName];
        const other = createTeam('teamB', '相手', 'コーチ');
        other.players = [scorer('b0', 6, '相手選手', 0)];
        saveGameResult('試合', mine, other, [], [], [], new Date('2026-06-08'));

        const before = aggregatePlayerStats(MY_TEAM);
        expect(before).toHaveLength(2);

        saveMergedPlayers(MY_TEAM.id, mergeKeys({}, ['佐藤', 'さとう'], '佐藤'));
        const after = aggregatePlayerStats(MY_TEAM);

        expect(after).toHaveLength(1);
        expect(after[0].playerKey).toBe('佐藤');
        expect(after[0].gamesPlayed).toBe(2);
        expect(after[0].totalStats.points).toBe(18);
        // 効いている統合には印が出る
        expect(effectiveMergedKeys(MY_TEAM)).toEqual(new Set(['佐藤']));
    });

    it('統合先に素のカードが同じ試合に居る場合も適用しない', () => {
        // 3枚のうち #4 と #7 が同じ試合に並ぶ。まとめ先が #4 でも #7 でも
        // その試合が二重になるので、組ごと寄せない
        recordTwoGamesTogether();
        recordGame([scorer('p9', 9, '佐藤', 2)], '2026-06-15');

        const keys = aggregatePlayerStats(MY_TEAM).map(p => p.playerKey);
        expect(keys).toEqual(['佐藤#4', '佐藤#7', '佐藤#9']);

        saveMergedPlayers(MY_TEAM.id, mergeKeys({}, ['佐藤#7', '佐藤#9'], '佐藤#4'));
        const result = aggregatePlayerStats(MY_TEAM);

        expect(result.map(p => p.playerKey)).toEqual(['佐藤#4', '佐藤#7', '佐藤#9']);
        expect(result.map(p => p.gamesPlayed)).toEqual([2, 2, 1]);
    });
});
