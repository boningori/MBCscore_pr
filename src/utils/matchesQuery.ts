// 文字列の絞り込みで使う照合の規則。
//
// 試合履歴の検索（historyFilter.ts）と対戦チーム管理の検索（teamFilter.ts）は
// 「同じ振る舞い」と決めてある。それぞれが trim().toLowerCase().includes() を
// 書くと、片方だけ直したときに静かにずれる。利用者からは「同じ言葉で引いたのに
// 片方だけ出ない」という形で見えるので、規則はここ1か所に置く。
//
// 全角半角・かなカナの同一視はしない。入れるなら両方の画面に同時に入れる話で、
// 片方だけ賢くすると上と同じずれになる。

/**
 * haystack が query を含むか。
 *
 * - 検索語の前後の空白は落とす
 * - 英字の大文字小文字は区別しない
 * - 部分一致（前方一致ではない）
 * - 空の検索語は常に true（＝絞り込みなし）
 */
export function matchesQuery(haystack: string, query: string): boolean {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return haystack.toLowerCase().includes(needle);
}
