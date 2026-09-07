// 1チームに登録できる選手数の上限。
//
// 公式様式の選手欄は15人分しかなく、RunningScoresheet も players.slice(0, 15)
// でしか描画しない。上限を掛けないと16人目以降は「得点はチーム合計に乗るのに
// スコアシートには現れない」状態になり、合計と個人欄が合わない提出物ができる。
//
// マイチーム側には元から上限があったが、対戦チーム側（対戦チーム管理・
// 試合設定の未登録チーム入力）には無く、番号一括選択で101人まで選べていた。
// 判定と文言をここに集約して、編集画面ごとにずれないようにする。

import { MAX_PLAYERS_PER_TEAM } from '../../types/game';
import { sortPlayersByNumber } from '../../utils/playerNumber';

export { MAX_PLAYERS_PER_TEAM };

/** これ以上追加できないか（追加操作の直前に呼ぶ） */
export function isPlayerLimitReached(currentCount: number): boolean {
    return currentCount >= MAX_PLAYERS_PER_TEAM;
}

/** 上限に達したときの案内。理由（様式の欄数）まで伝える */
export function playerLimitMessage(): string {
    return `選手は${MAX_PLAYERS_PER_TEAM}人までです（スコアシートの選手欄が${MAX_PLAYERS_PER_TEAM}人分のため）`;
}

/** 並べ替えと表示に要る最小限。Player もこの形を満たす */
export interface NumberedPlayer {
    number: number;
    name: string;
}

/**
 * 追加したときに公式様式（15人分）から外れる選手を返す。溢れないなら null。
 *
 * 外れるのは「いま追加する選手」とは限らない。名簿は背番号順に並び
 * （handleAddPlayerToTeam）、様式は先頭15人しか描かない（RunningScoresheet の
 * players.slice(0, 15)）ため、若い番号を足すと番号の大きい既存選手が押し出される。
 * 実測では、得点を記録済みの #24 が様式から消えてチーム合計と個人欄の合計が
 * 食い違った。
 *
 * 追加そのものは止めない（練習試合では人数が読めないまま始まることがあり、
 * 止めると記録できなくなる）。代わりに、誰が外れるかを先に伝えるために使う。
 *
 * 並べ替えは sortPlayersByNumber に任せる。様式に載る15人を決めるのは
 * reducer 側のソートなので、別実装で数えると案内と結果がずれる。
 */
export function findOverflowPlayer(
    players: readonly NumberedPlayer[],
    newPlayer: NumberedPlayer,
): NumberedPlayer | null {
    return findOverflowPlayers(players, [newPlayer])[0] ?? null;
}

/**
 * まとめて追加したときに公式様式（15人分）から外れる選手を、背番号順で全て返す。
 * 溢れないなら空配列。
 *
 * スタメン選択画面の一括登録では複数人を同時に足すため、単数版では
 * 「1人目しか案内できない」。並べ替えを別実装で書くと案内と実際の結果が
 * ずれるので、判定はこの関数に集約し、単数版もここを通す。
 *
 * 追加が0人のときは、既に16人以上いても空配列を返す。追加操作をしていない
 * のに「載らなくなります」と出すと、いま何をしたせいなのかが伝わらない。
 */
export function findOverflowPlayers(
    players: readonly NumberedPlayer[],
    newPlayers: readonly NumberedPlayer[],
): NumberedPlayer[] {
    if (newPlayers.length === 0) return [];
    const ordered = sortPlayersByNumber([...players, ...newPlayers]);
    return ordered.slice(MAX_PLAYERS_PER_TEAM);
}
