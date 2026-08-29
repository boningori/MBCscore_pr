// localStorage から読み戻した値を、描画側の前提に合わせて整えるための小道具。
//
// 手で編集した／共有の途中で切れたバックアップを取り込むと、配列であるはずの
// ところに文字列が、オブジェクトであるはずの要素に null が入る。読み手はどこも
// .map / .filter / .some や素のプロパティで引いているため、そういう値が1つでも
// あると ErrorBoundary がアプリ全体をエラー画面に置き換える。
//
// 試合履歴・マイチーム・対戦チーム・中断セッションで同じ整え方が要るので、
// 判定をここに1つだけ置く。入口ごとに書くと、片方だけ直し忘れる。

export function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * オブジェクトの配列にする。配列でなければ空配列、null等の要素は取り除く。
 *
 * 健全なときは渡された配列をそのまま返す。参照が変わると useMemo や
 * React.memo の比較が毎回外れるため（migrateTeam と同じ理由）。
 */
export function coerceEntries<T>(value: unknown): T[] {
    if (!Array.isArray(value)) return [];
    return value.every(isPlainObject) ? (value as T[]) : (value.filter(isPlainObject) as T[]);
}

/** 配列でなければ差し替える（中身は見ない）。健全なら同じ配列を返す */
export function coerceArray<T>(value: unknown, fallback: T[]): T[] {
    return Array.isArray(value) ? (value as T[]) : fallback;
}
