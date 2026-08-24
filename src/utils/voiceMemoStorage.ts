// 音声メモの保存。sessionStorage を使う。
//
// createStorage.ts (createJsonStorage) は localStorage 専用なので流用しない。
// sessionStorage を選ぶ理由は2つ:
//   1) mirrorBackup.collectAppData() は localStorage しか走査しないため、
//      バックアップにもエクスポートにも構造的に載らない
//   2) 試合中のリロードやPWA更新では消えない。口述した場面はもう二度と来ないので、
//      メモリ保持だと再起動で永久に失われる
// キーは APP_KEY_PREFIXES (minibasket- / mbc_ / mbc-) を避けて、
// 将来の取り違えを防ぐ。

import type { VoiceMemo } from './voiceMemo';
import { sortMemos } from './voiceMemo';

export const VOICE_MEMO_STORAGE_KEY = 'voicememo-session';

export function loadVoiceMemos(): VoiceMemo[] {
    try {
        const raw = sessionStorage.getItem(VOICE_MEMO_STORAGE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            console.warn('Discarded malformed voice memos in sessionStorage');
            return [];
        }
        return sortMemos(parsed as VoiceMemo[]);
    } catch (error) {
        console.error('Failed to load voice memos:', error);
        return [];
    }
}

export function saveVoiceMemos(memos: VoiceMemo[]): void {
    try {
        sessionStorage.setItem(VOICE_MEMO_STORAGE_KEY, JSON.stringify(memos));
    } catch (error) {
        // 保存できなくても記録本体には影響しない補助機能なので、握って続行する
        console.error('Failed to save voice memos:', error);
    }
}

export function clearVoiceMemos(): void {
    sessionStorage.removeItem(VOICE_MEMO_STORAGE_KEY);
}
