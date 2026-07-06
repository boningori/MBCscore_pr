import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import type { Game } from '../types/game';
import { createInitialGame, createTeam, createPlayer } from '../types/game';

// 両チーム2名ずつの試合状態を作るヘルパー
function makeGame(): Game {
    const game = createInitialGame();
    const teamA = createTeam('teamA', 'ホーム', 'コーチA');
    teamA.players = [
        createPlayer('a1', 4, '選手A1', true),
        createPlayer('a2', 5, '選手A2'),
    ];
    const teamB = createTeam('teamB', 'ビジター', 'コーチB');
    teamB.players = [
        createPlayer('b1', 6, '選手B1', true),
        createPlayer('b2', 7, '選手B2'),
    ];
    game.teamA = teamA;
    game.teamB = teamB;
    game.phase = 'playing';
    return game;
}

describe('gameReducer: ADD_SCORE', () => {
    it('2Pで得点+2、2P成功/試投が+1され、履歴にランニングスコアが記録される', () => {
        const state = gameReducer(makeGame(), {
            type: 'ADD_SCORE',
            payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' },
        });
        const p = state.teamA.players.find(p => p.id === 'a1')!;
        expect(p.stats.points).toBe(2);
        expect(p.stats.twoPointMade).toBe(1);
        expect(p.stats.twoPointAttempt).toBe(1);
        expect(state.scoreHistory).toHaveLength(1);
        expect(state.scoreHistory[0].points).toBe(2);
        expect(state.scoreHistory[0].runningScoreA).toBe(2);
        expect(state.scoreHistory[0].runningScoreB).toBe(0);
    });

    it('3PとFTの得点・成功数が正しく加算される', () => {
        let state = makeGame();
        state = gameReducer(state, { type: 'ADD_SCORE', payload: { teamId: 'teamB', playerId: 'b1', scoreType: '3P' } });
        state = gameReducer(state, { type: 'ADD_SCORE', payload: { teamId: 'teamB', playerId: 'b1', scoreType: 'FT' } });
        const p = state.teamB.players.find(p => p.id === 'b1')!;
        expect(p.stats.points).toBe(4);
        expect(p.stats.threePointMade).toBe(1);
        expect(p.stats.freeThrowMade).toBe(1);
        expect(state.scoreHistory[1].runningScoreB).toBe(4);
    });
});

