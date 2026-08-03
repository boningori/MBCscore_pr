// PWAのインストール状態の判定と、インストール案内を閉じたかの記録。
//
// インストール導線はPWAの最大の離脱点なので、まだホーム画面に入れていない
// 利用者にだけ案内を出す。すでにインストール済み、または一度閉じた人には出さない。

import { createJsonStorage } from './createStorage';

const INSTALL_GUIDE_DISMISSED_KEY = 'minibasket-install-guide-dismissed';

const dismissedStorage = createJsonStorage<boolean>(
    INSTALL_GUIDE_DISMISSED_KEY,
    false,
    'install guide dismissed',
);

/** iOS Safari のみに存在する非標準プロパティ */
interface IosNavigator extends Navigator {
    standalone?: boolean;
}

/**
 * ホーム画面から起動している（＝インストール済み）か。
 * iOSは display-mode: standalone が当てにならない時期が長かったため
 * navigator.standalone も併せて見る。
 */
export function isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    if ((navigator as IosNavigator).standalone === true) return true;
    return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

/**
 * iOS（iPadOS含む）か。
 * iPadOS 13以降はUserAgentが Macintosh になるため、タッチ対応の有無で見分ける
 * （デスクトップのMacはmaxTouchPointsが0）。
 */
export function isIos(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

export function loadInstallGuideDismissed(): boolean {
    return dismissedStorage.load();
}

export function dismissInstallGuide(): void {
    dismissedStorage.save(true);
}
