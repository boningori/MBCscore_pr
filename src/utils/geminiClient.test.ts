import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GEMINI_API_BASE, FALLBACK_MODELS, getStoredApiKey, saveApiKey, subscribeApiKeyChanged } from './geminiClient';

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
