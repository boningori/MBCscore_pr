// 保存済みデータから読み戻したチームの、欠けたフィールドの補完。
//
// 記録エンジンが作るチームは createTeam を通るので全部そろっている。欠けるのは
// 古い記録と、手で編集したバックアップJSONを取り込んだ記録。公式様式は
// コーチ行・A.コーチ行・タイムアウト欄・チームファウル欄を添字で引くため、
// 欠けたまま渡すと画面ごと落ちる（実測: coachFouls の無いレコードで
// 「Cannot read properties of undefined (reading '0')」）。

import { describe, it, expect } from 'vitest';
import { migrateTeam } from './migrateTeam';
import { createTeam } from '../types/game';
import type { Team } from '../types/game';

describe('migrateTeam', () => {
    it('欠けている配列を空で補う', () => {
        const broken = { id: 'teamB', name: '相手', coachName: 'C' } as unknown as Team;

        const migrated = migrateTeam(broken);

        expect(migrated.players).toEqual([]);
        expect(migrated.timeouts).toEqual([]);
        expect(migrated.teamFouls).toEqual([0, 0, 0, 0]);
        expect(migrated.coachFouls).toEqual([]);
        expect(migrated.assistantCoachFouls).toEqual([]);
        expect(migrated.benchFouls).toEqual([]);
    });

    it('入っている値は書き換えない', () => {
        const team = createTeam('teamA', 'ホーム', 'コーチ');
        team.teamFouls = [1, 2, 3, 4, 5];
        team.coachFouls = ['T'];

        const migrated = migrateTeam(team);

        expect(migrated.teamFouls).toEqual([1, 2, 3, 4, 5]);
        expect(migrated.coachFouls).toEqual(['T']);
    });

    it('補うものが無ければ同じオブジェクトを返す（無駄な再描画を起こさない）', () => {
        const team = createTeam('teamA', 'ホーム', 'コーチ');

        expect(migrateTeam(team)).toBe(team);
    });

    it('OTで伸びたチームファウル欄を4つに切り詰めない', () => {
        const team = createTeam('teamA', 'ホーム', 'コーチ');
        team.teamFouls = [2, 3, 1, 4, 4];
        // 他が欠けていて作り直しになる経路でも、既存の値は保つ
        const partial = { ...team, benchFouls: undefined } as unknown as Team;

        expect(migrateTeam(partial).teamFouls).toEqual([2, 3, 1, 4, 4]);
    });
});
