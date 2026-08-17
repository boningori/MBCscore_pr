// 選手のファウル欄は「発生順」に埋まっていなければならない。
//
// 公式様式は player.fouls[i] の表記（P2 など）と、foulHistory を時刻順に並べた
// i 番目のピリオド（記入色 1Q/3Q=赤・2Q/4Q/OT=黒）を対にして1マスを描く
// （RunningScoresheet.renderPlayerRow）。ハーフタイムの太線位置も前半の
// ファウル数から決まるため、並びが崩れると太線が別のファウルの右に出る。
//
// ところが player.fouls は常に末尾へ追加していた。発生時刻より後に追加される
// 経路が2つある:
//   - EDIT_FOUL: 背番号の見間違いを直す付け替え（試合中いちばん多い訂正）
//   - 保留ファウルの解決: 記録時のピリオドを持ったまま、あとから確定する
// どちらも「後のクォーターのファウルが1枠目に、前のクォーターのファウルが
// 2枠目に」出て、色まで入れ替わっていた。

import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import type { Game } from '../types/game';
import { createInitialGame, createTeam, createPlayer, formatFoulDisplay } from '../types/game';
import { createPendingAction } from '../types/pendingAction';

function makeGame(): Game {
    const game = createInitialGame();
    const teamA = createTeam('teamA', 'ホーム', 'コーチA');
    teamA.players = [createPlayer('a1', 4, '選手A1', true), createPlayer('a2', 5, '選手A2')];
    const teamB = createTeam('teamB', 'ビジター', 'コーチB');
    teamB.players = [createPlayer('b1', 6, '選手B1', true)];
    game.teamA = teamA;
    game.teamB = teamB;
    game.phase = 'playing';
    return game;
}

/** 公式様式が1マスずつ描くときに見る組み合わせ（表記 + 記入色のもとになるピリオド） */
function sheetCells(state: Game, playerId: string) {
    const player = state.teamA.players.find(p => p.id === playerId)!;
    const history = state.foulHistory
        .filter(f => f.playerId === playerId)
        .sort((a, b) => a.timestamp - b.timestamp);
    return player.fouls.map((foul, i) => ({
        text: formatFoulDisplay(foul),
        quarter: history[i]?.quarter,
    }));
}

describe('公式様式のファウル欄: 発生順', () => {
    it('付け替えたファウルが、発生順の位置に収まる', () => {
        let state = makeGame();
        // Q1: a2 のパーソナル（あとで a1 のものだったと分かる）
        state = gameReducer(state, {
            type: 'ADD_FOUL',
            payload: { teamId: 'teamA', playerId: 'a2', foulType: 'P' },
        });
        const q1FoulId = state.foulHistory[0].id;

        // Q2: a1 のテクニカル（先に確定している）
        state = { ...state, currentQuarter: 2 };
        state = gameReducer(state, {
            type: 'ADD_FOUL',
            payload: { teamId: 'teamA', playerId: 'a1', foulType: 'T' },
        });

        // Q1 のパーソナルを a1 へ付け替える
        state = gameReducer(state, {
            type: 'EDIT_FOUL',
            payload: { entryId: q1FoulId, newPlayerId: 'a1' },
        });

        expect(sheetCells(state, 'a1')).toEqual([
            { text: 'P', quarter: 1 },
            { text: 'T', quarter: 2 },
        ]);
    });

    it('あとから解決した保留ファウルが、発生順の位置に収まる', () => {
        let state = makeGame();
        const pending = createPendingAction('FOUL', 'P', 'teamA', 1, []);
        // Q1 に発生したが誰か分からず保留
        state = gameReducer(state, {
            type: 'ADD_PENDING_ACTION',
            payload: { ...pending, timestamp: pending.timestamp - 600_000 },
        });

        // Q3 で a1 のテクニカルを記録
        state = { ...state, currentQuarter: 3 };
        state = gameReducer(state, {
            type: 'ADD_FOUL',
            payload: { teamId: 'teamA', playerId: 'a1', foulType: 'T' },
        });

        // そのあとで Q1 の保留を「a1 だった」と解決
        state = gameReducer(state, {
            type: 'RESOLVE_PENDING_ACTION',
            payload: { pendingActionId: pending.id, playerId: 'a1' },
        });

        expect(sheetCells(state, 'a1')).toEqual([
            { text: 'P', quarter: 1 },
            { text: 'T', quarter: 3 },
        ]);
    });

    it('FT付きの保留ファウルも発生順に収まる', () => {
        let state = makeGame();
        const pending = createPendingAction('FOUL', 'P', 'teamA', 1, []);
        state = gameReducer(state, {
            type: 'ADD_PENDING_ACTION',
            payload: { ...pending, timestamp: pending.timestamp - 600_000 },
        });

        state = { ...state, currentQuarter: 3 };
        state = gameReducer(state, {
            type: 'ADD_FOUL',
            payload: { teamId: 'teamA', playerId: 'a1', foulType: 'T' },
        });

        state = gameReducer(state, {
            type: 'RESOLVE_PENDING_ACTION_WITH_FREE_THROWS',
            payload: {
                pendingActionId: pending.id,
                playerId: 'a1',
                foulType: 'P',
                shotSituation: 'none',
                freeThrows: 2,
                freeThrowResults: ['made', 'missed'],
                shooterTeamId: 'teamB',
                shooterPlayerId: 'b1',
            },
        });

        expect(sheetCells(state, 'a1')).toEqual([
            { text: 'P2', quarter: 1 },
            { text: 'T', quarter: 3 },
        ]);
    });

    it('ファウル種類だけを指定して解決する保留も発生順に収まる', () => {
        let state = makeGame();
        const pending = createPendingAction('FOUL', 'P', 'teamA', 1, []);
        state = gameReducer(state, {
            type: 'ADD_PENDING_ACTION',
            payload: { ...pending, timestamp: pending.timestamp - 600_000 },
        });

        state = { ...state, currentQuarter: 3 };
        state = gameReducer(state, {
            type: 'ADD_FOUL',
            payload: { teamId: 'teamA', playerId: 'a1', foulType: 'T' },
        });

        state = gameReducer(state, {
            type: 'RESOLVE_PENDING_ACTION_WITH_FOUL_TYPE',
            payload: { pendingActionId: pending.id, playerId: 'a1', foulType: 'U' },
        });

        expect(sheetCells(state, 'a1')).toEqual([
            { text: 'U', quarter: 1 },
            { text: 'T', quarter: 3 },
        ]);
    });

    it('発生順に記録した通常のファウルは従来どおり', () => {
        let state = makeGame();
        state = gameReducer(state, {
            type: 'ADD_FOUL',
            payload: { teamId: 'teamA', playerId: 'a1', foulType: 'P' },
        });
        state = { ...state, currentQuarter: 2 };
        state = gameReducer(state, {
            type: 'ADD_FOUL',
            payload: { teamId: 'teamA', playerId: 'a1', foulType: 'T' },
        });

        expect(sheetCells(state, 'a1')).toEqual([
            { text: 'P', quarter: 1 },
            { text: 'T', quarter: 2 },
        ]);
    });
});
