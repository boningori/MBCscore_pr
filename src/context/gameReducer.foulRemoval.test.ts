// ファウル取り消しの整合性テスト。
//
// ベンチ系テクニカルは「選手行／A.コーチ行」と「コーチ行のB」の二重計上があり、
// 追加側と削除側で処理が対称でないと、公式様式に消せないファウルが残ったり、
// 加算していないチームファウルが減ったりする。実際に両方起きていたため、
// 追加と削除の往復で元の状態に戻ることをここで固定する。

import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import type { Game } from '../types/game';
import { createInitialGame, createTeam, createPlayer } from '../types/game';

function makeGame(): Game {
    const game = createInitialGame();
    const teamA = createTeam('teamA', 'ホーム', 'コーチA', 'A.コーチA');
    teamA.players = [
        createPlayer('a1', 4, '選手A1', true),
        createPlayer('a2', 5, '選手A2'),
    ];
    const teamB = createTeam('teamB', 'ビジター', 'コーチB', 'A.コーチB');
    teamB.players = [
        createPlayer('b1', 6, '選手B1', true),
        createPlayer('b2', 7, '選手B2'),
    ];
    teamA.players.forEach(p => { p.isOnCourt = true; });
    teamB.players.forEach(p => { p.isOnCourt = true; });
    game.teamA = teamA;
    game.teamB = teamB;
    game.phase = 'playing';
    game.currentQuarter = 1;
    return game;
}

describe('gameReducer: A.コーチ テクニカルの取り消し', () => {
    it('コーチ行に二重計上したBも一緒に消える', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'ACOACH', foulType: 'T',
                shotSituation: 'none', freeThrows: 1, freeThrowResults: ['made'],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1', benchTechType: 'AC',
            },
        });
        expect(state.teamA.assistantCoachFouls).toEqual(['T']);
        expect(state.teamA.coachFouls).toEqual(['BT']);

        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId: state.foulHistory[0].id } });

        expect(state.teamA.assistantCoachFouls).toEqual([]);
        expect(state.teamA.coachFouls).toEqual([]);
    });

    it('コーチ本人のTを巻き添えで消さない', () => {
        let state = makeGame();
        // 先にコーチ本人のテクニカル
        state = gameReducer(state, {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'COACH', foulType: 'T',
                shotSituation: 'none', freeThrows: 1, freeThrowResults: ['made'],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1', benchTechType: 'HC',
            },
        });
        // 次にA.コーチのテクニカル
        state = gameReducer(state, {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'ACOACH', foulType: 'T',
                shotSituation: 'none', freeThrows: 1, freeThrowResults: ['made'],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1', benchTechType: 'AC',
            },
        });
        expect(state.teamA.coachFouls).toEqual(['T', 'BT']);

        // A.コーチ分だけ取り消す
        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId: state.foulHistory[1].id } });

        expect(state.teamA.coachFouls).toEqual(['T']);
        expect(state.teamA.assistantCoachFouls).toEqual([]);
    });
});

describe('gameReducer: 交代要員テクニカルの取り消し', () => {
    it('加算していないチームファウルを減らさない', () => {
        let state = makeGame();
        // 通常ファウルでチームファウルを1にする
        state = gameReducer(state, {
            type: 'ADD_FOUL',
            payload: { teamId: 'teamA', playerId: 'a1', foulType: 'P' },
        });
        expect(state.teamA.teamFouls[0]).toBe(1);

        state = gameReducer(state, {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'a2', foulType: 'T',
                shotSituation: 'none', freeThrows: 1, freeThrowResults: ['made'],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1', benchTechType: 'Sub',
            },
        });
        // 交代要員のTはチームファウルに入らない
        expect(state.teamA.teamFouls[0]).toBe(1);

        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId: state.foulHistory[1].id } });

        expect(state.teamA.teamFouls[0]).toBe(1);
    });

    it('選手行のTとコーチ行のBが両方消える', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'a2', foulType: 'T',
                shotSituation: 'none', freeThrows: 1, freeThrowResults: ['made'],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1', benchTechType: 'Sub',
            },
        });
        expect(state.teamA.players.find(p => p.id === 'a2')!.fouls).toHaveLength(1);
        expect(state.teamA.coachFouls).toEqual(['BT']);

        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId: state.foulHistory[0].id } });

        expect(state.teamA.players.find(p => p.id === 'a2')!.fouls).toEqual([]);
        expect(state.teamA.coachFouls).toEqual([]);
    });
});

describe('gameReducer: 同じ選手の同種ファウルの取り消し', () => {
    it('FT本数が違っても取り消した方のファウルが消える', () => {
        let state = makeGame();
        // 1件目: P（FTなし）
        state = gameReducer(state, {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'a1', foulType: 'P',
                shotSituation: 'none', freeThrows: 0, freeThrowResults: [],
                shooterTeamId: 'teamB', shooterPlayerId: '',
            },
        });
        // 2件目: P（シュート中でFT2本）
        state = gameReducer(state, {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'a1', foulType: 'P',
                shotSituation: '2P', shotMade: false, freeThrows: 2, freeThrowResults: ['made', 'missed'],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1',
            },
        });
        expect(state.teamA.players[0].fouls).toHaveLength(2);

        // 2件目（P2）だけ取り消す
        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId: state.foulHistory[1].id } });

        const remaining = state.teamA.players[0].fouls;
        expect(remaining).toHaveLength(1);
        expect(remaining[0]).toEqual({ type: 'P', freeThrows: 0, freeThrowResults: undefined });
    });
});

describe('gameReducer: FT得点を編集したあとのファウル取り消し', () => {
    it('得点履歴と選手スタッツの合計が食い違わない', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'a1', foulType: 'P',
                shotSituation: 'none', freeThrows: 2, freeThrowResults: ['made', 'made'],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1',
            },
        });
        expect(state.scoreHistory).toHaveLength(2);

        // 記録ミスに気づき、1本目をb2に付け替える
        state = gameReducer(state, {
            type: 'EDIT_SCORE',
            payload: { entryId: state.scoreHistory[0].id, newPlayerId: 'b2', newScoreType: 'FT' },
        });

        // そのあとファウルごと取り消す
        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId: state.foulHistory[0].id } });

        const totalPoints = [...state.teamA.players, ...state.teamB.players]
            .reduce((sum, p) => sum + p.stats.points, 0);
        const historyPoints = state.scoreHistory.reduce((sum, e) => sum + e.points, 0);
        expect(historyPoints).toBe(totalPoints);
        expect([...state.teamA.players, ...state.teamB.players].every(p => p.stats.points >= 0)).toBe(true);
        expect([...state.teamA.players, ...state.teamB.players].every(p => p.stats.freeThrowAttempt >= 0)).toBe(true);
    });

    it('近い時刻に無関係な得点があっても巻き添えで消さない', () => {
        let state = makeGame();
        // 同じ選手が先に通常の2Pを決めている
        state = gameReducer(state, { type: 'ADD_SCORE', payload: { teamId: 'teamB', playerId: 'b1', scoreType: '2P' } });
        state = gameReducer(state, {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'a1', foulType: 'P',
                shotSituation: 'none', freeThrows: 1, freeThrowResults: ['made'],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1',
            },
        });
        expect(state.scoreHistory).toHaveLength(2);

        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId: state.foulHistory[0].id } });

        // 残るのは通常の2Pのみ
        expect(state.scoreHistory).toHaveLength(1);
        expect(state.scoreHistory[0].scoreType).toBe('2P');
        expect(state.teamB.players.find(p => p.id === 'b1')!.stats.points).toBe(2);
    });
});
