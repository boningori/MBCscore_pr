// html2canvas と jspdf は合わせて約590KB(gzip 174KB)あり、
// 使うのはスコアシート/選手詳細のエクスポート時だけ。静的importだと
// 全画面の初回起動に乗ってしまうため、実行時に動的importする。

import { isIos } from './installState';

/**
 * 出力の結末。
 *
 * 'cancelled' は iOS の共有シートを利用者が閉じた場合で、ファイルはどこにも
 * 残っていない。以前は exportElement が void を返していたため、呼び出し側
 * （useExportAction）は例外が出ない＝成功とみなして「出力しました」を出していた
 * （実測: iPadのUAで共有をキャンセルすると、ダウンロードは起きないのに
 * 成功トーストだけが出る）。やめた操作を成功と報告しないよう、ここまで伝える。
 */
export type ExportOutcome = 'saved' | 'cancelled';

/** 出力ファイルを共有シートに渡せたか */
export type ExportShareResult =
    /** 共有シートに渡した（ダウンロードは不要） */
    | 'shared'
    /** 利用者が共有をやめた（ダウンロードで追い打ちしない） */
    | 'cancelled'
    /** この端末では共有できない（従来どおりダウンロードする） */
    | 'unsupported';

/**
 * 共有を試す価値がある端末か。
 *
 * 共有に渡すにはファイル全体をメモリに起こす必要がある（PDFで数MB）。
 * ダウンロードで済む端末にその一手間をかけさせないため、呼ぶ側が先に見る。
 */
export function canAttemptExportShare(): boolean {
    return isIos() && typeof navigator.share === 'function';
}

/**
 * 出力したファイルを共有シートに渡す。iOSでだけ試みる。
 *
 * iOSはホーム画面から起動した状態だと a[download] が当てにならず、
 * 「押しても何も起きない」か、blobへ遷移してアプリの画面から出てしまう。
 * 記録中に画面を持っていかれるのがいちばん困るので、保存先の選択は
 * OSの共有シート（ファイルに保存／プリント／送信）に任せる。
 *
 * iOS以外は 'unsupported' を返してダウンロードに任せる。Android・PCでは
 * a[download] が期待どおり動き、共有シートを挟むほうが手数が増えるため。
 * バックアップ（dataBackup.shareFile）が全端末で共有を試すのとは方針が違う。
 * あちらは「端末の外へ出す」のが目的で、こちらは「手元に残す」のが目的。
 *
 * やめた場合にダウンロードへ流さないのは、上に書いたとおりiOSのダウンロードが
 * 画面遷移を伴いうるため。利用者が明示的にやめた操作の後で起こしてはいけない。
 */
export async function shareExportFile(file: File): Promise<ExportShareResult> {
    if (!canAttemptExportShare()) return 'unsupported';
    // canShare が無い環境では share があることを信じて進む（判定APIは後発）
    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
        return 'unsupported';
    }

    try {
        // 共有先（ファイルに保存等）がファイル名に title を使うことがあるため揃える
        await navigator.share({ files: [file], title: file.name });
        return 'shared';
    } catch (error) {
        // 共有シートを閉じただけ。出力そのものは成功している
        if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
        // 共有が使えなかった。取りこぼすよりはダウンロードを試す
        return 'unsupported';
    }
}

/**
 * canvas から実際に画像が取り出せたことを確かめる（取れなければ例外）。
 *
 * toDataURL は上限を超えた canvas に対して例外ではなく 'data:,' を返す。
 * iOS Safari は canvas の面積に上限（広く知られている値で約16.78M px）があり、
 * 選手詳細の出力は1試合の時点で 2458×8702 = 21.4M px に達する（実測）。
 *
 * 戻り値を検査していなかったため、中身の無いファイルを保存したうえで
 * 「出力しました」と報告していた（実測: toDataURL に 'data:,' を返させると
 * 0バイトの .jpg がダウンロードされ、成功トーストが出る）。
 * ここで落とせば useExportAction が失敗として通知する。
 */
