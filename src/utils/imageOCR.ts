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

/**
 * Geminiへ1リクエストで送る画像の上限（バイト）。
 *
 * Base64は4/3に膨らむので、8MBの写真で約10.7MBの本文になる。これを超える
 * 端末（48MPのスマホなど）では、遅いうえに失敗しやすい経路へ黙って進んでいた。
 *
 * 超えたときは弾かずにTesseractへ回す。Tesseractは端末内で動くので送信量の
 * 制約が無く、「大きすぎる写真では写真読込そのものが使えない」を作らないため。
 */
const GEMINI_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

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
 * Geminiが返した背番号を、アプリ内部の背番号へ直す（使えない値は null）。
 *
 * Tesseract側は parsePlayerNumber + isValidPlayerNumber を通しているのに、
 * こちらは範囲を見ていなかった。実測: 999 と -3 がそのまま名簿に入り、
 * 文字列の "0" は `parseInt("0") || index + 1` の || が 0 を falsy と見て
 * index+1（別番号）に化けていた。0番の選手が黙って違う番号で登録される。
 *
 * JSONの数値では「00」を表せないため、Gemini経由の 00 は 0 に潰れる。
 * これは応答形式の限界なので、ここでは 0 として受ける（Tesseract経由は
 * 文字列を見るので 00 を保てる）。
 */
function normalizeGeminiNumber(value: unknown): number | null {
    const parsed = typeof value === 'number'
        ? (Number.isInteger(value) ? value : null)
        : typeof value === 'string'
            ? parsePlayerNumber(value)
            : null;
    if (parsed === null || !isValidPlayerNumber(parsed)) return null;
    return parsed;
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
            // 例外にする（return しない）。return すると recognizePlayerList の
            // catch を通らず、Tesseract を試さないまま失敗が返る。実測では
            // APIキーを入れている利用者だけが、キー無しなら読めた写真で
            // 「応答形式が正しくありませんでした」を受け取っていた
            if (!jsonMatch) {
                throw new Error('Geminiからの応答形式が正しくありませんでした');
            }

            const parsed: unknown = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(parsed)) throw new Error('Geminiの応答が選手の配列ではありませんでした');

            // データ検証と正規化。背番号は Tesseract 側（parseOcrText）と同じ規則で
            // 通す。以前はここだけ範囲を見ておらず、実測で 999 や -3 がそのまま
            // 名簿に入り、文字列の "0" は parseInt("0") が falsy 判定に落ちて
            // index+1（別番号）へ化けていた
            const validatedPlayers: SavedPlayer[] = [];
            for (const [index, raw] of parsed.entries()) {
                const p = raw as Partial<SavedPlayer>;
                const number = normalizeGeminiNumber(p.number);
                if (number === null) continue;
                validatedPlayers.push({
                    number,
                    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : `選手${index + 1}`,
                    licenseNo: typeof p.licenseNo === 'string' && p.licenseNo.trim() ? p.licenseNo.trim().replace(/[^a-zA-Z0-9]/g, '') : undefined,
                    isCaptain: false,
                });
            }

            // 1人も取れなければ Gemini は当てにならなかったということ。
            // 例外にして Tesseract へ回す（recognizePlayerList の catch）
            if (validatedPlayers.length === 0) {
                throw new Error('Geminiの応答から有効な選手を取り出せませんでした');
            }

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

    // APIキーがあればGeminiを優先試行。
    // 大きすぎる写真は送らずTesseractへ回す（GEMINI_MAX_IMAGE_BYTES）
    if (apiKey && imageFile.size > GEMINI_MAX_IMAGE_BYTES) {
        fallbackReason = `画像が大きいため（${Math.round(imageFile.size / 1024 / 1024)}MB）AIへは送らず標準OCRで読み取りました`;
    } else if (apiKey) {
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
