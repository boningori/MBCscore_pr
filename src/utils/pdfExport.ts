// html2canvas と jspdf は合わせて約590KB(gzip 174KB)あり、
// 使うのはスコアシート/選手詳細のエクスポート時だけ。静的importだと
// 全画面の初回起動に乗ってしまうため、実行時に動的importする。

/**
 * SVG斜線の位置情報を収集
 */
interface SlashLineInfo {
    x: number;
    y: number;
    width: number;
    height: number;
}

function collectSlashLinePositions(container: HTMLElement): SlashLineInfo[] {
    const containerRect = container.getBoundingClientRect();
    const svgs = container.querySelectorAll('svg.rs-unused-slash');
    const positions: SlashLineInfo[] = [];

    svgs.forEach((svg) => {
        const rect = svg.getBoundingClientRect();
        positions.push({
            x: rect.left - containerRect.left,
            y: rect.top - containerRect.top,
            width: rect.width,
            height: rect.height,
        });
    });

    return positions;
}

/**
 * Canvasに斜線を直接描画
 */
function drawSlashLinesOnCanvas(
    canvas: HTMLCanvasElement,
    positions: SlashLineInfo[],
    scale: number
): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1 * scale;
    ctx.lineCap = 'square';

    positions.forEach(({ x, y, width, height }) => {
        ctx.beginPath();
        ctx.moveTo(x * scale, y * scale);
        ctx.lineTo((x + width) * scale, (y + height) * scale);
        ctx.stroke();
    });
}

/**
 * 円グラフ（conic-gradient）をhtml2canvas向けに描き直す
 *
 * html2canvas 1.4.1 は conic-gradient に対応しておらず、単色に潰れて
 * 割合が読み取れなくなる。キャプチャ用に複製されたDOM上で、背景を
 * 自前で描いたPNGに差し替える。
 */
interface PieSegments {
    percent: number; // 主色(OFF側)が占める割合
    mainColor: string;
    restColor: string;
}

// conic-gradient は真上から時計回り。canvasの0radは3時方向なので起点をずらす。
const PIE_START_ANGLE = -Math.PI / 2;
const FULL_TURN = Math.PI * 2;
// 実寸120pxの円をscale 3で出しても足りる解像度。背景は 100% 100% で伸縮させる。
const PIE_TEXTURE_SIZE = 480;

export function pieSplitAngle(percent: number): number {
    const clamped = Math.min(100, Math.max(0, percent));
    return PIE_START_ANGLE + (clamped / 100) * FULL_TURN;
}

export function readPieSegments(pie: HTMLElement): PieSegments | null {
    const percent = Number(pie.dataset.piePercent);
    if (!Number.isFinite(percent)) return null;

    // 色はテーマで変わるため、複製DOM上で解決済みの値を読む（凡例ドットと必ず揃う）
    const style = pie.ownerDocument.defaultView?.getComputedStyle(pie);
    const mainColor = style?.getPropertyValue('--stats-success').trim();
    const restColor = style?.getPropertyValue('--stats-success-pale').trim();
    if (!mainColor || !restColor) return null;

    return { percent: Math.min(100, Math.max(0, percent)), mainColor, restColor };
}

function drawPieDataUrl({ percent, mainColor, restColor }: PieSegments): string | null {
    const canvas = document.createElement('canvas');
    canvas.width = PIE_TEXTURE_SIZE;
    canvas.height = PIE_TEXTURE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const r = PIE_TEXTURE_SIZE / 2;
    const wedge = (start: number, end: number, color: string) => {
        ctx.beginPath();
        ctx.moveTo(r, r);
        ctx.arc(r, r, r, start, end);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    };

    // 境界に隙間ができないよう、DEF色で全面を塗ってからOFF色を重ねる
    wedge(PIE_START_ANGLE, PIE_START_ANGLE + FULL_TURN, restColor);
    wedge(PIE_START_ANGLE, pieSplitAngle(percent), mainColor);

    return canvas.toDataURL('image/png');
}

