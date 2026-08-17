// ファウルが生成したFT・バスケットカウントの得点は、ファウル削除時に一緒に消える必要がある。
//
// 対応付けをタイムスタンプの近接（同一シューター・1秒以内）で行っていたため、
// 先に得点エントリを訂正すると照合が外れ、選手スタッツからは減算されるのに
// 得点エントリが残った。スコアボード（選手得点の合計）とスコアシートの
// ランニングスコアが食い違い、しかも画面上どちらも「もっともらしい」数字になる。
import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import type { Game } from '../types/game';
import { createInitialGame, createTeam, createPlayer } from '../types/game';

function makeGame(): Game {
    const game = createInitialGame();
    const teamA = createTeam('teamA', 'ホーム', 'コーチA');
    teamA.players = [createPlayer('a1', 4, '選手A1', true), createPlayer('a2', 5, '選手A2')];
    const teamB = createTeam('teamB', 'ビジター', 'コーチB');
    teamB.players = [createPlayer('b1', 6, '選手B1', true), createPlayer('b2', 7, '選手B2')];
    game.teamA = teamA;
    game.teamB = teamB;
    game.phase = 'playing';
    return game;
}

/** teamAのa1がファウル、teamBのb1がFT2本成功 */
function withFoulAndTwoMadeFreeThrows(): Game {
    return gameReducer(makeGame(), {
        type: 'ADD_FOUL_WITH_FREE_THROWS',
        payload: {
            teamId: 'teamA',
            playerId: 'a1',
            foulType: 'P',
            shotSituation: 'none',
            freeThrows: 2,
            freeThrowResults: ['made', 'made'],
            shooterTeamId: 'teamB',
            shooterPlayerId: 'b1',
        },
    });
}

const teamPoints = (state: Game, teamId: 'teamA' | 'teamB') =>
    state[teamId].players.reduce((sum, p) => sum + p.stats.points, 0);

const historyPoints = (state: Game, teamId: 'teamA' | 'teamB') =>
    state.scoreHistory.filter(s => s.teamId === teamId).reduce((sum, s) => sum + s.points, 0);

