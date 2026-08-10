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

export { MAX_PLAYERS_PER_TEAM };

/** これ以上追加できないか（追加操作の直前に呼ぶ） */
export function isPlayerLimitReached(currentCount: number): boolean {
    return currentCount >= MAX_PLAYERS_PER_TEAM;
}

/** 上限に達したときの案内。理由（様式の欄数）まで伝える */
export function playerLimitMessage(): string {
    return `選手は${MAX_PLAYERS_PER_TEAM}人までです（スコアシートの選手欄が${MAX_PLAYERS_PER_TEAM}人分のため）`;
}
