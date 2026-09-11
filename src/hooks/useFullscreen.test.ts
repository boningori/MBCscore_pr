// 全画面に対応していない端末では、そのボタンを出さない。
//
// useFullscreen は requestFullscreen / webkit / ms / moz を順に試し、どれも
// 無ければ何もせずに try を抜ける。例外が出ないので catch のトーストも出ず、
// isFullScreen も false のまま——つまり押しても無反応・無通知になる。
//
// iOS / iPadOS の Safari は任意要素の Fullscreen API を持たない。このアプリは
// 起動画像を40枚同梱するほど iOS を主対象にしていて、「タブレット横向きの
// フルモード推奨」の導線上にそのボタンが常設されている。主対象の端末で
// 沈黙するボタンが目立つ場所に居座るのは、押せるものだけを箱にするという
// 作りに反する。
//
// 対応可否は document.fullscreenEnabled（およびベンダー接頭辞版）で分かるので、
// 呼び出し側が出し分けられるように返す。

import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFullscreen } from './useFullscreen';

type FullscreenFlags = {
    fullscreenEnabled?: unknown;
    webkitFullscreenEnabled?: unknown;
    mozFullScreenEnabled?: unknown;
    msFullscreenEnabled?: unknown;
};

const KEYS: (keyof FullscreenFlags)[] = [
    'fullscreenEnabled',
    'webkitFullscreenEnabled',
    'mozFullScreenEnabled',
    'msFullscreenEnabled',
];

const saved = new Map<string, PropertyDescriptor | undefined>();

function setFlags(flags: FullscreenFlags) {
    for (const key of KEYS) {
        if (!saved.has(key)) saved.set(key, Object.getOwnPropertyDescriptor(document, key));
        Object.defineProperty(document, key, {
            configurable: true,
            get: () => flags[key],
        });
    }
}

afterEach(() => {
    for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(document, key, descriptor);
        else delete (document as unknown as Record<string, unknown>)[key];
    }
    saved.clear();
});

describe('useFullscreen の対応可否', () => {
    it('標準APIが使えるなら対応ありとする', () => {
        setFlags({ fullscreenEnabled: true });

        const { result } = renderHook(() => useFullscreen());

        expect(result.current.isSupported).toBe(true);
    });

    it('ベンダー接頭辞版しか無くても対応ありとする', () => {
        setFlags({ fullscreenEnabled: undefined, webkitFullscreenEnabled: true });

        const { result } = renderHook(() => useFullscreen());

        expect(result.current.isSupported).toBe(true);
    });

    // iOS Safari。プロパティ自体が無い
    it('どのAPIも無ければ対応なしとする', () => {
        setFlags({});

        const { result } = renderHook(() => useFullscreen());

        expect(result.current.isSupported).toBe(false);
    });

    // 埋め込み（iframe の allow-fullscreen なし）など、APIはあるが禁止されている場合。
    // 押しても拒否されるだけなので、出さない側に倒す
    it('APIはあっても許可されていなければ対応なしとする', () => {
        setFlags({ fullscreenEnabled: false });

        const { result } = renderHook(() => useFullscreen());

        expect(result.current.isSupported).toBe(false);
    });
});
