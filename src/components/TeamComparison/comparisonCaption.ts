// チーム比較の見出し（日付・大会名・会場を1行にまとめたもの）を組み立てる。
//
// GameSetup では試合名を空欄のまま進めると「YYYY-MM-DD vs 対戦相手」を
// 自動生成する（GameSetup.tsx の effectiveGameName）。画面にも「空欄の
// ままでもOK」と案内しており、これが既定の使われ方になっている。
// そのため試合名が記録日と同じ日付で始まっているときは、見出し先頭に
// 日付をもう一度出さない。
//
// 注意: 日付の見た目の形式がふたつ違う。formatRecordDate は表示用に
// YYYY/MM/DD（スラッシュ）を返すが、自動生成される試合名の中の日付は
// <input type="date"> 由来の YYYY-MM-DD（ハイフン）のまま埋め込まれる。
// 文字列同士をそのまま比べると別物に見えてしまうので、両方を年月日に
// 分解してから同じ暦日かどうかで判定する。
//
// この判定は GameSetup の自動生成仕様（「日付 vs 対戦相手」）に依存して
// いる。あちらの生成規則が変わる・無くなるときは、ここも合わせて見直すこと。

import { recordDateParts, formatRecordDate, type RecordDateParts } from '../../utils/localDate';

export interface ComparisonCaptionInput {
    /** GameRecord.date（保存済みの試合日、ISO文字列） */
    date: string;
    gameName: string;
    location?: string;
}

const LEADING_ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function sameCalendarDate(a: RecordDateParts, b: RecordDateParts): boolean {
    return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** 試合名の先頭が、記録日と同じ暦日の YYYY-MM-DD で始まっているか */
function nameStartsWithRecordDate(trimmedName: string, recordParts: RecordDateParts | null): boolean {
    if (!recordParts) return false;

    const matched = LEADING_ISO_DATE.exec(trimmedName);
    if (!matched) return false;

    const nameParts: RecordDateParts = {
        year: Number(matched[1]),
        month: Number(matched[2]),
        day: Number(matched[3]),
    };
    return sameCalendarDate(recordParts, nameParts);
}

/**
 * チーム比較画面の見出し文字列を組み立てる。
 *
 * - 試合名が記録日と同じ日付で始まっていれば、先頭に日付を重ねない
 *   （試合名の中の日付をそのまま生かす）
 * - それ以外（利用者が自分で名前を付けた場合）は、従来どおり日付を先頭に付ける
 * - 会場は従来どおり、あれば末尾に付ける
 * - 区切りは全角スペース
 */
export function buildComparisonCaption({ date, gameName, location }: ComparisonCaptionInput): string {
    const trimmedName = (gameName ?? '').trim();
    const recordParts = recordDateParts(date);
    const skipDate = nameStartsWithRecordDate(trimmedName, recordParts);

    return [
        skipDate ? '' : formatRecordDate(date),
        trimmedName,
        location,
    ].filter(Boolean).join('　');
}
