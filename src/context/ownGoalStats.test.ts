// オウンゴールの得点は、記録した選手のシュート成績に数えない。
//
// 相手のオウンゴールで入った点は、そのチームの得点にはなるが、
// 番号を借りた選手が打ったシュートではない。成功・試投に数えると
// その選手のFG%が実際より良く（または悪く）出て、選手スタッツ分析の
// FG%・シューティング欄・並べ替えまで巻き込んで狂う。
//
// 得点(points)は残す。チーム得点・ランニングスコア・最終スコアは
// すべて選手のpointsの総和から導出されており、ここを削ると
// スコアそのものが合わなくなるため。

import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import { createInitialGame, createTeam, createPlayer } from '../types/game';
import type { Game, Team } from '../types/game';

function team(id: string): Team {
    const t = createTeam(id, `T-${id}`, 'coach');
    t.players = [createPlayer(`${id}-1`, 4, 'A'), createPlayer(`${id}-2`, 5, 'B')];
    t.players.forEach(p => { p.isOnCourt = true; });
    return t;
}

function baseGame(): Game {
    return { ...createInitialGame(), teamA: team('teamA'), teamB: team('teamB'), phase: 'playing' };
}

const teamScore = (t: Team) => t.players.reduce((sum, p) => sum + p.stats.points, 0);

describe('オウンゴールとシュート成績', () => {
    it('OGにすると2P成功・2P試投から外れるが、得点とチームスコアは残る', () => {
        let s = baseGame();
        s = gameReducer(s, { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'teamA-1', scoreType: '2P' } });
        const entryId = s.scoreHistory[0].id;

        s = gameReducer(s, { type: 'TOGGLE_OWN_GOAL', payload: { entryId } });

        const p = s.teamA.players[0];
        expect(p.stats.twoPointMade).toBe(0);
        expect(p.stats.twoPointAttempt).toBe(0);
        expect(p.stats.points).toBe(2);
        expect(teamScore(s.teamA)).toBe(2);
    });

    it('OGにした得点を削除しても、シュート成績が負にならない', () => {
        let s = baseGame();
        s = gameReducer(s, { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'teamA-1', scoreType: '2P' } });
        const entryId = s.scoreHistory[0].id;
        s = gameReducer(s, { type: 'TOGGLE_OWN_GOAL', payload: { entryId } });

        s = gameReducer(s, { type: 'REMOVE_SCORE', payload: { entryId } });

        const p = s.teamA.players[0];
        expect(p.stats.twoPointMade).toBe(0);
        expect(p.stats.twoPointAttempt).toBe(0);
        expect(p.stats.points).toBe(0);
    });

    it('OGにした得点を別の選手に付け替えても、両者のシュート成績が動かない', () => {
        let s = baseGame();
        s = gameReducer(s, { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'teamA-1', scoreType: '2P' } });
        const entryId = s.scoreHistory[0].id;
        s = gameReducer(s, { type: 'TOGGLE_OWN_GOAL', payload: { entryId } });

        s = gameReducer(s, {
            type: 'EDIT_SCORE',
            payload: { entryId, newPlayerId: 'teamA-2', newScoreType: '2P' },
        });

        const [from, to] = s.teamA.players;
        expect(from.stats.twoPointMade).toBe(0);
        expect(from.stats.twoPointAttempt).toBe(0);
        expect(from.stats.points).toBe(0);
        // 付け替え先もOGのままなので、シュートを打ったことにはならない
        expect(to.stats.twoPointMade).toBe(0);
        expect(to.stats.twoPointAttempt).toBe(0);
        expect(to.stats.points).toBe(2);
        expect(teamScore(s.teamA)).toBe(2);
    });

    // 「入らなかったオウンゴール」は競技上あり得ない。変換を通すと、番号を借りた
    // だけの選手に試投が付き、さらに OG の目印(▲)も失われる。
    // UI側でも選ばせない（EditActionModal）が、reducerでも受け付けない
    it('OGにした得点はミスへ変換できない', () => {
        let s = baseGame();
        s = gameReducer(s, { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'teamA-1', scoreType: '2P' } });
        const entryId = s.scoreHistory[0].id;
        s = gameReducer(s, { type: 'TOGGLE_OWN_GOAL', payload: { entryId } });

        const next = gameReducer(s, {
            type: 'CONVERT_SCORE_TO_MISS',
            payload: { entryId, newMissType: '2PA' },
        });

        expect(next).toBe(s);
        expect(next.scoreHistory).toHaveLength(1);
        expect(next.statHistory).toHaveLength(0);
        expect(next.teamA.players[0].stats.twoPointMade).toBe(0);
        expect(next.teamA.players[0].stats.twoPointAttempt).toBe(0);
    });
});
