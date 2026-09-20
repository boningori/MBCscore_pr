// 「どちらがマイチームか」の判定。
//
// 記録画面・スコアボード・スタメン選択の3画面が、この1本だけを見る。
// 画面ごとに判定を書くと、片方だけ左右が入れ替わって食い違う。その状態は
// 「どちらが自分か分からない」という元の問題より悪い。
//
// 判定条件は gameHistoryStorage.ts の backfillSavedTeamIds と揃えてある
// （あちらも aIsMine === bIsMine を「自分側を決められない」として扱う）。
// 同じ意味の判定がリポジトリ内で2つの規則を持つのを避ける。

import type { Team } from '../types/game';

/**
 * マイチームがどちら側かを返す。決められないときは null。
 *
 * null になるのは2通り:
 *   - 両方に isMyTeam が立っている（紅白戦。どちらも自分なので片方を際立たせる意味が無い）
 *   - どちらにも立っていない（isMyTeam を持つ前の旧データ。手掛かりが無い）
 * どちらも、推測して間違った側を強調するより何もしないほうが安全である。
 */
export function resolveMyTeamSide(teamA: Team, teamB: Team): 'teamA' | 'teamB' | null {
    const aIsMine = teamA?.isMyTeam === true;
    const bIsMine = teamB?.isMyTeam === true;
    if (aIsMine === bIsMine) return null;
    return aIsMine ? 'teamA' : 'teamB';
}
