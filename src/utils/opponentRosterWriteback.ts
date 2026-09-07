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
    /** saveOpponent へそのまま渡す。計画が返る時点で必ず一致しているので null にはならない */
    updatedRegistry: SavedTeam | null;
    /** saveRecentOpponent へそのまま渡す。直近履歴に名前が一致しなければ null */
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
 * - 登録一覧・直近履歴のどちらかで同名が2件以上見つかった（どちらに入れるべきか決められない）
 * - 対戦チーム管理の登録一覧に見つからない（直近履歴にしか無い＝登録されていない、も含む）
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

    // 直近履歴は試合開始のたびに書かれる（App.tsx の handleGameSetupComplete が
    // saveRecentOpponent を呼ぶ）ので、そこに一致することは「登録されている」
    // 証拠にならない。その場で手入力しただけの相手も必ず直近履歴には載る。
    // 取り込み対象にしてよいのは、対戦チーム管理の登録一覧に一意に一致した
    // ときだけにする
    if (!registryHit) return null;

    // 差分は登録一覧の一致レコードを基準に計算する。直近履歴は試合開始時に
    // 「その試合で実際に使った名簿」で上書きされるため、現在の試合より
    // 遅れることはない。古いまま残るとしたら、その試合が使わなかった
    // 別レコードだけであり、それはこの機能が走る前からある古さであって、
    // この機能が新たに古くするわけではない。withAdded 内の have チェックは、
    // 直近履歴の中身が登録一覧と食い違っている（既に一部を持っている）場合の
    // 重複追加を防ぐためのもの
    const known = new Set(registryHit.players.map(p => p.number));

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

    const updatedRegistry = withAdded(registryHit);
    // 直近履歴の更新は、登録一覧に一致したうえで直近履歴にも一致したときだけ。
    // 両方を揃えるのは「片方だけだと、もう片方から選んだ次の試合で反映されて
    // 見えない」ため
    const updatedRecent = recentHit ? withAdded(recentHit) : null;

    return {
        teamName: opponent.name,
        added,
        updatedRegistry,
        updatedRecent,
        // 保存先が乖離している場合、登録後の人数は異なる可能性がある。
        // より多い側の人数を報告する。15人超過の警告は最も混雑した結果に対して
        // 出すべきだから
        resultCount: Math.max(
            updatedRegistry.players.length,
            updatedRecent?.players.length ?? 0,
        ),
    };
}
