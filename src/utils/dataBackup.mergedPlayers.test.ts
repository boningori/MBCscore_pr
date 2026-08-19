// 統合設定は端末のlocalStorageにしかない。バックアップに含めないと、
// 機種変更や復元のたびに割れたカードが戻り、利用者が統合をやり直すことになる。

import { describe, it, expect, beforeEach } from 'vitest';
import { exportAllData, parseImportJSON, executeImport } from './dataBackup';
import { loadMergedPlayers, saveMergedPlayers } from './mergedPlayers';

beforeEach(() => localStorage.clear());

describe('統合設定のバックアップ往復', () => {
    it('エクスポート→全消去→インポートで復元できる', () => {
        saveMergedPlayers('t1', { '佐藤　太郎': '佐藤 太郎' });
        const backup = exportAllData();
        localStorage.clear();

        const parsed = parseImportJSON(JSON.stringify(backup));
        const result = executeImport(parsed);

        expect(result.success).toBe(true);
        expect(loadMergedPlayers('t1')).toEqual({ '佐藤　太郎': '佐藤 太郎' });
    });

    it('端末側の統合設定とバックアップ側がマージされる', () => {
        saveMergedPlayers('t1', { A: 'B' });
        const backup = exportAllData();
        localStorage.clear();
        saveMergedPlayers('t1', { C: 'D' });

        executeImport(parseImportJSON(JSON.stringify(backup)));

        expect(loadMergedPlayers('t1')).toEqual({ A: 'B', C: 'D' });
    });

    it('統合設定を持たない旧バックアップを取り込んでも壊れない', () => {
        const backup = exportAllData();
        delete backup.data.mergedPlayers;
        localStorage.clear();

        const result = executeImport(parseImportJSON(JSON.stringify(backup)));

        expect(result.success).toBe(true);
        expect(loadMergedPlayers('t1')).toEqual({});
    });
});
