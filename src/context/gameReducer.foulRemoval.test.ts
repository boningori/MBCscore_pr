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

describe('gameReducer: OGにした得点を生んだファウルの取り消し', () => {
    // TOGGLE_OWN_GOAL はシュート成功・試投を成績から外す（handleToggleOwnGoal）。
    // 外したあとにファウルを取り消すと、REMOVE_SCORE / EDIT_SCORE と同じく
    // 「戻す対象が無い」扱いにしないと成功・試投が負になる。
    it('FT得点をOGにしてからファウルを消しても、FT成績が負にならない', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'a1', foulType: 'P',
                shotSituation: 'none', freeThrows: 1, freeThrowResults: ['made'],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1',
            },
        });
        state = gameReducer(state, { type: 'TOGGLE_OWN_GOAL', payload: { entryId: state.scoreHistory[0].id } });
        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId: state.foulHistory[0].id } });

        const b1 = state.teamB.players.find(p => p.id === 'b1')!;
        expect(b1.stats.freeThrowMade).toBe(0);
        expect(b1.stats.freeThrowAttempt).toBe(0);
        expect(b1.stats.points).toBe(0);
    });

    it('バスケットカウントの得点をOGにしてからファウルを消しても、2P成績が負にならない', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'a1', foulType: 'P',
                shotSituation: '2P', shotMade: true, freeThrows: 1, freeThrowResults: ['missed'],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1',
            },
        });
        const basket = state.scoreHistory.find(s => s.scoreType === '2P')!;
        state = gameReducer(state, { type: 'TOGGLE_OWN_GOAL', payload: { entryId: basket.id } });
        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId: state.foulHistory[0].id } });

        const b1 = state.teamB.players.find(p => p.id === 'b1')!;
        expect(b1.stats.twoPointMade).toBe(0);
        expect(b1.stats.twoPointAttempt).toBe(0);
        expect(b1.stats.freeThrowAttempt).toBe(0);
        expect(b1.stats.points).toBe(0);
    });
});

// フリースローはファウル無しには発生しない。
//
// FT成功をミスへ直すと得点エントリがFTAのスタッツ記録に化けるが（handleConvertScoreToMiss）、
// その記録はファウルとの紐付けを持たなかった。ファウルを取り消しても消えず、
// シューターに「原因の無い試投」が残る（実測: ftm=0, fta=1）。
// 競技規則では作れない状態で、選手詳細の FT 0/1 や通算集計にそのまま出る。
describe('gameReducer: ファウル由来のFTをミスへ直したあとの取り消し', () => {
    /** teamA a1 のファウルで teamB b1 がFTを1本打った状態 */
    function withFoul(result: 'made' | 'missed') {
        return gameReducer(makeGame(), {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'a1', foulType: 'P',
                shotSituation: 'none', freeThrows: 1, freeThrowResults: [result],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1',
            },
        });
    }

    it('ミスへ直してからファウルを取り消すと、試投もFTAの記録も残らない', () => {
        let state = withFoul('made');
        state = gameReducer(state, {
            type: 'CONVERT_SCORE_TO_MISS',
            payload: { entryId: state.scoreHistory[0].id, newMissType: 'FTA' },
        });
        expect(state.statHistory).toHaveLength(1);

        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId: state.foulHistory[0].id } });

        const b1 = state.teamB.players.find(p => p.id === 'b1')!;
        expect(b1.stats.freeThrowAttempt).toBe(0);
        expect(b1.stats.freeThrowMade).toBe(0);
        expect(state.statHistory).toHaveLength(0);
    });

    it('ミス→成功へ戻してからファウルを取り消しても、得点が残らない', () => {
        let state = withFoul('made');
        state = gameReducer(state, {
            type: 'CONVERT_SCORE_TO_MISS',
            payload: { entryId: state.scoreHistory[0].id, newMissType: 'FTA' },
        });
        state = gameReducer(state, {
            type: 'CONVERT_MISS_TO_SCORE',
            payload: { entryId: state.statHistory[0].id, newScoreType: 'FT' },
        });

        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId: state.foulHistory[0].id } });

        const b1 = state.teamB.players.find(p => p.id === 'b1')!;
        expect(b1.stats.points).toBe(0);
        expect(b1.stats.freeThrowAttempt).toBe(0);
        expect(state.scoreHistory).toHaveLength(0);
    });

    it('ファウルと無関係に記録したFTミスは、ファウルを取り消しても残る', () => {
        let state = withFoul('missed');
        // 別途、自分で記録したFTミス（テクニカル後の追加練習ではなく通常の入力）
        state = gameReducer(state, {
            type: 'ADD_STAT',
            payload: { teamId: 'teamB', playerId: 'b2', statType: 'FTA' },
        });

        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId: state.foulHistory[0].id } });

        const b2 = state.teamB.players.find(p => p.id === 'b2')!;
        expect(b2.stats.freeThrowAttempt).toBe(1);
        expect(state.statHistory).toHaveLength(1);
    });

    it('FTミスを別種別へ直したら、もうファウルの取り消しでは消さない', () => {
        let state = withFoul('made');
        state = gameReducer(state, {
            type: 'CONVERT_SCORE_TO_MISS',
            payload: { entryId: state.scoreHistory[0].id, newMissType: 'FTA' },
        });
        // 「FTミスではなくオフェンスリバウンドだった」と直す
        state = gameReducer(state, {
            type: 'EDIT_STAT',
            payload: { entryId: state.statHistory[0].id, newPlayerId: 'b1', newStatType: 'OREB' },
        });

        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId: state.foulHistory[0].id } });

        const b1 = state.teamB.players.find(p => p.id === 'b1')!;
        expect(b1.stats.offensiveRebounds).toBe(1);
        expect(state.statHistory).toHaveLength(1);
    });
});

// ミス→成功へ戻した得点は、紐付けを失っていた。
// 従来これが救われていたのは「同じシューター・1秒以内」という旧データ向けの
// 推測（handleRemoveFoul のフォールバック）に偶然引っかかっていたためで、
// シューターを付け替えると推測が外れ、ファウルを消しても得点だけが残る。
describe('gameReducer: ミス→成功へ戻したあとにシューターを付け替える', () => {
    it('ファウルを取り消すと、付け替えた先の得点も消える', () => {
        let state = gameReducer(makeGame(), {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'a1', foulType: 'P',
                shotSituation: 'none', freeThrows: 1, freeThrowResults: ['made'],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1',
            },
        });
        // 一度ミスへ直し、やはり成功だったと戻す
        state = gameReducer(state, {
            type: 'CONVERT_SCORE_TO_MISS',
            payload: { entryId: state.scoreHistory[0].id, newMissType: 'FTA' },
        });
        state = gameReducer(state, {
            type: 'CONVERT_MISS_TO_SCORE',
            payload: { entryId: state.statHistory[0].id, newScoreType: 'FT' },
        });
        // 打ったのは別の選手だった、と付け替える
        state = gameReducer(state, {
            type: 'EDIT_SCORE',
            payload: { entryId: state.scoreHistory[0].id, newPlayerId: 'b2', newScoreType: 'FT' },
        });
        expect(state.teamB.players.find(p => p.id === 'b2')!.stats.points).toBe(1);

        state = gameReducer(state, { type: 'REMOVE_FOUL', payload: { entryId: state.foulHistory[0].id } });

        expect(state.scoreHistory).toHaveLength(0);
        expect(state.teamB.players.reduce((sum, p) => sum + p.stats.points, 0)).toBe(0);
    });
});
