// 画像認識（OCR）ユーティリティ - Tesseract.js (Local)
// Gemini API実装はコメントアウトして温存

import type { SavedPlayer } from './teamStorage';
import { parsePlayerNumber, isValidPlayerNumber } from './playerNumber';
// tesseract.js は実行時に動的importする。静的importにすると、この
// モジュールを読む OpponentManager / OpponentSelect 経由でエントリチャンクに
// 載り、写真読込を一度も使わない利用者にも配られてしまう。
// html2canvas / jspdf と同じ扱い（pdfExport.ts の冒頭コメント参照）。
// 型は import type で取る（ビルド後に消えるためバンドルに影響しない）。
import type { createWorker } from 'tesseract.js';
import { TESSERACT_PATHS } from './tesseractAssets';
import { GEMINI_API_BASE, FALLBACK_MODELS, getStoredApiKey } from './geminiClient';

// 画像認識結果
export interface ImageOCRResult {
    success: boolean;
    players: SavedPlayer[];
    rawText?: string;
    error?: string;
    usedEngine?: 'Gemini' | 'Tesseract'; // どちらを使ったか返す
    fallbackReason?: string; // GeminiからTesseractへのフォールバック理由
}

// 画像をBase64に変換
export async function imageToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            // data:image/xxx;base64, を除去
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * テキストから選手情報を抽出する簡易的なパーサー
 * 番号と名前のペアを探す
 */
// 全角英数字・全角スペースを半角へ正規化（日本語OCR出力対策）
function normalizeOcrLine(line: string): string {
    return line
        // 全角数字 ０-９ → 半角
        .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        // 全角スペース(U+3000) → 半角
        .replace(/\u3000/g, ' ')
        .trim();
}

export function parseOcrText(text: string): SavedPlayer[] {
    const players: SavedPlayer[] = [];
    // 行ごとに分割して処理
    const lines = text.split(/\r?\n/);

    // 対応パターン: "4 田中太郎", "No.4 TANAKA", "#12 山田", "4. 佐藤", "5田中"（区切りなし）
    // - 先頭の "No." "#" "＃" "背番号" は任意接頭辞として除去
    // - 背番号は1〜2桁（0〜99）。名前の先頭は数字以外（年号 "2024年度" などの誤検出を防止）
    const lineRegex = /^(?:no\.?|[#＃]|背番号)?\s*([0-9]{1,2})\s*[.．:：,、]?\s*([^\d\s].*)$/i;

    // 複数列レイアウトの場合もあるので、単純な行処理だけでなく、
    // 全文から「数字＋名前」っぽいパターンを拾うアプローチも考えられるが、
    // まずは行単位で処理する

    for (const rawLine of lines) {
        const trimmed = normalizeOcrLine(rawLine);
        if (!trimmed) continue;

        const match = trimmed.match(lineRegex);
        if (match) {
            const numStr = match[1];
            let nameStr = match[2].trim();

            // "00" は 0 とは別の正規の背番号で、アプリ内部では
            // DOUBLE_ZERO_INTERNAL(100) で表す。parseInt では 0 に潰れて
            // 別番号の選手として登録されるため、共通の変換を通す
            const number = parsePlayerNumber(numStr);

            // 明らかに誤検知っぽいものを除外（番号が範囲外、名前が短すぎるなど）
            if (number === null || !isValidPlayerNumber(number)) continue;
            if (nameStr.length < 1) continue;

            // ゴミ文字除去（末尾の記号など）
            nameStr = nameStr.replace(/[|[\]{};:]/g, '').trim();
            if (nameStr.length < 1) continue;

            players.push({
                number,
                name: nameStr,
                isCaptain: false,
            });
        }
    }

    return players;
}

/**
 * Tesseract.jsによるOCR処理
 */
async function recognizeWithTesseract(imageFile: File): Promise<ImageOCRResult> {
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
    try {
        if (import.meta.env.DEV) console.log('Using OCR Engine: Tesseract.js (self-hosted)');
        // 本体の読み込みもここで初めて発生する（写真読込を使う人だけが払う）
        const { createWorker } = await import('tesseract.js');
        // worker・wasmコア・言語データすべてを同梱物から読み込む（第三者CDN依存なし＝完全オフライン対応）
        // corePathはディレクトリではなくファイルを直指定する。詳細は tesseractAssets.ts。
        worker = await createWorker('jpn', 1, {
            ...TESSERACT_PATHS,
            logger: m => { if (import.meta.env.DEV) console.log(m); },
        });

        const result = await worker.recognize(imageFile);
        const text = result.data.text;
        if (import.meta.env.DEV) console.log('OCR Raw Text (Tesseract):', text);

        const players = parseOcrText(text);

        if (players.length === 0) {
            return {
                success: false,
                players: [],
                rawText: text,
                error: '文字を認識しましたが、選手情報（番号と名前）を抽出できませんでした。',
                usedEngine: 'Tesseract',
            };
        }

        return {
            success: true,
            players,
            rawText: text,
            usedEngine: 'Tesseract',
        };
    } catch (error) {
        console.error('Tesseract Error:', error);
        throw error;
    } finally {
        if (worker) await worker.terminate();
    }
}

/**
 * Gemini APIによるOCR処理
 */
async function recognizeWithGemini(imageFile: File, apiKey: string): Promise<ImageOCRResult> {
    if (import.meta.env.DEV) console.log('Using OCR Engine: Gemini API');
    const base64Image = await imageToBase64(imageFile);
    const mimeType = imageFile.type || 'image/jpeg';

    const prompt = `この画像は日本のミニバスケットボールチームの選手名簿（メンバー表）です。
画像から選手情報を読み取り、以下のJSON形式で出力してください。

必ず以下の形式のJSONのみを出力し、他の説明文は含めないでください：
[
  {"number": 4, "name": "田中太郎", "licenseNo": "ABC1234567"},
  {"number": 5, "name": "佐藤花子", "licenseNo": "DEF9876543"}
]

注意：
- 背番号は数字で出力
- 背番号が読み取れない場合は0
- 名前が読み取れない場合は「選手」+連番
- licenseNoはJBA登録番号（ライセンス番号）。半角英数字で出力。画像に記載がない場合は省略可
- JSONのみを出力、説明文は不要`;

    let lastError: Error | null = null;


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
                    contents: [
                        {
                            parts: [
                                { text: prompt },
                                {
                                    inline_data: {
                                        mime_type: mimeType,
                                        data: base64Image,
                                    },
                                },
                            ],
                        },
                    ],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 2048,
                    },
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.error?.message || response.statusText;

                // 404なら次のモデルへ
                if (response.status === 404 || errorMessage.includes('not found')) {
                    console.warn(`Model ${model} not found (OCR), trying next...`);
                    lastError = new Error(errorMessage);
                    continue;
                }

                throw new Error(errorMessage);
            }

            const data = await response.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (import.meta.env.DEV) console.log(`OCR Raw Text (Gemini - ${model}):`, textResponse);


            // JSONを抽出
            const jsonMatch = textResponse.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                return {
                    success: false,
                    players: [],
                    rawText: textResponse,
                    error: 'Geminiからの応答形式が正しくありませんでした。',
                    usedEngine: 'Gemini',
                };
            }

            const players = JSON.parse(jsonMatch[0]) as SavedPlayer[];

            // データ検証と正規化
            const validatedPlayers: SavedPlayer[] = players.map((p, index) => ({
                number: typeof p.number === 'number' ? p.number : parseInt(String(p.number), 10) || index + 1,
                name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : `選手${index + 1}`,
                licenseNo: typeof p.licenseNo === 'string' && p.licenseNo.trim() ? p.licenseNo.trim().replace(/[^a-zA-Z0-9]/g, '') : undefined,
                isCaptain: false,
            }));

            return {
                success: true,
                players: validatedPlayers,
                rawText: textResponse,
                usedEngine: 'Gemini',
            };

        } catch (error) {
            console.error(`Gemini API Error (${model}):`, error);
            lastError = error instanceof Error ? error : new Error('Unknown error');
        }
    }

    throw lastError || new Error('All Gemini models failed');
}

