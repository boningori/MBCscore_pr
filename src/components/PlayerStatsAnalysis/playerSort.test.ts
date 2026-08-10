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
