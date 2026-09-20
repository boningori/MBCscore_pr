// 読み取り結果の詳細の折りたたみ。
//
// 既定OFFなのは、生の応答に選手の氏名がそのまま入るため。
// 設定ONでも、Geminiを試していなければ出すものが無いので描画しない。

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { OcrDiagnosticsPanel } from './OcrDiagnosticsPanel';
import { setAiOcrDiagnosticsEnabled } from '../../utils/appSettings';

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

const DIAGNOSTICS = {
    geminiModel: 'gemini-2.5-flash-lite',
    geminiRawText: '{"teams":[{"players":[]}]}',
};

describe('設定がOFFのとき', () => {
    it('何も描画しない', () => {
        const { container } = render(
            <OcrDiagnosticsPanel diagnostics={DIAGNOSTICS} usedEngine="Gemini" />,
        );
        expect(container.firstChild).toBeNull();
    });
});

describe('設定がONのとき', () => {
    beforeEach(() => {
        setAiOcrDiagnosticsEnabled(true);
    });

    it('開くまで応答の中身は出さない', () => {
        render(<OcrDiagnosticsPanel diagnostics={DIAGNOSTICS} usedEngine="Gemini" />);

        expect(screen.getByRole('button', { name: /読み取り結果の詳細/ })).toBeTruthy();
        expect(screen.queryByText(/"teams"/)).toBeNull();
    });

    it('開くとモデル名と生の応答が出る', () => {
        render(<OcrDiagnosticsPanel diagnostics={DIAGNOSTICS} usedEngine="Gemini" />);

        fireEvent.click(screen.getByRole('button', { name: /読み取り結果の詳細/ }));

        expect(screen.getByText(/gemini-2.5-flash-lite/)).toBeTruthy();
        expect(screen.getByText(/"teams"/)).toBeTruthy();
    });

    it('Geminiを試していなければ描画しない', () => {
        const { container } = render(
            <OcrDiagnosticsPanel diagnostics={{}} usedEngine="Tesseract" />,
        );
        expect(container.firstChild).toBeNull();
    });

    it('diagnostics が無くても落ちない', () => {
        const { container } = render(<OcrDiagnosticsPanel usedEngine="Tesseract" />);
        expect(container.firstChild).toBeNull();
    });

    it('Gemini不採用の理由が出る', () => {
        render(
            <OcrDiagnosticsPanel diagnostics={DIAGNOSTICS} usedEngine="Gemini" fallbackReason="quota exceeded" />,
        );

        fireEvent.click(screen.getByRole('button', { name: /読み取り結果の詳細/ }));

        expect(screen.getByText(/quota exceeded/)).toBeTruthy();
    });

    it('diagnosticsが空でもfallbackReasonだけで描画する（画像が大きすぎてAIへ送らなかった経路）', () => {
        const { container } = render(
            <OcrDiagnosticsPanel diagnostics={{}} usedEngine="Tesseract" fallbackReason="画像が大きいためAIへは送らず標準OCRで読み取りました" />,
        );

        expect(container.firstChild).not.toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /読み取り結果の詳細/ }));
        expect(screen.getByText(/画像が大きいため/)).toBeTruthy();
    });

    it('Tesseractが使われたときはその出力も出す', () => {
        render(
            <OcrDiagnosticsPanel
                diagnostics={DIAGNOSTICS}
                usedEngine="Tesseract"
                rawText="4 田中太郎"
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /読み取り結果の詳細/ }));

        expect(screen.getByText(/4 田中太郎/)).toBeTruthy();
    });
});
