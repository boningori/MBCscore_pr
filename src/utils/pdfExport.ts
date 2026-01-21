import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface ExportOptions {
    filename: string;
    format: 'pdf' | 'jpeg';
    quality?: number; // 0.0 - 1.0 for JPEG
}

/**
 * HTML要素をPDFまたはJPEGとしてエクスポート
 */
export async function exportElement(
    element: HTMLElement,
    options: ExportOptions
): Promise<void> {
    const { filename, format, quality = 0.85 } = options;

    // html2canvasでキャンバスに変換
    const canvas = await html2canvas(element, {
        scale: 4, // 300DPI対応 (A4 @ 96DPI * 3.125 = 300DPI, 4x is safe margin)
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1280, // デスクトップ表示を強制
    });

    if (format === 'jpeg') {
        // JPEG出力
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        downloadDataUrl(dataUrl, `${filename}.jpg`);
    } else {
        // PDF出力（A4サイズ）
        // PNGの代わりにJPEGを使用して容量を削減 (品質 0.85)
        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
            compress: true,
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        // アスペクト比を維持してA4に収める
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);

        const scaledWidth = imgWidth * ratio;
        const scaledHeight = imgHeight * ratio;

        // 中央配置
        const x = (pageWidth - scaledWidth) / 2;
        const y = 0;

        pdf.addImage(imgData, 'JPEG', x, y, scaledWidth, scaledHeight);
        pdf.save(`${filename}.pdf`);
    }
}

/**
 * DataURLをファイルとしてダウンロード
 */
function downloadDataUrl(dataUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * スコアシートエクスポート用ファイル名を生成
 */
export function generateScoresheetFilename(
    gameName: string,
    date: string,
    teamAName: string,
    teamBName: string
): string {
    const sanitize = (s: string) => s.replace(/[\/\\:*?"<>|]/g, '_');
    return `${sanitize(gameName)}_${date}_${sanitize(teamAName)}_vs_${sanitize(teamBName)}`;
}
