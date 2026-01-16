// 画像認識（OCR）ユーティリティ - Gemini Vision API

import type { SavedPlayer } from './teamStorage';

// API設定
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// 画像認識結果
export interface ImageOCRResult {
    success: boolean;
    players: SavedPlayer[];
    rawText?: string;
    error?: string;
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

// 画像から選手リストを認識
export async function recognizePlayerList(imageFile: File): Promise<ImageOCRResult> {
    if (!GEMINI_API_KEY) {
        return {
            success: false,
            players: [],
            error: 'Gemini APIキーが設定されていません。環境変数 VITE_GEMINI_API_KEY を設定してください。',
        };
    }

    try {
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

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
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
            throw new Error(errorData.error?.message || 'API request failed');
        }

        const data = await response.json();
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // JSONを抽出
        const jsonMatch = textResponse.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            return {
                success: false,
                players: [],
                rawText: textResponse,
                error: '選手情報を認識できませんでした。画像を確認してください。',
            };
        }

        const players = JSON.parse(jsonMatch[0]) as SavedPlayer[];

        // データ検証と正規化（isCaptainは常にfalse）
        const validatedPlayers: SavedPlayer[] = players.map((p, index) => ({
            number: typeof p.number === 'number' ? p.number : parseInt(String(p.number), 10) || index + 1,
            name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : `選手${index + 1}`,
            isCaptain: false,
        }));

        return {
            success: true,
            players: validatedPlayers,
            rawText: textResponse,
        };
    } catch (error) {
        console.error('Image OCR failed:', error);
        return {
            success: false,
            players: [],
            error: error instanceof Error ? error.message : '画像認識に失敗しました',
        };
    }
}

// APIキーが設定されているかチェック
export function isOCRAvailable(): boolean {
    return Boolean(GEMINI_API_KEY);
}
