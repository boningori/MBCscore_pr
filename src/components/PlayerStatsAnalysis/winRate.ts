// 勝率の表示。
//
// 引き分けは分母に入れない（勝 ÷ (勝+敗)）。日本のスポーツでの一般的な数え方で、
// 「引き分けが増えるほど勝率が下がる」という直感に反する動きを避けられる。
// 以前は勝 ÷ 全試合だったため、2勝2敗2分が33%と表示されていた。
// チームサマリーは引き分けを「分」として別に出しているので、勝率にも
// 混ぜると二重に数えていることになる。

import type { TeamRecord } from '../../utils/playerStatsAnalysis';

/** 勝率の表示文字列。勝敗のついた試合が無ければ「—」 */
export function formatWinRate(record: TeamRecord): string {
    const decided = record.wins + record.losses;
    // 0%と出すと「全敗」に見えるので、定義できないことを記号で示す
    if (decided === 0) return '—';
    return `${Math.round((record.wins / decided) * 100)}%`;
}
