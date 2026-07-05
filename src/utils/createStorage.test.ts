import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createJsonStorage } from './createStorage';
import { STORAGE_ERROR_EVENT } from './storageError';

interface Demo { count: number; items: string[] }

const storage = createJsonStorage<Demo>('mbc-test-demo', { count: 0, items: [] });

describe('createJsonStorage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('未保存ならfallbackを返す', () => {
        expect(storage.load()).toEqual({ count: 0, items: [] });
    });

    it('saveしたものをloadで復元できる', () => {
        storage.save({ count: 3, items: ['a'] });
        expect(storage.load()).toEqual({ count: 3, items: ['a'] });
        expect(localStorage.getItem('mbc-test-demo')).toBe('{"count":3,"items":["a"]}');
    });

    it('壊れたJSONならfallbackを返す', () => {
        localStorage.setItem('mbc-test-demo', 'こわれた');
        expect(storage.load()).toEqual({ count: 0, items: [] });
    });

    it('clearでキーが消える', () => {
        storage.save({ count: 1, items: [] });
        storage.clear();
        expect(localStorage.getItem('mbc-test-demo')).toBeNull();
    });

    it('save失敗時はstorage-errorイベントが飛ぶ', () => {
        const handler = vi.fn();
        window.addEventListener(STORAGE_ERROR_EVENT, handler);
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });

        storage.save({ count: 9, items: [] });

        expect(handler).toHaveBeenCalledTimes(1);
        setSpy.mockRestore();
        errSpy.mockRestore();
        window.removeEventListener(STORAGE_ERROR_EVENT, handler);
    });
});
