// OCRアセット（Tesseractのworker・wasmコア・言語データ）の先読み。
//
// 以前はこの3本もSWのプリキャッシュに載せていた。プリキャッシュはオール・オア・
// ナッシングで、1ファイルでも取得に失敗するとSWのinstallごとrejectされて破棄される。
// OCRアセットは5.9MBあり全体の約8割を占めるため、体育館の細い回線で落ちると
// 「オフラインで記録できる」という中核機能まで道連れになっていた。
//
// そこでプリキャッシュからは外し（vite.config.ts の globIgnores）、SWの
// runtimeCaching（CacheFirst / mbc-ocr-assets）で個別に持つ形に変えた。
// ただし放っておくと「初めてOCRを使う瞬間にオンラインでないと動かない」に
// 退化する。そうならないよう、起動後に裏でここが取りにいって従来どおり
// オフラインでもOCRが使える状態を保つ。
//
// 取得に失敗しても黙って諦める。OCRは任意機能で、記録そのものには関係ない。

import { TESSERACT_PATHS } from './tesseractAssets';

/**
 * 先読み対象。tesseract.js が実行時に実際に引くURLと1対1で揃える。
 * 言語データは `${langPath}/${lang}.traineddata${gzip ? '.gz' : ''}` の形で
 * 引かれる（node_modules/tesseract.js/src/worker-script/index.js）。
 * ここがずれると先読みしても本番は別URLを叩き、キャッシュを外す。
 */
export const OCR_ASSET_URLS: readonly string[] = [
    TESSERACT_PATHS.workerPath,
    TESSERACT_PATHS.corePath,
    `${TESSERACT_PATHS.langPath}/jpn.traineddata.gz`,
];

/** データセーバー設定を読むための非標準プロパティ */
interface ConnectionNavigator extends Navigator {
    connection?: { saveData?: boolean };
}

/** 先読みしてよい状況か */
function canWarm(): boolean {
    if (typeof navigator === 'undefined') return false;
    if (!navigator.onLine) return false;
    // 従量制回線で5.9MBを黙って落とさない
    if ((navigator as ConnectionNavigator).connection?.saveData === true) return false;
    // SWに制御されていないと fetch がキャッシュに入らず、ただの無駄な通信になる。
    // 初回訪問では clientsClaim を使っていないぶん controller が付かないため、
    // 先読みは2回目の起動から動く（オフライン運用に入るのはインストール後）
    return navigator.serviceWorker?.controller != null;
}

/**
 * OCRアセットをキャッシュに載せる。全部そろったら true。
 *
 * 直列に取るのは、3本同時だとピークで5.9MBを抱えるうえ、
 * 1本目で落ちる回線なら残り2本も落ちるため。
 */
export async function warmOcrAssetCache(): Promise<boolean> {
    if (!canWarm()) return false;

    try {
        for (const url of OCR_ASSET_URLS) {
            // 持っているかはキャッシュを直接見て判定する。
            // fetch はSWのCacheFirstに拾われて通信こそ発生しないが、
            // 3.8MBのwasmを毎起動でArrayBufferに読み出すことになる。
            // caches.match は名前を指定しなければ全キャッシュを横断するので、
            // SW側のcacheName（vite.config.ts）をここに書き写さずに済む
            if (await caches.match(url)) continue;

            const response = await fetch(url);
            // 404のHTMLをキャッシュに入れさせない（GitHub Pagesはindex.htmlを返す）
            if (!response.ok) return false;
            // 本体は使わないので読み捨てる。SWは自分のcloneをキャッシュ済み
            await response.arrayBuffer();
        }
        return true;
    } catch {
        // 通信断・容量不足など。OCRは任意機能なので黙って諦める
        return false;
    }
}

/**
 * 起動後に先読みを始める。成功するまでオンライン復帰のたびに試す。
 * 戻り値を呼ぶと停止する。
 *
 * @param delayMs 起動直後を避けるための待ち。初回描画とプリキャッシュを
 *   先に終わらせたいので既定で少し置く。
 */
export function startOcrAssetWarmup(delayMs = 10_000): () => void {
    if (typeof window === 'undefined') return () => { };

    let stopped = false;
    let running = false;
    let done = false;

    const attempt = async () => {
        if (stopped || done || running) return;
        running = true;
        try {
            done = await warmOcrAssetCache();
        } finally {
            running = false;
        }
    };

    const timer = window.setTimeout(() => { void attempt(); }, delayMs);
    const handleOnline = () => { void attempt(); };
    window.addEventListener('online', handleOnline);

    return () => {
        stopped = true;
        window.clearTimeout(timer);
        window.removeEventListener('online', handleOnline);
    };
}
