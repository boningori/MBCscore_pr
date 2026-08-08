// 旧データへの savedTeamId 書き戻し（起動時に一度）

import { applySavedTeamIdBackfill } from './gameHistoryStorage';
import { loadMyTeams } from './teamStorage';

/**
 * savedTeamId を持たない過去の試合に、登録マイチームのidを書き戻す。
 *
 * 記録に残るのは試合当時のチーム名だけなので、改名するとその試合は選手スタッツ分析の
 * 試合数・平均・成長グラフから丸ごと抜ける（試合履歴の一覧には残るため気付きにくい）。
 * 改名される前の今のうちに、名前による帰属をidへ凍結しておく。
 *
 * 帰属が一意に決まるレコードにしか書かないので、走らせた瞬間の分析結果は変わらない。
 * 判定の詳細と、書かずに見送る条件は backfillSavedTeamIds を参照。
 *
 * 起動のたびに呼んでよい。書き戻す対象が無ければ保存もしない。
 */
export function migrateSavedTeamIds(): void {
    applySavedTeamIdBackfill(loadMyTeams());
}
