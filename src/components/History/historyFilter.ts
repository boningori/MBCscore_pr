// 試合履歴の絞り込みと並べ替え。
//
// 履歴には手がかりが何も無く、1シーズン分（数十件）を延々スクロールして
// 目当ての試合を探すしかなかった。試合名・チーム名・日付のどれかで
// 引っかかれば十分なので、項目を分けずに1つの入力で横断検索する。

import type { GameRecord } from '../../utils/gameHistoryStorage';
import { recordInputDate } from '../../utils/localDate';

export type HistoryOrder = 'newest' | 'oldest';

export interface HistoryFilter {
    query: string;
    order: HistoryOrder;
}

/** 1件を検索対象の文字列にまとめる */
function searchableText(record: GameRecord): string {
    return [
        record.gameName,
        record.teamA?.name,
        record.teamB?.name,
        // 「2026-06」で6月の試合を探せるように、暦日も対象に含める
        recordInputDate(record.date),
    ].filter(Boolean).join(' ').toLowerCase();
}

/** 絞り込んで並べ替えた新しい配列を返す（元の配列は変えない） */
export function filterAndSortRecords(
    records: GameRecord[],
    { query, order }: HistoryFilter,
): GameRecord[] {
    const needle = query.trim().toLowerCase();
    const filtered = needle
        ? records.filter(record => searchableText(record).includes(needle))
        : [...records];

    const direction = order === 'newest' ? -1 : 1;
    return filtered.sort((a, b) => {
        const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
        // 同日の試合は元の並び（保存順）を保ちたいので0を返す。
        // Array#sort は安定なので、この時点の順序がそのまま残る
        if (diff === 0) return 0;
        return diff * direction;
    });
}
