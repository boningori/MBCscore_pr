// チーム単位のスタッツ集計。
//
// 「全体」と「クォーター別」で計算元が違う。
//
//   全体       … 選手スタッツの合計＋「選手不明」分。隣に並ぶ StatsPanel の
//                 合計行と必ず一致させる必要があるため、同じ足し方をする
//   クォーター別 … 履歴からの再集計。選手スタッツは累計値しか持たないため、
//                 Q別はこちらでしか出せない
//
// 両者が食い違うのは、どこかの reducer が選手スタッツを動かしたのに履歴を
// 書いていないということ。teamTotals.consistency.test.ts でそこを見張っている。

import type { FoulEntry, ScoreEntry, StatEntry, Team } from '../../types/game';
import { sumUnknownStats } from '../../utils/unknownStats';

/** 'all' は試合全体。数値はそのクォーター（5以降は延長） */
export type QuarterFilter = 'all' | number;

export interface TeamTotals {
    points: number;
    twoMade: number;
    twoAttempt: number;
    threeMade: number;
    threeAttempt: number;
    ftMade: number;
    ftAttempt: number;
    offensiveRebounds: number;
    defensiveRebounds: number;
    assists: number;
    steals: number;
    blocks: number;
    turnovers: number;
    /** 選手のファウルのみ。コーチ・ベンチは含めない（StatsPanel の合計行と同じ） */
    fouls: number;
}

export interface TeamTotalsInput {
    team: Team;
    teamId: string;
    scoreHistory: ScoreEntry[];
    statHistory: StatEntry[];
    foulHistory: FoulEntry[];
}

function emptyTotals(): TeamTotals {
    return {
        points: 0,
        twoMade: 0, twoAttempt: 0,
        threeMade: 0, threeAttempt: 0,
        ftMade: 0, ftAttempt: 0,
        offensiveRebounds: 0, defensiveRebounds: 0,
        assists: 0, steals: 0, blocks: 0, turnovers: 0,
        fouls: 0,
    };
}

export function computeTeamTotals(input: TeamTotalsInput, filter: QuarterFilter): TeamTotals {
    return filter === 'all' ? totalsFromPlayers(input) : totalsFromHistory(input, filter);
}

function totalsFromPlayers({ team, teamId, statHistory }: TeamTotalsInput): TeamTotals {
    const totals = emptyTotals();

    for (const p of team.players) {
        totals.points += p.stats.points;
        totals.twoMade += p.stats.twoPointMade;
        totals.twoAttempt += p.stats.twoPointAttempt;
        totals.threeMade += p.stats.threePointMade;
        totals.threeAttempt += p.stats.threePointAttempt;
        totals.ftMade += p.stats.freeThrowMade;
        totals.ftAttempt += p.stats.freeThrowAttempt;
        totals.offensiveRebounds += p.stats.offensiveRebounds;
        totals.defensiveRebounds += p.stats.defensiveRebounds;
        totals.assists += p.stats.assists;
        totals.steals += p.stats.steals;
        totals.blocks += p.stats.blocks;
        totals.turnovers += p.stats.turnovers;
        // ファウルは PlayerStats に無く、履歴の配列長がそのまま本数になる
        totals.fouls += p.fouls.length;
    }

    const unknown = sumUnknownStats(statHistory, teamId);
    if (unknown) {
        totals.points += unknown.points;
        totals.twoMade += unknown.twoPointMade;
        totals.twoAttempt += unknown.twoPointAttempt;
        totals.threeMade += unknown.threePointMade;
        totals.threeAttempt += unknown.threePointAttempt;
        totals.ftMade += unknown.freeThrowMade;
        totals.ftAttempt += unknown.freeThrowAttempt;
        totals.offensiveRebounds += unknown.offensiveRebounds;
        totals.defensiveRebounds += unknown.defensiveRebounds;
        totals.assists += unknown.assists;
        totals.steals += unknown.steals;
        totals.blocks += unknown.blocks;
        totals.turnovers += unknown.turnovers;
        // 不明では記録できないので、ファウルは足すものが無い
    }

    return totals;
}

