import { describe, it, expect, beforeEach } from 'vitest';
import { collectAppData } from './mirrorBackup';
import type { VoiceMemo } from './voiceMemo';
import { VOICE_MEMO_STORAGE_KEY, clearVoiceMemos, loadVoiceMemos, saveVoiceMemos } from './voiceMemoStorage';

const memo = (id: string, createdAt: number): VoiceMemo => ({
    id,
    quarter: 2,
    createdAt,
    status: 'done',
    text: '青5シュートミス',
});

beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
});

describe('voiceMemoStorage: 保存と読み込み', () => {
    it('保存したメモを読み出せる', () => {
        saveVoiceMemos([memo('a', 100)]);
        expect(loadVoiceMemos()).toHaveLength(1);
        expect(loadVoiceMemos()[0].text).toBe('青5シュートミス');
    });

    it('読み込み時もcreatedAt昇順に整列する', () => {
        saveVoiceMemos([memo('b', 200), memo('a', 100)]);
        expect(loadVoiceMemos().map(m => m.id)).toEqual(['a', 'b']);
    });

    it('未保存なら空配列', () => {
        expect(loadVoiceMemos()).toEqual([]);
    });

    it('壊れたJSONは捨てて空配列を返す', () => {
        sessionStorage.setItem(VOICE_MEMO_STORAGE_KEY, '{壊れている');
        expect(loadVoiceMemos()).toEqual([]);
    });

    it('配列でない値は捨てて空配列を返す', () => {
        sessionStorage.setItem(VOICE_MEMO_STORAGE_KEY, '{"a":1}');
        expect(loadVoiceMemos()).toEqual([]);
    });

    it('clearで全件消える', () => {
        saveVoiceMemos([memo('a', 100)]);
        clearVoiceMemos();
        expect(loadVoiceMemos()).toEqual([]);
    });
});

describe('voiceMemoStorage: 端末外へ出さない', () => {
    it('localStorageには書かない', () => {
        saveVoiceMemos([memo('a', 100)]);
        expect(localStorage.getItem(VOICE_MEMO_STORAGE_KEY)).toBeNull();
        expect(localStorage.length).toBe(0);
    });

    it('ミラーバックアップの収集対象に現れない', () => {
        // バックアップとエクスポートに音声メモを載せない、が設計上の約束
        saveVoiceMemos([memo('a', 100)]);
        expect(Object.keys(collectAppData())).not.toContain(VOICE_MEMO_STORAGE_KEY);
    });

    it('キーはバックアップ対象の接頭辞で始まらない', () => {
        for (const prefix of ['minibasket-', 'mbc_', 'mbc-']) {
            expect(VOICE_MEMO_STORAGE_KEY.startsWith(prefix)).toBe(false);
        }
    });
});
