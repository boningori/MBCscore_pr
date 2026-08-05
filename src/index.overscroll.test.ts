import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// このアプリの主要ジェスチャは「↓スワイプ＝ミス」で、下方向のドラッグを常用する。
// スクロール可能な領域（.app-main）が先頭にある状態で下へ引くと、スクロール連鎖で
// ブラウザの引っ張って更新が走り、記録中にアプリごとリロードされる。
// touch-action: manipulation はダブルタップズームを止めるだけで、これは防げない。
// 値が消えると静かに再発するため、ここで存在を固定する。
// jsdom環境では import.meta.url が file: にならないため cwd 基準で読む
const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8');

/** セレクタ直後のブロック本文を取り出す（@media の外にある最初の宣言） */
function blockFor(selector: string): string {
    const re = new RegExp(`(^|\\})\\s*${selector}\\s*\\{([^}]*)\\}`, 'm');
    const m = indexCss.match(re);
    return m ? m[2] : '';
}

describe('引っ張って更新でリロードされないこと', () => {
    it('html にスクロール連鎖を止める指定がある', () => {
        expect(blockFor('html')).toMatch(/overscroll-behavior(-y)?\s*:\s*(contain|none)/);
    });

    it('body にもスクロール連鎖を止める指定がある', () => {
        // Chromeは引っ張って更新の判定に body 側の指定も見るため両方に置く
        expect(blockFor('body')).toMatch(/overscroll-behavior(-y)?\s*:\s*(contain|none)/);
    });
});
