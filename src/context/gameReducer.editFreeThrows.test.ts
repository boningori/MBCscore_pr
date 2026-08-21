// FTの成否の訂正。
//
// 外したFTは記録を1件も作らない —— 成功したFTは ScoreEntry になるが、外したぶんは
// シューターの freeThrowAttempt に本数として乗るだけで、アクション履歴に現れない。
// そのため「外した」を「入った」に直す導線がどこにも無く、ファウルごと削除して
// 入れ直すしかなかった（選手選択・種別・シュート状況・シューター・本数をやり直す）。
// 試合中の誤タップとしてはいちばん起きやすいのに、いちばん高くつく。

import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import type { Game, FreeThrowResult } from '../types/game';
import { createInitialGame, createTeam, createPlayer } from '../types/game';

function makeGame(): Game {
    const game = createInitialGame();
    const teamA = createTeam('teamA', 'ホーム', 'コーチA', 'A.コーチA');
    teamA.players = [createPlayer('a1', 4, '選手A1', true), createPlayer('a2', 5, '選手A2')];
    const teamB = createTeam('teamB', 'ビジター', 'コーチB', 'A.コーチB');
    teamB.players = [createPlayer('b1', 6, '選手B1', true), createPlayer('b2', 7, '選手B2')];
    [...teamA.players, ...teamB.players].forEach(p => { p.isOnCourt = true; });
    return { ...game, teamA, teamB, phase: 'playing', currentQuarter: 1 };
}

/** teamA の a1 がファウル → teamB の b1 が freeThrows 本のFTを打つ */
function withFoul(results: FreeThrowResult[]): Game {
    return gameReducer(makeGame(), {
        type: 'ADD_FOUL_WITH_FREE_THROWS',
        payload: {
            teamId: 'teamA', playerId: 'a1', foulType: 'P', shotSituation: 'none',
            freeThrows: results.length, freeThrowResults: results,
            shooterTeamId: 'teamB', shooterPlayerId: 'b1',
        },
    });
}

const shooter = (g: Game) => g.teamB.players.find(p => p.id === 'b1')!;
const ftEntries = (g: Game) => g.scoreHistory.filter(s => s.scoreType === 'FT');
const teamBPoints = (g: Game) => g.teamB.players.reduce((sum, p) => sum + p.stats.points, 0);
const foulCell = (g: Game) => {
    const cell = g.teamA.players.find(p => p.id === 'a1')!.fouls[0];
    return typeof cell === 'string' ? null : cell;
};

const edit = (g: Game, freeThrowResults: FreeThrowResult[]) =>
    gameReducer(g, { type: 'EDIT_FOUL_FREE_THROWS', payload: { entryId: g.foulHistory[0].id, freeThrowResults } });

describe('EDIT_FOUL_FREE_THROWS: 外した→入った', () => {
    it('シューターの成功数・得点・得点エントリが増える', () => {
        let state = withFoul(['made', 'missed']);
        expect(shooter(state).stats).toMatchObject({ freeThrowAttempt: 2, freeThrowMade: 1, points: 1 });

        state = edit(state, ['made', 'made']);

        expect(shooter(state).stats).toMatchObject({ freeThrowAttempt: 2, freeThrowMade: 2, points: 2 });
        expect(ftEntries(state)).toHaveLength(2);
        expect(teamBPoints(state)).toBe(2);
    });

    it('足した得点エントリもファウルに紐づく（取り消しで一緒に消える）', () => {
        let state = withFoul(['missed', 'missed']);
        state = edit(state, ['made', 'made']);
        expect(ftEntries(state).every(s => s.sourceFoulId === state.foulHistory[0].id)).toBe(true);

        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId: state.foulHistory[0].id } });

        expect(state.scoreHistory).toHaveLength(0);
        expect(shooter(state).stats).toMatchObject({ freeThrowAttempt: 0, freeThrowMade: 0, points: 0 });
    });
});

describe('EDIT_FOUL_FREE_THROWS: 入った→外した', () => {
    it('シューターの成功数・得点・得点エントリが減る', () => {
        let state = withFoul(['made', 'made']);

        state = edit(state, ['made', 'missed']);

        expect(shooter(state).stats).toMatchObject({ freeThrowAttempt: 2, freeThrowMade: 1, points: 1 });
        expect(ftEntries(state)).toHaveLength(1);
        expect(teamBPoints(state)).toBe(1);
    });

    it('全部外していたことにしても、試投数は本数のまま残る', () => {
        let state = withFoul(['made', 'made', 'made']);

        state = edit(state, ['missed', 'missed', 'missed']);

        expect(shooter(state).stats).toMatchObject({ freeThrowAttempt: 3, freeThrowMade: 0, points: 0 });
        expect(ftEntries(state)).toHaveLength(0);
    });
});