/**
 * 画像から選手リストを認識（ハイブリッド版）
 */
export async function recognizePlayerList(imageFile: File): Promise<ImageOCRResult> {
    const apiKey = getStoredApiKey();

    let fallbackReason = '';

    // APIキーがあればGeminiを優先試行
    if (apiKey) {
        try {
            return await recognizeWithGemini(imageFile, apiKey);
        } catch (error) {
            fallbackReason = error instanceof Error ? error.message : 'Unknown error';
            console.warn('Gemini API failed, falling back to Tesseract...', error);
            // Gemini失敗時はTesseractへフォールバック
        }
    }

    // キーが無い、またはGemini失敗時はTesseract
    try {
        const tesseractResult = await recognizeWithTesseract(imageFile);
        if (fallbackReason) {
            tesseractResult.fallbackReason = fallbackReason;
        }
        return tesseractResult;
    } catch (error) {
        return {
            success: false,
            players: [],
            error: tesseractFailureMessage(error),
            usedEngine: 'Tesseract',
            fallbackReason: fallbackReason // Geminiエラーも保持
        };
    }
}

/**
 * Tesseractが起動できなかったときの文面。
 *
 * OCRアセット（worker/wasm/言語データ）はSWのプリキャッシュではなく
 * runtimeCaching で持つようにしたため（vite.config.ts）、まだ取れていない
 * 端末がオフラインで写真読込を開くと、fetchの生のエラーが出てしまう。
 * 利用者が打てる手（一度オンラインで開く）に繋がる文面に置き換える。
 */
function tesseractFailureMessage(error: unknown): string {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return '写真読込に必要なデータがまだ端末にありません。'
            + '一度オンラインでアプリを開くと、以降はオフラインでも使えます。'
            + '（今は選手を手入力で追加できます）';
    }
    return error instanceof Error ? error.message : '画像認識に失敗しました';
}

// OCR機能自体は常に利用可能
export function isOCRAvailable(): boolean {
    return true;
}
