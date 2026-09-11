// 起動時にAI写真読込の移行を走らせる。
//
// 移行そのものの規則は aiOcrMigration.test.ts が固定している。ここで確かめるのは
// 「アプリの起動経路でちゃんと呼ばれているか」だけ。呼び忘れると、この版より前から
// APIキーを使っていた利用者が、更新した瞬間に黙って標準OCRへ落ちる——頼まれた
// 機能を無断で取り上げることになる。
//
// migrateSavedTeamIds と同じ場所・同じ理由（意味が変わる前に今の意味を書き留める）。

import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import App from './App';
import { hasAiOcrConsent, hasStoredAiOcr, isAiOcrEnabled } from './utils/appSettings';

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    window.history.replaceState(null, '');
});

afterEach(cleanup);

describe('起動時のAI写真読込の移行', () => {
    it('APIキーを持っている利用者は、AI写真読込を有効なまま引き継ぐ', () => {
        localStorage.setItem('mbc_gemini_api_key', 'AIza-existing-user');

        render(<App />);

        expect(isAiOcrEnabled()).toBe(true);
        expect(hasAiOcrConsent()).toBe(true);
    });

    it('APIキーが無ければ、未選択のまま起動する', () => {
        render(<App />);

        expect(hasStoredAiOcr()).toBe(false);
        expect(isAiOcrEnabled()).toBe(false);
    });
});
