import { describe, it, expect } from 'vitest';
import { filterTeamsByName } from './teamFilter';
import type { SavedTeam } from '../../utils/teamStorage';

// 対戦チーム管理は全件を登録順に並べるだけで、探す手段が無かった。
// 編集も削除もこの一覧からしか辿れないので、探せないことが操作できない
// ことになる。引くのはチーム名だけ（コーチ名や選手名では引かない）。

function team(name: string, overrides: Partial<SavedTeam> = {}): SavedTeam {
    return {
        id: `opp-${name}`,
        name,
        coachName: '佐々木',
        assistantCoachName: '',
        players: [{ number: 4, name: '田中', isCaptain: false }],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

const teams = [
    team('西陵ミニバス'),
    team('東陵ミニバスケットボールクラブ'),
    team('MBC Jr'),
];

const namesOf = (list: SavedTeam[]) => list.map(t => t.name);

describe('filterTeamsByName', () => {
    it('名前の一部で絞れる', () => {
        expect(namesOf(filterTeamsByName(teams, '西陵'))).toEqual(['西陵ミニバス']);
    });

    it('複数が引っかかればすべて返す', () => {
        expect(namesOf(filterTeamsByName(teams, 'ミニバス')))
            .toEqual(['西陵ミニバス', '東陵ミニバスケットボールクラブ']);
    });

    it('英字の大文字小文字を区別しない', () => {
        expect(namesOf(filterTeamsByName(teams, 'mbc'))).toEqual(['MBC Jr']);
    });

    it('空の検索語では全件返る', () => {
        expect(namesOf(filterTeamsByName(teams, ''))).toEqual(namesOf(teams));
        expect(namesOf(filterTeamsByName(teams, '  '))).toEqual(namesOf(teams));
    });

    it('コーチ名では引けない（対象は名前だけ）', () => {
        expect(filterTeamsByName(teams, '佐々木')).toEqual([]);
    });

    it('選手名では引けない（対象は名前だけ）', () => {
        expect(filterTeamsByName(teams, '田中')).toEqual([]);
    });

    it('名前が空のチームは、検索語があると外れる', () => {
        const withUnnamed = [...teams, team('')];
        expect(namesOf(filterTeamsByName(withUnnamed, '西陵'))).toEqual(['西陵ミニバス']);
    });

    it('名前が空のチームも、検索語が無ければ残る', () => {
        const withUnnamed = [...teams, team('')];
        expect(filterTeamsByName(withUnnamed, '')).toHaveLength(4);
    });

    it('元の配列を変えない', () => {
        const input = [...teams];
        filterTeamsByName(input, '西陵');
        expect(namesOf(input)).toEqual(namesOf(teams));
    });

    it('並び順は入力のまま（並べ替えない）', () => {
        // 登録順という現行の規則を保つ。今回入れるのは探す手段であって
        // 並べ直す手段ではない
        expect(namesOf(filterTeamsByName(teams, 'ミニバス')))
            .toEqual(['西陵ミニバス', '東陵ミニバスケットボールクラブ']);
    });
});
