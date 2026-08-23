import { describe, it, expect } from 'vitest';
import { computeTeamTotals, type TeamTotalsInput, type TeamTotals } from './teamTotals';
import { gameReducer } from '../../context/reducers';
import { createInitialGame, createPlayer, MAX_QUARTERS } from '../../types/game';
import type { Game, GameAction } from '../../types/game';

/** 記録操作を一通り流した試合を作る */
function playedGame(): Game {
    let game = createInitialGame();
    game = {
        ...game,
        phase: 'playing',
        teamA: { ...game.teamA, name: '白', players: [createPlayer('a1', 4, '一郎'), createPlayer('a2', 5, '二郎')] },
        teamB: { ...game.teamB, name: '青', players: [createPlayer('b1', 7, '三郎')] },
        showThreePoint: true,
    };

    const actions: GameAction[] = [
        { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' } },
        { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'a2', scoreType: '3P' } },
        { type: 'ADD_SCORE', payload: { teamId: 'teamB', playerId: 'b1', scoreType: '2P' } },
        { type: 'ADD_STAT', payload: { teamId: 'teamA', playerId: 'a1', statType: '2PA' } },
        { type: 'ADD_STAT', payload: { teamId: 'teamA', playerId: 'a1', statType: 'OREB' } },
        { type: 'ADD_STAT', payload: { teamId: 'teamA', playerId: 'a2', statType: 'DREB' } },
        { type: 'ADD_STAT', payload: { teamId: 'teamA', playerId: 'a2', statType: 'AST' } },
        { type: 'ADD_STAT', payload: { teamId: 'teamB', playerId: 'b1', statType: 'TO:PM' } },
        // BLK の ADD_STAT が一度も流れていなかった穴を塞ぐ
        { type: 'ADD_STAT', payload: { teamId: 'teamB', playerId: 'b1', statType: 'BLK' } },
        // threeAttempt は3P成功の加算だけでは1になっていて、3PA（外した3P）の
        // 分岐そのものが未検証だった。別に流して両方の経路を通す
        { type: 'ADD_STAT', payload: { teamId: 'teamA', playerId: 'a2', statType: '3PA' } },
        // 選手のファウル（Q1）。fouls は全体＝選手のfouls配列長の合計、
        // クォーター別＝foulHistoryの再集計と、2経路の実装が本質的に違うので
        // ここが未検証だとこのテストの主目的の一つが機能しない
        { type: 'ADD_FOUL', payload: { teamId: 'teamA', playerId: 'a1', foulType: 'P' } },
        // 実際のディスパッチ表に NEXT_QUARTER は無く、クォーターを進めるのは END_QUARTER
        { type: 'END_QUARTER' },
        { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'a1', scoreType: 'FT' } },
        { type: 'ADD_STAT', payload: { teamId: 'teamA', playerId: 'a1', statType: 'FTA' } },
        { type: 'ADD_STAT', payload: { teamId: 'teamB', playerId: 'b1', statType: 'STL' } },
        // 選手のファウル（Q2、別クォーター・別選手）
        { type: 'ADD_FOUL', payload: { teamId: 'teamA', playerId: 'a2', foulType: 'P' } },
        // コーチ・ベンチのファウル。foulHistory には載るがどの選手の fouls 配列にも
        // 載らない。両経路が一致することは、クォーター別集計が isCoachOrBench を
        // 正しく除外している証明になる。ADD_FOUL はコーチ・ベンチの playerId を
        // 弾いて何もしない（foulHandlers.ts の isCoachOrBenchId）ので、実際にUIが
        // 使う ADD_FOUL_WITH_FREE_THROWS で記録する。freeThrows: 0 にして
        // シューター側のスタッツ・得点履歴は動かさない
        {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: null, foulType: 'T', shotSituation: 'none',
                freeThrows: 0, freeThrowResults: [],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1',
            },
        },
        // FT本数付きのファウル（1本成功・1本失敗）。外した分は StatEntry を
        // 1件も作らない（canEditFreeThrows のdocコメント）ため、ここを流さないと
        // 「外したFTがクォーター別集計から落ちる」バグをテストが検知できない
        {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamB', playerId: 'b1', foulType: 'P', shotSituation: 'none',
                freeThrows: 2, freeThrowResults: ['made', 'missed'],
                shooterTeamId: 'teamA', shooterPlayerId: 'a1',
            },
        },
        // 同じく、2本とも失敗のケース。全体では2試投なのにクォーター別では
        // 0試投になっていたもう一つの症状を固定する
        {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamB', playerId: 'b1', foulType: 'P', shotSituation: 'none',
                freeThrows: 2, freeThrowResults: ['missed', 'missed'],
                shooterTeamId: 'teamA', shooterPlayerId: 'a2',
            },
        },
        // バスケットカウント（and-1）。シュート成功＋FT1本成功を同時に発生させる経路
        {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamB', playerId: 'b1', foulType: 'P', shotSituation: '2P',
                shotMade: true, freeThrows: 1, freeThrowResults: ['made'],
                shooterTeamId: 'teamA', shooterPlayerId: 'a1',
            },
        },
        // 「選手不明」のADD_STAT。構造上は選手スタッツに乗らないぶん全体・
        // クォーター別とも一致するはずだが、固定しておく価値がある
        { type: 'ADD_STAT', payload: { teamId: 'teamB', playerId: 'unknown', statType: 'AST' } },
    ];

    // ディスパッチ表に無いアクション名で静かに素通りすると、比べる対象が
    // 空の試合になってテストが無意味に通る。状態が動いたことを確かめる
    for (const action of actions) {
        const next = gameReducer(game, action);
        expect(next).not.toBe(game);
        game = next;
    }

    // オウンゴール。対象は既存の得点エントリのIDが要るため、静的な配列には
    // 入れられない（IDは reducer が crypto.randomUUID() で実行時に振る）。
    // 一番最初の ADD_SCORE（teamA a1 の2P）を対象にする
    const targetScore = game.scoreHistory.find(s => s.teamId === 'teamA' && s.scoreType === '2P');
    expect(targetScore).toBeDefined();
    const withOwnGoal = gameReducer(game, { type: 'TOGGLE_OWN_GOAL', payload: { entryId: targetScore!.id } });
    expect(withOwnGoal).not.toBe(game);
    game = withOwnGoal;

    return game;
}

