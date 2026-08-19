// 割れていそうな選手カードの検知。
//
// 割れているカードは利用者が気づかないと直しようがない。半角スペースの
// 「佐藤 太郎」と、間に全角スペース(U+3000)を挟んだだけの同姓同名は
// 一覧に並んでも見分けが付かないので、気づく手掛かりを一覧の側から出す。
//
// 検知は提案までで、確認なしには統合しない（別人を混ぜると通算・平均・
// 成長グラフがまとめて狂う。自動で寄せてよいのは名簿から一意に決まるときだけ）。

import type { AggregatedPlayerStats } from '../../utils/playerStatsAnalysis';
import { normalizeNameForMerge } from '../../utils/mergedPlayers';

/**
 * 空白の違いだけで割れているカードの組を返す（組が無ければ空配列）。
 *
 * 束ねるのは空白を取り除いた氏名。背番号の一致は使わない —— ミニバスは
 * 6年生が抜けたあと下級生が番号を引き継ぐので、別人が同じ番号で毎年候補に
 * 出てしまい、提案が邪魔になる。
 *
 * @param rosterNames 現在の名簿の氏名。同じ氏名が2人以上いる場合、その氏名は
 *   名簿で意図的に分けている（別々のライセンスNo.を割り当てている等）とみなし、
 *   候補から外す。buildIdentityAliases（playerStatsAnalysis）と同じ
 *   「あいまいなら候補にしない」という設計判断だが、判定基準は異なる。
 *   buildIdentityAliases は生の氏名の完全一致で見るのに対し、こちらは
 *   normalizeNameForMerge による空白除去後のキーで見る。
 */
export function findMergeCandidates(
    players: readonly AggregatedPlayerStats[],
    rosterNames: readonly string[],
): AggregatedPlayerStats[][] {
    const rosterCount = new Map<string, number>();
    for (const name of rosterNames) {
        const key = normalizeNameForMerge(name);
        rosterCount.set(key, (rosterCount.get(key) ?? 0) + 1);
    }

    const groups = new Map<string, AggregatedPlayerStats[]>();
    for (const player of players) {
        const key = normalizeNameForMerge(player.name);
        if (!key) continue;
        const group = groups.get(key) ?? [];
        group.push(player);
        groups.set(key, group);
    }

    const result: AggregatedPlayerStats[][] = [];
    for (const [key, group] of groups) {
        if (group.length < 2) continue;
        if ((rosterCount.get(key) ?? 0) >= 2) continue;
        result.push(group);
    }
    return result;
}
