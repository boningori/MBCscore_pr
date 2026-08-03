import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isStandalone, isIos, loadInstallGuideDismissed, dismissInstallGuide } from './installState';

const originalMatchMedia = window.matchMedia;

function stubUserAgent(ua: string, maxTouchPoints = 0) {
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
}

function stubDisplayMode(standalone: boolean) {
    window.matchMedia = ((query: string) => ({
        matches: query.includes('display-mode: standalone') ? standalone : false,
        media: query,
        addEventListener: () => { },
        removeEventListener: () => { },
    })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
    localStorage.clear();
    stubDisplayMode(false);
});

afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
});

describe('isStandalone', () => {
    it('display-mode: standalone ならインストール済みとみなす', () => {
        stubDisplayMode(true);
        expect(isStandalone()).toBe(true);
    });

    it('ブラウザタブで開いている間はfalse', () => {
        expect(isStandalone()).toBe(false);
    });

    it('iOSの navigator.standalone も見る（iOSはdisplay-modeが当てにならない）', () => {
        Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
        expect(isStandalone()).toBe(true);
        Reflect.deleteProperty(navigator, 'standalone');
    });
});

describe('isIos', () => {
    it('iPhoneを判定する', () => {
        stubUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
        expect(isIos()).toBe(true);
    });

    it('iPadOS13以降はMacintosh扱いになるのでタッチ有無で見分ける', () => {
        stubUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5);
        expect(isIos()).toBe(true);
    });

    it('タッチ非対応のMacはiOSではない', () => {
        stubUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0);
        expect(isIos()).toBe(false);
    });

    it('Androidはfalse', () => {
        stubUserAgent('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36', 5);
        expect(isIos()).toBe(false);
    });
});

describe('インストール案内の非表示記録', () => {
    it('初期状態では非表示にしていない', () => {
        expect(loadInstallGuideDismissed()).toBe(false);
    });

    it('閉じたことを永続化する（毎回起動のたびに出さない）', () => {
        dismissInstallGuide();
        expect(loadInstallGuideDismissed()).toBe(true);
    });
});
