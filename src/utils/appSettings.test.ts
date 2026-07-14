import { describe, it, expect, beforeEach } from 'vitest';
import { getDefaultGameMode, saveDefaultGameMode } from './appSettings';

beforeEach(() => {
    localStorage.clear();
});

const setWidth = (w: number) => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true });
};

describe('getDefaultGameMode: 未設定時は画面幅で自動選択', () => {
    it('未設定かつスマホ幅(<768px)ならシンプルモード', () => {
        setWidth(375);
        expect(getDefaultGameMode()).toBe('simple');
    });

    it('未設定かつタブレット幅(>=768px)ならフルモード', () => {
        setWidth(1024);
        expect(getDefaultGameMode()).toBe('full');
    });

    it('明示的に保存された設定は画面幅より優先される', () => {
        setWidth(375);
        saveDefaultGameMode('full');
        expect(getDefaultGameMode()).toBe('full');
    });
});
