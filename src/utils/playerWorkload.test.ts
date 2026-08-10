import { describe, it, expect } from 'vitest';
import { getWorkload } from './playerWorkload';

describe('getWorkload', () => {
    it('1試合あたりの出場クォーターと1Qあたりのスタッツを出す', () => {
        const workload = getWorkload({
            gamesPlayed: 4,
            totalQuartersPlayed: 10, // 平均2.5Q
            points: 40,
            rebounds: 20,
            assists: 10,
        });

        expect(workload).not.toBeNull();
        expect(workload!.quartersPerGame).toBe(2.5);
        expect(workload!.perQuarter.points).toBe(4);
        expect(workload!.perQuarter.rebounds).toBe(2);
        expect(workload!.perQuarter.assists).toBe(1);
    });

    // 出場クォーターを記録し始める前の試合しか無い選手は、割る分母が無い。
    // 0で割ると Infinity が画面に出るので、この指標自体を出さない
    it('出場クォーターが未記録なら null（指標を出さない）', () => {
        expect(getWorkload({
            gamesPlayed: 3, totalQuartersPlayed: 0, points: 30, rebounds: 9, assists: 6,
        })).toBeNull();
    });

    it('試合数が0でも落ちない', () => {
        expect(getWorkload({
            gamesPlayed: 0, totalQuartersPlayed: 0, points: 0, rebounds: 0, assists: 0,
        })).toBeNull();
    });

    it('一部の試合だけ出場クォーターが記録されていても、記録がある分で割る', () => {
        // 旧データ2試合(0Q) + 新データ2試合(4Q) を通算した状態
        const workload = getWorkload({
            gamesPlayed: 4, totalQuartersPlayed: 4, points: 40, rebounds: 0, assists: 0,
        });

        expect(workload!.perQuarter.points).toBe(10);
        // 平均出場Qは試合数で割る。旧データ混在は利用者側で見て判断できるよう素直に出す
        expect(workload!.quartersPerGame).toBe(1);
    });
});
