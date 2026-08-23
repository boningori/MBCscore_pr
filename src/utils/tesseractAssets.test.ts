import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { TESSERACT_ASSET_VERSION, TESSERACT_CORE_FILE, TESSERACT_PATHS } from './tesseractAssets';

// tesseract.js は corePath がディレクトリだと SIMD/relaxedSIMD を実行時に判定し、
// 3種類のwasmコアのどれかを要求する（node_modules/tesseract.js の
// src/worker-script/browser/getCore.js）。3本とも同梱・precacheすると
// 11.4MBのうち7.6MBが一度も使われないまま全端末に配られる。
// corePath にファイルを直接指定すると判定をスキップしてそのファイルを読むため、
// 同梱を1本に絞れる。ただし「指定したファイル」と「実際に置いてあるファイル」が
// ずれるとOCRが起動時に落ちるので、ここで一致を固定する。
//
// 置き場所にバージョンを含めるのは、SWのランタイムキャッシュ（CacheFirst /
// mbc-ocr-assets）対策。URLが変わらないと、一度キャッシュした端末は
// tesseract.js を上げても古いworkerを永久に使い続け、アプリのJSだけ新しくなって
// OCRが静かに壊れる。バージョンを含めれば新しいURLとして取り直され、
// 古い世代は maxEntries のLRUで落ちる。
const TESSERACT_ROOT = resolve(process.cwd(), 'public/tesseract');
const TESSERACT_DIR = resolve(TESSERACT_ROOT, TESSERACT_ASSET_VERSION);

/** 同梱元。ここと中身がずれたら、アプリのJSと同梱アセットの版が食い違っている */
const NODE_MODULES = resolve(process.cwd(), 'node_modules');
const installedVersion = (pkg: string): string =>
    JSON.parse(readFileSync(resolve(NODE_MODULES, pkg, 'package.json'), 'utf8')).version;

describe('Tesseractの同梱アセット', () => {
    it('参照しているwasmコアが実際に同梱されている', () => {
        expect(existsSync(resolve(TESSERACT_DIR, TESSERACT_CORE_FILE))).toBe(true);
    });

    it('wasmコアは1本だけ同梱する（未使用コアを配らない）', () => {
        const cores = readdirSync(TESSERACT_DIR).filter(f => f.endsWith('.wasm.js'));
        expect(cores).toEqual([TESSERACT_CORE_FILE]);
    });

    it('corePathはディレクトリではなくファイルを指す', () => {
        // 末尾が .js でないと tesseract.js 側が実行時判定に入ってしまう
        expect(TESSERACT_CORE_FILE.endsWith('.js')).toBe(true);
    });

    it('workerと言語データも同梱されている', () => {
        expect(existsSync(resolve(TESSERACT_DIR, 'worker.min.js'))).toBe(true);
        expect(existsSync(resolve(TESSERACT_DIR, 'tessdata/jpn.traineddata.gz'))).toBe(true);
    });
});

// URLにバージョンが乗っていないと、CacheFirstで一度掴んだ端末は永久に
// 古いアセットを使い続ける（vite.config.ts の mbc-ocr-assets）。
describe('Tesseractアセットの世代', () => {
    it('参照URLにバージョンが入っている（更新が端末に届く）', () => {
        for (const url of [TESSERACT_PATHS.workerPath, TESSERACT_PATHS.corePath, TESSERACT_PATHS.langPath]) {
            expect(url).toContain(`/tesseract/${TESSERACT_ASSET_VERSION}/`);
        }
    });

    it('同梱する世代はひとつだけ（古い世代を配らない）', () => {
        const generations = readdirSync(TESSERACT_ROOT, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name);
        expect(generations).toEqual([TESSERACT_ASSET_VERSION]);
    });
});

// 同梱アセットは node_modules から手で写している。npm update でアプリのJSだけ
// 新しくなり、workerやwasmコアが古いまま取り残されるとOCRが静かに壊れるため、
// 「写し忘れ」をここで落とす。
describe('Tesseractの同梱アセットと依存の版', () => {
    it('置き場所のバージョンが tesseract.js の版と一致する', () => {
        expect(TESSERACT_ASSET_VERSION).toBe(installedVersion('tesseract.js'));
    });

    it('workerが node_modules の中身と一致する', () => {
        const bundled = readFileSync(resolve(TESSERACT_DIR, 'worker.min.js'));
        const source = readFileSync(resolve(NODE_MODULES, 'tesseract.js/dist/worker.min.js'));
        expect(bundled.equals(source)).toBe(true);
    });

    it('wasmコアが node_modules の中身と一致する', () => {
        const bundled = readFileSync(resolve(TESSERACT_DIR, TESSERACT_CORE_FILE));
        const source = readFileSync(resolve(NODE_MODULES, 'tesseract.js-core', TESSERACT_CORE_FILE));
        expect(bundled.equals(source)).toBe(true);
    });

    it('言語データは中身を比べられないので、gzipであることと大きさで見る', () => {
        // jpn.traineddata.gz は node_modules に無い（tesseract.js は既定でCDNから
        // 取りにいく）ため、比較対象がない。空ファイルや取得失敗のHTMLが
        // 紛れ込んでいないことだけ確かめる
        const lang = resolve(TESSERACT_DIR, 'tessdata/jpn.traineddata.gz');
        const header = readFileSync(lang).subarray(0, 2);
        expect([...header]).toEqual([0x1f, 0x8b]);
        expect(statSync(lang).size).toBeGreaterThan(1_000_000);
    });
});

// tesseract.js を静的importすると、それを読む imageOCR → OpponentManager /
// OpponentSelect → App と芋づるでエントリチャンクに載り、写真読込を使わない
// 利用者にも配られる。html2canvas / jspdf は同じ理由で動的importにしてある
// （pdfExport.ts の冒頭コメント）。同じ基準をここにも効かせる。
describe('OCRの読み込み境界', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/utils/imageOCR.ts'), 'utf8');

    it('tesseract.js を静的importしない（実行時までエントリに載せない）', () => {
        // `import type` は型のみでビルド後に消えるため対象外
        const staticValueImport = /^\s*import\s+(?!type\s)[^;]*from\s+['"]tesseract\.js['"]/m;
        expect(staticValueImport.test(source)).toBe(false);
    });

    it('OCR実行時に動的importする', () => {
        expect(/await\s+import\(\s*['"]tesseract\.js['"]\s*\)/.test(source)).toBe(true);
    });
});
