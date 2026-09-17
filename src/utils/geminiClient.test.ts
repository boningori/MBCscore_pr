import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GEMINI_API_BASE, FALLBACK_MODELS, getStoredApiKey, saveApiKey, subscribeApiKeyChanged } from './geminiClient';
import { STORAGE_ERROR_EVENT } from './storageError';

beforeEach(() => {
    localStorage.clear();
});

describe('geminiClient: APIキーの保存', () => {
    it('保存したキーを読み出せる', () => {
        saveApiKey('test-key');
        expect(getStoredApiKey()).toBe('test-key');
    });

    it('空文字を渡すとキーを削除する', () => {
        saveApiKey('test-key');
        saveApiKey('');
        expect(localStorage.getItem('mbc_gemini_api_key')).toBeNull();
    });

    it('既存のOCRと同じlocalStorageキーを使う（設定済みの利用者が再入力せずに済む）', () => {
        saveApiKey('test-key');
        expect(localStorage.getItem('mbc_gemini_api_key')).toBe('test-key');
    });

    it('保存できたら true を返す', () => {
        expect(saveApiKey('test-key')).toBe(true);
    });

    // ここはアプリで唯一 createStorage を通らない書き込みだった。
    // 容量超過やプライベートブラウズで setItem が投げると、例外がそのまま
    // onClick を抜けていく——続けて保存するはずの既定モードは書かれず、
    // 「設定を保存しました」も保存失敗のトーストも出ない。押しても何も
    // 起きない保存ボタンになる。他の7領域と同じ約束（成否を返す・
    // notifyStorageError で知らせる）に揃える。
    it('保存に失敗しても投げず、false を返して保存失敗を知らせる', () => {
        const handler = vi.fn();
        window.addEventListener(STORAGE_ERROR_EVENT, handler);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('quota', 'QuotaExceededError');
        });

        expect(() => saveApiKey('test-key')).not.toThrow();
        expect(saveApiKey('test-key')).toBe(false);
        expect(handler).toHaveBeenCalled();

        window.removeEventListener(STORAGE_ERROR_EVENT, handler);
        vi.restoreAllMocks();
    });

    it('削除に失敗したときも投げずに false を返す', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new DOMException('denied', 'SecurityError');
        });

        expect(saveApiKey('')).toBe(false);

        vi.restoreAllMocks();
    });

    // 書けていないのに購読者（useVoiceMemo）へ知らせると、その画面だけが
    // 新しいキーを持っているように振る舞い、リロードで消える
    it('保存に失敗したときは購読者へ通知しない', () => {
        const listener = vi.fn();
        const unsubscribe = subscribeApiKeyChanged(listener);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('quota', 'QuotaExceededError');
        });

        saveApiKey('test-key');

        expect(listener).not.toHaveBeenCalled();
        unsubscribe();
        vi.restoreAllMocks();
    });
});

// AppContentは得点・スタッツ・ファウルのたびに再描画される。useVoiceMemoが
// isFeatureEnabledの計算でgetStoredApiKey()を毎回呼ぶとホットパスで
// localStorageを読んでしまうため、APIキー保存時だけ購読者へ知らせる
describe('geminiClient: APIキー変更の通知', () => {
    it('saveApiKeyで保存すると購読者に通知する', () => {
        const listener = vi.fn();
        const unsubscribe = subscribeApiKeyChanged(listener);
        saveApiKey('new-key');
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
    });

    it('unsubscribe後は通知されない', () => {
        const listener = vi.fn();
        const unsubscribe = subscribeApiKeyChanged(listener);
        unsubscribe();
        saveApiKey('new-key');
        expect(listener).not.toHaveBeenCalled();
    });
});

describe('geminiClient: モデル一覧', () => {
    it('最速のflash-liteが先頭にある', () => {
        expect(FALLBACK_MODELS[0]).toBe('gemini-2.5-flash-lite');
    });

    it('APIベースURLはv1beta', () => {
        expect(GEMINI_API_BASE).toBe('https://generativelanguage.googleapis.com/v1beta/models/');
    });
});