function assertRenderedImage(dataUrl: string, canvas: HTMLCanvasElement): void {
    if (dataUrl.startsWith('data:image/')) return;
    throw new Error(
        `画像を生成できませんでした（${canvas.width}x${canvas.height}px）。`
        + '端末の上限を超えた可能性があります',
    );
}

/** DataURLをBlobに戻す（共有シートにはFileで渡す必要がある） */
export function dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(',');
    const type = header.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
}

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
    //
    // チーム比較のドーナツはチーム色で塗るので、要素が --pie-main / --pie-rest を
    // 持っていればそちらを先に見る。持っていない既存の円グラフ（選手詳細の
    // リバウンド内訳）は従来どおり --stats-success 系に落ちる。
    const style = pie.ownerDocument.defaultView?.getComputedStyle(pie);
    const read = (name: string) => style?.getPropertyValue(name).trim() ?? '';

    const mainColor = read('--pie-main') || read('--stats-success');
    const restColor = read('--pie-rest') || read('--stats-success-pale');
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

/**
 * 複製DOMにページのCSSを埋め込み、外部参照の<link>を取り除く。
 *
 * html2canvas は複製DOMを iframe に document.write して作る。この iframe は
 * Service Worker の制御下に入らない（実測: 複製側の
 * navigator.serviceWorker.controller が null）。そのため複製に付いてくる
 * <link rel="stylesheet"> はプリキャッシュを通らず必ずネットワークへ出る。
 * 体育館＝オフラインでは取得に失敗し、スタイルの当たらない複製がそのまま
 * 描かれていた。実測では A4レイアウト(794px幅)ではなく素のHTMLが
 * ビューポート幅(1264px)で縦に伸び、PDFが崩れたまま5ページに分割されていた。
 * しかもトーストは「出力しました」と成功を報告する（無言の失敗）。
 *
 * CSSは同一オリジンなので cssRules から読み出せる。複製に直接埋め込めば
 * 出力が回線から切り離され、オンラインでも毎回CSSを取り直す無駄が消える。
 *
 * onclone は iframe の load 後に呼ばれるので、取得の試行そのものは止まらない
 * （描画には影響しない。止めるには複製前に生きたDOMを触ることになり、
 * 画面が一瞬素の状態になるため採らない）。
 */
export function inlinePageStyles(
    target: Document,
    sheets: Iterable<CSSStyleSheet> = document.styleSheets,
): void {
    const css = [...sheets]
        .map(sheet => {
            try {
                return [...sheet.cssRules].map(rule => rule.cssText).join('\n');
            } catch {
                // 別オリジンのスタイルシートは読めない。同梱CSSは同一オリジンなので
                // ここに落ちるのは出力に関係しないものだけ。残りを埋め込んで進む
                return '';
            }
        })
        .filter(Boolean)
        .join('\n');

    // modulepreload も外す。描画には要らないのに複製から取りにいく
    target.querySelectorAll('link[rel="stylesheet"], link[rel="modulepreload"]')
        .forEach(link => link.remove());

    const style = target.createElement('style');
    style.textContent = css;
    target.head.appendChild(style);
}

/**
 * html2canvas の onclone。複製DOMを出力できる状態に整える。
 *
 * 複製DOMなので、ここで何をしても画面の表示には影響しない。
 */
export function prepareExportClone(clonedDocument: Document, clonedElement: HTMLElement): void {
    inlinePageStyles(clonedDocument);
    repaintPieCharts(clonedElement);
}

