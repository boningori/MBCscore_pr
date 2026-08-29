// 壊れた1件が入っているだけでアプリ全体がエラー画面になる経路をふさぐ。
//
// 下の各ケースは v1.6.8 の実ブラウザで実際に ErrorBoundary を出したもの
// （履歴に1件だけ仕込み、履歴一覧→試合詳細→各タブと開いて確認した）。
// 手で編集した／共有の途中で切れたバックアップを取り込むと起きる形で、
// sanitizeImportedGame は teamA/teamB と finalScore しか直していなかった。

import { describe, it, expect, beforeEach } from 'vitest';
import { repairGameRecord, repairGameRecords } from './repairGameRecords';
import { loadGameHistory } from './gameHistoryStorage';
import type { GameRecord } from './gameHistoryStorage';
import { createTeam, createPlayer } from '../types/game';

function validRecord(overrides: Record<string, unknown> = {}): GameRecord {
    const teamA = { ...createTeam('teamA', '自軍', 'コーチ'), players: [createPlayer('teamA-p0', 4, 'あ')] };
    const teamB = { ...createTeam('teamB', '相手', 'コーチ'), players: [createPlayer('teamB-p0', 5, 'い')] };
    return {
        id: 'g1',
        date: '2026-08-20T10:00:00.000Z',
        gameName: '決勝戦',
        teamA,
        teamB,
        finalScore: { teamA: 0, teamB: 0 },
        scoreHistory: [],
        statHistory: [],
        foulHistory: [],
        createdAt: '2026-08-20T11:00:00.000Z',
        ...overrides,
    } as GameRecord;
}

describe('repairGameRecord: 壊れたフィールドを描画できる形にする', () => {
    it('scoreHistory が配列でなければ空配列にする（scoreHistory.some で落ちていた）', () => {
        const fixed = repairGameRecord(validRecord({ scoreHistory: 'oops' }));
        expect(fixed.scoreHistory).toEqual([]);
    });

    it('statHistory が配列でなければ空配列にする', () => {
        const fixed = repairGameRecord(validRecord({ statHistory: null }));
        expect(fixed.statHistory).toEqual([]);
    });

    it('foulHistory が配列でなければ空配列にする', () => {
        const fixed = repairGameRecord(validRecord({ foulHistory: 42 }));
        expect(fixed.foulHistory).toEqual([]);
    });

    it.each([
        ['scoreHistory', 'scoreType'],
        ['statHistory', 'statType'],
        ['foulHistory', 'playerId'],
    ])('%s の null 要素は取り除く（null の %s を読んで落ちていた）', field => {
        const good = { id: 'e1', teamId: 'teamA', playerId: 'teamA-p0', quarter: 1, timestamp: 1 };
        const fixed = repairGameRecord(validRecord({ [field]: [null, good, undefined] }));
        expect(fixed[field as 'scoreHistory']).toEqual([good]);
    });

    it('pendingActions が配列でなければ空配列にする（.map で落ちていた）', () => {
        const fixed = repairGameRecord(validRecord({ pendingActions: 'x' }));
        expect(fixed.pendingActions).toEqual([]);
    });

    // 「未割り当てがあった試合」と「そもそも無い試合」の区別を消さない
    it('pendingActions が元から無ければ足さない', () => {
        const fixed = repairGameRecord(validRecord({ scoreHistory: 'oops' }));
        expect('pendingActions' in fixed).toBe(false);
    });

    it('gameName が文字列でなければ文字にして残す（.trim で落ちていた）', () => {
        expect(repairGameRecord(validRecord({ gameName: 123 })).gameName).toBe('123');
        expect(repairGameRecord(validRecord({ gameName: null })).gameName).toBe('');
    });

    it('teamA が null でもチームとして扱える形にする（履歴一覧が落ちていた）', () => {
        const fixed = repairGameRecord(validRecord({ teamA: null }));
        expect(fixed.teamA.players).toEqual([]);
        expect(Array.isArray(fixed.teamA.teamFouls)).toBe(true);
    });

    it('players の null 要素は取り除く', () => {
        const teamA = { ...createTeam('teamA', '自軍', 'コーチ'), players: [null, createPlayer('p', 4, 'あ')] };
        const fixed = repairGameRecord(validRecord({ teamA }));
        expect(fixed.teamA.players).toHaveLength(1);
    });

    // 参照が変わると useMemo / React.memo の比較が毎回外れる
    it('直すところが無ければ同じオブジェクトをそのまま返す', () => {
        const record = validRecord();
        expect(repairGameRecord(record)).toBe(record);
    });
});

describe('repairGameRecords: 履歴全体', () => {
    it('直すところが無ければ null（書き戻さない）', () => {
        expect(repairGameRecords([validRecord()])).toBeNull();
    });

    it('オブジェクトでない要素だけは捨てる（試合として復元しようがない）', () => {
        const good = validRecord();
        const repaired = repairGameRecords([null, good, 'x'] as unknown as GameRecord[]);
        expect(repaired).toEqual([good]);
    });

    it('壊れた1件があっても、他の記録はそのまま残る', () => {
        const good = validRecord({ id: 'ok' });
        const bad = validRecord({ id: 'bad', scoreHistory: 'oops' });
        const repaired = repairGameRecords([good, bad])!;
        expect(repaired).toHaveLength(2);
        expect(repaired[0]).toBe(good);
        expect(repaired[1].scoreHistory).toEqual([]);
    });
});

describe('loadGameHistory: 読み込みの時点で直り、直った形が書き戻る', () => {
    beforeEach(() => localStorage.clear());

    it('壊れたレコードを直して返す', () => {
        localStorage.setItem('minibasket-game-history', JSON.stringify([
            validRecord({ id: 'broken', scoreHistory: 'oops', teamA: null, gameName: 7 }),
        ]));

        const [record] = loadGameHistory();

        expect(record.scoreHistory).toEqual([]);
        expect(record.teamA.players).toEqual([]);
        expect(record.gameName).toBe('7');
    });

    // 直した形を書き戻さないと、旧バージョンで取り込み済みの壊れたレコードが
    // 読むたびに直され続ける（＝毎回のコストになる）
    it('直した結果を localStorage に書き戻す', () => {
        localStorage.setItem('minibasket-game-history', JSON.stringify([
            validRecord({ id: 'broken', foulHistory: null }),
        ]));

        loadGameHistory();

        const stored = JSON.parse(localStorage.getItem('minibasket-game-history')!);
        expect(stored[0].foulHistory).toEqual([]);
    });

    it('健全な履歴には書き戻さない', () => {
        const original = JSON.stringify([validRecord()]);
        localStorage.setItem('minibasket-game-history', original);

        loadGameHistory();

        expect(localStorage.getItem('minibasket-game-history')).toBe(original);
    });
});
