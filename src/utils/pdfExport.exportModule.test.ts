// 出力用コード（html2canvas / jspdf）の読み込みが失敗したときの案内。
//
// この2つは動的importなので、ページを開いた後にチャンクが取れなくなると
// そこで初めて失敗する。起こる筋道は3つある:
//  - 2つのタブで開いていて、片方で「更新」を押した。新SWが activate した
//    瞬間に旧プリキャッシュの項目が消え、gh-pages は dist を丸ごと
//    差し替えるのでサーバにも旧チャンクは残っていない（実測で404）
//  - 初回利用でプリキャッシュが揃う前にオフラインになった
//  - 容量逼迫でキャッシュが捨てられた／SWが使えない環境
//
// どれも「他のアプリを閉じてもう一度お試しください」（一般的な案内）では
// 直らない。手の打ちようがあるのは再読み込みか通信の回復なので、そこを言う。

import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadExportModule } from './pdfExport';
import { ExportModuleError } from './exportError';

function setOnline(online: boolean): void {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('loadExportModule', () => {
    it('読み込めたモジュールをそのまま返す', async () => {
        const module = { default: 'html2canvas' };

        await expect(loadExportModule(() => Promise.resolve(module))).resolves.toBe(module);
    });

    it('読み込めなければ ExportModuleError にする', async () => {
        setOnline(true);

        await expect(
            loadExportModule(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module'))),
        ).rejects.toBeInstanceOf(ExportModuleError);
    });

    it('オンラインなら、再読み込みを案内する', async () => {
        setOnline(true);

        await expect(
            loadExportModule(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module'))),
        ).rejects.toThrow(/再読み込み/);
    });

    it('オフラインなら、再読み込みではなく通信の回復を案内する', async () => {
        // オフラインのまま読み込み直しても、そのチャンクは手に入らない。
        // 再読み込みを勧めると、直らない操作を繰り返させることになる
        setOnline(false);

        const failing = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'));
        await expect(loadExportModule(failing)).rejects.toThrow(/通信/);
        await expect(loadExportModule(failing)).rejects.not.toThrow(/再読み込み/);
    });

    it('元の失敗を cause に残す（エラーログで原因を追えるように）', async () => {
        setOnline(true);
        const original = new TypeError('Failed to fetch dynamically imported module');

        await expect(loadExportModule(() => Promise.reject(original))).rejects.toMatchObject({
            cause: original,
        });
    });
});

describe('pdfExport の動的import', () => {
    // 案内を直しても、片方の import が素のままだと そこだけ従来の
    // 「他のアプリを閉じて…」に戻る。呼び出し箇所の付け忘れをここで止める
    it('すべて loadExportModule を通している', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const source = readFileSync(resolve(process.cwd(), 'src/utils/pdfExport.ts'), 'utf8');

        const bare = [...source.matchAll(/await import\(/g)];
        expect(bare, '素の await import が残っている').toHaveLength(0);

        for (const moduleName of ['html2canvas', 'jspdf']) {
            expect(source).toContain(`loadExportModule(() => import('${moduleName}'))`);
        }
    });
});
