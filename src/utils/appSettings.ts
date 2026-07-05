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

// デフォルトゲームモードを取得
export function getDefaultGameMode(): GameMode {
    return loadAppSettings().defaultGameMode;
}

// デフォルトゲームモードを保存
export function saveDefaultGameMode(mode: GameMode): void {
    saveAppSettings({ defaultGameMode: mode });
}
