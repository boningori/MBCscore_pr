// Tesseractの同梱アセットのパス定義。
//
// tesseract.js は corePath がディレクトリだと SIMD / relaxed SIMD の対応状況を
// 実行時に判定し、3種類あるwasmコアのどれかを要求する。3本とも同梱すると
// 11.4MBのうち7.6MBが一度も使われないまま全端末にprecacheされてしまう。
//
// corePath に .js ファイルを直接指定すると tesseract.js は判定をスキップして
// そのファイルを読み込む（node_modules/tesseract.js の
// src/worker-script/browser/getCore.js の corePathImport.slice(-2) === 'js' 分岐）。
// これを利用してSIMD版1本に固定する。
//
// SIMD版を選ぶ理由: WASM SIMD は Safari 16.4+ / Chrome 91+ / Firefox 89+ で、
// このアプリのビルドターゲット（Viteの baseline-widely-available = Safari 16 /
// Chrome 107 / Firefox 104）とほぼ重なる。アプリのJSが動く端末なら
// SIMDも通ると考えてよい。
// 参照先と実体のずれは tesseractAssets.test.ts が検知する。
export const TESSERACT_CORE_FILE = 'tesseract-core-simd-lstm.wasm.js';

/** Tesseractアセットのベースパス（ViteのbaseすなわちGitHub Pagesのサブパスに追従） */
export const TESSERACT_BASE = `${import.meta.env.BASE_URL}tesseract`;

export const TESSERACT_PATHS = {
    workerPath: `${TESSERACT_BASE}/worker.min.js`,
    corePath: `${TESSERACT_BASE}/${TESSERACT_CORE_FILE}`,
    langPath: `${TESSERACT_BASE}/tessdata`,
} as const;