describe('REMOVE_FOUL: ファウルが生んだ得点の削除', () => {
    it('通常の削除でFT得点も消える', () => {
        const withFoul = withFoulAndTwoMadeFreeThrows();
        expect(teamPoints(withFoul, 'teamB')).toBe(2);

        const removed = gameReducer(withFoul, {
            type: 'REMOVE_FOUL',
            payload: { entryId: withFoul.foulHistory[0].id },
        });

        expect(removed.scoreHistory).toHaveLength(0);
        expect(teamPoints(removed, 'teamB')).toBe(0);
    });

    it('FTを別の選手に訂正した後でも、削除後にスタッツと得点履歴が一致する', () => {
        const withFoul = withFoulAndTwoMadeFreeThrows();
        // FT1本目をb1からb2の記録に訂正する（押し間違えの訂正）
        const corrected = gameReducer(withFoul, {
            type: 'EDIT_SCORE',
            payload: {
                entryId: withFoul.scoreHistory[0].id,
                newPlayerId: 'b2',
                newScoreType: 'FT',
            },
        });
        expect(teamPoints(corrected, 'teamB')).toBe(2);

        const removed = gameReducer(corrected, {
            type: 'REMOVE_FOUL',
            payload: { entryId: corrected.foulHistory[0].id },
        });

        // ファウルごと消したのだから、そのファウル由来の得点は残ってはいけない
        expect(removed.scoreHistory).toHaveLength(0);
        // スコアボードとランニングスコアが食い違わない
        expect(teamPoints(removed, 'teamB')).toBe(historyPoints(removed, 'teamB'));
        expect(teamPoints(removed, 'teamB')).toBe(0);
        // 訂正先・訂正元とも、記録前の状態に戻る（マイナスが残らない）
        for (const id of ['b1', 'b2']) {
            const p = removed.teamB.players.find(x => x.id === id)!;
            expect({ id, ...p.stats }).toMatchObject({
                id, points: 0, freeThrowMade: 0, freeThrowAttempt: 0,
            });
        }
    });

    it('FTを1本外していても、削除後にFTの試投数が残らない', () => {
        const withFoul = gameReducer(makeGame(), {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'a1', foulType: 'P', shotSituation: 'none',
                freeThrows: 2, freeThrowResults: ['made', 'missed'],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1',
            },
        });
        const b1Before = withFoul.teamB.players.find(p => p.id === 'b1')!;
        expect(b1Before.stats).toMatchObject({ points: 1, freeThrowMade: 1, freeThrowAttempt: 2 });

        const removed = gameReducer(withFoul, {
            type: 'REMOVE_FOUL',
            payload: { entryId: withFoul.foulHistory[0].id },
        });

        const b1 = removed.teamB.players.find(p => p.id === 'b1')!;
        expect(b1.stats).toMatchObject({ points: 0, freeThrowMade: 0, freeThrowAttempt: 0 });
        expect(removed.scoreHistory).toHaveLength(0);
    });

    it('ファウル由来の得点を全部ミスへ直しても、無関係な得点を巻き込まない', () => {
        // 同じシューターが自力で決めた2P。ファウルの記録とタイムスタンプが近接する
        const withOwnScore = gameReducer(makeGame(), {
            type: 'ADD_SCORE',
            payload: { teamId: 'teamB', playerId: 'b1', scoreType: '2P', entryId: 'own-2p' },
        });
        // バスケットカウント: シュート成功 + FT1本成功
        const withFoul = gameReducer(withOwnScore, {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'a1', foulType: 'P', shotSituation: '2P', shotMade: true,
                freeThrows: 1, freeThrowResults: ['made'],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1',
            },
        });
        const foulId = withFoul.foulHistory[0].id;

        // 「どちらも実は外していた」と直す。これでファウルに紐づく得点は1件も残らない
        const corrected = withFoul.scoreHistory
            .filter(s => s.sourceFoulId === foulId)
            .reduce((state, entry) => gameReducer(state, {
                type: 'CONVERT_SCORE_TO_MISS',
                payload: { entryId: entry.id, newMissType: entry.scoreType === 'FT' ? 'FTA' : '2PA' },
            }), withFoul);
        expect(corrected.scoreHistory.map(s => s.id)).toEqual(['own-2p']);

        const removed = gameReducer(corrected, { type: 'REMOVE_FOUL', payload: { entryId: foulId } });

        // 紐づく得点が0件でも、旧データ向けの推測（同一シューター・1秒以内）へ
        // 落ちてはいけない。自力の2Pは残る
        expect(removed.scoreHistory.map(s => s.id)).toEqual(['own-2p']);
        expect(teamPoints(removed, 'teamB')).toBe(historyPoints(removed, 'teamB'));
        expect(teamPoints(removed, 'teamB')).toBe(2);
        // ミスへ直した試投はファウルと対で消える
        const b1 = removed.teamB.players.find(p => p.id === 'b1')!;
        expect(b1.stats).toMatchObject({ twoPointMade: 1, twoPointAttempt: 1, freeThrowAttempt: 0 });
    });

    it('無関係な得点は巻き込まれない', () => {
        const withFoul = withFoulAndTwoMadeFreeThrows();
        // 同じシューターが直後に通常の2Pを決めた（タイムスタンプが近接する）
        const withExtraScore = gameReducer(withFoul, {
            type: 'ADD_SCORE',
            payload: { teamId: 'teamB', playerId: 'b1', scoreType: '2P' },
        });

        const removed = gameReducer(withExtraScore, {
            type: 'REMOVE_FOUL',
            payload: { entryId: withExtraScore.foulHistory[0].id },
        });

        expect(removed.scoreHistory).toHaveLength(1);
        expect(removed.scoreHistory[0].scoreType).toBe('2P');
        expect(teamPoints(removed, 'teamB')).toBe(historyPoints(removed, 'teamB'));
        expect(teamPoints(removed, 'teamB')).toBe(2);
    });
});
