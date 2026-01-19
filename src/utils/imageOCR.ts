// 画像認識（OCR）ユーティリティ - Tesseract.js (Local)
// Gemini API実装はコメントアウトして温存

import type { SavedPlayer } from './teamStorage';
import Tesseract from 'tesseract.js';

// API設定
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const STORAGE_KEY_GEMINI_API = 'mbc_gemini_api_key';

// APIキーの管理関数
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

// 画像認識結果
export interface ImageOCRResult {
    success: boolean;
    players: SavedPlayer[];
    rawText?: string;
    error?: string;
    usedEngine?: 'Gemini' | 'Tesseract'; // どちらを使ったか返す
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
function parseOcrText(text: string): SavedPlayer[] {
    const players: SavedPlayer[] = [];
    // 行ごとに分割して処理
    const lines = text.split(/\r?\n/);

    // 一般的なパターン: "4 田中 太郎", "No.4 TANAKA", "4. 佐藤" など
    // 数字の後に何らかの文字列が続くパターンを探す
    const lineRegex = /^\s*([0-9]{1,3})[\s\.:,]+(.+)/;

    // 複数列レイアウトの場合もあるので、単純な行処理だけでなく、
    // 全文から「数字＋名前」っぽいパターンを拾うアプローチも考えられるが、
    // まずは行単位で処理する

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const match = trimmed.match(lineRegex);
        if (match) {
            const numStr = match[1];
            let nameStr = match[2].trim();

            const number = parseInt(numStr, 10);

            // 明らかに誤検知っぽいものを除外（番号が大きすぎる、名前が短すぎるなど）
            if (number > 99) continue;
            if (nameStr.length < 1) continue;

            // ゴミ文字除去（末尾の記号など）
            nameStr = nameStr.replace(/[|\[\]{};:]/g, '');

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
    try {
        console.log('Using OCR Engine: Tesseract.js');
        const result = await Tesseract.recognize(
            imageFile,
            'jpn', // 日本語優先
            {
                logger: m => import.meta.env.DEV ? console.log(m) : null,
            }
        );

        const text = result.data.text;
        console.log('OCR Raw Text (Tesseract):', text);

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
    }
}

/**
 * Gemini APIによるOCR処理
 */
async function recognizeWithGemini(imageFile: File, apiKey: string): Promise<ImageOCRResult> {
    try {
        console.log('Using OCR Engine: Gemini API');
        const base64Image = await imageToBase64(imageFile);
        const mimeType = imageFile.type || 'image/jpeg';

        const prompt = `この画像は日本のミニバスケットボールチームの選手名簿（メンバー表）です。
画像から選手情報を読み取り、以下のJSON形式で出力してください。

必ず以下の形式のJSONのみを出力し、他の説明文は含めないでください：
[
  {"number": 4, "name": "田中太郎"},
  {"number": 5, "name": "佐藤花子"}
]

注意：
- 背番号は数字で出力
- 背番号が読み取れない場合は0
- 名前が読み取れない場合は「選手」+連番
- JSONのみを出力、説明文は不要`;

        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
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
            throw new Error(errorData.error?.message || 'Gemini API request failed');
        }

        const data = await response.json();
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log('OCR Raw Text (Gemini):', textResponse);

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
            isCaptain: false,
        }));

        return {
            success: true,
            players: validatedPlayers,
            rawText: textResponse,
            usedEngine: 'Gemini',
        };
    } catch (error) {
        console.error('Gemini API Error:', error);
        throw error; // エラーを投げてフォールバックさせるか、呼び出し元で処理
    }
}

/**
 * 画像から選手リストを認識（ハイブリッド版）
 */
export async function recognizePlayerList(imageFile: File): Promise<ImageOCRResult> {
    const apiKey = getStoredApiKey();

    // APIキーがあればGeminiを優先試行
    if (apiKey) {
        try {
            return await recognizeWithGemini(imageFile, apiKey);
        } catch (error) {
            console.warn('Gemini API failed, falling back to Tesseract...', error);
            // Gemini失敗時はTesseractへフォールバック
            // （ただし認証エラーなどの場合はユーザーに通知したほうが親切かもだが、
            //  今回は「とにかく読み取る」ことを優先してフォールバックする）
        }
    }

    // キーが無い、またはGemini失敗時はTesseract
    try {
        return await recognizeWithTesseract(imageFile);
    } catch (error) {
        return {
            success: false,
            players: [],
            error: error instanceof Error ? error.message : '画像認識に失敗しました',
            usedEngine: 'Tesseract',
        };
    }
}

// OCR機能自体は常に利用可能
export function isOCRAvailable(): boolean {
    return true;
}
