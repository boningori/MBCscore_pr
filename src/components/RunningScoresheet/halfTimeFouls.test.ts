// 前半ファウル数の集計。ハーフタイムの太線の位置を決める土台なので、
// 「どこまでを前半とみなすか」「欄の頭打ち」の境目をここで固定する。
//
// この関数だけを直接叩くテストが無く、RunningScoresheet 経由の描画テスト
// （halfTimeLine.test.tsx）が間接的に踏んでいるだけだった。境目を変えても
// 描画テストの具体例が外れなければ気付けないため、単体で押さえる。

import { describe, it, expect } from 'vitest';
import { countFirstHalfFouls, FOUL_CELL_COUNT } from './halfTimeFouls';
import type { FoulEntry, FoulType } from '../../types/game';

let seq = 0;

/** 検査に効く項目だけ指定してファウル履歴を作る */
function foul(playerId: string | null, quarter: number, overrides: Partial<FoulEntry> = {}): FoulEntry {
    seq++;
    return {
        id: `f${seq}`,
        teamId: 'teamA',
        playerId,
        playerNumber: playerId ? 4 : -1,
        foulType: 'P' as FoulType,
        quarter,
        timestamp: 1000 * seq,
        isCoachOrBench: playerId === null,
        ...overrides,
    };
}

describe('countFirstHalfFouls', () => {
    it('履歴が空なら0', () => {
        expect(countFirstHalfFouls([], 'a1')).toBe(0);
    });

    it('第2Qまでを前半として数える', () => {
        const history = [foul('a1', 1), foul('a1', 2)];
        expect(countFirstHalfFouls(history, 'a1')).toBe(2);
    });

    it('第3Q以降は数えない', () => {
        const history = [foul('a1', 1), foul('a1', 3), foul('a1', 4)];
        expect(countFirstHalfFouls(history, 'a1')).toBe(1);
    });

    it('延長のファウルも数えない', () => {
        const history = [foul('a1', 2), foul('a1', 5), foul('a1', 6)];
        expect(countFirstHalfFouls(history, 'a1')).toBe(1);
    });

    it('他の選手のファウルは数えない', () => {
        const history = [foul('a1', 1), foul('a2', 1), foul('a2', 2)];
        expect(countFirstHalfFouls(history, 'a1')).toBe(1);
    });

    it('コーチ・ベンチのファウル（playerIdなし）はどの選手にも当たらない', () => {
        const history = [foul(null, 1, { coachFoulTarget: 'COACH', foulType: 'T' }), foul('a1', 1)];
        expect(countFirstHalfFouls(history, 'a1')).toBe(1);
    });

    it('前半のファウルが記入欄より多くても欄の数で頭打ちになる', () => {
        const history = Array.from({ length: FOUL_CELL_COUNT + 1 }, () => foul('a1', 1));
        expect(countFirstHalfFouls(history, 'a1')).toBe(FOUL_CELL_COUNT);
    });

    it('ちょうど記入欄の数なら頭打ちに触れない', () => {
        const history = Array.from({ length: FOUL_CELL_COUNT }, () => foul('a1', 2));
        expect(countFirstHalfFouls(history, 'a1')).toBe(FOUL_CELL_COUNT);
    });

    it('履歴に居ない選手は0（様式の余白行との境界線が0扱いになる前提）', () => {
        // RunningScoresheet は名簿より下の空行を「前半0件の行」として扱い、
        // 名簿末尾の選手の下に太線を引く。存在しないIDで0が返ることがその前提
        const history = [foul('a1', 1)];
        expect(countFirstHalfFouls(history, 'a99')).toBe(0);
    });

    it('記入欄は5つ（様式のファウル欄）', () => {
        expect(FOUL_CELL_COUNT).toBe(5);
    });
});