/**
 * 横スクロール位置を控えて、あとで戻す関数を返す。
 *
 * 出力は生きたDOMに 'exporting' を付けて寸法を変える。成長グラフの軸は
 * いちばん新しい期間が見える右端から始まる（chartScroll）が、出力用の
 * レイアウトでは列が縮んで中身が枠に収まるため、ブラウザが scrollLeft を
 * 0 に丸める。クラスを外すと再びあふれるのに位置は 0 のままで、出力した
 * あとグラフ6枚がいちばん古い期間まで巻き戻っていた
 * （実測: JPEG出力の前 594/594 → 後 0/594）。
 *
 * 出力は画像を作る処理であって画面を動かす処理ではないので、触った状態は
 * 元に戻して返す。左端(0)だった要素は戻す必要が無いので控えない。
 */
export function captureScrollLeft(scrollers: Iterable<{ scrollLeft: number }>): () => void {
    const saved: Array<[{ scrollLeft: number }, number]> = [];
    for (const el of scrollers) {
        if (el.scrollLeft !== 0) saved.push([el, el.scrollLeft]);
    }
    return () => {
        for (const [el, left] of saved) el.scrollLeft = left;
    };
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
): Promise<ExportOutcome> {
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

    // 出力用レイアウトは寸法を変えるので、横スクロール位置は控えてから戻す
    const restoreScroll = captureScrollLeft(element.querySelectorAll<HTMLElement>('*'));

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
            // 複製DOMなので、画面の表示には影響しない。
            // CSSの埋め込みもここで行う（複製のiframeはSWの制御外で、
            // <link>のままだとオフラインでスタイルが落ちる。inlinePageStyles）
            onclone: prepareExportClone,
        });
    } finally {
        element.classList.remove('exporting');
        // クラスを外して寸法が戻ったあとに位置を書く（順序を逆にすると丸められる）
        restoreScroll();
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
        // 中身が空のまま保存して「出力しました」と言わない（assertRenderedImage）
        assertRenderedImage(dataUrl, finalCanvas);
        const name = `${filename}.jpg`;
        // iOSでは共有シートに渡す（ダウンロードが当てにならない。shareExportFile）
        if (canAttemptExportShare()) {
            const shared = await shareExportFile(new File([dataUrlToBlob(dataUrl)], name, { type: 'image/jpeg' }));
            if (shared === 'shared') return 'saved';
            // やめたなら追い打ちのダウンロードはしない。成功とも言わない
            if (shared === 'cancelled') return 'cancelled';
        }
        downloadDataUrl(dataUrl, name);
        return 'saved';
    }
    // jspdfの読み込みを待たずに戻ると、呼び出し側が完了と誤認して
    // 「出力しました」を先に出してしまうためawaitする
    return exportFitToPagePDF(finalCanvas, filename);
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
async function exportFitToPagePDF(canvas: HTMLCanvasElement, filename: string): Promise<ExportOutcome> {
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
        // 1ページでも空なら中身の欠けたPDFになる。保存せず失敗として知らせる
        assertRenderedImage(imgData, pageCanvas);
        // 上寄せ（余白はCSS側で設定済み）
        pdf.addImage(imgData, 'JPEG', page.x, 0, page.drawWidth, page.drawHeight);
    });

    // iOSでは共有シートに渡す（ダウンロードが当てにならない。shareExportFile）
    const name = `${filename}.pdf`;
    if (canAttemptExportShare()) {
        const shared = await shareExportFile(new File([pdf.output('blob')], name, { type: 'application/pdf' }));
        if (shared === 'shared') return 'saved';
        if (shared === 'cancelled') return 'cancelled';
    }
    pdf.save(name);
    return 'saved';
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
 * ファイル名に使えない文字（OS/ファイルシステム予約文字）を '_' に置き換える。
 *
 * 元は generateScoresheetFilename の中だけにあった処理。試合名を含む
 * ファイル名を作る箇所が増えたため、そちらでも使えるよう独立させた。
 */
export function sanitizeFilename(s: string): string {
    return s.replace(/[/\\:*?"<>|]/g, '_');
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
    return `${sanitizeFilename(gameName)}_${date}_${sanitizeFilename(teamAName)}_vs_${sanitizeFilename(teamBName)}`;
}
