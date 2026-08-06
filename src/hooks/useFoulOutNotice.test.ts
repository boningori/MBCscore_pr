import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useFoulOutNotice } from './useFoulOutNotice';
import { createTeam, createPlayer } from '../types/game';
import type { Game, Player, Team } from '../types/game';

const showToast = vi.hoisted(() => vi.fn());
vi.mock('../components/Toast/toastApi', () => ({ showToast }));

function player(id: string, number: number, name: string, fouls: number): Player {
    return {
        ...createPlayer(id, number, name),
        fouls: Array.from({ length: fouls }, () => 'P' as const),
    };
}

function team(id: 'teamA' | 'teamB', name: string, players: Player[]): Team {
    return { ...createTeam(id, name, ''), players };
}

/** 検証に使う分だけを備えた最小のGame */
function game(teamA: Team, teamB: Team = team('teamB', '青', [])): Pick<Game, 'teamA' | 'teamB'> {
    return { teamA, teamB };
}

beforeEach(() => showToast.mockReset());
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('useFoulOutNotice', () => {
    it('5個目のファウルが記録された瞬間に知らせる', () => {
        const before = game(team('teamA', '白', [player('a1', 7, 'タロウ', 4)]));
        const after = game(team('teamA', '白', [player('a1', 7, 'タロウ', 5)]));

        const { rerender } = renderHook(({ s }) => useFoulOutNotice(s), {
            initialProps: { s: before },
        });
        expect(showToast).not.toHaveBeenCalled();

        rerender({ s: after });

        expect(showToast).toHaveBeenCalledTimes(1);
        expect(showToast.mock.calls[0][0]).toContain('#7');
        expect(showToast.mock.calls[0][0]).toContain('タロウ');
        expect(showToast.mock.calls[0][0]).toContain('退場');
    });

    it('4個目では知らせない', () => {
        const before = game(team('teamA', '白', [player('a1', 7, 'タロウ', 3)]));
        const after = game(team('teamA', '白', [player('a1', 7, 'タロウ', 4)]));

        const { rerender } = renderHook(({ s }) => useFoulOutNotice(s), {
            initialProps: { s: before },
        });
        rerender({ s: after });

        expect(showToast).not.toHaveBeenCalled();
    });

    it('すでに5ファウルの状態で開始しても知らせない', () => {
        const restored = game(team('teamA', '白', [player('a1', 7, 'タロウ', 5)]));

        renderHook(({ s }) => useFoulOutNotice(s), { initialProps: { s: restored } });

        expect(showToast).not.toHaveBeenCalled();
    });

    // アプリは空のチームでマウントし、そのあと RESTORE_GAME で選手が現れる。
    // 「初回レンダーだけ無視する」実装では、この2手目を新規到達と誤認して
    // 中断再開のたびに過去の退場を蒸し返す（実機で確認）
    it('中断再開: 空のチームで始まり、あとから5ファウルの選手が現れても知らせない', () => {
        const empty = game(team('teamA', '白', []), team('teamB', '青', []));
        const restored = game(
            team('teamA', '白', [player('a1', 7, 'タロウ', 5)]),
            team('teamB', '青', [player('b1', 3, 'ジロウ', 5)]),
        );

        const { rerender } = renderHook(({ s }) => useFoulOutNotice(s), {
            initialProps: { s: empty },
        });
        rerender({ s: restored });

        expect(showToast).not.toHaveBeenCalled();
    });

    it('復元後にその選手がさらに記録されても、退場の再通知はしない', () => {
        const empty = game(team('teamA', '白', []));
        const restored = () => game(team('teamA', '白', [player('a1', 7, 'タロウ', 5)]));

        const { rerender } = renderHook(({ s }) => useFoulOutNotice(s), {
            initialProps: { s: empty },
        });
        rerender({ s: restored() });
        rerender({ s: restored() });

        expect(showToast).not.toHaveBeenCalled();
    });

    it('復元後に別の選手が5個目に達したら知らせる', () => {
        const empty = game(team('teamA', '白', []));
        const restored = game(
            team('teamA', '白', [player('a1', 7, 'タロウ', 5), player('a2', 8, 'ジロウ', 4)]),
        );
        const next = game(
            team('teamA', '白', [player('a1', 7, 'タロウ', 5), player('a2', 8, 'ジロウ', 5)]),
        );

        const { rerender } = renderHook(({ s }) => useFoulOutNotice(s), {
            initialProps: { s: empty },
        });
        rerender({ s: restored });
        expect(showToast).not.toHaveBeenCalled();

        rerender({ s: next });
        expect(showToast).toHaveBeenCalledTimes(1);
        expect(showToast.mock.calls[0][0]).toContain('ジロウ');
    });

    it('同じ選手について二度は知らせない', () => {
        const before = game(team('teamA', '白', [player('a1', 7, 'タロウ', 4)]));
        const after = game(team('teamA', '白', [player('a1', 7, 'タロウ', 5)]));

        const { rerender } = renderHook(({ s }) => useFoulOutNotice(s), {
            initialProps: { s: before },
        });
        rerender({ s: after });
        showToast.mockReset();

        // 得点などで再レンダーされても再通知しない
        rerender({ s: game(team('teamA', '白', [player('a1', 7, 'タロウ', 5)])) });
        expect(showToast).not.toHaveBeenCalled();
    });

    it('ファウルを取り消して5個未満に戻したあと、再び5個目に達したら知らせる', () => {
        const five = () => game(team('teamA', '白', [player('a1', 7, 'タロウ', 5)]));
        const four = () => game(team('teamA', '白', [player('a1', 7, 'タロウ', 4)]));

        const { rerender } = renderHook(({ s }) => useFoulOutNotice(s), {
            initialProps: { s: four() },
        });
        rerender({ s: five() });
        expect(showToast).toHaveBeenCalledTimes(1);

        // 誤記録を取り消す
        rerender({ s: four() });
        showToast.mockReset();

        rerender({ s: five() });
        expect(showToast).toHaveBeenCalledTimes(1);
    });

    it('両チームを見る', () => {
        const before = game(
            team('teamA', '白', [player('a1', 7, 'タロウ', 4)]),
            team('teamB', '青', [player('b1', 12, 'ジロウ', 4)]),
        );
        const after = game(
            team('teamA', '白', [player('a1', 7, 'タロウ', 4)]),
            team('teamB', '青', [player('b1', 12, 'ジロウ', 5)]),
        );

        const { rerender } = renderHook(({ s }) => useFoulOutNotice(s), {
            initialProps: { s: before },
        });
        rerender({ s: after });

        expect(showToast).toHaveBeenCalledTimes(1);
        expect(showToast.mock.calls[0][0]).toContain('ジロウ');
    });

    it('コートネームがあればそれを使う（カード表示と揃える）', () => {
        const withCourtName = (fouls: number): Player => ({
            ...player('a1', 7, '山田太郎', fouls),
            courtName: 'タロウ',
        });
        const { rerender } = renderHook(({ s }) => useFoulOutNotice(s), {
            initialProps: { s: game(team('teamA', '白', [withCourtName(4)])) },
        });
        rerender({ s: game(team('teamA', '白', [withCourtName(5)])) });

        expect(showToast.mock.calls[0][0]).toContain('タロウ');
        expect(showToast.mock.calls[0][0]).not.toContain('山田太郎');
    });
});
