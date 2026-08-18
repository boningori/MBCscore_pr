import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import type { Game } from '../types/game';
import { createInitialGame, createTeam, createPlayer } from '../types/game';
import { createPendingAction } from '../types/pendingAction';

// 「選手不明」で解決した記録を、あとから成功へ直す経路の検証。
//
// 不明で解決した記録は playerId が 'unknown' で、名簿の誰でもない。
// これを得点へ変換すると、得点エントリだけが増えて選手の points はどこにも
// 増えない。スコアボード・最終スコア・履歴の finalScore は選手合計から、
// ランニングスコアと様式のピリオド別スコアは scoreHistory から出しているので、
// 両者が食い違ったまま試合が保存される（実測: ボード0点・シート2点）。
// さらに以後の ADD_SCORE が同じ累計値を持ち、様式のランニングスコア欄で
// 後の得点が1行も印字されなくなる。

function makeGame(): Game {
    const game = createInitialGame();
    const teamA = createTeam('teamA', 'ホーム', 'コーチA');
    teamA.players = [
        createPlayer('a1', 4, '選手A1', true),
        createPlayer('a2', 5, '選手A2'),
    ];
    const teamB = createTeam('teamB', 'ビジター', 'コーチB');
    teamB.players = [createPlayer('b1', 6, '選手B1', true)];
    game.teamA = teamA;
    game.teamB = teamB;
    game.phase = 'playing';
    return game;
}

/** 保留の 2Pミス を「選手不明」で解決した状態を作り、その StatEntry のidを返す */
function withUnknownMiss(): { state: Game; entryId: string } {
    let state = makeGame();
    const pending = createPendingAction('STAT', '2PA', 'teamA', 1, []);
    state = gameReducer(state, { type: 'ADD_PENDING_ACTION', payload: pending });
    state = gameReducer(state, {
        type: 'RESOLVE_PENDING_ACTION_UNKNOWN',
        payload: { pendingActionId: pending.id },
    });
    return { state, entryId: state.statHistory[0].id };
}

const boardScore = (state: Game, teamId: 'teamA' | 'teamB') =>
    state[teamId].players.reduce((sum, p) => sum + p.stats.points, 0);

const sheetScore = (state: Game, teamId: 'teamA' | 'teamB') =>
    state.scoreHistory.reduce((sum, e) => sum + (e.teamId === teamId ? e.points : 0), 0);

describe('CONVERT_MISS_TO_SCORE: 選手不明の記録', () => {
    it('不明のまま成功へ変換しても、誰のものでもない得点を作らない', () => {
        const { state, entryId } = withUnknownMiss();

        const next = gameReducer(state, {
            type: 'CONVERT_MISS_TO_SCORE',
            payload: { entryId, newScoreType: '2P', newPlayerId: 'unknown' },
        });

        expect(next.scoreHistory).toHaveLength(0);
        expect(next.statHistory).toHaveLength(1);
    });

    it('名簿にいない選手を指定した変換も受け付けない', () => {
        const { state, entryId } = withUnknownMiss();

        const next = gameReducer(state, {
            type: 'CONVERT_MISS_TO_SCORE',
            payload: { entryId, newScoreType: '2P', newPlayerId: 'b1' },  // 相手チームの選手
        });

        expect(next.scoreHistory).toHaveLength(0);
    });

    it('選手を指定すれば変換でき、ボードとシートの得点が一致する', () => {
        const { state, entryId } = withUnknownMiss();

        const next = gameReducer(state, {
            type: 'CONVERT_MISS_TO_SCORE',
            payload: { entryId, newScoreType: '2P', newPlayerId: 'a1' },
        });

        expect(boardScore(next, 'teamA')).toBe(2);
        expect(sheetScore(next, 'teamA')).toBe(2);
        expect(next.teamA.players[0].stats.twoPointMade).toBe(1);
        // 不明で付いていた試投は付け替え先へ移り、二重にはならない
        expect(next.teamA.players[0].stats.twoPointAttempt).toBe(1);
    });

    it('変換を拒んだあとも、続けて記録した得点の累計がずれない', () => {
        const { state, entryId } = withUnknownMiss();

        let next = gameReducer(state, {
            type: 'CONVERT_MISS_TO_SCORE',
            payload: { entryId, newScoreType: '2P', newPlayerId: 'unknown' },
        });
        next = gameReducer(next, {
            type: 'ADD_SCORE',
            payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' },
        });

        const running = next.scoreHistory.map(s => s.runningScoreA);
        expect(running).toEqual([2]);
        expect(new Set(running).size).toBe(running.length);
    });
});
