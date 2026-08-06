// localStorageの使用量の見積もり
//
// 試合履歴は unshift のみで上限も枝刈りも無く、際限なく伸びる。
// 壁に当たった瞬間は保存の失敗として現れるが、そこで初めて気づくのでは遅い。
// データを勝手に消すことはせず（消えて困るのは利用者の記録そのもの）、
// 早めに気づいて手動バックアップと整理へ誘導するための材料だけを出す。

// localStorage の容量は仕様で決まっておらず、主要ブラウザの事実上の上限が
// オリジンあたり約5MB。厳密な値は取得できないため、この前提で見積もる
// （navigator.storage.estimate はIndexedDB等を含むオリジン全体の値で、
// localStorage 単体の残量とは一致しない）。
export const LOCAL_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;

/** この使用率を超えたら警告する */
export const WARN_RATIO = 0.8;

// バックアップ対象と同じ基準（mirrorBackup.ts の APP_KEY_PREFIXES と揃える）
const APP_KEY_PREFIXES = ['minibasket-', 'mbc_', 'mbc-'];

export interface StorageUsage {
    usedBytes: number;
    limitBytes: number;
    /** 0〜1。上限を超えても1で頭打ちにする */
    ratio: number;
    nearlyFull: boolean;
}

/**
 * 使用バイト数から比率と警告要否を出す。
 *
 * 実測と切り離しているのは、上限超え時の頭打ちを検証するため。
 * jsdomのlocalStorageは5,000,000コード単位で自前の上限を持っており、
 * 書き込みでこの定数（5MiB）を超えさせられない。
 */
export function computeUsage(usedBytes: number): StorageUsage {
    const ratio = Math.min(usedBytes / LOCAL_STORAGE_LIMIT_BYTES, 1);
    return {
        usedBytes,
        limitBytes: LOCAL_STORAGE_LIMIT_BYTES,
        ratio,
        nearlyFull: ratio > WARN_RATIO,
    };
}

/**
 * アプリが使っている localStorage の量を見積もる。
 *
 * キー名もバイト数に数える。実際に容量を消費するうえ、キーが増えるだけでも
 * 上限に近づくため。UTF-16の2バイト/文字で数える実装もあるが、ここでは
 * 保存内容がほぼASCIIのJSONなので文字数をそのままバイト数とみなす。
 */
export function estimateStorageUsage(): StorageUsage {
    let usedBytes = 0;

    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !APP_KEY_PREFIXES.some(p => key.startsWith(p))) continue;
            usedBytes += key.length + (localStorage.getItem(key)?.length ?? 0);
        }
    } catch {
        // プライベートブラウズ等でlocalStorage自体が触れないことがある。
        // 見積もりが出せないだけなので0として扱い、警告も出さない
        usedBytes = 0;
    }

    return computeUsage(usedBytes);
}

/** 「1.2MB」「340KB」のような表示用の文字列 */
export function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${bytes}B`;
}
