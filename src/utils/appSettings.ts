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
    /**
     * 写真読込でAI（Gemini）を使うか。撮影画像を端末外へ送るため既定はOFF。
     *
     * 以前は「APIキーがあるかどうか」だけで決まっていた。キーは音声メモと共用なので、
     * 音声メモのためにキーを入れた利用者は、名簿の撮影画像——子どもの氏名と
     * JBA登録番号が写ったもの——まで黙ってGoogleへ送る状態になっていた。
     * 音声メモと同じく、送る先が増える設定は明示的な選択の上でだけ有効にする。
     */
    aiOcrEnabled: boolean;
    /** 画像の外部送信について一度でも同意したか。OFFに戻しても取り消さない */
    aiOcrConsented: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
    defaultGameMode: 'full',
    voiceMemoEnabled: false,
    voiceMemoConsented: false,
    aiOcrEnabled: false,
    aiOcrConsented: false,
};

// 配列やnull・文字列が入っていると、スプレッドで {"0":"a",…} のような
// 別物が既定へ混ざるため、素のオブジェクトのみ受ける（他の保存領域と同じ判定）
const settingsStorage = createJsonStorage<Record<string, unknown>>(
    APP_SETTINGS_KEY, {}, 'app settings',
    (v): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v),
);

const GAME_MODES: readonly string[] = ['full', 'simple'];

/**
 * 保存されている設定を、既知の項目・既知の型だけに絞って読む。
 *
 * 他の保存領域（試合履歴・チーム・中断セッション・非表示選手・統合設定）は
 * 読み込みの時点で形を確かめているのに、ここにだけ検査が無かった。
 * 実測(v1.6.10): {"defaultGameMode":999} がそのままモードとして扱われ、
 * 'simple' でないので全端末がフルモードになる（横向きスマホでは3カラムが
 * 畳まれて得点ボタンにスクロールが要る状態）。しかも hasStoredGameMode が
 * true を返すため、画面幅への自動追従も止まったままになる。
 * 経路は手で編集したバックアップの取り込みと、他アプリとのキー衝突。
 *
 * 壊れた項目だけを落とし、健全な項目は残す（レコード単位で捨てない、という
 * 他の領域と同じ扱い）。
 */
function readStoredSettings(): Partial<AppSettings> {
    const raw = settingsStorage.load();
    const clean: Partial<AppSettings> = {};
    if (typeof raw.defaultGameMode === 'string' && GAME_MODES.includes(raw.defaultGameMode)) {
        clean.defaultGameMode = raw.defaultGameMode as GameMode;
    }
    if (typeof raw.voiceMemoEnabled === 'boolean') clean.voiceMemoEnabled = raw.voiceMemoEnabled;
    if (typeof raw.voiceMemoConsented === 'boolean') clean.voiceMemoConsented = raw.voiceMemoConsented;
    if (typeof raw.aiOcrEnabled === 'boolean') clean.aiOcrEnabled = raw.aiOcrEnabled;
    if (typeof raw.aiOcrConsented === 'boolean') clean.aiOcrConsented = raw.aiOcrConsented;
    return clean;
}

// 設定変更の購読。
//
// AppContentは得点・スタッツ・ファウルの記録のたびに再描画されるため、
// isVoiceMemoEnabled()を毎レンダー呼ぶと、その都度localStorageの読み込みと
// JSON.parseが走ってしまう（記録操作のたびに、である）。読み込み値自体を
// モジュールにキャッシュする案もあったが、バックアップ復元
// （dataBackup.ts）がsaveAppSettingsを経由せずlocalStorageへ直接書くため、
// キャッシュだけでは復元直後に古い値を返しかねない。
// 代わりに「値」ではなく「変わったことそのもの」を通知する側に倒す。
// 呼び出し側（useVoiceMemo）は変更があったときだけ読み直せばよく、
// 通知漏れがあっても古い値を握り続けるだけで、キャッシュのように
// 間違った値を他のロジック（バックアップのマージ処理等）へ渡す事故が起きない。
const settingsListeners = new Set<() => void>();

export function subscribeAppSettingsChanged(listener: () => void): () => void {
    settingsListeners.add(listener);
    return () => settingsListeners.delete(listener);
}

// saveAppSettingsを経由しない変更（バックアップ復元でのlocalStorage直接書き込み等）
// のために公開する
export function notifyAppSettingsChanged(): void {
    settingsListeners.forEach(listener => listener());
}

// アプリ設定を保存
// loadAppSettings()（既定値で埋めた値）ではなく生のストレージ値にマージする。
// そうしないと一部の設定を保存しただけで未選択の項目まで既定値として
// ストレージに書き込まれ、hasStoredGameMode()のような「明示的に保存したか」を
// 見分ける処理が壊れる
export function saveAppSettings(settings: Partial<AppSettings>): void {
    // 壊れた項目はここで落ちる（readStoredSettings）。既定値で埋めた値を
    // 土台にしてはいけない理由は上のコメントのとおり
    settingsStorage.save({ ...readStoredSettings(), ...settings });
    notifyAppSettingsChanged();
}

// アプリ設定を読み込み
export function loadAppSettings(): AppSettings {
    return { ...DEFAULT_SETTINGS, ...readStoredSettings() };
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
    return readStoredSettings().defaultGameMode !== undefined;
}

// デフォルトゲームモードを取得
// 未設定時は画面幅で自動選択する（スマホ=シンプル / タブレット以上=フル）
export function getDefaultGameMode(): GameMode {
    return readStoredSettings().defaultGameMode ?? getViewportGameMode();
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

// 写真読込のAI経路（Gemini）。
// 既定OFFなのは、名簿の撮影画像——子どもの氏名とJBA登録番号が写る——を
// 端末外（Googleのサーバー）へ送るため。APIキーの有無だけで決めていた頃は、
// 音声メモのためにキーを入れただけで写真読込まで黙ってクラウド経路になっていた。
export function isAiOcrEnabled(): boolean {
    return loadAppSettings().aiOcrEnabled;
}

export function setAiOcrEnabled(enabled: boolean): void {
    saveAppSettings({ aiOcrEnabled: enabled });
}

/**
 * AI写真読込のON/OFFを一度でも明示的に保存したか。
 *
 * 「まだ選んでいない」と「OFFを選んだ」を区別するために要る。この版より前から
 * APIキーを使っていた利用者は、キー設定の説明（画像がGoogleへ送られる旨）を
 * 読んだうえでAI経路を使っていたので、更新で黙って標準OCRへ落とすのは機能の
 * 後退になる。移行（aiOcrMigration.ts）がここを見て判断する。
 */
export function hasStoredAiOcr(): boolean {
    return readStoredSettings().aiOcrEnabled !== undefined;
}

export function hasAiOcrConsent(): boolean {
    return loadAppSettings().aiOcrConsented;
}

export function grantAiOcrConsent(): void {
    saveAppSettings({ aiOcrConsented: true });
}
