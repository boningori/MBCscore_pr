// 録音した音声を Gemini API で文字起こしする。
//
// 用途は「記録者が数秒で吹き込んだメモを、読める形にする」ことだけ。
// 背番号やアクションの構造化はしない。誤って整形されると、
// 読み手が「そう言ったのか、モデルが補ったのか」を区別できなくなるため。

import { FALLBACK_MODELS, GEMINI_API_BASE } from './geminiClient';
import type { TranscriptionOutcome } from './voiceMemo';

export const TRANSCRIBE_PROMPT = `この音声は、バスケットボールの試合中に記録者が吹き込んだ日本語の短いメモです。
聞こえたとおりに文字起こししてください。

- 要約・補完・言い換えをしない
- 聞き取れない部分は「…」とする
- 文字起こしの結果だけを出力し、説明文を付けない`;

async function blobToBase64(blob: Blob): Promise<string> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    // 一度に渡すと引数が多すぎて落ちるため分割する
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

export async function transcribeAudio(wav: Blob, apiKey: string): Promise<TranscriptionOutcome> {
    const base64Audio = await blobToBase64(wav);
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
                    contents: [
                        {
                            parts: [
                                { text: TRANSCRIBE_PROMPT },
                                { inline_data: { mime_type: 'audio/wav', data: base64Audio } },
                            ],
                        },
                    ],
                    generationConfig: {
                        // 聞こえたままを出させたいので揺らぎを最小にする
                        temperature: 0,
                        maxOutputTokens: 256,
                    },
                }),
            });

            if (!response.ok) {
                // エラー本文がJSONとは限らない（プロキシの502等はHTMLを返すことがある）。
                // ここで投げると外側のcatchに落ちて「通信そのものが失敗した」ときと
                // 区別が付かず、全モデルを律儀に試して記録者を待たせてしまう
                let errorMessage = response.statusText || `HTTPエラー ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData?.error?.message || errorMessage;
                } catch {
                    // 本文がJSONでない＝インフラ層の障害と見なし、後続のモデルへは進まない
                }

                // 404なら次のモデルへ。それ以外（キー不正・権限・課金・本文パース不能）は
                // 全モデルで同じ結果になるので即座に返す
                if (response.status === 404 || errorMessage.includes('not found')) {
                    console.warn(`Model ${model} not found (transcribe), trying next...`);
                    lastError = errorMessage;
                    continue;
                }

                return { success: false, error: errorMessage };
            }

            let data: { candidates?: { content?: { parts?: { text?: string }[] } }[] };
            try {
                data = await response.json();
            } catch {
                // 200 OKでも本文がJSONとは限らない（会場のキャプティブポータルが
                // HTMLのログインページを返す等）。ここで投げると外側のcatchに落ちて
                // 「通信そのものが失敗した」ときと区別が付かず、base64化した音声を
                // 残りの全モデルへ律儀に再送信して記録者を待たせてしまう
                return { success: false, error: '応答の解析に失敗しました（ネットワーク環境をご確認ください）' };
            }
            const text: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                return { success: true, text: text.trim() };
            }
            lastError = '応答に文字起こし結果が含まれていませんでした';
        } catch (error) {
            lastError = error instanceof Error ? error.message : 'Unknown error';
        }
    }

    return { success: false, error: lastError || '文字起こしに失敗しました' };
}
