// Gemini APIの共通設定。OCR・音声メモの両方から使う。
//
// 元は imageOCR.ts に同居していたが、APIキーとモデル一覧はOCR固有ではなく
// アプリ共通の設定なので切り出した。音声メモ側から imageOCR を import すると
// Tesseract を読む側のモジュールに巻き込まれるため、依存の向きとしても不適切だった。

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

export function saveApiKey(key: string): void {
    if (key) {
        localStorage.setItem(STORAGE_KEY_GEMINI_API, key);
    } else {
        localStorage.removeItem(STORAGE_KEY_GEMINI_API);
    }
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