describe('EDIT_FOUL_FREE_THROWS: 記録の整合', () => {
    // 様式は選手のファウル欄（FoulRecord）を読む。履歴だけ直すと画面とシートが食い違う
    it('履歴と選手のファウル欄の両方が書き換わる', () => {
        let state = withFoul(['missed', 'missed']);

        state = edit(state, ['made', 'missed']);

        expect(state.foulHistory[0].freeThrowResults).toEqual(['made', 'missed']);
        expect(foulCell(state)?.freeThrowResults).toEqual(['made', 'missed']);
        // 本数と種別は動かさない
        expect(state.foulHistory[0].freeThrows).toBe(2);
        expect(foulCell(state)?.freeThrows).toBe(2);
        expect(foulCell(state)?.type).toBe('P');
    });

    it('ランニングスコアが再計算される', () => {
        let state = gameReducer(withFoul(['missed', 'missed']), {
            type: 'ADD_SCORE', payload: { teamId: 'teamB', playerId: 'b2', scoreType: '2P' },
        });
        state = edit(state, ['made', 'made']);

        const ordered = state.scoreHistory
            .filter(s => s.teamId === 'teamB')
            .slice()
            .sort((a, b) => a.timestamp - b.timestamp);
        let acc = 0;
        for (const e of ordered) {
            acc += e.points;
            expect(e.runningScoreB).toBe(acc);
        }
        expect(teamBPoints(state)).toBe(acc);
    });

    it('成否が同じなら state を作り替えない（自動保存と再描画を無駄に走らせない）', () => {
        const state = withFoul(['made', 'missed']);

        expect(edit(state, ['made', 'missed'])).toBe(state);
    });
});

describe('EDIT_FOUL_FREE_THROWS: 受け付けない記録', () => {
    it('FTを伴わないファウル', () => {
        const state = gameReducer(makeGame(), {
            type: 'ADD_FOUL', payload: { teamId: 'teamA', playerId: 'a1', foulType: 'P' },
        });

        expect(edit(state, ['made'])).toBe(state);
    });

    it('本数と件数が食い違う指定', () => {
        const state = withFoul(['made', 'missed']);

        expect(edit(state, ['made'])).toBe(state);
        expect(edit(state, ['made', 'made', 'made'])).toBe(state);
    });

    // 成功したFTを「やっぱりミス」と直すと、得点エントリが sourceFoulId 付きの
    // FTA へ化ける。本数と得点エントリが1対1で対応しなくなるので触らない
    it('FTをミスへ変換したあとの記録', () => {
        let state = withFoul(['made', 'made']);
        const ft = ftEntries(state)[0];
        state = gameReducer(state, {
            type: 'CONVERT_SCORE_TO_MISS',
            payload: { entryId: ft.id, newMissType: 'FTA', newPlayerId: 'b1' },
        });

        expect(edit(state, ['missed', 'missed'])).toBe(state);
    });

    // シューターを付け替えると、得点は別の選手に付いている。
    // 差分をファウルのシューターへ当てると帳尻が合わない
    it('シューターを付け替えたあとの記録', () => {
        let state = withFoul(['made', 'missed']);
        state = gameReducer(state, {
            type: 'EDIT_SCORE',
            payload: { entryId: ftEntries(state)[0].id, newPlayerId: 'b2', newScoreType: 'FT' },
        });

        expect(edit(state, ['made', 'made'])).toBe(state);
    });

    // OGにしたFTは、得点だけ残してシュート成績から外してある
    // （handleToggleOwnGoal）。成功数と得点エントリの本数が一致していても
    // シューターの freeThrowMade はそのぶん少ないので、差分を当てると
    // points と個々のスタッツの導出が食い違う（疑似試合のフューズが検出）
    it('OGにしたFTを含む記録', () => {
        let state = withFoul(['made', 'made']);
        state = gameReducer(state, { type: 'TOGGLE_OWN_GOAL', payload: { entryId: ftEntries(state)[0].id } });
        const before = state;

        state = edit(state, ['made', 'missed']);

        expect(state).toBe(before);
        // 念のため: 得点は個々のスタッツから導ける状態のまま
        const s = shooter(state).stats;
        const og = state.scoreHistory
            .filter(e => e.playerId === 'b1' && e.isOwnGoal)
            .reduce((sum, e) => sum + e.points, 0);
        expect(s.points).toBe(s.twoPointMade * 2 + s.threePointMade * 3 + s.freeThrowMade + og);
    });

    it('存在しないファウル', () => {
        const state = withFoul(['made']);

        expect(gameReducer(state, {
            type: 'EDIT_FOUL_FREE_THROWS', payload: { entryId: 'nope', freeThrowResults: ['missed'] },
        })).toBe(state);
    });
});
