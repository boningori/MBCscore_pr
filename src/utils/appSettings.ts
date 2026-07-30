// アプリ設定の保存・読み込み

import { createJsonStorage } from './createStorage';

const APP_SETTINGS_KEY = 'minibasket-app-settings';

export type GameMode = 'full' | 'simple';

export interface AppSettings {
    defaultGameMode: GameMode;
}

const DEFAULT_SETTINGS: AppSettings = {
    defaultGameMode: 'full',
};

const settingsStorage = createJsonStorage<Partial<AppSettings>>(APP_SETTINGS_KEY, {}, 'app settings');

// アプリ設定を保存
export function saveAppSettings(settings: Partial<AppSettings>): void {
    settingsStorage.save({ ...loadAppSettings(), ...settings });
}

// アプリ設定を読み込み
export function loadAppSettings(): AppSettings {
    return { ...DEFAULT_SETTINGS, ...settingsStorage.load() };
}

// シンプルモードが適する画面幅。App.css の @media (max-width: 800px) と対にする。
// この幅以下ではCSSが3カラムを2カラムへ畳むため、JS側だけフルモードを選ぶと
// 「フルモードなのに窮屈な2カラム」という中途半端な状態になる（旧実装の768pxがこれだった）
export const SIMPLE_MODE_MEDIA_QUERY = '(max-width: 800px)';

// 画面幅に適したゲームモードを判定する。
// CSSのブレークポイントを直接評価するので、JS側の閾値がCSSとずれることがない
export function getViewportGameMode(): GameMode {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'full';
    return window.matchMedia(SIMPLE_MODE_MEDIA_QUERY).matches ? 'simple' : 'full';
}

// モードが設定画面で明示的に保存されているか
// （保存済みならユーザーの意思なので、画面幅による自動切り替えを行わない）
export function hasStoredGameMode(): boolean {
    return settingsStorage.load().defaultGameMode !== undefined;
}

// デフォルトゲームモードを取得
// 未設定時は画面幅で自動選択する（スマホ=シンプル / タブレット以上=フル）
export function getDefaultGameMode(): GameMode {
    const stored = settingsStorage.load();
    if (stored.defaultGameMode) return stored.defaultGameMode;
    return getViewportGameMode();
}

// デフォルトゲームモードを保存
export function saveDefaultGameMode(mode: GameMode): void {
    saveAppSettings({ defaultGameMode: mode });
}
