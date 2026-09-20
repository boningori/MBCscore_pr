// 読み取り結果の詳細（Geminiの生の応答と、応答したモデル名）。
//
// プロンプトを直しても「直ったか」は実写でしか分からない。そのとき
// Geminiが実際に何を返したかを見られないと、推測で直すことになる。
//
// 既定OFFなのは、生の応答に選手の氏名がそのまま入るため。
// 体育館で画面を人に見せる場面がある以上、常時表示にはしない。

import { useState } from 'react';
import type { OcrDiagnostics } from '../../utils/imageOCR';
import { isAiOcrDiagnosticsEnabled } from '../../utils/appSettings';

interface OcrDiagnosticsPanelProps {
    diagnostics?: OcrDiagnostics;
    usedEngine?: 'Gemini' | 'Tesseract';
    /** 結果を出したエンジンの生出力。Tesseractが使われたときだけ意味がある */
    rawText?: string;
    /** Geminiの答えを採らなかった理由。画像が大きすぎて送らなかった場合はdiagnosticsが空でもこれだけ入る */
    fallbackReason?: string;
}

export function OcrDiagnosticsPanel({ diagnostics, usedEngine, rawText, fallbackReason }: OcrDiagnosticsPanelProps) {
    const [open, setOpen] = useState(false);

    // Geminiを試していなければ出すものが無い。設定ONでも黙って何も出さない
    if (!isAiOcrDiagnosticsEnabled()) return null;
    if (!diagnostics?.geminiModel && !diagnostics?.geminiRawText && !fallbackReason) return null;

    return (
        <div className="ocr-diagnostics">
            {/* 角丸の面はボタンだけ。中身は素の文字にする */}
            <button
                type="button"
                className="btn btn-small btn-secondary"
                onClick={() => setOpen(!open)}
            >
                {open ? '▼' : '▶'} 読み取り結果の詳細
            </button>

            {open && (
                <div className="ocr-diagnostics-body">
                    <p>使ったエンジン: {usedEngine ?? '不明'}</p>
                    {diagnostics?.geminiModel && <p>最後に試したモデル: {diagnostics.geminiModel}</p>}
                    {diagnostics?.geminiModelsTried && diagnostics.geminiModelsTried.length > 1 && (
                        <p>試した順: {diagnostics.geminiModelsTried.join(' → ')}</p>
                    )}
                    {fallbackReason && <p>Gemini不採用の理由: {fallbackReason}</p>}
                    {diagnostics?.geminiRawText && (
                        <>
                            <p>AIの応答:</p>
                            <pre className="ocr-diagnostics-raw">{diagnostics.geminiRawText}</pre>
                        </>
                    )}
                    {usedEngine === 'Tesseract' && rawText && (
                        <>
                            <p>標準OCRの読み取り:</p>
                            <pre className="ocr-diagnostics-raw">{rawText}</pre>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
