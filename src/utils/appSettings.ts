// アプリ設定の保存・読み込み

import { createJsonStorage } from './createStorage';

const APP_SETTINGS_KEY = 'minibasket-app-settings';

export type GameMode = 'full' | 'simple';

export interface AppSettings {
    defaultGameMode: GameMode;
    /** 音声メモ機能のON/OFF。音声を端末外へ送るため既定はOFF */
    voiceMemoEnabled: boolean;
    /** 音声の外部送信について一度でも同意したか。OFFに戻しても取り消さない */
    voiceMemoConsented: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
    defaultGameMode: 'full',
    voiceMemoEnabled: false,
    voiceMemoConsented: false,
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

// シンプルモードが適する画面条件。CSSのブレークポイントと対にする。
//
// 1) 幅800px以下 … App.css の @media (max-width: 800px)。
//    この幅以下ではCSSが3カラムを2カラムへ畳むため、JS側だけフルモードを選ぶと
//    「フルモードなのに窮屈な2カラム」という中途半端な状態になる（旧実装の768pxがこれだった）
// 2) 横向きで高さ500px以下 … App.css の
//    @media (orientation: landscape) and (max-height: 500px)。
//    横向きスマホ（812x375等）はフルモードのボタン群と交代・ベンチファウル・
//    アクション履歴が入りきらず、列ごとに227pxの内部スクロールが発生していた。
//    シンプルモードなら操作ボタン3個・履歴なしで1画面に収まる。
export const SIMPLE_MODE_MEDIA_QUERY =
    '(max-width: 800px), (orientation: landscape) and (max-height: 500px)';

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

// 音声メモ機能のON/OFF。
// 既定OFFなのは、この機能だけが「記録者の声」を端末外（Googleのサーバー）へ
// 送るため。知らないうちに送られている状態を作らない。
export function isVoiceMemoEnabled(): boolean {
    return loadAppSettings().voiceMemoEnabled;
}

export function setVoiceMemoEnabled(enabled: boolean): void {
    saveAppSettings({ voiceMemoEnabled: enabled });
}

// 外部送信への同意。初回ONのときだけ確認を出すための記録で、
// OFFに戻しても取り消さない（同じ説明を何度も読ませない）
export function hasVoiceMemoConsent(): boolean {
    return loadAppSettings().voiceMemoConsented;
}

export function grantVoiceMemoConsent(): void {
    saveAppSettings({ voiceMemoConsented: true });
}
