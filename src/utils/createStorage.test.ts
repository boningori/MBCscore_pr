import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createJsonStorage } from './createStorage';
import { STORAGE_ERROR_EVENT } from './storageError';

interface Demo { count: number; items: string[] }

const storage = createJsonStorage<Demo>('mbc-test-demo', { count: 0, items: [] });

describe('createJsonStorage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    // setItem のスパイを張ったテストが途中で落ちると、復元されないまま
    // 後続へ漏れて無関係なテストを巻き込む
    afterEach(() => vi.restoreAllMocks());

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

    it('形が合わないデータならfallbackを返す', () => {
        // JSONとして読めても中身が別物ということが起きる。
        // 旧バージョンの形、他アプリのキー衝突、手で書き換えたバックアップなど。
        // そのまま通すと描画時にundefinedを触って落ちるため、読み込みの時点で捨てる
        const validated = createJsonStorage<Demo>(
            'mbc-test-validated',
            { count: 0, items: [] },
            'demo',
            (v): v is Demo =>
                typeof v === 'object' && v !== null &&
                typeof (v as Demo).count === 'number' && Array.isArray((v as Demo).items),
        );

        localStorage.setItem('mbc-test-validated', '{"count":"3個","items":null}');
        expect(validated.load()).toEqual({ count: 0, items: [] });
    });

    it('形が合うデータはそのまま返す', () => {
        const validated = createJsonStorage<Demo>(
            'mbc-test-validated',
            { count: 0, items: [] },
            'demo',
            (v): v is Demo =>
                typeof v === 'object' && v !== null &&
                typeof (v as Demo).count === 'number' && Array.isArray((v as Demo).items),
        );

        localStorage.setItem('mbc-test-validated', '{"count":3,"items":["a"]}');
        expect(validated.load()).toEqual({ count: 3, items: ['a'] });
    });

    it('検証関数を渡さなければ従来どおり素通しする', () => {
        // 既存の呼び出し側の挙動を変えない
        localStorage.setItem('mbc-test-demo', '{"count":"3個"}');
        expect(storage.load()).toEqual({ count: '3個' });
    });

    it('clearでキーが消える', () => {
        storage.save({ count: 1, items: [] });
        storage.clear();
        expect(localStorage.getItem('mbc-test-demo')).toBeNull();
    });

    // 呼び出し側が「保存できたか」で分岐できないと、保存に失敗したのに
    // 元データを消す、という取り返しのつかない順序を書けてしまう
    it('save成功でtrueを返す', () => {
        expect(storage.save({ count: 1, items: [] })).toBe(true);
    });

    it('save失敗でfalseを返す', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });

        expect(storage.save({ count: 1, items: [] })).toBe(false);
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
