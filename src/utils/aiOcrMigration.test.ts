// AI写真読込を独立したスイッチにしたときの、既存利用者の引き継ぎ。
//
// これまでは「Gemini APIキーがあるかどうか」だけでAI経路が決まっていた。
// キーを入れた利用者は、その入力欄のすぐ横にある説明——撮影した画像が
// Googleのサーバーへ送られる——を読んだうえでそうしている。更新の瞬間に
// 黙って標準OCR（端末内）へ落とすのは、頼まれた機能を取り上げることになる。
//
// 逆に、この版より後にキーを入れる利用者にはスイッチが要る。キーは音声メモと
// 共用なので、キーの存在をそのまま「画像を送ってよい」と読み替えてはいけない。
//
// そこで一度だけ、更新時点の状態を設定へ焼き付ける。savedTeamIdMigration が
// 「改名される前に今日の帰属をidへ凍結する」のと同じ考え方で、意味が変わる前に
// 今の意味を書き留める。

import { describe, it, expect, beforeEach } from 'vitest';
import { migrateAiOcrSetting } from './aiOcrMigration';
import { hasAiOcrConsent, hasStoredAiOcr, isAiOcrEnabled, setAiOcrEnabled } from './appSettings';

const API_KEY_STORAGE = 'mbc_gemini_api_key';

beforeEach(() => {
    localStorage.clear();
});

describe('AI写真読込への移行', () => {
    it('キーを使っていた利用者は、AI写真読込を有効なまま引き継ぐ', () => {
        localStorage.setItem(API_KEY_STORAGE, 'AIza-existing-user');

        migrateAiOcrSetting();

        expect(isAiOcrEnabled()).toBe(true);
    });

    // 同意ダイアログは「これから送り始める」ときの確認。すでに送っていた利用者に
    // 出すと、使えていた機能が一度止まったように見える
    it('引き継いだ利用者には同意を尋ね直さない', () => {
        localStorage.setItem(API_KEY_STORAGE, 'AIza-existing-user');

        migrateAiOcrSetting();

        expect(hasAiOcrConsent()).toBe(true);
    });

    it('キーを持っていなければ何も書かない（未選択のまま）', () => {
        migrateAiOcrSetting();

        expect(hasStoredAiOcr()).toBe(false);
        expect(isAiOcrEnabled()).toBe(false);
    });

    it('空文字のキーは「持っていない」として扱う', () => {
        localStorage.setItem(API_KEY_STORAGE, '');

        migrateAiOcrSetting();

        expect(hasStoredAiOcr()).toBe(false);
    });

    // 移行は起動のたびに走る。すでに選んだ人の意思を上書きしてはいけない
    it('自分でOFFにした人の設定を、起動のたびにONへ戻さない', () => {
        localStorage.setItem(API_KEY_STORAGE, 'AIza-existing-user');
        setAiOcrEnabled(false);

        migrateAiOcrSetting();

        expect(isAiOcrEnabled()).toBe(false);
    });

    it('自分でONにした人の設定もそのまま', () => {
        localStorage.setItem(API_KEY_STORAGE, 'AIza-existing-user');
        setAiOcrEnabled(true);

        migrateAiOcrSetting();

        expect(isAiOcrEnabled()).toBe(true);
    });

    it('二度呼んでも結果が変わらない', () => {
        localStorage.setItem(API_KEY_STORAGE, 'AIza-existing-user');

        migrateAiOcrSetting();
        setAiOcrEnabled(false);
        migrateAiOcrSetting();

        expect(isAiOcrEnabled()).toBe(false);
    });

    // キーを入れるのは移行より後、というのが新規利用者の順序。
    // そこでONにされては、スイッチを設けた意味がなくなる
    it('移行のあとでキーを入れても、勝手にONにはならない', () => {
        migrateAiOcrSetting();
        localStorage.setItem(API_KEY_STORAGE, 'AIza-new-user');

        expect(isAiOcrEnabled()).toBe(false);
    });
});
