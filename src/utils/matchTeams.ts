// 試合開始時のチーム組み立て

import type { Team } from '../types/game';
import { savedTeamToTeam, type SavedTeam, type NumberType } from './teamStorage';

/**
 * 登録チームから、試合で使う白（teamA）／青（teamB）を組み立てる。
 *
 * 白=teamA（上段）・青=teamB（下段）に固定し、マイチームの色に応じて中身を割り当てる。
 * 番号タイプ（ビブス/ユニフォーム）はマイチーム側にだけ効く。相手チームは登録された
 * number をそのまま使う。
 *
 * マイチーム側には savedTeamId を残す。savedTeamToTeam が Team へ写した時点で id は
 * 'teamA'/'teamB' に変わってしまい、これが無いと保存後は名前でしか登録チームと
 * 結び付けられず、改名した瞬間に過去の試合が選手スタッツ分析から消える。
 * 相手側にあえて入れない理由は Team.savedTeamId のコメントを参照。
 *
 * コート上の選手はクリアして返す（スタメンはQ1のラインナップ画面で選ぶ）。
 */
export function buildMatchTeams(setup: {
    myTeam: SavedTeam;
    opponentTeam: SavedTeam;
    myTeamColor: 'white' | 'blue';
    numberType: NumberType;
}): { teamA: Team; teamB: Team } {
    const isMyTeamWhite = setup.myTeamColor === 'white';

    const teamA = savedTeamToTeam(
        isMyTeamWhite ? setup.myTeam : setup.opponentTeam,
        'teamA',
        isMyTeamWhite ? setup.numberType : undefined,
    );
    teamA.isMyTeam = isMyTeamWhite;
    teamA.color = 'white';
    if (isMyTeamWhite) teamA.savedTeamId = setup.myTeam.id;

    const teamB = savedTeamToTeam(
        isMyTeamWhite ? setup.opponentTeam : setup.myTeam,
        'teamB',
        isMyTeamWhite ? undefined : setup.numberType,
    );
    teamB.isMyTeam = !isMyTeamWhite;
    teamB.color = 'blue';
    if (!isMyTeamWhite) teamB.savedTeamId = setup.myTeam.id;

    teamA.players = teamA.players.map(p => ({ ...p, isOnCourt: false }));
    teamB.players = teamB.players.map(p => ({ ...p, isOnCourt: false }));

    return { teamA, teamB };
}
