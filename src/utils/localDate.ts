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

// ここから下は「保存済みの試合日を読む」側。
//
// 試合日は <input type="date"> の 'YYYY-MM-DD' を new Date() に通してから
// toISOString() で保存している。つまり記録の中では必ず「その暦日のUTC0時」。
// これを現地ゲッター（getMonth/getDate）で読み戻すと、UTCより西の地域では
// 常に前日として表示される（日本では +9 のため偶然一致していただけ）。
// 履歴の日付・スコアシートの日付・月次/年次の集計キー・出力ファイル名が
// まとめて1日ずれるので、読み取りは記録された暦日をそのまま取り出す。

const ISO_DATE_HEAD = /^(\d{4})-(\d{2})-(\d{2})/;

export interface RecordDateParts {
    year: number;
    month: number; // 1-12
    day: number;
}

/**
 * 保存済みの試合日から、記録された暦日を取り出す（読めなければ null）。
 *
 * 文字列の先頭が YYYY-MM-DD ならそこを使う。手で編集したバックアップに
 * オフセット付きの時刻が入っていても、書いた人の意図した日付を保てる。
 * 形が違うときだけ Date に通し、UTC基準で読む。
 */
export function recordDateParts(iso: string): RecordDateParts | null {
    if (!iso) return null;

    const matched = ISO_DATE_HEAD.exec(iso);
    if (matched) {
        return { year: Number(matched[1]), month: Number(matched[2]), day: Number(matched[3]) };
    }

    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

const pad2 = (n: number) => n.toString().padStart(2, '0');

/** 試合日を YYYY/MM/DD に（読めなければ空文字。画面に Invalid Date を出さない） */
export function formatRecordDate(iso: string): string {
    const parts = recordDateParts(iso);
    return parts ? `${parts.year}/${pad2(parts.month)}/${pad2(parts.day)}` : '';
}

/** 試合日を M/D に（グラフの軸ラベルなど幅が狭い場所用） */
export function formatRecordDateShort(iso: string): string {
    const parts = recordDateParts(iso);
    return parts ? `${parts.month}/${parts.day}` : '';
}

/** 試合日を <input type="date"> と同じ YYYY-MM-DD に */
export function recordInputDate(iso: string): string {
    const parts = recordDateParts(iso);
    return parts ? `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}` : '';
}

/**
 * 期間の絞り込み用の境界。記録がUTC0時で入っているので、比較もUTCでそろえる。
 *
 * 以前は開始日が new Date('YYYY-MM-DD')（UTC）、終了日が
 * new Date('YYYY-MM-DDT23:59:59')（現地）と食い違っていた。日本では
 * たまたま実害が出なかったが、UTCより西では終了日の翌日の試合まで入る。
 */
export function startOfInputDateUtc(input: string): Date | undefined {
    const parts = recordDateParts(input);
    if (!parts) return undefined;
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0));
}

export function endOfInputDateUtc(input: string): Date | undefined {
    const parts = recordDateParts(input);
    if (!parts) return undefined;
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 23, 59, 59, 999));
}
