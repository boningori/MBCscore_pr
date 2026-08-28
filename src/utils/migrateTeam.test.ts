// 保存済みデータから読み戻したチームの、欠けたフィールドの補完。
//
// 記録エンジンが作るチームは createTeam を通るので全部そろっている。欠けるのは
// 古い記録と、手で編集したバックアップJSONを取り込んだ記録。公式様式は
// コーチ行・A.コーチ行・タイムアウト欄・チームファウル欄を添字で引くため、
// 欠けたまま渡すと画面ごと落ちる（実測: coachFouls の無いレコードで
// 「Cannot read properties of undefined (reading '0')」）。

import { describe, it, expect } from 'vitest';
import { migrateTeam } from './migrateTeam';
import { createTeam, createPlayer, createInitialStats } from '../types/game';
import type { Player, Team } from '../types/game';

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

    it('stats を持たない選手に空のスタッツを補う', () => {
        // 様式・チーム比較・選手スタッツ分析はどれも p.stats.points を素で読む。
        // 欠けたまま渡すと画面ごと落ちる（実測: 手で編集したバックアップを
        // 取り込んだあと、選手スタッツ分析と履歴の試合詳細が
        // 「Cannot read properties of undefined (reading 'points')」で
        // アプリ全体のエラー画面に置き換わる）
        const team = createTeam('teamA', 'ホーム', 'コーチ');
        team.players = [{ id: 'p1', number: 4, name: '選手A', isCaptain: false } as unknown as Player];

        const migrated = migrateTeam(team);

        expect(migrated.players[0].stats).toEqual(createInitialStats());
        expect(migrated.players[0].fouls).toEqual([]);
        expect(migrated.players[0].quartersPlayed).toEqual([false, false, false, false]);
    });

    it('選手の入っている値は書き換えない', () => {
        const team = createTeam('teamA', 'ホーム', 'コーチ');
        const player = createPlayer('p1', 4, '選手A');
        player.stats.points = 12;
        player.fouls = ['P'];
        player.quartersPlayed = ['starter', false, 'sub', false];
        // 別の選手が欠けていて作り直しになる経路でも、そろっている選手は触らない
        team.players = [player, { id: 'p2', number: 5, name: '選手B', isCaptain: false } as unknown as Player];

        const migrated = migrateTeam(team);

        expect(migrated.players[0]).toBe(player);
        expect(migrated.players[0].stats.points).toBe(12);
        expect(migrated.players[0].fouls).toEqual(['P']);
        expect(migrated.players[0].quartersPlayed).toEqual(['starter', false, 'sub', false]);
    });

    it('OTに入った試合では出場欄もピリオド数ぶん補う', () => {
        // 様式もスタメン選択も quartersPlayed を添字で引く。4つ固定で補うと
        // OTの枠だけ undefined になり、teamFouls と長さが食い違う
        const team = createTeam('teamA', 'ホーム', 'コーチ');
        team.teamFouls = [2, 3, 1, 4, 4];
        team.players = [{ id: 'p1', number: 4, name: '選手A', isCaptain: false } as unknown as Player];

        expect(migrateTeam(team).players[0].quartersPlayed).toHaveLength(5);
    });

    it('選手も含めて補うものが無ければ同じオブジェクトを返す', () => {
        const team = createTeam('teamA', 'ホーム', 'コーチ');
        team.players = [createPlayer('p1', 4, '選手A')];

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
