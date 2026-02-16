// アプリ設定の保存・読み込み

const APP_SETTINGS_KEY = 'minibasket-app-settings';

export type GameMode = 'full' | 'simple';

export interface AppSettings {
    defaultGameMode: GameMode;
}

const DEFAULT_SETTINGS: AppSettings = {
    defaultGameMode: 'full',
};

// アプリ設定を保存
export function saveAppSettings(settings: Partial<AppSettings>): void {
    try {
        const current = loadAppSettings();
        const updated = { ...current, ...settings };
        localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(updated));
    } catch (error) {
        console.error('Failed to save app settings:', error);
    }
}

// アプリ設定を読み込み
export function loadAppSettings(): AppSettings {
    try {
        const data = localStorage.getItem(APP_SETTINGS_KEY);
        if (!data) return DEFAULT_SETTINGS;
        return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } catch (error) {
        console.error('Failed to load app settings:', error);
        return DEFAULT_SETTINGS;
    }
}

// デフォルトゲームモードを取得
export function getDefaultGameMode(): GameMode {
    return loadAppSettings().defaultGameMode;
}

// デフォルトゲームモードを保存
export function saveDefaultGameMode(mode: GameMode): void {
    saveAppSettings({ defaultGameMode: mode });
}