describe('gameReducer: ADD_STAT / REMOVE_SCORE', () => {
    it('TO:DDでturnoversとturnoverDDが両方+1される', () => {
        const state = gameReducer(makeGame(), {
            type: 'ADD_STAT',
            payload: { teamId: 'teamA', playerId: 'a2', statType: 'TO:DD' },
        });
        const p = state.teamA.players.find(p => p.id === 'a2')!;
        expect(p.stats.turnovers).toBe(1);
        expect(p.stats.turnoverDD).toBe(1);
        expect(state.statHistory).toHaveLength(1);
    });

    it('REMOVE_SCOREで得点と履歴が取り消される', () => {
        let state = gameReducer(makeGame(), {
            type: 'ADD_SCORE',
            payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' },
        });
        const entryId = state.scoreHistory[0].id;
        state = gameReducer(state, { type: 'REMOVE_SCORE', payload: { entryId } });
        const p = state.teamA.players.find(p => p.id === 'a1')!;
        expect(p.stats.points).toBe(0);
        expect(p.stats.twoPointMade).toBe(0);
        expect(state.scoreHistory).toHaveLength(0);
    });

    it('REMOVE_SCORE後、残った得点のランニングスコアが再計算される', () => {
        let state = makeGame();
        state = gameReducer(state, { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' } });
        const firstId = state.scoreHistory[0].id;
        state = gameReducer(state, { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'a2', scoreType: '2P' } });
        // 最初の得点（累計2点だったマス）を削除
        state = gameReducer(state, { type: 'REMOVE_SCORE', payload: { entryId: firstId } });

        expect(state.scoreHistory).toHaveLength(1);
        // 残った得点の累計は2点であるべき（4点のままはランニングスコアシートが壊れる）
        expect(state.scoreHistory[0].runningScoreA).toBe(2);
    });
});

describe('gameReducer: EDIT_SCORE', () => {
    it('点数種別の編集後、全エントリのランニングスコアが再計算される', () => {
        let state = makeGame();
        state = gameReducer(state, { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' } });
        const firstId = state.scoreHistory[0].id;
        state = gameReducer(state, { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'a2', scoreType: '2P' } });
        // 最初の2Pを3Pに編集（累計が 2,4 → 3,5 に変わるべき）
        state = gameReducer(state, { type: 'EDIT_SCORE', payload: { entryId: firstId, newPlayerId: 'a1', newScoreType: '3P' } });

        const sorted = [...state.scoreHistory].sort((a, b) => a.timestamp - b.timestamp);
        expect(sorted[0].runningScoreA).toBe(3);
        expect(sorted[1].runningScoreA).toBe(5);
    });
});

describe('gameReducer: 保留アクション解決とランニングスコア整合', () => {
    it('先の時刻に発生した保留得点を後で解決しても、時系列順の累計が付く', () => {
        let state = makeGame();
        // 早い時刻(1000)の保留SCORE(teamA, 2P)を登録
        const pending = {
            id: 'p1', actionType: 'SCORE' as const, value: '2P', teamId: 'teamA' as const,
            quarter: 1, timestamp: 1000, playersOnCourt: [], candidatePlayerIds: [],
        };
        state = gameReducer(state, { type: 'ADD_PENDING_ACTION', payload: pending });
        // その後、直接 teamA a2 が 2P（現在時刻＝大きいtimestamp）
        state = gameReducer(state, { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'a2', scoreType: '2P' } });
        // 保留を a1 に解決
        state = gameReducer(state, { type: 'RESOLVE_PENDING_ACTION', payload: { pendingActionId: 'p1', playerId: 'a1' } });

        expect(state.scoreHistory).toHaveLength(2);
        const sorted = [...state.scoreHistory].sort((a, b) => a.timestamp - b.timestamp);
        // 早い時刻の保留(a1)が累計2、後の直接得点(a2)が累計4であるべき
        expect(sorted[0].playerId).toBe('a1');
        expect(sorted[0].runningScoreA).toBe(2);
        expect(sorted[1].playerId).toBe('a2');
        expect(sorted[1].runningScoreA).toBe(4);
    });
});

describe('gameReducer: ADD_FOUL', () => {
    it('選手ファウルで当該Qのチームファウルと選手ファウル履歴が+1される', () => {
        const state = gameReducer(makeGame(), {
            type: 'ADD_FOUL',
            payload: { teamId: 'teamA', playerId: 'a1', foulType: 'P' },
        });
        expect(state.teamA.teamFouls[0]).toBe(1);
        const p = state.teamA.players.find(p => p.id === 'a1')!;
        expect(p.fouls).toHaveLength(1);
        expect(state.foulHistory).toHaveLength(1);
        expect(state.foulHistory[0].isCoachOrBench).toBe(false);
    });

    it('コーチテクニカルはチームファウルに加算されない', () => {
        const state = gameReducer(makeGame(), {
            type: 'ADD_FOUL',
            payload: { teamId: 'teamA', playerId: 'COACH', foulType: 'T' },
        });
        expect(state.teamA.teamFouls[0]).toBe(0);
        expect(state.teamA.coachFouls).toEqual(['T']);
        expect(state.foulHistory[0].isCoachOrBench).toBe(true);
        expect(state.foulHistory[0].coachFoulTarget).toBe('COACH');
    });
});

describe('gameReducer: EDIT_STAT の複合ターンオーバー', () => {
    it('TO:DDエントリの選手を編集すると、TO数も新しい選手へ移動する', () => {
        let state = makeGame();
        state = gameReducer(state, { type: 'ADD_STAT', payload: { teamId: 'teamA', playerId: 'a1', statType: 'TO:DD' } });
        const entryId = state.statHistory[0].id;
        // 種別は TO:DD のまま、選手を a1 → a2 に変更
        state = gameReducer(state, { type: 'EDIT_STAT', payload: { entryId, newPlayerId: 'a2', newStatType: 'TO:DD' } });

        const a1 = state.teamA.players.find(p => p.id === 'a1')!;
        const a2 = state.teamA.players.find(p => p.id === 'a2')!;
        // 旧選手a1からは減算、新選手a2へ加算されるべき
        expect(a1.stats.turnovers).toBe(0);
        expect(a1.stats.turnoverDD).toBe(0);
        expect(a2.stats.turnovers).toBe(1);
        expect(a2.stats.turnoverDD).toBe(1);
    });
});

describe('gameReducer: REMOVE_FOUL の整合性', () => {
    it('FT付きファウルを削除すると、残った得点のランニングスコアが再計算される', () => {
        let state = makeGame();
        // teamAのa1がファウル → teamBのb1に2FT（2本成功、累計rB=2）
        state = gameReducer(state, {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'a1', foulType: 'P', shotSituation: 'none',
                freeThrows: 2, freeThrowResults: ['made', 'made'],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1', shotMade: false,
            },
        });
        const foulId = state.foulHistory[0].id;
        // その後 teamB b2 が 2P（累計rB=4）
        state = gameReducer(state, { type: 'ADD_SCORE', payload: { teamId: 'teamB', playerId: 'b2', scoreType: '2P' } });
        // ファウルを削除（b1の2FTが消える）
        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId: foulId } });

        // 残るのは b2 の2Pのみ。累計は2点であるべき
        expect(state.scoreHistory).toHaveLength(1);
        expect(state.scoreHistory[0].playerId).toBe('b2');
        expect(state.scoreHistory[0].runningScoreB).toBe(2);
    });

    it('バスケットカウント(and-1)ファウルの削除でバスケット得点も戻る', () => {
        let state = makeGame();
        // teamA a1 がファウル、teamB b1 がゴール成功(2P)＋1FT成功 = 3点
        state = gameReducer(state, {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'a1', foulType: 'P', shotSituation: '2P',
                freeThrows: 1, freeThrowResults: ['made'],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1', shotMade: true,
            },
        });
        const b1Before = state.teamB.players.find(p => p.id === 'b1')!;
        expect(b1Before.stats.points).toBe(3);
        expect(b1Before.stats.twoPointMade).toBe(1);

        const foulId = state.foulHistory[0].id;
        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId: foulId } });

        const b1 = state.teamB.players.find(p => p.id === 'b1')!;
        // バスケット(2P)もFTも戻り、得点は0
        expect(b1.stats.points).toBe(0);
        expect(b1.stats.twoPointMade).toBe(0);
        expect(b1.stats.twoPointAttempt).toBe(0);
        expect(b1.stats.freeThrowMade).toBe(0);
        // スコア履歴はバスケット・FTとも削除されて空
        expect(state.scoreHistory).toHaveLength(0);
    });
});

describe('gameReducer: END_QUARTER / END_GAME', () => {
    it('Q1終了でQ2・quarterEndフェーズになる', () => {
        const state = gameReducer(makeGame(), { type: 'END_QUARTER' });
        expect(state.currentQuarter).toBe(2);
        expect(state.phase).toBe('quarterEnd');
    });

    it('Q4終了時に点差があれば試合終了になる', () => {
        let state = makeGame();
        state.currentQuarter = 4;
        state = gameReducer(state, { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' } });
        state = gameReducer(state, { type: 'END_QUARTER' });
        expect(state.phase).toBe('finished');
        expect(state.endTime).not.toBeNull();
    });

    it('Q4終了時に同点ならオーバータイム(Q5)に入り、チームファウル枠が拡張される', () => {
        let state = makeGame();
        state.currentQuarter = 4;
        state = gameReducer(state, { type: 'END_QUARTER' });
        expect(state.currentQuarter).toBe(5);
        expect(state.phase).toBe('quarterEnd');
        expect(state.teamA.teamFouls).toHaveLength(5);
        expect(state.teamB.teamFouls).toHaveLength(5);
        expect(state.teamA.players[0].quartersPlayed).toHaveLength(5);
    });
});
