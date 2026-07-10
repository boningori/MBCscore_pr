// 最終バックアップ情報の記録と督促要否の判定
// 「前回バックアップ後に試合が増えていれば督促する」ためのごく小さなストレージ

import { createJsonStorage } from './createStorage';
import { loadGameHistory } from './gameHistoryStorage';

const LAST_BACKUP_KEY = 'minibasket-last-backup';

export interface LastBackupInfo {
    timestamp: number;
    gameCount: number;
}

const lastBackupStorage = createJsonStorage<LastBackupInfo | null>(LAST_BACKUP_KEY, null, 'last backup');

// 最終バックアップ情報を取得
export function loadLastBackup(): LastBackupInfo | null {
    return lastBackupStorage.load();
}

// 現在の試合数・現在時刻でバックアップ済みとして記録
export function recordBackup(): void {
    lastBackupStorage.save({
        timestamp: Date.now(),
        gameCount: loadGameHistory().length,
    });
}

// 督促すべきか（前回バックアップ後に試合が増えていれば true）
export function isBackupDue(): boolean {
    const count = loadGameHistory().length;
    if (count === 0) return false;
    const last = loadLastBackup();
    if (!last) return true;
    return count > last.gameCount;
}
