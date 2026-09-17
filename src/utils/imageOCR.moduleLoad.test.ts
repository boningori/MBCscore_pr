// tesseract.js 本体（動的importのチャンク）が読み込めないときの文面。
//
// OCRは押した時点で初めて本体を読み込む。ページを開いた後にそのチャンクが
// 手に入らなくなると——2つのタブで開いていて片方で「更新」を押した後などに——
// ここで初めて失敗する。以前は生の英語（"Failed to fetch dynamically imported
// module"）がそのまま画面に出ていた。
//
// 「アセットがまだ端末に無い」（オフライン）とは打つ手が違う。あちらは一度
// オンラインで開けば以後オフラインでも使えるが、こちらは再読み込みが要る。
// 両方の文面を取り違えないことを固定する。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// import そのものを失敗させる（チャンクが取れない状態）
vi.mock('tesseract.js', () => {
    throw new TypeError('Failed to fetch dynamically imported module');
});

import { recognizePlayerList } from './imageOCR';
import { setAiOcrEnabled } from './appSettings';

function imageFile(): File {
    return new File([new Uint8Array(10)], 'roster.jpg', { type: 'image/jpeg' });
}

beforeEach(() => {
    localStorage.clear();
    // AI経路は通さず、Tesseractだけを見る
    setAiOcrEnabled(false);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('本体を読み込めないとき', () => {
    it('オンラインなら、再読み込みを案内する（生のエラーを出さない）', async () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

        const result = await recognizePlayerList(imageFile());

        expect(result.success).toBe(false);
        expect(result.error).toContain('再読み込み');
        expect(result.error).not.toContain('Failed to fetch');
    });

    it('オフラインなら、これまでどおり「一度オンラインで開く」を案内する', async () => {
        // アセット未取得と区別が付かない状況なので、再読み込みを勧めても直らない
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

        const result = await recognizePlayerList(imageFile());

        expect(result.success).toBe(false);
        expect(result.error).toContain('一度オンラインでアプリを開く');
        expect(result.error).not.toContain('再読み込み');
    });
});

describe('imageOCR の動的import', () => {
    // 付け忘れるとそこだけ生の英語に戻る（pdfExport と同じ趣旨の検査）
    it('tesseract.js は loadTesseract を通して読み込む', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const source = readFileSync(resolve(process.cwd(), 'src/utils/imageOCR.ts'), 'utf8');

        // 素の import は loadTesseract の中の1つだけ
        const bare = [...source.matchAll(/await import\('tesseract\.js'\)/g)];
        expect(bare, 'loadTesseract を通さない import が残っている').toHaveLength(1);
        expect(source).toContain('await loadTesseract()');
    });
});
