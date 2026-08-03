import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TESSERACT_CORE_FILE } from './tesseractAssets';

// tesseract.js は corePath がディレクトリだと SIMD/relaxedSIMD を実行時に判定し、
// 3種類のwasmコアのどれかを要求する（node_modules/tesseract.js の
// src/worker-script/browser/getCore.js）。3本とも同梱・precacheすると
// 11.4MBのうち7.6MBが一度も使われないまま全端末に配られる。
// corePath にファイルを直接指定すると判定をスキップしてそのファイルを読むため、
// 同梱を1本に絞れる。ただし「指定したファイル」と「実際に置いてあるファイル」が
// ずれるとOCRが起動時に落ちるので、ここで一致を固定する。
const TESSERACT_DIR = resolve(process.cwd(), 'public/tesseract');

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
