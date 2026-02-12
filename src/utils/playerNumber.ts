// 背番号表示用ユーティリティ
// バスケットボールでは「0」と「00」は別の背番号として有効
// 内部的には「00」を 100 として表現し、表示時に変換する

// 「00」の内部表現値
export const DOUBLE_ZERO_INTERNAL = 100;

// 背番号を表示用文字列に変換
export function formatPlayerNumber(num: number): string {
    if (num === DOUBLE_ZERO_INTERNAL) {
        return '00';
    }
    return String(num);
}

// 入力文字列を内部番号に変換
// "00" -> 100, "0" -> 0, "1" -> 1, etc.
export function parsePlayerNumber(input: string): number | null {
    const trimmed = input.trim();

    // "00" は特別に扱う
    if (trimmed === '00') {
        return DOUBLE_ZERO_INTERNAL;
    }

    // 通常の数値として解析
    const num = parseInt(trimmed, 10);
    if (isNaN(num) || num < 0 || num > 99) {
        return null;
    }
    return num;
}

// 背番号のバリデーション（0-99 または 100=00）
export function isValidPlayerNumber(num: number): boolean {
    return (num >= 0 && num <= 99) || num === DOUBLE_ZERO_INTERNAL;
}

// 背番号のソート比較関数
// ソート順: 0, 1, 2, ..., 99, 00
export function comparePlayerNumbers(a: number, b: number): number {
    // 00 (100) は最後に来る
    if (a === DOUBLE_ZERO_INTERNAL && b !== DOUBLE_ZERO_INTERNAL) {
        return 1;
    }
    if (b === DOUBLE_ZERO_INTERNAL && a !== DOUBLE_ZERO_INTERNAL) {
        return -1;
    }
    return a - b;
}

// 表示用背番号でソートするコンパレータ
export function sortPlayersByNumber<T extends { number: number }>(players: T[]): T[] {
    return [...players].sort((a, b) => comparePlayerNumbers(a.number, b.number));
}
