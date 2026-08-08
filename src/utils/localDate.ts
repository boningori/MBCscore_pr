// <input type="date"> に入れる日付文字列（YYYY-MM-DD）の組み立て。
//
// Date#toISOString はUTCの日付を返す。日本(UTC+9)では現地の朝9時前がUTCでは
// まだ前日なので、`new Date().toISOString().slice(0,10)` を既定値にすると
// 8時台に試合設定をした瞬間に日付が前日になる。ミニバスは9時開始・8時台受付が
// 普通なので、これは日常的に起きる。しかも記録者には気づく手がかりがなく、
// スコアシートの日付欄・履歴の表示と並び・月次/年次の集計・出力ファイル名まで
// まとめて1日ずれる。
//
// 現地のカレンダー日付が欲しい場面ではこちらを使う。

/** Date を現地のカレンダー日付 YYYY-MM-DD にする */
export function formatInputDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/** 今日の現地日付 YYYY-MM-DD */
export function todayInputDate(): string {
    return formatInputDate(new Date());
}
