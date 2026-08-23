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
    // 現れない（foulHandlers.ts の updateShooterTeam / canEditFreeThrows の
    // docコメント）。上の2つのループだけでは、このクォーターの試投数が本数に
    // 届かない（実測: freeThrows:2 で1本外すと、全体=2 なのにクォーター別の
    // 和は1）。
    //
    // 「本数 − 紐付いた成功／変換件数」で割り出す方式（sourceFoulId で数える）は
    // 誤り。REMOVE_SCORE・EDIT_SCORE・CONVERT_SCORE_TO_MISS はどれも紐付いた
    // ScoreEntry/StatEntry そのものを消したり別種別へ変えたりするだけで、
    // 選手の freeThrowAttempt は1減らす（handleRemoveScore 等）。つまり
    // 「本数」と「紐付いた件数」は独立に動く。実測（実際の gameReducer で
    // REMOVE_SCORE/EDIT_SCORE/CONVERT_SCORE_TO_MISS を1件流した場合）:
    //   紐付きFTを削除          → 全体=1 なのにクォーター別の和は2（過大）
    //   紐付きFTを2Pへ編集       → 全体=1 なのにクォーター別の和は2（過大）
    //   紐付きFTを2Pミスへ変換   → 全体=1 なのにクォーター別の和は2（過大）
    //
    // 代わりに FoulEntry.freeThrowResults をそのまま数える。この配列は
    // ADD_FOUL_WITH_FREE_THROWS が本数ぶん一度に埋めて（'made'/'missed'）、
    // 以後 REMOVE_SCORE・EDIT_SCORE・CONVERT_SCORE_TO_MISS のどれからも
    // 書き換わらない（sourceFoulId で紐付いた ScoreEntry/StatEntry 側だけが
    // 動く。freeThrowResults を書き換えるのは EDIT_FOUL_FREE_THROWS だけで、
    // それはファウル自体の成否を直す別経路）。つまりここが常に「シューターの
    // freeThrowAttempt に実際に乗っている本数の内訳」の正。
    //
    // 二重計上にならない理由: 上のFTAループが拾うのは「成功 → ミスへ変換」で
    // 生まれた FTA の StatEntry（CONVERT_SCORE_TO_MISS）だけで、これは
    // freeThrowResults の 'missed' とは別物（変換後も freeThrowResults は
    // 元のまま書き換わらない）。実例: freeThrows:2, results ['made','made'] で
    // 1本を変換 → ftMade 1（残った成功のScoreEntry）＋ FTAループ 1（変換で
    // 生まれたStatEntry）＋ ここの missed 0（freeThrowResults は ['made','made']
    // のまま）＝ 2 で本数と一致する。
    //
    // FTを打ったのはシューター側のチームなので shooterTeamId で絞る。
    // teamId（ファウルした側）は下の fouls 集計にしか使えない。
    //
    // shooterPlayerId が無い記録（本数だけ乗ってシューターに紐付かない）は
    // reducer 側も選手スタッツを動かさない（updateShooterTeam の
    // `if (!isTarget || !shooterPlayerId) return team;`）ので、ここでも数えない。
    for (const entry of foulHistory) {
        if (entry.shooterTeamId !== teamId || entry.quarter !== quarter) continue;
        if (!entry.shooterPlayerId) continue;
        const missed = (entry.freeThrowResults ?? []).filter(r => r === 'missed').length;
        totals.ftAttempt += missed;
    }

    for (const entry of foulHistory) {
        if (entry.teamId !== teamId || entry.quarter !== quarter) continue;
        if (entry.isCoachOrBench) continue;
        totals.fouls++;
    }

    return totals;
}
