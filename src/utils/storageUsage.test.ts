import { describe, it, expect, beforeEach } from 'vitest';
import { computeUsage, estimateStorageUsage, formatBytes, LOCAL_STORAGE_LIMIT_BYTES, WARN_RATIO } from './storageUsage';

beforeEach(() => localStorage.clear());

/** 指定バイト数ぶんのアプリデータを積む（1文字=1バイト相当のASCII） */
function fill(key: string, bytes: number) {
    localStorage.setItem(key, 'x'.repeat(bytes));
}

describe('estimateStorageUsage', () => {
    it('空なら使用量0', () => {
        const usage = estimateStorageUsage();
        expect(usage.usedBytes).toBe(0);
        expect(usage.ratio).toBe(0);
        expect(usage.nearlyFull).toBe(false);
    });

    it('アプリのキーだけを数える（他サイト・他用途のキーは含めない）', () => {
        fill('minibasket-game-history', 1000);
        fill('mbc_error_log', 500);
        fill('unrelated-key', 9999);

        expect(estimateStorageUsage().usedBytes).toBe(1500 + 'minibasket-game-history'.length + 'mbc_error_log'.length);
    });

    it('キー名もバイト数に含める（実際に容量を食うため）', () => {
        fill('minibasket-a', 10);
        expect(estimateStorageUsage().usedBytes).toBe(10 + 'minibasket-a'.length);
    });

    it('使用率を返す', () => {
        fill('minibasket-game-history', LOCAL_STORAGE_LIMIT_BYTES / 4);
        expect(estimateStorageUsage().ratio).toBeCloseTo(0.25, 2);
    });

    it('しきい値を超えたら nearlyFull になる', () => {
        fill('minibasket-game-history', Math.ceil(LOCAL_STORAGE_LIMIT_BYTES * (WARN_RATIO + 0.05)));
        const usage = estimateStorageUsage();
        expect(usage.ratio).toBeGreaterThan(WARN_RATIO);
        expect(usage.nearlyFull).toBe(true);
    });

    it('しきい値の手前では nearlyFull にならない', () => {
        fill('minibasket-game-history', Math.floor(LOCAL_STORAGE_LIMIT_BYTES * (WARN_RATIO - 0.1)));
        expect(estimateStorageUsage().nearlyFull).toBe(false);
    });

    it('localStorageが使えない環境でも落ちない', () => {
        const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() { throw new Error('SecurityError'); },
        });

        expect(() => estimateStorageUsage()).not.toThrow();
        expect(estimateStorageUsage().usedBytes).toBe(0);

        if (original) Object.defineProperty(window, 'localStorage', original);
    });
});

// jsdomのlocalStorageは5,000,000コード単位で頭打ちなので、上限超えは
// 書き込みでは再現できない。比率の計算だけを切り離して確かめる
describe('computeUsage', () => {
    it('上限を超えても比率は1で頭打ちにする（表示が壊れないように）', () => {
        const usage = computeUsage(LOCAL_STORAGE_LIMIT_BYTES * 2);
        expect(usage.ratio).toBe(1);
        expect(usage.nearlyFull).toBe(true);
    });

    it('ちょうど上限なら1', () => {
        expect(computeUsage(LOCAL_STORAGE_LIMIT_BYTES).ratio).toBe(1);
    });

    it('しきい値ちょうどではまだ警告しない', () => {
        expect(computeUsage(LOCAL_STORAGE_LIMIT_BYTES * WARN_RATIO).nearlyFull).toBe(false);
    });
});

describe('formatBytes', () => {
    it('単位を切り替えて読める形にする', () => {
        expect(formatBytes(512)).toBe('512B');
        expect(formatBytes(2048)).toBe('2KB');
        expect(formatBytes(3 * 1024 * 1024)).toBe('3.0MB');
    });
});
