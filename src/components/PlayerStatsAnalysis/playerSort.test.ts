import { describe, it, expect } from 'vitest';
import { sortPlayers, PLAYER_SORT_OPTIONS, type PlayerSortKey } from './playerSort';
import { makeAggregatedPlayer, makeStats } from '../../test/statsFactories';

// 一覧は背番号順に固定されていて、誰が伸びているかを一覧で掴めなかった。
// 並べ替えは表示順を変えるだけで、集計値には触らない。

function p(number: number, opts: {
    name?: string; points?: number; reb?: number; assists?: number;
    made?: number; attempts?: number; games?: number; quarters?: number;
} = {}) {
    const games = opts.games ?? 2;
    return makeAggregatedPlayer({
        playerKey: `p${number}`,
        number,
        name: opts.name ?? `選手${number}`,
        gamesPlayed: games,
        totalQuartersPlayed: opts.quarters ?? 0,
        avgStats: makeStats({
            points: opts.points ?? 0,
            defensiveRebounds: opts.reb ?? 0,
            assists: opts.assists ?? 0,
        }),
        totalStats: makeStats({
            twoPointMade: opts.made ?? 0,
            twoPointAttempt: opts.attempts ?? 0,
        }),
    });
}

const numbersOf = (list: ReturnType<typeof p>[], key: PlayerSortKey) =>
    sortPlayers(list, key).map(x => x.number);

describe('sortPlayers', () => {
    const players = [
        p(7, { points: 4, reb: 9, assists: 1, made: 1, attempts: 10, quarters: 8 }),
        p(4, { points: 12, reb: 2, assists: 5, made: 6, attempts: 10, quarters: 4 }),
        p(5, { points: 8, reb: 5, assists: 3, made: 3, attempts: 10, quarters: 6 }),
    ];

    it('既定は背番号の昇順', () => {
        expect(numbersOf(players, 'number')).toEqual([4, 5, 7]);
    });

    it('得点は多い順', () => {
        expect(numbersOf(players, 'points')).toEqual([4, 5, 7]);
    });

    it('REBは多い順（OR+DR）', () => {
        expect(numbersOf(players, 'rebounds')).toEqual([7, 5, 4]);
    });

    it('ASTは多い順', () => {
        expect(numbersOf(players, 'assists')).toEqual([4, 5, 7]);
    });

    it('FG%は高い順', () => {
        expect(numbersOf(players, 'fgPercent')).toEqual([4, 5, 7]);
    });

    it('出場Qは多い順', () => {
        expect(numbersOf(players, 'quarters')).toEqual([7, 5, 4]);
    });

    // 試投0の選手を「FG 0%」として最下位に置くのは妥当だが、
    // 上位に混ざると「一番よく決めた選手」を探せなくなる
    it('FG%: 試投が無い選手は最後に回す', () => {
        const list = [p(9, { made: 0, attempts: 0 }), p(4, { made: 1, attempts: 10 })];
        expect(numbersOf(list, 'fgPercent')).toEqual([4, 9]);
    });

    // 規定試投（＝一覧の最多出場試合数×1本）。下限が無いと、1試合で1本だけ
    // 決めた選手が 18/22 の選手より上に来る。カードに出るのは率だけなので
    // 一覧からは見分けられず、「誰がよく決めているか」を掴む並び順が一番外れる
    it('FG%: 規定試投に満たない選手は最後に回す', () => {
        const list = [
            p(13, { games: 1, made: 1, attempts: 1 }),   // 100% だが1本だけ
            p(4, { games: 3, made: 18, attempts: 24 }),  // 75%
            p(5, { games: 3, made: 9, attempts: 15 }),   // 60%
        ];
        // 下限は 3本（最多出場3試合 × 1本）。#13 は1本なので末尾へ
        expect(numbersOf(list, 'fgPercent')).toEqual([4, 5, 13]);
    });

    it('FG%: 規定試投を満たしていれば率どおりに並ぶ', () => {
        const list = [
            p(4, { games: 3, made: 2, attempts: 4 }),   // 50%
            p(5, { games: 3, made: 3, attempts: 3 }),   // 100%・下限ちょうど
        ];
        expect(numbersOf(list, 'fgPercent')).toEqual([5, 4]);
    });

    // 記録が1試合しかない時期に全員が下限割れすると、並び順そのものが機能しない。
    // 試合数に比例させているので、1試合なら下限も1本まで下がる
    it('FG%: 記録が1試合しかなくても並びが空にならない', () => {
        const list = [
            p(9, { games: 1, made: 0, attempts: 0 }),
            p(4, { games: 1, made: 1, attempts: 1 }),
            p(5, { games: 1, made: 1, attempts: 4 }),
        ];
        // 下限1本。試投0の#9だけが末尾
        expect(numbersOf(list, 'fgPercent')).toEqual([4, 5, 9]);
    });

    // 下限は他の並び順には効かない（率ではないので母数の大小で歪まない）
    it('FG%以外の並び順は試投数に左右されない', () => {
        const list = [
            p(13, { games: 1, points: 30, attempts: 1 }),
            p(4, { games: 3, points: 12, attempts: 24 }),
        ];
        expect(numbersOf(list, 'points')).toEqual([13, 4]);
    });

    it('同値なら背番号順で安定する', () => {
        const list = [p(9, { points: 5 }), p(4, { points: 5 }), p(6, { points: 5 })];
        expect(numbersOf(list, 'points')).toEqual([4, 6, 9]);
    });

    it('元の配列を破壊しない', () => {
        const list = [p(7), p(4)];
        sortPlayers(list, 'points');
        expect(list.map(x => x.number)).toEqual([7, 4]);
    });

    it('選べる並び順にはすべてラベルがある', () => {
        for (const option of PLAYER_SORT_OPTIONS) {
            expect(option.label.length).toBeGreaterThan(0);
        }
    });
});

// ラベルと実際の基準の食い違い。
//
// 得点・REB・ASTは avgStats（平均）、出場Qは totalQuartersPlayed（通算）で
// 並べているのに、ラベルはどれも「◯が多い順」だった。「得点が多い順」で
// 1試合30点の選手が10試合100点の選手より上に来るのに、そうは読めない。
describe('並べ替えラベルが基準を示す', () => {
    const labelOf = (key: PlayerSortKey) =>
        PLAYER_SORT_OPTIONS.find(o => o.key === key)!.label;

    it('平均で並べる項目のラベルに「平均」と入る', () => {
        expect(labelOf('points')).toContain('平均');
        expect(labelOf('rebounds')).toContain('平均');
        expect(labelOf('assists')).toContain('平均');
    });

    it('通算で並べる項目のラベルに「通算」と入る', () => {
        expect(labelOf('quarters')).toContain('通算');
    });

    it('背番号順とFG%には基準の但し書きを付けない', () => {
        expect(labelOf('number')).toBe('背番号順');
        expect(labelOf('fgPercent')).not.toContain('平均');
    });
});
