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
import { GEMINI_API_BASE, FALLBACK_MODELS, GEMINI_REQUEST_TIMEOUT_MS, getStoredApiKey } from './geminiClient';
import { fetchWithTimeout, isTimeoutError, TIMEOUT_MESSAGE } from './fetchWithTimeout';
import { isAiOcrEnabled } from './appSettings';
import { parseGeminiRosterResponse } from './geminiRosterResponse';
import { normalizePlayerName } from './playerIdentityKey';

// 画像認識結果
export interface ImageOCRResult {
    success: boolean;
    players: SavedPlayer[];
    rawText?: string;
    error?: string;
    usedEngine?: 'Gemini' | 'Tesseract'; // どちらを使ったか返す
    fallbackReason?: string; // GeminiからTesseractへのフォールバック理由
    /**
     * 背番号を読み取れず取り込めなかった行の数。
     *
     * ライセンスNo.を背番号として読むと3桁になり、0〜99の範囲外で落ちる。
     * 黙って continue していたため、選手が消えたことが誰にも分からなかった。
     * 上限超過（OpponentManager の overflowCount）と同じく、件数を画面へ出す
     */
    invalidNumberCount?: number;
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
 * tesseract.js 本体（動的importのチャンク）を読み込めなかったことを表す例外。
 *
 * OCRアセット（worker/wasm/言語データ）が無い場合と区別が要る。あちらは
 * 「一度オンラインでアプリを開けば以後オフラインでも使える」が、こちらは
 * 手元のページが参照しているチャンクがキャッシュにもサーバにも無い状態で、
 * 再読み込みしないと直らない（pdfExport.loadExportModule と同じ筋）。
 */
class OcrModuleError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message);
        this.name = 'OcrModuleError';
        if (options && 'cause' in options) this.cause = options.cause;
    }
}

/**
 * tesseract.js 本体を読み込む。読めなければ、打てる手を添えて投げ直す。
 *
 * 文面をここで決め切ってよいのは、オフラインのときは
 * tesseractFailureMessage が先に別の案内（アセット未取得）を返すため。
 * つまりこの文面が画面に出るのはオンラインのときだけになる。
 */
async function loadTesseract(): Promise<typeof import('tesseract.js')> {
    try {
        return await import('tesseract.js');
    } catch (error) {
        throw new OcrModuleError(
            '写真読込に必要なデータを読み込めませんでした。画面を再読み込みしてから、もう一度お試しください',
            { cause: error },
        );
    }
}

/**
 * Tesseract.jsによるOCR処理
 */
