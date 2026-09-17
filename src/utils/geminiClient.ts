// Gemini APIの共通設定。OCR・音声メモの両方から使う。
//
// 元は imageOCR.ts に同居していたが、APIキーとモデル一覧はOCR固有ではなく
// アプリ共通の設定なので切り出した。音声メモ側から imageOCR を import すると
// Tesseract を読む側のモジュールに巻き込まれるため、依存の向きとしても不適切だった。

import { notifyStorageError } from './storageError';

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

const STORAGE_KEY_GEMINI_API = 'mbc_gemini_api_key';

export const FALLBACK_MODELS = [
    // --- 現行主力モデル (安定版) ---
    'gemini-2.5-flash-lite',    // 最速・最軽量モデル
    'gemini-2.5-flash',         // 高速・低コスト・多機能
    'gemini-2.5-pro',           // 高度な思考・論理推論 (Adaptive Thinking)
    // --- 次世代モデル (最新プレビュー) ---
    'gemini-3-flash-preview',   // 最もバランスの取れた次世代モデル
    'gemini-3-pro-preview',     // 最強のエージェント型・推論モデル
] as const;

export function getStoredApiKey(): string {
    return localStorage.getItem(STORAGE_KEY_GEMINI_API) || import.meta.env.VITE_GEMINI_API_KEY || '';
}

// APIキー変更の購読。useVoiceMemoはisFeatureEnabledの計算にgetStoredApiKey()を
// 使うが、AppContentは得点等の記録のたびに再描画されるため、レンダーのたびに
// 呼ぶとホットパスでlocalStorageを読んでしまう。設定画面での保存時だけ
// 購読者へ知らせ、hooks側はそのときだけ読み直す
const apiKeyListeners = new Set<() => void>();

export function subscribeApiKeyChanged(listener: () => void): () => void {
    apiKeyListeners.add(listener);
    return () => apiKeyListeners.delete(listener);
}

/**
 * APIキーを保存する（空文字なら削除）。保存できたら true。
 *
 * ここはアプリで唯一 createStorage を通らない localStorage への書き込みだった。
 * 容量超過やプライベートブラウズで setItem が投げると、例外がそのまま onClick を
 * 抜けていく——設定画面では続けて書くはずの既定モードが書かれず、「設定を
 * 保存しました」も保存失敗のトーストも出ない。押しても何も起きない保存ボタンに
 * なっていた。
 *
 * 他の保存領域と同じ約束にそろえる: 成否を返し、失敗は notifyStorageError で
 * アプリ全体へ知らせる（createStorage.save と同じ形）。
 * 書けていないときに購読者へ知らせないのも要点で、知らせると useVoiceMemo が
 * 「キーがある」状態で動き、リロードで消える。
 */
export function saveApiKey(key: string): boolean {
    try {
        if (key) {
            localStorage.setItem(STORAGE_KEY_GEMINI_API, key);
        } else {
            localStorage.removeItem(STORAGE_KEY_GEMINI_API);
        }
    } catch (error) {
        notifyStorageError('Gemini API key', error);
        return false;
    }
    apiKeyListeners.forEach(listener => listener());
    return true;
}

/**
 * Gemini APIの接続テスト。設定画面から呼ばれる。
 * 404のモデルは次の候補へ送り、それ以外のエラーは即座に返す。
 */
export async function testGeminiConnection(apiKey: string): Promise<{ success: boolean; message: string }> {
    let lastError = '';

    for (const model of FALLBACK_MODELS) {
        try {
            const url = `${GEMINI_API_BASE}${model}:generateContent`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey,
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'Hello' }] }],
                    generationConfig: { maxOutputTokens: 10 },
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.error?.message || response.statusText;

                // 404なら次のモデルへ
                if (response.status === 404 || errorMessage.includes('not found')) {
                    console.warn(`Model ${model} not found, trying next...`);
                    lastError = errorMessage;
                    continue;
                }

                return { success: false, message: errorMessage };
            }

            const data = await response.json();
            if (data.candidates && data.candidates.length > 0) {
                return { success: true, message: `接続成功 (${model})` };
            }
        } catch (error) {
            lastError = error instanceof Error ? error.message : 'Unknown error';
        }
    }

    return {
        success: false,
        message: `接続失敗: 全てのモデルでエラーが発生しました (${lastError})`,
    };
}
