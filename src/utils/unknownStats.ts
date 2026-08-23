// 「選手不明」で記録した分の集計。
//
// 保留アクションを不明で解決すると playerId が 'unknown' の StatEntry になり、
// どの選手のスタッツにも入らない。チーム合計は選手スタッツの総和で作るので、
// これを足さないと「チーム統計に記録」したはずの分がどの数字にも現れない。
//
// 統計パネルとチーム比較の両方が同じ足し方をする必要があるため、ここに置く。

import type { PlayerStats, StatEntry } from '../types/game';
import { createInitialStats } from '../types/game';

/** 'unknown' に割り当てられた記録をチーム分だけ集計する（無ければ null） */
export function sumUnknownStats(statHistory: StatEntry[], teamId: string): PlayerStats | null {
    const entries = statHistory.filter(s => s.playerId === 'unknown' && s.teamId === teamId);
    if (entries.length === 0) return null;

    const stats = createInitialStats();
    for (const { statType } of entries) {
        switch (statType) {
            case 'OREB': stats.offensiveRebounds++; break;
            case 'DREB': stats.defensiveRebounds++; break;
            case 'AST': stats.assists++; break;
            case 'STL': stats.steals++; break;
            case 'BLK': stats.blocks++; break;
            case 'TO': stats.turnovers++; break;
            case 'TO:DD': stats.turnovers++; stats.turnoverDD++; break;
            case 'TO:TR': stats.turnovers++; stats.turnoverTR++; break;
            case 'TO:PM': stats.turnovers++; stats.turnoverPM++; break;
            case 'TO:CM': stats.turnovers++; stats.turnoverCM++; break;
            case '2PA': stats.twoPointAttempt++; break;
            case '3PA': stats.threePointAttempt++; break;
            case 'FTA': stats.freeThrowAttempt++; break;
        }
    }
    return stats;
}
