// ファウル行の「(FT: n/m)」は、記録した当時の成否ではなく、いま残っている記録を
// 表さなければならない。
//
// 成功したFTを「やっぱり外していた」と直す（CONVERT_SCORE_TO_MISS）と、得点
// エントリだけが FTA の StatEntry へ化けて FoulEntry.freeThrowResults は 'made' の
// まま残る。そのため同じパネルの中で、シューター側の行が「FTミス」・スコアが0点
// なのに、ファウル行だけが「(FT: 1/2)」と言い続けていた。しかもこの状態は
// canEditFreeThrows が false になる＝画面から直せないので、記録者には直しようの
// ない矛盾表示だけが残る。
//
// freeThrowResults を書き換えないこと自体は他の集計の前提なので変えない
// （TeamComparison の teamTotals が「外した本数」の正としてこれを読む）。
// 表示側が紐付いた記録から数え直す（countMadeFreeThrows）。

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, within } from '@testing-library/react';
import { ActionHistory } from './ActionHistory';
import { gameReducer } from '../../context/reducers';
import { createInitialGame, createPlayer, createTeam } from '../../types/game';
import type { FoulEntry, Game } from '../../types/game';

afterEach(cleanup);

function makeGame(): Game {
    const g = createInitialGame();
    const a = createTeam('teamA', 'ホーム', 'C');
    const b = createTeam('teamB', 'アウェイ', 'C');
    a.players = [{ ...createPlayer('a1', 4, 'たろう'), isOnCourt: true }];
    b.players = [{ ...createPlayer('b1', 20, 'はなこ'), isOnCourt: true }];
    return { ...g, teamA: a, teamB: b, phase: 'playing' };
}

/** アンスポ（FT2本）を1件記録した状態を作る */
function withUnsportsmanlike(results: ('made' | 'missed')[]): Game {
    return gameReducer(makeGame(), {
        type: 'ADD_FOUL_WITH_FREE_THROWS',
        payload: {
            teamId: 'teamA', playerId: 'a1', foulType: 'U',
            shotSituation: 'none', shotMade: false,
            freeThrows: results.length, freeThrowResults: results,
            shooterTeamId: 'teamB', shooterPlayerId: 'b1',
        },
    });
}

/** ファウルした側（teamA）の履歴を描く */
function renderFoulSide(game: Game) {
    const utils = render(
        <ActionHistory
            teamId="teamA" teamName="ホーム"
            scoreHistory={game.scoreHistory}
            statHistory={game.statHistory}
            foulHistory={game.foulHistory}
            players={game.teamA.players}
            onRemoveScore={vi.fn()} onRemoveStat={vi.fn()} onRemoveFoul={vi.fn()}
            onEditScore={vi.fn()} onEditStat={vi.fn()}
        />
    );
    return within(utils.baseElement);
}

describe('ActionHistory: ファウル行のFT表示', () => {
    it('記録したままなら記録どおりに出す', () => {
        const q = renderFoulSide(withUnsportsmanlike(['made', 'missed']));

        expect(q.getByText(/\(FT: 1\/2\)/)).toBeTruthy();
    });

    it('成功したFTをミスへ直したら 0/2 になる', () => {
        let game = withUnsportsmanlike(['made', 'missed']);
        const ft = game.scoreHistory.find(s => s.scoreType === 'FT')!;
        game = gameReducer(game, {
            type: 'CONVERT_SCORE_TO_MISS',
            payload: { entryId: ft.id, newMissType: 'FTA', newPlayerId: 'b1' },
        });
        // シューターの成績は既に 0/2（reducer側は正しい）
        expect(game.teamB.players[0].stats.freeThrowMade).toBe(0);
        expect(game.teamB.players[0].stats.freeThrowAttempt).toBe(2);

        const q = renderFoulSide(game);

        expect(q.getByText(/\(FT: 0\/2\)/)).toBeTruthy();
        expect(q.queryByText(/\(FT: 1\/2\)/)).toBeNull();
    });

    it('紐付いた得点を消したら、その分を成功に数えない', () => {
        let game = withUnsportsmanlike(['made', 'made']);
        const ft = game.scoreHistory.filter(s => s.scoreType === 'FT');
        game = gameReducer(game, { type: 'REMOVE_SCORE', payload: { entryId: ft[0].id } });

        const q = renderFoulSide(game);

        expect(q.getByText(/\(FT: 1\/2\)/)).toBeTruthy();
    });

    it('全部外したファウルは 0/2 のまま（紐付く記録が1件も無い）', () => {
        const game = withUnsportsmanlike(['missed', 'missed']);
        expect(game.scoreHistory).toHaveLength(0);

        const q = renderFoulSide(game);

        expect(q.getByText(/\(FT: 0\/2\)/)).toBeTruthy();
    });

    it('sourceFoulId を持たない旧データは記録どおりに出す', () => {
        const legacy: FoulEntry = {
            id: 'old-1', teamId: 'teamA', playerId: 'a1', playerNumber: 4,
            foulType: 'U', quarter: 1, timestamp: 1000, isCoachOrBench: false,
            freeThrows: 2, freeThrowResults: ['made', 'made'],
            shooterTeamId: 'teamB', shooterPlayerId: 'b1', shooterPlayerNumber: 20,
        };
        const game = { ...makeGame(), foulHistory: [legacy] };

        const q = renderFoulSide(game);

        expect(q.getByText(/\(FT: 2\/2\)/)).toBeTruthy();
    });

    it('バスケットカウントの得点は成功FTに数えない', () => {
        const game = gameReducer(makeGame(), {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'a1', foulType: 'P',
                shotSituation: '2P', shotMade: true,
                freeThrows: 1, freeThrowResults: ['missed'],
                shooterTeamId: 'teamB', shooterPlayerId: 'b1',
            },
        });
        // 紐付く記録はあるが、それはシュート成功分の2P
        expect(game.scoreHistory).toHaveLength(1);
        expect(game.scoreHistory[0].scoreType).toBe('2P');

        const q = renderFoulSide(game);

        expect(q.getByText(/\(FT: 0\/1\)/)).toBeTruthy();
    });
});
