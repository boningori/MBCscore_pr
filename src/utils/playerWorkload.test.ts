import { describe, it, expect } from 'vitest';
import { getWorkload } from './playerWorkload';

describe('getWorkload', () => {
    it('1試合あたりの出場クォーターと1Qあたりのスタッツを出す', () => {
        const workload = getWorkload({
            gamesWithQuarters: 4,
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
            gamesWithQuarters: 0, totalQuartersPlayed: 0, points: 30, rebounds: 9, assists: 6,
        })).toBeNull();
    });

    it('試合数が0でも落ちない', () => {
        expect(getWorkload({
            gamesWithQuarters: 0, totalQuartersPlayed: 0, points: 0, rebounds: 0, assists: 0,
        })).toBeNull();
    });

    // 分子と分母の対象試合が食い違うと、旧データの得点が新データの出場Qで
    // 割られて必ず過大になる。呼び出し側が「出場Qが記録された試合だけ」の
    // 累計と試合数を渡す約束にして、混ぜようがない形にする
    it('出場Qが記録された試合だけで割る（旧データの得点を混ぜない）', () => {
        // 旧データ2試合(0Q・計20点) + 新データ2試合(計4Q・計20点)のうち、後者だけを渡す
        const workload = getWorkload({
            gamesWithQuarters: 2, totalQuartersPlayed: 4, points: 20, rebounds: 0, assists: 0,
        });

        expect(workload!.perQuarter.points).toBe(5);
        expect(workload!.quartersPerGame).toBe(2);
    });
});
