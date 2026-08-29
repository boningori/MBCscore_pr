// 壊れた中断セッションを再開しても落ちないこと。
//
// 履歴と違ってここは「試合の途中」に効く。壊れたセッションを再開すると
// 記録を続けようとしたその場でアプリがエラー画面になり、localStorage に
// 残るので再開のたびに再発する。
//
// 下の各ケースは v1.6.9 の実ブラウザで実際に ErrorBoundary を出したもの
// （セッションに1件仕込んで「試合を再開」を押して確認した）。

import { describe, it, expect, beforeEach } from 'vitest';
import { loadGameSession, repairGameSession } from './gameSessionStorage';
import type { GameSession } from './gameSessionStorage';
import { createInitialGame, createTeam, createPlayer } from '../types/game';

function validSession(mutate?: (s: Record<string, unknown>) => void): GameSession {
    const game = createInitialGame();
    game.phase = 'playing';
    game.teamA = { ...createTeam('teamA', '自軍', 'コーチ'), players: [createPlayer('teamA-p0', 4, 'あ')] };
    game.teamB = { ...createTeam('teamB', '相手', 'コーチ'), players: [createPlayer('teamB-p0', 5, 'い')] };
    const session = { game, gameName: '練習試合', date: '2026-08-20', savedAt: '2026-08-20T02:00:00.000Z' };
    if (mutate) mutate(session as unknown as Record<string, unknown>);
    return session as unknown as GameSession;
}

describe('repairGameSession', () => {
    it('game が空でもチームとして扱える形にする（undefined の players で落ちていた）', () => {
        const fixed = repairGameSession(validSession(s => { s.game = {}; }));
        expect(fixed.game.teamA.players).toEqual([]);
        expect(fixed.game.teamB.players).toEqual([]);
    });

    it('teamA が null でもチームとして扱える形にする', () => {
        const fixed = repairGameSession(validSession(s => { (s.game as Record<string, unknown>).teamA = null; }));
        expect(fixed.game.teamA.players).toEqual([]);
        expect(Array.isArray(fixed.game.teamA.teamFouls)).toBe(true);
    });

    it('players の null 要素は取り除く（null の isOnCourt を読んで落ちていた）', () => {
        const fixed = repairGameSession(validSession(s => {
            (s.game as { teamA: { players: unknown[] } }).teamA.players = [null];
        }));
        expect(fixed.game.teamA.players).toEqual([]);
    });

    it('timeouts が配列でなければ空配列にする（timeouts.some で落ちていた）', () => {
        const fixed = repairGameSession(validSession(s => {
            (s.game as { teamA: { timeouts: unknown } }).teamA.timeouts = 'x';
        }));
        expect(fixed.game.teamA.timeouts).toEqual([]);
    });

    it.each(['scoreHistory', 'statHistory', 'foulHistory', 'pendingActions'] as const)(
        '%s が配列でなければ空配列にする（.filter で落ちていた）',
        field => {
            const fixed = repairGameSession(validSession(s => {
                (s.game as Record<string, unknown>)[field] = 'x';
            }));
            expect(fixed.game[field]).toEqual([]);
        },
    );

    it.each(['scoreHistory', 'statHistory', 'foulHistory', 'pendingActions'] as const)(
        '%s の null 要素は取り除く（null の teamId を読んで落ちていた）',
        field => {
            const fixed = repairGameSession(validSession(s => {
                (s.game as Record<string, unknown>)[field] = [null];
            }));
            expect(fixed.game[field]).toEqual([]);
        },
    );

    it('直すところが無ければ同じオブジェクトをそのまま返す', () => {
        const session = validSession();
        expect(repairGameSession(session)).toBe(session);
    });
});

describe('loadGameSession: 読み込みの時点で直り、直った形が書き戻る', () => {
    beforeEach(() => localStorage.clear());

    it('壊れたセッションを直して返す', () => {
        localStorage.setItem('minibasket-game-session', JSON.stringify(
            validSession(s => { (s.game as Record<string, unknown>).scoreHistory = 'x'; }),
        ));

        expect(loadGameSession()!.game.scoreHistory).toEqual([]);
        const stored = JSON.parse(localStorage.getItem('minibasket-game-session')!);
        expect(stored.game.scoreHistory).toEqual([]);
    });

    it('健全なセッションには書き戻さない', () => {
        const original = JSON.stringify(validSession());
        localStorage.setItem('minibasket-game-session', original);

        loadGameSession();

        expect(localStorage.getItem('minibasket-game-session')).toBe(original);
    });

    it('セッションが無ければ null', () => {
        expect(loadGameSession()).toBeNull();
    });
});