function totalsFromHistory(
    { teamId, scoreHistory, statHistory, foulHistory }: TeamTotalsInput,
    quarter: number,
): TeamTotals {
    const totals = emptyTotals();

    for (const entry of scoreHistory) {
        if (entry.teamId !== teamId || entry.quarter !== quarter) continue;
        totals.points += entry.points;
        // OGは得点だけ。シュートを打った選手の成績にはしない（選手スタッツ側と同じ）
        if (entry.isOwnGoal) continue;
        if (entry.scoreType === '2P') totals.twoMade++;
        else if (entry.scoreType === '3P') totals.threeMade++;
        else totals.ftMade++;
    }

    for (const entry of statHistory) {
        if (entry.teamId !== teamId || entry.quarter !== quarter) continue;
        switch (entry.statType) {
            case 'OREB': totals.offensiveRebounds++; break;
            case 'DREB': totals.defensiveRebounds++; break;
            case 'AST': totals.assists++; break;
            case 'STL': totals.steals++; break;
            case 'BLK': totals.blocks++; break;
            case 'TO':
            case 'TO:DD':
            case 'TO:TR':
            case 'TO:PM':
            case 'TO:CM': totals.turnovers++; break;
            // 外したシュート。成功分は ScoreEntry 側で数えているので、
            // ここに足すと試投数になる
            case '2PA': totals.twoAttempt++; break;
            case '3PA': totals.threeAttempt++; break;
            case 'FTA': totals.ftAttempt++; break;
        }
    }

    totals.twoAttempt += totals.twoMade;
    totals.threeAttempt += totals.threeMade;
    totals.ftAttempt += totals.ftMade;

    // ファウルで与えたFTのうち「外した分」を補う。
    //
    // 外したFTは StatEntry を1件も作らない。成功分だけが ScoreEntry になり、
    // 外した本数はシューターの freeThrowAttempt に本数として乗るだけで履歴に
    // 現れない（foulHandlers.ts の canEditFreeThrows のdocコメント）。上の2つの
    // ループだけでは、このクォーターの試投数が本数に届かない
    // （実測: freeThrows:2 で1本外すと、全体=2 なのにクォーター別の和は1）。
    //
    // FTを打ったのはシューター側のチームなので shooterTeamId で絞る。
    // teamId（ファウルした側）は下の fouls 集計にしか使えない。
    //
    // freeThrowResults の 'missed' はここでは見ない。CONVERT_SCORE_TO_MISS で
    // 成功FTを「やっぱり外し」に直しても freeThrowResults は書き換わらず
    // （'made' のまま）、ScoreEntry が1件減って代わりに FTA の StatEntry が
    // 増えるだけなので、'missed' の数を足すと二重に減算してしまう。
    // 代わりに「本数 − このファウルに紐付いた件数（成功のScoreEntry＋
    // ミスへ変換されたFTAのStatEntry。どちらも sourceFoulId で結ばれる）」で
    // 外した分を割り出す。バスケットカウントの本数（basketEntry）は
    // scoreType '2P'/'3P' で sourceFoulId を持つが、ここでは scoreType 'FT' /
    // statType 'FTA' だけを数えるので混ざらない。
    //
    // sourceFoulId は旧データに無い（ScoreEntry/StatEntry のdocコメント）。
    // このファウルへの紐付きが1件も無いとき、それが「新データだが全部外した」
    // のか「旧データで紐付け自体が無い」のか、この1件だけでは区別できない。
    // その試合のどこかに sourceFoulId 付きの記録が1件でもあれば新データと
    // 判断して本数どおり外れたとみなし、1件も無ければ旧データとみなして
    // 補正しない（過大計上より過少計上のほうが実害が小さいため、あえて足さない）
    const hasFoulLinkedEntries =
        scoreHistory.some(s => s.sourceFoulId !== undefined) ||
        statHistory.some(s => s.sourceFoulId !== undefined);
    for (const entry of foulHistory) {
        if (entry.shooterTeamId !== teamId || entry.quarter !== quarter) continue;
        const freeThrows = entry.freeThrows ?? 0;
        if (freeThrows <= 0) continue;

        const linkedMade = scoreHistory.filter(
            s => s.sourceFoulId === entry.id && s.scoreType === 'FT'
        ).length;
        const linkedMissConverted = statHistory.filter(
            s => s.sourceFoulId === entry.id && s.statType === 'FTA'
        ).length;
        const accounted = linkedMade + linkedMissConverted;

        let missed: number;
        if (accounted > 0) {
            missed = freeThrows - accounted;
        } else if (hasFoulLinkedEntries) {
            missed = freeThrows;
        } else {
            missed = 0;
        }
        totals.ftAttempt += Math.max(0, missed);
    }

    for (const entry of foulHistory) {
        if (entry.teamId !== teamId || entry.quarter !== quarter) continue;
        if (entry.isCoachOrBench) continue;
        totals.fouls++;
    }

    return totals;
}
