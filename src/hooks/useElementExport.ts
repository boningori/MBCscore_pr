// 画面の一部を丸ごと画像・PDFにするための入口。
//
// 「refの中身を取り出す → 空なら諦める → exportElement を format 違いで
// 2回書く → 通知ラベルを 'PDF'/'JPEG' に振り分ける」という同じ手順が、
// スコアシート・選手詳細・チーム比較に写してあった。スタッツ表で4箇所目に
// なるのでここへ集約する。
//
// 出力そのものの作法（進行中フラグ・二重起動の抑止・成否の通知）は
// useExportAction が持つ。このフックはその上に薄く乗るだけで、
// 失敗の扱いを別に持たない。

import { useCallback, type RefObject } from 'react';
import { useExportAction } from './useExportAction';
import { exportElement } from '../utils/pdfExport';

export interface ElementExportOptions {
    filename: string;
    /** html2canvasのキャプチャ幅。省略時は exportElement の既定（1280） */
    windowWidth?: number;
    /** html2canvasのスケール。省略時は exportElement の既定（4） */
    scale?: number;
    /** 出力物の先頭に入れる見出し（選手名など） */
    title?: string;
}

export interface UseElementExportResult {
    /** 出力処理の実行中か。呼ぶ側が他のボタンも一緒に無効化するために返す */
    isExporting: boolean;
    exportPdf: () => void;
    exportJpeg: () => void;
}

export function useElementExport(
    targetRef: RefObject<HTMLElement | null>,
    options: ElementExportOptions,
): UseElementExportResult {
    const { isExporting, runExport } = useExportAction();
    const { filename, windowWidth, scale, title } = options;

    const exportAs = useCallback((format: 'pdf' | 'jpeg') => {
        const element = targetRef.current;
        // 画面を離れた直後などに空になりうる。null のまま進むと html2canvas が
        // 落ち、理由の分からない「出力に失敗しました」だけが出る
        if (!element) return;
        void runExport(
            () => exportElement(element, { filename, format, windowWidth, scale, title }),
            format === 'pdf' ? 'PDF' : 'JPEG',
        );
    }, [targetRef, runExport, filename, windowWidth, scale, title]);

    const exportPdf = useCallback(() => exportAs('pdf'), [exportAs]);
    const exportJpeg = useCallback(() => exportAs('jpeg'), [exportAs]);

    return { isExporting, exportPdf, exportJpeg };
}