export function repaintPieCharts(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-pie-percent]').forEach((pie) => {
        const segments = readPieSegments(pie);
        if (!segments) return;

        const dataUrl = drawPieDataUrl(segments);
        if (!dataUrl) return;

        // 中央の穴は子要素(.pie-center)が描くので、ここは塗り分けた円だけでよい
        pie.style.backgroundImage = `url("${dataUrl}")`;
        pie.style.backgroundSize = '100% 100%';
        pie.style.backgroundRepeat = 'no-repeat';
    });
}

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

    // 先に本体を読み込む。
    //
    // 以前は 'exporting' を付けてから import していた。この動的importは
    // 下の try/finally の外なので、失敗するとA4レイアウトを強制するクラスが
    // 付いたまま残り、画面のスコアシート／選手詳細が崩れたままになる
    // （エラートーストは出るが、画面を離れるまで戻らない）。
    //
    // SWは registerType: 'prompt' で更新を承諾するまで旧プリキャッシュを
    // 保つので、デプロイ直後にチャンクが消える経路はほぼ塞がっている。
    // それでも初回利用時にプリキャッシュが揃う前のオフライン、
    // ストレージ逼迫によるキャッシュ破棄、SWが使えない環境では失敗しうる。
    //
    // 読み込みが済んでから付ければ、失敗しても付かない。
    // 回線が遅いときの「読み込み中だけ崩れて見える」も無くなる。
    const { default: html2canvas } = await import('html2canvas');

    // エクスポート中はレスポンシブの display:none を無効化してA4レイアウトを復元
    element.classList.add('exporting');

    // SVG斜線の位置情報を収集（html2canvasがSVGを正しくレンダリングしないため）。
    // A4レイアウトを適用した状態で測る必要があるので、クラスを付けた後に行う
    const slashPositions = collectSlashLinePositions(element);

    let canvas: HTMLCanvasElement;
    try {
        // html2canvasでキャンバスに変換
        canvas = await html2canvas(element, {
            scale,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth,
            ignoreElements: (el) => el.classList?.contains('rs-unused-slash'), // SVG斜線は除外
            // 複製DOMなので、画面の表示には影響しない
            onclone: (_doc, clonedElement) => repaintPieCharts(clonedElement),
        });
    } finally {
        element.classList.remove('exporting');
    }

    // html2canvasのCanvasを新しいCanvasにコピーして斜線を描画
    // （html2canvasが返すCanvasには直接描画できないため）
    const newCanvas = document.createElement('canvas');
    newCanvas.width = canvas.width;
    newCanvas.height = canvas.height;
    const newCtx = newCanvas.getContext('2d');
    if (newCtx) {
        newCtx.drawImage(canvas, 0, 0);
        drawSlashLinesOnCanvas(newCanvas, slashPositions, scale);
    }
    canvas = newCanvas;

    // タイトル付きcanvasを生成
    const finalCanvas = options.title ? addTitleToCanvas(canvas, options.title) : canvas;

    if (format === 'jpeg') {
        const dataUrl = finalCanvas.toDataURL('image/jpeg', quality);
        downloadDataUrl(dataUrl, `${filename}.jpg`);
    } else {
        // jspdfの読み込みを待たずに戻ると、呼び出し側が完了と誤認して
        // 「出力しました」を先に出してしまうためawaitする
        await exportFitToPagePDF(finalCanvas, filename);
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

/** PDF1ページ分の割り当て */
export interface PdfPageSlice {
    /** 元canvas上の切り出し開始位置(px) */
    sourceY: number;
    /** 切り出す高さ(px) */
    sourceHeight: number;
    /** ページ上の描画幅(mm) */
    drawWidth: number;
    /** ページ上の描画高さ(mm) */
    drawHeight: number;
    /** ページ上の左端(mm)。1ページに収める場合だけ中央寄せになる */
    x: number;
}

/**
 * 1ページに収めるために許す縦の超過。
 *
 * スコアシートは実測で縦横比 1.471（A4は 1.414）と、A4より4%だけ縦長い。
 * 超過が少しでもあれば改ページする実装にすると、公式様式が「2ページ目に数mmだけ」
 * という形で必ず割れる。この程度は幅を96%に縮めて1枚に収めたほうがよい。
 * 一方で選手詳細は縦横比3以上まで伸びるので、そこは改ページに回す。
 */
const SINGLE_PAGE_TOLERANCE = 1.15;

/**
 * canvasをA4ページへ割り当てる。
 *
 * 以前は Math.min(pageWidth/w, pageHeight/h) で必ず1ページに収めていた。
 * スコアシートはA4比のレイアウトなので問題なかったが、選手詳細は
 * 「試合別詳細（1試合1行）＋推移グラフ6枚」を含むため高さが試合数に比例して伸びる。
 * 実測では52試合の選手で描画幅が 89.4mm（A4幅210mmの42%）まで縮み、
 * 右側120mmが空白のまま本文が読めない大きさになっていた。しかも
 * 試合を重ねるほど悪化する。
 *
 * そこで幅は常にページ幅に合わせ、あふれた分を次ページへ送る。
 * 切れ目が行の途中に来ることはあるが、全体が読めなくなるよりは軽い。
 */
export function planPdfPages(
    canvasWidth: number,
    canvasHeight: number,
    pageWidth: number,
    pageHeight: number,
): PdfPageSlice[] {
    if (!(canvasWidth > 0) || !(canvasHeight > 0)) {
        return [{
            sourceY: 0, sourceHeight: Math.max(0, canvasHeight),
            drawWidth: pageWidth, drawHeight: 0, x: 0,
        }];
    }

    const mmPerPx = pageWidth / canvasWidth;
    const totalHeight = canvasHeight * mmPerPx;

    if (totalHeight <= pageHeight) {
        return [{ sourceY: 0, sourceHeight: canvasHeight, drawWidth: pageWidth, drawHeight: totalHeight, x: 0 }];
    }

    // わずかな超過なら縮めて1ページに収める（改ページするとほぼ空のページが増える）
    if (totalHeight <= pageHeight * SINGLE_PAGE_TOLERANCE) {
        const shrunkWidth = pageWidth * (pageHeight / totalHeight);
        return [{
            sourceY: 0,
            sourceHeight: canvasHeight,
            drawWidth: shrunkWidth,
            drawHeight: pageHeight,
            x: (pageWidth - shrunkWidth) / 2,
        }];
    }

    // 1ページに載る元canvasの高さ。切り上げるとページ高を超えるので必ず切り捨てる
    const slicePx = Math.max(1, Math.floor(pageHeight / mmPerPx));
    const slices: PdfPageSlice[] = [];
    for (let y = 0; y < canvasHeight; y += slicePx) {
        // 最終ページは余りだけ。引き伸ばすと縦横比が崩れる
        const sourceHeight = Math.min(slicePx, canvasHeight - y);
        slices.push({
            sourceY: y, sourceHeight,
            drawWidth: pageWidth, drawHeight: sourceHeight * mmPerPx, x: 0,
        });
    }
    return slices;
}

/** canvasの一部を切り出した新しいcanvasを返す */
function cropCanvas(source: HTMLCanvasElement, sourceY: number, sourceHeight: number): HTMLCanvasElement {
    if (sourceY === 0 && sourceHeight === source.height) return source;

    const cropped = document.createElement('canvas');
    cropped.width = source.width;
    cropped.height = sourceHeight;
    const ctx = cropped.getContext('2d');
    if (!ctx) return source;

    // 切り出し先の下地。JPEG化すると透明部分が黒くなるため白で塗る
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cropped.width, cropped.height);
    ctx.drawImage(source, 0, sourceY, source.width, sourceHeight, 0, 0, source.width, sourceHeight);
    return cropped;
}

/**
 * PDF出力（A4幅いっぱいに描き、あふれた分は改ページ）
 */
async function exportFitToPagePDF(canvas: HTMLCanvasElement, filename: string): Promise<void> {
    const { jsPDF } = await import('jspdf');

    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pages = planPdfPages(canvas.width, canvas.height, pageWidth, pageHeight);

    pages.forEach((page, index) => {
        if (index > 0) pdf.addPage();
        const pageCanvas = cropCanvas(canvas, page.sourceY, page.sourceHeight);
        const imgData = pageCanvas.toDataURL('image/jpeg', 0.85);
        // 上寄せ（余白はCSS側で設定済み）
        pdf.addImage(imgData, 'JPEG', page.x, 0, page.drawWidth, page.drawHeight);
    });

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
    const sanitize = (s: string) => s.replace(/[/\\:*?"<>|]/g, '_');
    return `${sanitize(gameName)}_${date}_${sanitize(teamAName)}_vs_${sanitize(teamBName)}`;
}
