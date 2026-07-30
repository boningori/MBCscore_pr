import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGameMode } from './useGameMode';
import { saveDefaultGameMode } from '../utils/appSettings';

// 幅の変化を発火できるmatchMediaスタブ（jsdomのmatchMediaは幅を評価しないため）
let currentWidth = 1024;
let listeners: (() => void)[] = [];

const installMatchMedia = () => {
    listeners = [];
    window.matchMedia = ((query: string) => {
        const maxWidth = /\(max-width:\s*(\d+)px\)/.exec(query);
        return {
            get matches() {
                return maxWidth ? currentWidth <= Number(maxWidth[1]) : false;
            },
            media: query,
            onchange: null,
            addEventListener: (_: string, cb: () => void) => { listeners.push(cb); },
            removeEventListener: (_: string, cb: () => void) => {
                listeners = listeners.filter(l => l !== cb);
            },
            addListener: () => { },
            removeListener: () => { },
            dispatchEvent: () => false,
        } as unknown as MediaQueryList;
    }) as typeof window.matchMedia;
};

// 端末の回転・リサイズを模す
const resizeTo = (width: number) => {
    currentWidth = width;
    act(() => { listeners.forEach(l => l()); });
};

beforeEach(() => {
    localStorage.clear();
    currentWidth = 1024;
    installMatchMedia();
});

describe('useGameMode', () => {
    it('起動時は画面幅から選ばれる', () => {
        currentWidth = 390;
        const { result } = renderHook(() => useGameMode());
        expect(result.current.gameMode).toBe('simple');
    });

    it('横向き→縦向き(3カラムが崩れる幅)への回転でシンプルへ切り替わる', () => {
        const { result } = renderHook(() => useGameMode());
        expect(result.current.gameMode).toBe('full');

        resizeTo(768); // iPad縦
        expect(result.current.gameMode).toBe('simple');
    });

    it('縦向き→横向きの回転でフルへ戻る', () => {
        currentWidth = 768;
        const { result } = renderHook(() => useGameMode());
        expect(result.current.gameMode).toBe('simple');

        resizeTo(1024);
        expect(result.current.gameMode).toBe('full');
    });

    it('手動で切り替えた後は回転しても勝手に変わらない', () => {
        const { result } = renderHook(() => useGameMode());
        expect(result.current.gameMode).toBe('full');

        act(() => { result.current.toggleGameMode(); });
        expect(result.current.gameMode).toBe('simple');

        resizeTo(1280); // フル相当の幅に戻しても、ユーザーの選択を維持する
        expect(result.current.gameMode).toBe('simple');
    });

    it('設定画面で既定モードが保存済みなら回転しても追従しない', () => {
        saveDefaultGameMode('full');
        const { result } = renderHook(() => useGameMode());
        expect(result.current.gameMode).toBe('full');

        resizeTo(390);
        expect(result.current.gameMode).toBe('full');
    });

    it('セッション途中で既定モードが保存されたら、その時点で追従を止める', () => {
        const { result } = renderHook(() => useGameMode());
        expect(result.current.gameMode).toBe('full');

        saveDefaultGameMode('full'); // 設定モーダルでの保存を模す
        resizeTo(390);
        expect(result.current.gameMode).toBe('full');
    });
});
