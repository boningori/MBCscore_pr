// 対戦チーム一覧の絞り込み。
//
// 一覧は登録順に全件を並べるだけで、探す手段が無かった（teamStorage の
// saveOpponent は末尾に push するだけなので、後から足したチームほど下に
// 積み上がる）。編集も削除もこの一覧からしか辿れないため、探せないことが
// そのまま操作できないことになる。
//
// 引くのはチーム名だけにする。コーチ名や選手名まで拾うと、名前で引いた
// つもりの結果に理由の分からない1件が混ざる。
//
// team.name が文字列であることは読み込み側が保証している
// （repairSavedTeams が String(...) へ矯正する）ので、ここでは重ねない。

import type { SavedTeam } from '../../utils/teamStorage';
import { matchesQuery } from '../../utils/matchesQuery';

/**
 * 名前で絞った新しい配列を返す（元の配列は変えない）。
 *
 * 並べ替えはしない——登録順という現行の規則を保つ。
 * 空の検索語では全件返る（matchesQuery が常に true を返す）。
 */
export function filterTeamsByName(teams: SavedTeam[], query: string): SavedTeam[] {
    return teams.filter(team => matchesQuery(team.name, query));
}
