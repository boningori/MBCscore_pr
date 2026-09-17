// Gemini APIの共通設定。OCR・音声メモの両方から使う。
//
// 元は imageOCR.ts に同居していたが、APIキーとモデル一覧はOCR固有ではなく
// アプリ共通の設定なので切り出した。音声メモ側から imageOCR を import すると
// Tesseract を読む側のモジュールに巻き込まれるため、依存の向きとしても不適切だった。

import { notifyStorageError } from './storageError';
import { fetchWithTimeout, isTimeoutError, TIMEOUT_MESSAGE } from './fetchWithTimeout';

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
 * 写真読込・文字起こしの上限。
 *
 * 上りに最大8MBの画像（imageOCR）や60秒ぶんのWAV（audioTranscribe）を載せる。
 * 体育館の細い回線では正常でも数十秒かかるので、短く切ると「遅いだけの回線」で
 * 使えない機能になってしまう。逆に上限が無いと、キャプティブポータルに
 * 捕まったときに画面が固まったまま戻らない。
 */
export const GEMINI_REQUEST_TIMEOUT_MS = 60_000;

/**
 * 接続テストの上限。
 *
 * 送るのは「Hello」だけなので、画像やWAVを送る本番の呼び出しより短くてよい。
 * 設定画面で「接続テスト中...」を見ながら待つ画面なので、待たせすぎない。
 */
export const CONNECTION_TEST_TIMEOUT_MS = 15_000;

/**
 * Gemini APIの接続テスト。設定画面から呼ばれる。
 * 404のモデルは次の候補へ送り、それ以外のエラーは即座に返す。
 *
 * 「それ以外」の中身が長らく抜けていた。エラー本文がJSONとは限らず
 * （プロキシの502やキャプティブポータルはHTMLを返す）、`await response.json()`
 * が投げると外側の catch が拾って次のモデルへ進み、5回送ったうえで生の
 * パースエラーを画面に出していた。同じ守りは imageOCR と audioTranscribe が
 * 先に入れている——共通モジュールのこちらだけが取り残されていた。
 *
 * 時間切れも同じ扱いにする。1つ時間切れなら残りも時間切れなので、
 * 5モデルぶん（最大75秒）待たせる意味がない。
 */
export async function testGeminiConnection(apiKey: string): Promise<{ success: boolean; message: string }> {
    let lastError = '';

    for (const model of FALLBACK_MODELS) {
        try {
            const url = `${GEMINI_API_BASE}${model}:generateContent`;
            const response = await fetchWithTimeout(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey,
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'Hello' }] }],
                    generationConfig: { maxOutputTokens: 10 },
                }),
            }, CONNECTION_TEST_TIMEOUT_MS);

            if (!response.ok) {
                // 本文がJSONでない＝インフラ層の障害。モデルを変えても結果は同じ
                let errorMessage: string = response.statusText || `HTTPエラー ${response.status}`;
                let parsed = false;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData?.error?.message || errorMessage;
                    parsed = true;
                } catch {
                    // JSONとして読めない本文の中身は画面に出さない（HTMLの断片や
                    // パースエラーの文言を見せても、利用者にできることが無い）
                }

                // 404なら次のモデルへ
                if (parsed && (response.status === 404 || errorMessage.includes('not found'))) {
                    console.warn(`Model ${model} not found, trying next...`);
                    lastError = errorMessage;
                    continue;
                }

                return { success: false, message: `接続失敗: ${errorMessage}` };
            }

            const data = await response.json();
            if (data.candidates && data.candidates.length > 0) {
                return { success: true, message: `接続成功 (${model})` };
            }
            lastError = '応答に候補が含まれていませんでした';
        } catch (error) {
            // 時間切れは全モデルで同じ結果になる。残りを試さず、その場で知らせる
            if (isTimeoutError(error)) {
                return { success: false, message: `接続失敗: ${TIMEOUT_MESSAGE}` };
            }
            lastError = error instanceof Error ? error.message : 'Unknown error';
        }
    }

    return {
        success: false,
        message: `接続失敗: 全てのモデルでエラーが発生しました (${lastError})`,
    };
}