async function recognizeWithTesseract(imageFile: File): Promise<ImageOCRResult> {
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
    try {
        if (import.meta.env.DEV) console.log('Using OCR Engine: Tesseract.js (self-hosted)');
        // 本体の読み込みもここで初めて発生する（写真読込を使う人だけが払う）
        const { createWorker } = await loadTesseract();
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
 * Geminiが返したライセンスNo.を、使える値だけに絞る（使えなければ undefined）。
 *
 * 欄に入り得るのは3桁の数字（JBA登録番号の下3桁。RunningScoresheet の注記）か、
 * 10桁の英数字（公式戦プログラムに載る登録番号そのもの）。一方で取り違えの相手は
 * すべて2桁以下である——背番号 0〜99、通し番号 1〜15、学年 1桁、出場時限・
 * ファウル 1桁。重ならないので、2桁以下なら誤読と断じてよい。
 *
 * 4〜9桁や11桁以上は弾かない。知らない様式を殺すより、そのまま残して
 * 人が直せるほうがよい（識別キーは下3桁で揃えるので実害も小さい）。
 */
function normalizeGeminiLicenseNo(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const cleaned = value.trim().replace(/[^a-zA-Z0-9]/g, '');
    if (cleaned.length < 3) return undefined;
    return cleaned;
}

/**
 * Geminiが返した氏名から空白を取り除く（空なら連番で補う）。
 *
 * 公式様式の氏名は均等割付で、字間に全角スペース(U+3000)が入る。`.trim()` は
 * 前後しか削らないので、字間のスペースはそのまま保存されていた。氏名は
 * 選手識別の最後の砦で、ライセンスNo.が動いたときの寄せ直し
 * （playerStatsAnalysis の buildIdentityAliases）は氏名で名簿を引く。
 * ここが揺れると何も効かない。
 *
 * 空白除去そのものは playerIdentityKey に持たせている。識別キーの氏名も
 * 同じ規則で均すので、2つの実装があると片方だけ直したときに静かに食い違う。
 */
function normalizeGeminiName(value: unknown, index: number): string {
    const cleaned = typeof value === 'string' ? normalizePlayerName(value) : '';
    return cleaned || `選手${index + 1}`;
}

/**
 * モデルを変えても結果が変わらない失敗。
 *
 * FALLBACK_MODELS を順に試すのは「そのモデルが無い(404)」場合に意味がある。
 * キー不正・権限・課金・レート制限、そしてエラー本文がJSONですらない
 * インフラ層の障害は、どのモデルへ送っても同じ結果になる。素の Error で
 * 投げるとループ自身の catch が拾い直してしまうため、区別できる型にする。
 * 同じ扱いは audioTranscribe.ts が先に入れている。
 */
class GeminiFatalError extends Error { }

/**
 * 写真そのものが読み取りに向いていない失敗。Tesseractへ回さず、撮り直しを促す。
 *
 * GeminiFatalError では表現できない。あちらは「モデルを変えても同じ」を
 * 意味するだけで、recognizePlayerList の catch は種類を問わず Tesseract へ回す。
 * 1枚に複数チームが写った写真をそこへ渡すと、parseOcrText は行単位で拾うので
 * 全チームの選手が混ざった名簿がもっともらしく返り、利用者が誤りに気づけない。
 * 「読めなかった」より「間違って読めた」ほうが害が大きい。
 */
class ImageFormatError extends Error { }

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
            const response = await fetchWithTimeout(url, {
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
            }, GEMINI_REQUEST_TIMEOUT_MS);

            if (!response.ok) {
                // エラー本文がJSONとは限らない（プロキシの502やキャプティブポータルは
                // HTMLを返す）。ここで素のまま投げると下の catch に落ちて「通信そのものが
                // 失敗した」ときと区別が付かず、残りのモデルへ画像を送り直してしまう
                let errorMessage: string = response.statusText || `HTTPエラー ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData?.error?.message || errorMessage;
                } catch {
                    // 本文がJSONでない＝インフラ層の障害。モデルを変えても結果は同じ
                    throw new GeminiFatalError(errorMessage);
                }

                // 404なら次のモデルへ
                if (response.status === 404 || errorMessage.includes('not found')) {
                    console.warn(`Model ${model} not found (OCR), trying next...`);
                    lastError = new Error(errorMessage);
                    continue;
                }

                // キー不正・権限・課金・レート制限は全モデルで同じ結果になる。
                // 素の Error だと下の catch が拾い直して、最大8MBの画像を
                // base64 のまま5回アップロードしてから諦めることになる
                throw new GeminiFatalError(errorMessage);
            }

            const data = await response.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (import.meta.env.DEV) console.log(`OCR Raw Text (Gemini - ${model}):`, textResponse);


            // 例外にする（return しない）。return すると recognizePlayerList の
            // catch を通らず、Tesseract を試さないまま失敗が返る。実測では
            // APIキーを入れている利用者だけが、キー無しなら読めた写真で
            // 「応答形式が正しくありませんでした」を受け取っていた
            const teams = parseGeminiRosterResponse(textResponse);
            if (teams.length === 0) {
                throw new Error('Geminiからの応答形式が正しくありませんでした');
            }

            // モデルを変えても写真は変わらないので、ここで打ち切る（下の catch は
            // ImageFormatError を素通しする）
            if (teams.length > 1) {
                throw new ImageFormatError(
                    '1枚の画像に複数のチームが写っています。1チーム分だけが写るように切り取って、もう一度お試しください',
                );
            }

            // データ検証と正規化。背番号は Tesseract 側（parseOcrText）と同じ規則で
            // 通す。以前はここだけ範囲を見ておらず、実測で 999 や -3 がそのまま
            // 名簿に入り、文字列の "0" は parseInt("0") が falsy 判定に落ちて
            // index+1（別番号）へ化けていた
            //
            // 複数チームは上で弾いているので、ここに来るのは常に1チーム分
            const validatedPlayers: SavedPlayer[] = [];
            let invalidNumberCount = 0;
            for (const [index, raw] of teams[0].players.entries()) {
                const p = raw as Partial<SavedPlayer>;
                const number = normalizeGeminiNumber(p.number);
                if (number === null) {
                    invalidNumberCount++;
                    continue;
                }
                validatedPlayers.push({
                    number,
                    name: normalizeGeminiName(p.name, index),
                    licenseNo: normalizeGeminiLicenseNo(p.licenseNo),
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
                invalidNumberCount,
            };

        } catch (error) {
            console.error(`Gemini API Error (${model}):`, error);
            // 様式の問題。残りのモデルへ送り直しても同じ写真が返ってくるだけで、
            // Tesseractへ回しても直らない（recognizePlayerList側で返し切る）
            if (error instanceof ImageFormatError) throw error;
            // モデルを変えても結果が変わらない失敗は、ここで打ち切る。
            // recognizePlayerList の catch が受けて Tesseract へ回すので、
            // 写真読込そのものが使えなくなるわけではない（着くまでが速くなるだけ）
            if (error instanceof GeminiFatalError) throw error;
            // 時間切れも同じ。網に届いていないのだから、8MBの画像を
            // 残り4モデルへ送り直しても同じ結果を待つだけになる
            if (isTimeoutError(error)) throw new GeminiFatalError(TIMEOUT_MESSAGE);
            lastError = error instanceof Error ? error : new Error('Unknown error');
        }
    }

    throw lastError || new Error('All Gemini models failed');
}

/**
 * 画像から選手リストを認識（ハイブリッド版）
 */
export async function recognizePlayerList(imageFile: File): Promise<ImageOCRResult> {
    // 送ってよいかは設定で決める。APIキーは音声メモと共用なので、キーがあることを
    // 「名簿の写真を外へ出してよい」と読み替えてはいけない（appSettings の aiOcrEnabled）。
    // OFFのときは Tesseract（端末内）だけで読むので、写真読込そのものは使える
    const apiKey = isAiOcrEnabled() ? getStoredApiKey() : '';

    let fallbackReason = '';

    // AI経路が有効ならGeminiを優先試行。
    // 大きすぎる写真は送らずTesseractへ回す（GEMINI_MAX_IMAGE_BYTES）
    if (apiKey && imageFile.size > GEMINI_MAX_IMAGE_BYTES) {
        fallbackReason = `画像が大きいため（${Math.round(imageFile.size / 1024 / 1024)}MB）AIへは送らず標準OCRで読み取りました`;
    } else if (apiKey) {
        try {
            return await recognizeWithGemini(imageFile, apiKey);
        } catch (error) {
            // 写真の撮り方の問題は、端末内OCRに回しても直らない。
            // 回すとかえって「間違って読めた」結果が返るので、ここで返し切る
            if (error instanceof ImageFormatError) {
                return {
                    success: false,
                    players: [],
                    error: error.message,
                    usedEngine: 'Gemini',
                };
            }
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
    // 本体のチャンクが読めていない（別のタブで更新した後など）。
    // OCRそのものの失敗ではないので、生の英語メッセージ
    // （"Failed to fetch dynamically imported module"）を画面へ出さない
    if (error instanceof OcrModuleError) return error.message;
    return error instanceof Error ? error.message : '画像認識に失敗しました';
}

// OCR機能自体は常に利用可能
export function isOCRAvailable(): boolean {
    return true;
}
