import { describe, it, expect, beforeEach } from 'vitest';
import { getDefaultGameMode, hasStoredGameMode, saveDefaultGameMode } from './appSettings';

beforeEach(() => {
    localStorage.clear();
});

// jsdomのmatchMediaは幅を評価しないため、(max-width: Npx)を解釈するスタブを入れる
const setWidth = (w: number) => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true });
    window.matchMedia = ((query: string) => {
        const maxWidth = /\(max-width:\s*(\d+)px\)/.exec(query);
        return {
            matches: maxWidth ? w <= Number(maxWidth[1]) : false,
            media: query,
            onchange: null,
            addEventListener: () => { },
            removeEventListener: () => { },
            addListener: () => { },
            removeListener: () => { },
            dispatchEvent: () => false,
        } as unknown as MediaQueryList;
    }) as typeof window.matchMedia;
};

describe('getDefaultGameMode: 未設定時は画面幅で自動選択', () => {
    it('未設定かつスマホ幅ならシンプルモード', () => {
        setWidth(375);
        expect(getDefaultGameMode()).toBe('simple');
    });

    it('未設定かつ3カラムが成立する幅(>800px)ならフルモード', () => {
        setWidth(1024);
        expect(getDefaultGameMode()).toBe('full');
    });

    // CSSの @media (max-width: 800px) と閾値を揃える。
    // 旧実装は768px基準だったため、768〜800pxがフルモードなのに2カラムに畳まれていた
    it('800pxちょうどはシンプルモード（CSSが2カラムへ畳む側）', () => {
        setWidth(800);
        expect(getDefaultGameMode()).toBe('simple');
    });

    it('801px以上はフルモード', () => {
        setWidth(801);
        expect(getDefaultGameMode()).toBe('full');
    });

    it('iPad Pro 11インチ縦(834px)はフルモード', () => {
        setWidth(834);
        expect(getDefaultGameMode()).toBe('full');
    });

    it('明示的に保存された設定は画面幅より優先される', () => {
        setWidth(375);
        saveDefaultGameMode('full');
        expect(getDefaultGameMode()).toBe('full');
    });
});

describe('hasStoredGameMode', () => {
    it('未保存ならfalse', () => {
        expect(hasStoredGameMode()).toBe(false);
    });

    it('保存済みならtrue', () => {
        saveDefaultGameMode('simple');
        expect(hasStoredGameMode()).toBe(true);
    });
});
