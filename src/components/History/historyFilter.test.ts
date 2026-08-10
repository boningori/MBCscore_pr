import { describe, it, expect } from 'vitest';
import { filterAndSortRecords } from './historyFilter';
import type { GameRecord } from '../../utils/gameHistoryStorage';

// 履歴は絞り込みも並べ替えも無く、1シーズン分（数十件）を延々スクロールするしかなかった。

function rec(id: string, date: string, gameName: string, a: string, b: string): GameRecord {
    const team = (name: string) => ({
        id: name, name, coachName: '', assistantCoachName: '',
        players: [], timeouts: [], teamFouls: [0, 0, 0, 0],
        coachFouls: [], assistantCoachFouls: [], benchFouls: [], color: 'white' as const,
    });
    return {
        id, date, gameName,
        teamA: team(a), teamB: team(b),
        finalScore: { teamA: 0, teamB: 0 },
        scoreHistory: [], statHistory: [], foulHistory: [],
        createdAt: date,
    };
}

const records = [
    rec('g1', '2026-06-05T00:00:00.000Z', '春季大会 準決勝', 'ミナミ', 'キタ'),
    rec('g2', '2026-05-01T00:00:00.000Z', '練習試合', 'ミナミ', 'ヒガシ'),
    rec('g3', '2026-07-10T00:00:00.000Z', '夏季大会 1回戦', 'ミナミ', 'ニシ'),
];

const idsOf = (r: GameRecord[]) => r.map(x => x.id);

describe('filterAndSortRecords', () => {
    it('既定は日付の新しい順', () => {
        expect(idsOf(filterAndSortRecords(records, { query: '', order: 'newest' })))
            .toEqual(['g3', 'g1', 'g2']);
    });

    it('古い順にも並べ替えられる', () => {
        expect(idsOf(filterAndSortRecords(records, { query: '', order: 'oldest' })))
            .toEqual(['g2', 'g1', 'g3']);
    });

    it('試合名で絞り込める', () => {
        expect(idsOf(filterAndSortRecords(records, { query: '大会', order: 'newest' })))
            .toEqual(['g3', 'g1']);
    });

    it('対戦相手のチーム名でも絞り込める', () => {
        expect(idsOf(filterAndSortRecords(records, { query: 'ヒガシ', order: 'newest' })))
            .toEqual(['g2']);
    });

    it('自チーム名でも絞り込める', () => {
        expect(idsOf(filterAndSortRecords(records, { query: 'ミナミ', order: 'newest' })))
            .toHaveLength(3);
    });

    // 「2026-06」で6月の試合を探せるようにする
    it('日付の文字列でも絞り込める', () => {
        expect(idsOf(filterAndSortRecords(records, { query: '2026-06', order: 'newest' })))
            .toEqual(['g1']);
    });

    it('前後の空白は無視する', () => {
        expect(idsOf(filterAndSortRecords(records, { query: '  練習  ', order: 'newest' })))
            .toEqual(['g2']);
    });

    it('大文字小文字を区別しない', () => {
        const withAlpha = [rec('g9', '2026-06-05T00:00:00.000Z', 'Summer Cup', 'A', 'B')];
        expect(idsOf(filterAndSortRecords(withAlpha, { query: 'summer', order: 'newest' })))
            .toEqual(['g9']);
    });

    it('一致しなければ空', () => {
        expect(filterAndSortRecords(records, { query: 'そんな試合はない', order: 'newest' }))
            .toHaveLength(0);
    });

    it('元の配列を破壊しない', () => {
        const copy = [...records];
        filterAndSortRecords(records, { query: '', order: 'oldest' });
        expect(records).toEqual(copy);
    });
});
