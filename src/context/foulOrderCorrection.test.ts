// ファウルを取り消す・付け替えたあとも、公式様式のファウル欄の並びが崩れないこと。
//
// 様式は player.fouls[i] の表記（P2 など）と、その選手の foulHistory を時刻順に
// 並べた i 番目のピリオド（記入色 1Q/3Q=赤・2Q/4Q/OT=黒）を対にして1マスを描く。
// 取り消し側が「種別とFT本数が最初に一致するマス」を消していたため、同じ種別・
// 同じFT本数のファウルを2つ持つ選手で必ず先頭が当たり、後の1つを訂正したつもりで
// 前のマスが消えていた。残りが1つ前へ詰まるので、表記と記入色の対応が全部ずれる。
//
// 追加側（insertFoulInOrder）は時刻順に直っていたが、削除側は内容一致のままだった。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { gameReducer } from './reducers';
import { createInitialGame, createPlayer, createTeam } from '../types/game';
import type { Game } from '../types/game';

function makeGame(): Game {
    const g = createInitialGame();
    const a = createTeam('teamA', 'ホーム', 'コーチ');
    const b = createTeam('teamB', 'アウェイ', 'コーチ');
    a.players = [
        { ...createPlayer('a1', 4, 'A1'), isOnCourt: true },
        { ...createPlayer('a2', 5, 'A2'), isOnCourt: true },
    ];
    b.players = [{ ...createPlayer('b1', 20, 'B1'), isOnCourt: true }];
    return { ...g, teamA: a, teamB: b, phase: 'playing' };
}

/** 様式が読む形にそろえる: 欄の表記と、その欄の記入色を決めるピリオド */
function sheetCells(g: Game, playerId: string) {
    const player = [...g.teamA.players, ...g.teamB.players].find(p => p.id === playerId)!;
    const ordered = g.foulHistory
        .filter(f => f.playerId === playerId)
        .sort((a, b) => a.timestamp - b.timestamp);
    return player.fouls.map((f, i) => ({
        表記: typeof f === 'string' ? f : `${f.type}${f.freeThrows || ''}`,
        ピリオド: ordered[i] ? `Q${ordered[i].quarter}` : '(履歴なし)',
    }));
}

function addFoul(g: Game, playerId: string, foulType: 'P' | 'T' | 'U', freeThrows: number): Game {
    return gameReducer(g, {
        type: 'ADD_FOUL_WITH_FREE_THROWS',
        payload: {
            teamId: 'teamA',
            playerId,
            foulType,
            shotSituation: 'none',
            shotMade: false,
            freeThrows,
            freeThrowResults: Array.from({ length: freeThrows }, () => 'made' as const),
            shooterTeamId: 'teamB',
            shooterPlayerId: 'b1',
        },
    });
}

let clock = 0;
const tick = (ms: number) => {
    clock += ms;
    vi.setSystemTime(clock);
};

beforeEach(() => {
    vi.useFakeTimers();
    clock = new Date('2026-08-18T10:00:00Z').getTime();
    vi.setSystemTime(clock);
});
afterEach(() => vi.useRealTimers());

/** Q1にP・Q2にT1・Q3にP。PがFT本数まで同じなので内容では区別できない */
function threeFouls(): Game {
    let g = makeGame();
    g = addFoul(g, 'a1', 'P', 0);
    tick(60_000);
    g = { ...g, currentQuarter: 2 };
    g = addFoul(g, 'a1', 'T', 1);
    tick(60_000);
    g = { ...g, currentQuarter: 3 };
    g = addFoul(g, 'a1', 'P', 0);
    tick(60_000);
    return g;
}

describe('ファウルの訂正と様式のファウル欄', () => {
    it('記録した時点では時刻順に並んでいる', () => {
        expect(sheetCells(threeFouls(), 'a1')).toEqual([
            { 表記: 'P', ピリオド: 'Q1' },
            { 表記: 'T1', ピリオド: 'Q2' },
            { 表記: 'P', ピリオド: 'Q3' },
        ]);
    });

    it('REMOVE_FOUL: 3つ目(Q3のP)を取り消しても残り2つの並びが変わらない', () => {
        let g = threeFouls();
        const q3 = g.foulHistory.find(f => f.quarter === 3)!;

        g = gameReducer(g, { type: 'REMOVE_FOUL', payload: { entryId: q3.id } });

        expect(sheetCells(g, 'a1')).toEqual([
            { 表記: 'P', ピリオド: 'Q1' },
            { 表記: 'T1', ピリオド: 'Q2' },
        ]);
    });

    it('REMOVE_FOUL: 1つ目(Q1のP)を取り消したときも残りが正しい', () => {
        let g = threeFouls();
        const q1 = g.foulHistory.find(f => f.quarter === 1)!;

        g = gameReducer(g, { type: 'REMOVE_FOUL', payload: { entryId: q1.id } });

        expect(sheetCells(g, 'a1')).toEqual([
            { 表記: 'T1', ピリオド: 'Q2' },
            { 表記: 'P', ピリオド: 'Q3' },
        ]);
    });

    it('EDIT_FOUL: 3つ目(Q3のP)を別の選手へ移しても、元の選手の並びが変わらない', () => {
        let g = threeFouls();
        const q3 = g.foulHistory.find(f => f.quarter === 3)!;

        g = gameReducer(g, { type: 'EDIT_FOUL', payload: { entryId: q3.id, newPlayerId: 'a2' } });

        expect(sheetCells(g, 'a1')).toEqual([
            { 表記: 'P', ピリオド: 'Q1' },
            { 表記: 'T1', ピリオド: 'Q2' },
        ]);
        expect(sheetCells(g, 'a2')).toEqual([
            { 表記: 'P', ピリオド: 'Q3' },
        ]);
    });

    it('欄と履歴の件数が食い違う古いデータでは、従来どおり内容から探す', () => {
        // ADD_FOUL 由来の文字列だけを持ち、履歴に対応が無い形（レガシー）
        let g = makeGame();
        g = addFoul(g, 'a1', 'P', 0);
        const entry = g.foulHistory[0];
        // 欄だけ1つ多い状態にする（履歴1件・欄2件）
        g = {
            ...g,
            teamA: {
                ...g.teamA,
                players: g.teamA.players.map(p =>
                    p.id === 'a1' ? { ...p, fouls: ['T' as const, ...p.fouls] } : p),
            },
        };

        g = gameReducer(g, { type: 'REMOVE_FOUL', payload: { entryId: entry.id } });

        // 内容一致で P のマスだけが消え、T は残る
        const a1 = g.teamA.players.find(p => p.id === 'a1')!;
        expect(a1.fouls).toEqual(['T']);
    });
});
