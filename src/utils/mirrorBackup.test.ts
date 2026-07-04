import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// モジュール内部のスロットル状態をテストごとにリセットするため動的import
async function freshModule() {
    vi.resetModules();
    return await import('./mirrorBackup');
}

describe('mirrorBackup', () => {
    beforeEach(() => {
        localStorage.clear();
        indexedDB.deleteDatabase('mbc-mirror-backup');
    });

    it('collectAppData: アプリのキーのみ収集する', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '[]');
        localStorage.setItem('mbc_gemini_api_key', 'k');
        localStorage.setItem('unrelated-key', 'x');
        const data = m.collectAppData();
        expect(Object.keys(data).sort()).toEqual(['mbc_gemini_api_key', 'minibasket-my-teams']);
        expect(m.hasAppData()).toBe(true);
    });

    it('saveSnapshot→getLatestSnapshotで最新世代が取得できる', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '["v1"]');
        await m.saveSnapshot(1000);
        localStorage.setItem('minibasket-my-teams', '["v2"]');
        await m.saveSnapshot(2000);

        const latest = await m.getLatestSnapshot();
        expect(latest).not.toBeNull();
        expect(latest!.timestamp).toBe(2000);
        expect(latest!.entries['minibasket-my-teams']).toBe('["v2"]');
    });

    it('10世代を超えた古いスナップショットは削除される', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '[]');
        for (let i = 1; i <= 12; i++) {
            await m.saveSnapshot(i * 1000);
        }
        const latest = await m.getLatestSnapshot();
        expect(latest!.timestamp).toBe(12000);
        // 1000, 2000 の世代は削除されているはず（3000が最古）
        const all = await m.getAllSnapshots();
        expect(all).toHaveLength(10);
        expect(Math.min(...all.map(s => s.timestamp))).toBe(3000);
    });

    it('空のlocalStorageではスナップショットを作らない（既存世代を守る）', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '["v1"]');
        await m.saveSnapshot(1000);
        localStorage.clear();
        await m.saveSnapshot(2000);
        const latest = await m.getLatestSnapshot();
        expect(latest!.timestamp).toBe(1000);
    });

    it('restoreSnapshot: エントリをlocalStorageへ書き戻す', async () => {
        const m = await freshModule();
        m.restoreSnapshot({ timestamp: 1, entries: { 'minibasket-my-teams': '["restored"]' } });
        expect(localStorage.getItem('minibasket-my-teams')).toBe('["restored"]');
    });

    it('maybeSnapshot: 30秒以内の連続呼び出しはスキップされる', async () => {
        const m = await freshModule();
        // Dateのみ偽装する（setTimeoutまで偽装するとfake-indexeddbの内部処理が止まる）
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-07-04T10:00:00Z'));
        localStorage.setItem('minibasket-my-teams', '["v1"]');
        await m.maybeSnapshot();
        localStorage.setItem('minibasket-my-teams', '["v2"]');
        await m.maybeSnapshot(); // 30秒未満なのでスキップ
        const latest = await m.getLatestSnapshot();
        expect(latest!.entries['minibasket-my-teams']).toBe('["v1"]');

        vi.setSystemTime(new Date('2026-07-04T10:00:31Z'));
        await m.maybeSnapshot();
        const latest2 = await m.getLatestSnapshot();
        expect(latest2!.entries['minibasket-my-teams']).toBe('["v2"]');
        vi.useRealTimers();
    });
});
