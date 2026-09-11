// 保留アクションを「まだ数に入っていない記録」として数える。
//
// 保留はチームファウルにも選手スタッツにも入らない（handleAddPendingAction は
// 配列へ積むだけ）。試合が終わるまでに解決されれば辻褄は合うが、解決するまでの
// 間、記録者が見て判断する数字が実態より小さいままになる:
//
//   - チームファウル … ペナルティ（5個目以降はFT2本）の判定が1つ早い側へずれる。
//     FoulInputFlow は teamFouls >= 4 でFT本数を提案するので、保留が1件あると
//     「本当はペナルティなのにFT0本」を提案し、記録者がそれを信じるとFTの
//     本数そのものを取り違える。
//   - 得点 … 第4Q終了時の同点判定が狂い、同点でないのに「延長戦へ」を出す、
//     あるいは同点なのに試合終了へ落とす。
//
// 数え方をここに1つ置いて、表示側（TFバッジ）と判定側（FoulInputFlow・
// 終了時の確認）が同じ数を見るようにする。

import { describe, it, expect } from 'vitest';
import { createPendingAction } from '../types/pendingAction';
import type { PendingAction } from '../types/pendingAction';
import { pendingTeamFouls, hasPendingScores } from './pendingTotals';

const foul = (teamId: 'teamA' | 'teamB', quarter: number): PendingAction =>
    createPendingAction('FOUL', '', teamId, quarter, []);

const score = (teamId: 'teamA' | 'teamB', quarter: number, value: string): PendingAction =>
    createPendingAction('SCORE', value, teamId, quarter, []);

const stat = (teamId: 'teamA' | 'teamB', quarter: number): PendingAction =>
    createPendingAction('STAT', 'OREB', teamId, quarter, []);

describe('pendingTeamFouls', () => {
    it('そのチーム・そのピリオドの保留ファウルを数える', () => {
        const pendings = [foul('teamA', 2), foul('teamA', 2), foul('teamB', 2), foul('teamA', 3)];
        expect(pendingTeamFouls(pendings, 'teamA', 2)).toBe(2);
    });

    it('ファウル以外は数えない', () => {
        const pendings = [foul('teamA', 1), score('teamA', 1, '2P'), stat('teamA', 1)];
        expect(pendingTeamFouls(pendings, 'teamA', 1)).toBe(1);
    });

    it('保留が無ければ0', () => {
        expect(pendingTeamFouls([], 'teamA', 1)).toBe(0);
    });

    // OT欄は直前ピリオドの数を種にして積み上がる（gameFlowHandlers の extendForOT）。
    // 解決時の incrementTeamFoul も第4Q以降は後続のOT欄へ伝播させるので、
    // 数える側も同じ形にしないと、OT中に見えるチームファウルだけが足りなくなる
    it('OT中は、第4Q以降の保留も通算に含める', () => {
        const pendings = [foul('teamA', 4), foul('teamA', 5)];
        expect(pendingTeamFouls(pendings, 'teamA', 5)).toBe(2);
    });

    it('OT2では、第4Q・OT1・OT2の保留をすべて含める', () => {
        const pendings = [foul('teamA', 4), foul('teamA', 5), foul('teamA', 6)];
        expect(pendingTeamFouls(pendings, 'teamA', 6)).toBe(3);
    });

    it('Q1〜Q3は互いに独立で、前のピリオドの保留は持ち越さない', () => {
        const pendings = [foul('teamA', 1), foul('teamA', 2)];
        expect(pendingTeamFouls(pendings, 'teamA', 3)).toBe(0);
    });

    it('第4Qでは第3Q以前の保留を含めない', () => {
        const pendings = [foul('teamA', 3), foul('teamA', 4)];
        expect(pendingTeamFouls(pendings, 'teamA', 4)).toBe(1);
    });
});

describe('hasPendingScores', () => {
    it('得点の保留が1件でもあれば真', () => {
        expect(hasPendingScores([stat('teamA', 1), score('teamB', 1, '2P')])).toBe(true);
    });

    it('得点の保留が無ければ偽（ファウル・スタッツだけでは立たない）', () => {
        expect(hasPendingScores([foul('teamA', 1), stat('teamA', 1)])).toBe(false);
    });

    it('保留そのものが無ければ偽', () => {
        expect(hasPendingScores([])).toBe(false);
    });
});
