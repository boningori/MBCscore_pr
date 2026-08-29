// 壊れたチームが1件あるだけでチーム管理画面がエラー画面になる経路をふさぐ。
//
// 下の各ケースは v1.6.9 の実ブラウザで実際に ErrorBoundary を出したもの
// （マイチーム／対戦チームに1件だけ仕込んで管理画面を開いて確認した）。
// teamStorage の検査は「配列であること」までで、要素の中身は素通しだった。

import { describe, it, expect, beforeEach } from 'vitest';
import { repairSavedTeam, repairSavedTeams } from './repairSavedTeams';
import { loadMyTeams, loadOpponents, loadRecentOpponents } from './teamStorage';
import type { SavedTeam } from './teamStorage';

function validTeam(overrides: Record<string, unknown> = {}): SavedTeam {
    return {
        id: 'team-1',
        name: '自軍',
        coachName: 'コーチ',
        assistantCoachName: 'A',
        players: [{ number: 4, name: 'あ', isCaptain: true }],
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        ...overrides,
    } as SavedTeam;
}

describe('repairSavedTeam', () => {
    it('players が配列でなければ空配列にする（.slice(...).map で落ちていた）', () => {
        expect(repairSavedTeam(validTeam({ players: null })).players).toEqual([]);
        expect(repairSavedTeam(validTeam({ players: 'x' })).players).toEqual([]);
    });

    it('players の null 要素は取り除く（null の bibNumber を読んで落ちていた）', () => {
        const good = { number: 6, name: 'う', isCaptain: false };
        const fixed = repairSavedTeam(validTeam({ players: [null, good] }));
        expect(fixed.players).toEqual([good]);
    });

    it('直すところが無ければ同じオブジェクトをそのまま返す', () => {
        const team = validTeam();
        expect(repairSavedTeam(team)).toBe(team);
    });
});

describe('repairSavedTeams', () => {
    it('直すところが無ければ null（書き戻さない）', () => {
        expect(repairSavedTeams([validTeam()])).toBeNull();
    });

    it('オブジェクトでない要素は捨てる（null / 文字列）', () => {
        const good = validTeam();
        const repaired = repairSavedTeams([null, good, 'x'] as unknown as SavedTeam[]);
        expect(repaired).toEqual([good]);
    });

    it('空オブジェクトは名前と選手を補って残す（捨てない）', () => {
        const repaired = repairSavedTeams([{}] as unknown as SavedTeam[])!;
        expect(repaired).toHaveLength(1);
        expect(repaired[0].players).toEqual([]);
        expect(typeof repaired[0].name).toBe('string');
    });

    it('name が文字列でなければ文字列にする', () => {
        const repaired = repairSavedTeams([validTeam({ name: 123 })])!;
        expect(repaired[0].name).toBe('123');
    });

    it('壊れた1件があっても、他のチームはそのまま残る', () => {
        const good = validTeam({ id: 'ok' });
        const bad = validTeam({ id: 'bad', players: null });
        const repaired = repairSavedTeams([good, bad])!;
        expect(repaired[0]).toBe(good);
        expect(repaired[1].players).toEqual([]);
    });
});

describe('teamStorage: 読み込みの時点で直り、直った形が書き戻る', () => {
    beforeEach(() => localStorage.clear());

    it.each([
        ['minibasket-my-teams', loadMyTeams],
        ['minibasket-saved-opponents', loadOpponents],
        ['minibasket-opponent-teams', loadRecentOpponents],
    ])('%s の壊れたチームを直して返す', (key, load) => {
        localStorage.setItem(key, JSON.stringify([null, validTeam({ players: [null] })]));

        const teams = load();

        expect(teams).toHaveLength(1);
        expect(teams[0].players).toEqual([]);
        expect(JSON.parse(localStorage.getItem(key)!)).toHaveLength(1);
    });

    it('健全な一覧には書き戻さない', () => {
        const original = JSON.stringify([validTeam()]);
        localStorage.setItem('minibasket-my-teams', original);

        loadMyTeams();

        expect(localStorage.getItem('minibasket-my-teams')).toBe(original);
    });
});
