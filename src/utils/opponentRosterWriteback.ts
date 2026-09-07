// 試合中に相手チームへ足した選手を、対戦チームの名簿へ取り込む計画を立てる。
//
// 追加を追跡する状態は持たない。試合終了時に「保存済みの名簿」と「試合中の
// 名簿」を背番号で突き合わせ、試合側にしか無い背番号を追加分とする。
// 背番号は選手の識別子で、登録時に重複しないことが保証されている。

import type { Team } from '../types/game';
import type { SavedPlayer, SavedTeam } from './teamStorage';
import { sortPlayersByNumber } from './playerNumber';

export interface OpponentWriteback {
    /** ダイアログに出すチーム名 */
    teamName: string;
    /** 取り込む選手（背番号順） */
    added: SavedPlayer[];
    /** saveOpponent へそのまま渡す。名前が一致しなければ null */
    updatedRegistry: SavedTeam | null;
    /** saveRecentOpponent へそのまま渡す。名前が一致しなければ null */
    updatedRecent: SavedTeam | null;
    /** 登録後の人数。15人超過の案内に使う */
    resultCount: number;
}

/** 同名が1件だけ見つかればそれを返す。0件は null、2件以上は 'ambiguous' */
function uniqueByName(teams: SavedTeam[], name: string): SavedTeam | null | 'ambiguous' {
    const hits = teams.filter(t => t.name === name);
    if (hits.length === 0) return null;
    if (hits.length > 1) return 'ambiguous';
    return hits[0];
}

/**
 * 取り込みの計画を立てる。尋ねる必要が無ければ null。
 *
 * null を返すのは次のいずれか。
 * - 相手チームを判別できない（isMyTeam が偽の側がちょうど1つに決まらない）
 * - 追加された選手がいない
 * - どちらかの保存先で同名が2件以上見つかった（どちらに入れるべきか決められない）
 * - どちらの保存先にも見つからなかった（改名・未登録）
 *
 * 相手チームは名前でしか登録レコードと結び付けられない。Team.savedTeamId は
 * マイチームにしか入らず、相手側に入れると「自分の別チームを相手として登録した
 * 練習試合が選手スタッツ分析から消える」既知の不具合が復活する
 * （types/game.ts の savedTeamId のコメント）。名前が曖昧なら、違うチームの
 * 名簿に黙って書き込むより尋ねないほうが安全。
 */
export function planOpponentWriteback(
    teamA: Team,
    teamB: Team,
    registry: SavedTeam[],
    recent: SavedTeam[],
): OpponentWriteback | null {
    const opponents = [teamA, teamB].filter(t => t.isMyTeam === false);
    if (opponents.length !== 1) return null;
    const opponent = opponents[0];

    const registryHit = uniqueByName(registry, opponent.name);
    const recentHit = uniqueByName(recent, opponent.name);
    if (registryHit === 'ambiguous' || recentHit === 'ambiguous') return null;
    if (!registryHit && !recentHit) return null;

    // 差分の基準はどちらか一方でよい。通常は同じレコードが両方に入っている。
    // ずれている場合に備え、実際に足すときは保存先ごとに持っていない番号だけを足す
    const reference = registryHit ?? recentHit!;
    const known = new Set(reference.players.map(p => p.number));

    // 取り込むのは背番号と名前だけ。コートネームもライセンスNo.も試合中の
    // 追加では入力手段が無く、キャプテンは名簿側で決めること
    const added = sortPlayersByNumber(
        opponent.players
            .filter(p => !known.has(p.number))
            .map(p => ({ number: p.number, name: p.name, isCaptain: false })),
    );
    if (added.length === 0) return null;

    // 既存選手はそのまま残し、足りない分だけ足す。SavedTeam を作り直すと
    // courtName / licenseNo / bibNumber / uniformNumber が落ちる
    // （teamStorage.ts の teamToSavedTeam 削除の経緯を参照）。
    // id は変えない。saveOpponent は id で既存レコードを探して差し替える
    const withAdded = (team: SavedTeam): SavedTeam => {
        const have = new Set(team.players.map(p => p.number));
        return {
            ...team,
            players: sortPlayersByNumber([...team.players, ...added.filter(p => !have.has(p.number))]),
        };
    };

    const updatedRegistry = registryHit ? withAdded(registryHit) : null;
    const updatedRecent = recentHit ? withAdded(recentHit) : null;

    return {
        teamName: opponent.name,
        added,
        updatedRegistry,
        updatedRecent,
        resultCount: Math.max(
            updatedRegistry?.players.length ?? 0,
            updatedRecent?.players.length ?? 0,
        ),
    };
}
