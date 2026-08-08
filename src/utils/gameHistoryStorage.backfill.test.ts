// 旧データへの savedTeamId 書き戻し。
//
// この改修より前に記録した試合は savedTeamId を持たないため、名前でしか
// マイチームと結び付かない。つまり「これから改名する人」の既存データは
// 依然として分析から消える。改名前の今のうちに id を凍結しておく。
//
// 書き戻しは今日の帰属を変えてはいけない。誤って結び付けると、他チームの
// 選手が分析に混ざったまま名前を直しても直らなくなる（名前と違い id は
// 改名で自己修正しない）。曖昧なら何も書かないほうが安全。

import { describe, it, expect } from 'vitest';
import { backfillSavedTeamIds, type GameRecord } from './gameHistoryStorage';
import { createTeam } from '../types/game';

function record(opts: {
    a: { name: string; isMyTeam?: boolean; savedTeamId?: string };
    b: { name: string; isMyTeam?: boolean; savedTeamId?: string };
}): GameRecord {
    const teamA = createTeam('teamA', opts.a.name, 'コーチ');
    teamA.isMyTeam = opts.a.isMyTeam;
    teamA.savedTeamId = opts.a.savedTeamId;
    const teamB = createTeam('teamB', opts.b.name, 'コーチ');
    teamB.isMyTeam = opts.b.isMyTeam;
    teamB.savedTeamId = opts.b.savedTeamId;

    return {
        id: 'game-1', date: '2026-04-01T00:00:00.000Z', gameName: 'テスト大会',
        teamA, teamB, finalScore: { teamA: 0, teamB: 0 },
        scoreHistory: [], statHistory: [], foulHistory: [],
        createdAt: '2026-04-01T00:00:00.000Z',
    };
}

describe('backfillSavedTeamIds', () => {
    it('isMyTeam側にだけidを書き戻す', () => {
        const records = [record({ a: { name: '6年生チーム', isMyTeam: true }, b: { name: '相手チーム' } })];

        const result = backfillSavedTeamIds(records, [{ id: 't6', name: '6年生チーム' }]);

        expect(result).not.toBeNull();
        expect(result![0].teamA.savedTeamId).toBe('t6');
        expect(result![0].teamB.savedTeamId).toBeUndefined();
    });

    it('相手が自分の別チームでも、相手側には書かない（名前照合のまま残す）', () => {
        const records = [record({ a: { name: '6年生チーム', isMyTeam: true }, b: { name: '5年生チーム' } })];

        const result = backfillSavedTeamIds(records, [
            { id: 't6', name: '6年生チーム' },
            { id: 't5', name: '5年生チーム' },
        ]);

        expect(result![0].teamB.savedTeamId).toBeUndefined();
    });

    it('同名のマイチームが複数あるときは何も書かない', () => {
        const records = [record({ a: { name: '6年生チーム', isMyTeam: true }, b: { name: '相手チーム' } })];

        const result = backfillSavedTeamIds(records, [
            { id: 't6a', name: '6年生チーム' },
            { id: 't6b', name: '6年生チーム' },
        ]);

        expect(result).toBeNull();
    });

    it('isMyTeamがどちらの側にも無い旧レコードには書かない', () => {
        const records = [record({ a: { name: '6年生チーム' }, b: { name: '相手チーム' } })];

        expect(backfillSavedTeamIds(records, [{ id: 't6', name: '6年生チーム' }])).toBeNull();
    });

    it('両側がisMyTeamの壊れたレコードには書かない（自分側を決められない）', () => {
        const records = [record({
            a: { name: '6年生チーム', isMyTeam: true },
            b: { name: '6年生チーム', isMyTeam: true },
        })];

        expect(backfillSavedTeamIds(records, [{ id: 't6', name: '6年生チーム' }])).toBeNull();
    });

    it('名前が一致するマイチームが無ければ書かない', () => {
        const records = [record({ a: { name: '6年生チーム', isMyTeam: true }, b: { name: '相手チーム' } })];

        expect(backfillSavedTeamIds(records, [{ id: 't5', name: '5年生チーム' }])).toBeNull();
    });

    it('すでにsavedTeamIdを持つレコードは触らない', () => {
        const records = [record({
            a: { name: '6年生チーム', isMyTeam: true, savedTeamId: 't-old' },
            b: { name: '相手チーム' },
        })];

        expect(backfillSavedTeamIds(records, [{ id: 't6', name: '6年生チーム' }])).toBeNull();
    });

    it('紅白戦ではisMyTeam側にだけidが付く', () => {
        const records = [record({
            a: { name: '6年生チーム' },
            b: { name: '6年生チーム', isMyTeam: true },
        })];

        const result = backfillSavedTeamIds(records, [{ id: 't6', name: '6年生チーム' }]);

        expect(result![0].teamA.savedTeamId).toBeUndefined();
        expect(result![0].teamB.savedTeamId).toBe('t6');
    });

    it('書き戻す対象が1件も無ければnullを返す（無用な保存を起こさない）', () => {
        const records = [record({ a: { name: '相手A', isMyTeam: false }, b: { name: '相手B' } })];

        expect(backfillSavedTeamIds(records, [{ id: 't6', name: '6年生チーム' }])).toBeNull();
    });

    it('元の配列を書き換えない', () => {
        const records = [record({ a: { name: '6年生チーム', isMyTeam: true }, b: { name: '相手チーム' } })];

        backfillSavedTeamIds(records, [{ id: 't6', name: '6年生チーム' }]);

        expect(records[0].teamA.savedTeamId).toBeUndefined();
    });

    it('対象外のレコードはそのまま残す', () => {
        const target = record({ a: { name: '6年生チーム', isMyTeam: true }, b: { name: '相手チーム' } });
        const other = record({ a: { name: '5年生チーム', isMyTeam: true }, b: { name: '相手チーム' } });

        const result = backfillSavedTeamIds([target, other], [{ id: 't6', name: '6年生チーム' }]);

        expect(result).toHaveLength(2);
        expect(result![0].teamA.savedTeamId).toBe('t6');
        expect(result![1]).toBe(other);
    });
});