function inputFor(game: Game, teamId: 'teamA' | 'teamB'): TeamTotalsInput {
    return {
        team: game[teamId],
        teamId,
        scoreHistory: game.scoreHistory,
        statHistory: game.statHistory,
        foulHistory: game.foulHistory,
    };
}

/** 全クォーターぶんを足し合わせる（延長も含める） */
function sumOfQuarters(input: TeamTotalsInput): TeamTotals {
    const quarters = new Set<number>([
        ...input.scoreHistory.map(s => s.quarter),
        ...input.statHistory.map(s => s.quarter),
        ...input.foulHistory.map(f => f.quarter),
    ]);
    for (let q = 1; q <= MAX_QUARTERS; q++) quarters.add(q);

    // 0 は存在しないクォーターなので、全項目0の器が返る
    const acc = computeTeamTotals(input, 0);
    for (const q of quarters) {
        const totals = computeTeamTotals(input, q);
        for (const key of Object.keys(acc) as (keyof TeamTotals)[]) acc[key] += totals[key];
    }
    return acc;
}

describe('集計2経路の整合性', () => {
    it('履歴から計算したクォーターの和が、選手スタッツの合計と一致する', () => {
        const game = playedGame();

        for (const teamId of ['teamA', 'teamB'] as const) {
            const input = inputFor(game, teamId);
            expect(sumOfQuarters(input)).toEqual(computeTeamTotals(input, 'all'));
        }
    });
});
