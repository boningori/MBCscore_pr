import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface ExportOptions {
    filename: string;
    format: 'pdf' | 'jpeg';
    quality?: number; // 0.0 - 1.0 for JPEG
    windowWidth?: number; // html2canvasのキャプチャ幅（デフォルト: 1280）
    scale?: number; // html2canvasのスケール（デフォルト: 4）
    title?: string; // タイトル（選手名など）
}

/**
 * HTML要素をPDFまたはJPEGとしてエクスポート
 * title指定時はタイトル付きで出力
 */
export async function exportElement(
    element: HTMLElement,
    options: ExportOptions
): Promise<void> {
    const {
        filename,
        format,
        quality = 0.85,
        windowWidth = 1280,
        scale = 4,
    } = options;

    // エクスポート中はレスポンシブの display:none を無効化してA4レイアウトを復元
    element.classList.add('exporting');

    let canvas: HTMLCanvasElement;
    try {
        // html2canvasでキャンバスに変換
        canvas = await html2canvas(element, {
            scale,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth,
        });
    } finally {
        element.classList.remove('exporting');
    }

    // タイトル付きcanvasを生成
    const finalCanvas = options.title ? addTitleToCanvas(canvas, options.title) : canvas;

    if (format === 'jpeg') {
        const dataUrl = finalCanvas.toDataURL('image/jpeg', quality);
        downloadDataUrl(dataUrl, `${filename}.jpg`);
    } else {
        exportFitToPagePDF(finalCanvas, filename);
    }
}

/**
 * canvasにタイトルと四辺の余白を付けた新しいcanvasを返す
 */
function addTitleToCanvas(canvas: HTMLCanvasElement, title: string): HTMLCanvasElement {
    const titleFontSize = Math.round(canvas.width * 0.025);
    const titlePaddingTop = Math.round(titleFontSize * 0.6);
    const titlePaddingBottom = Math.round(titleFontSize * 0.8);
    const titleHeight = titlePaddingTop + titleFontSize + titlePaddingBottom;

    // 四辺のマージン（canvas幅の2.5%程度）
    const margin = Math.round(canvas.width * 0.025);

    const newCanvas = document.createElement('canvas');
    newCanvas.width = canvas.width + margin * 2;
    newCanvas.height = titleHeight + canvas.height + margin;
    const ctx = newCanvas.getContext('2d');
    if (!ctx) return canvas;

    // 白背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, newCanvas.width, newCanvas.height);

    // タイトル描画（左寄せ、マージン内）
    ctx.fillStyle = '#1e293b';
    ctx.font = `bold ${titleFontSize}px "Helvetica Neue", "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(title, margin, titlePaddingTop);

    // コンテンツ描画（左右マージン分オフセット）
    ctx.drawImage(canvas, margin, titleHeight);

    return newCanvas;
}

/**
 * 1ページPDF出力（A4にマージン付きで収める）
 */
function exportFitToPagePDF(canvas: HTMLCanvasElement, filename: string): void {
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginX = 8;
    const marginY = 6;
    const contentWidth = pageWidth - marginX * 2;
    const contentHeight = pageHeight - marginY * 2;

    // アスペクト比を維持してマージン内に収める
    const ratio = Math.min(contentWidth / canvas.width, contentHeight / canvas.height);
    const scaledWidth = canvas.width * ratio;
    const scaledHeight = canvas.height * ratio;

    // 上寄せ・左右中央
    const x = (pageWidth - scaledWidth) / 2;
    const y = marginY;

    const imgData = canvas.toDataURL('image/jpeg', 0.85);
    pdf.addImage(imgData, 'JPEG', x, y, scaledWidth, scaledHeight);
    pdf.save(`${filename}.pdf`);
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
