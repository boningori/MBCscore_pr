// 読み取り結果の詳細表示の設定。
//
// 生の応答には選手の氏名がそのまま入るので、既定はOFF。
// 保存値が壊れていても既定に戻せること（他の設定と同じ約束）を固定する。

import { describe, it, expect, beforeEach } from 'vitest';
import { isAiOcrDiagnosticsEnabled, setAiOcrDiagnosticsEnabled } from './appSettings';

const SETTINGS_KEY = 'minibasket-app-settings';

beforeEach(() => {
    localStorage.clear();
});

describe('読み取り結果の詳細表示の設定', () => {
    it('既定はOFF（応答に氏名が含まれるため）', () => {
        expect(isAiOcrDiagnosticsEnabled()).toBe(false);
    });

    it('ONにして読み直せる', () => {
        setAiOcrDiagnosticsEnabled(true);
        expect(isAiOcrDiagnosticsEnabled()).toBe(true);
    });

    it('OFFに戻せる', () => {
        setAiOcrDiagnosticsEnabled(true);
        setAiOcrDiagnosticsEnabled(false);
        expect(isAiOcrDiagnosticsEnabled()).toBe(false);
    });

    it('boolean以外が保存されていたら既定に戻す', () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ aiOcrDiagnosticsEnabled: 'yes' }));
        expect(isAiOcrDiagnosticsEnabled()).toBe(false);
    });

    it('他の設定を巻き込まない', () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ aiOcrEnabled: true }));
        setAiOcrDiagnosticsEnabled(true);
        expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) as string).aiOcrEnabled).toBe(true);
    });
});
