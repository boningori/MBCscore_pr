import { describe, it, expect, afterEach } from 'vitest';
import { inlinePageStyles, prepareExportClone } from './pdfExport';

// html2canvas は複製DOMを iframe に document.write して作る。この iframe は
// Service Worker の制御下に入らないため、複製側の <link rel="stylesheet"> は
// プリキャッシュを通らず必ずネットワークへ出る。オフラインでは取得に失敗し、
// スタイルの当たらない複製がそのまま描かれて出力が崩れていた（実測）。
// 複製にCSSを埋め込んで、ネットワークから切り離す。

/** 複製DOMの代わり（html2canvasが作る別ドキュメント） */
function makeClonedDocument(headHtml: string): Document {
    const doc = document.implementation.createHTMLDocument('clone');
    doc.head.innerHTML = headHtml;
    return doc;
}

/** cssRules を読めるスタイルシートを1枚持つ、取り込み元のドキュメント */
function makeSourceSheets(css: string): CSSStyleSheet[] {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    return [...document.styleSheets];
}

afterEach(() => {
    document.head.querySelectorAll('style').forEach(el => el.remove());
});

describe('inlinePageStyles', () => {
    it('取り込み元のCSSを複製DOMに<style>として埋め込む', () => {
        const sheets = makeSourceSheets('.exporting { width: 794px; }');
        const clone = makeClonedDocument('');

        inlinePageStyles(clone, sheets);

        const injected = clone.head.querySelector('style');
        expect(injected?.textContent).toContain('794px');
    });

    it('複製DOMの<link rel="stylesheet">を取り除く（ネットワークへ出させない）', () => {
        const sheets = makeSourceSheets('.a { color: red; }');
        const clone = makeClonedDocument('<link rel="stylesheet" href="/assets/index.css">');

        inlinePageStyles(clone, sheets);

        expect(clone.head.querySelector('link[rel="stylesheet"]')).toBeNull();
    });

    it('複製DOMの<link rel="modulepreload">も取り除く（描画に不要な取得を残さない）', () => {
        const sheets = makeSourceSheets('.a { color: red; }');
        const clone = makeClonedDocument('<link rel="modulepreload" href="/assets/vendor-react.js">');

        inlinePageStyles(clone, sheets);

        expect(clone.head.querySelector('link[rel="modulepreload"]')).toBeNull();
    });

    it('読み出せないスタイルシート（別オリジン）があっても、残りを埋め込んで進む', () => {
        const blocked = {
            get cssRules(): CSSRuleList {
                throw new DOMException('cross-origin', 'SecurityError');
            },
        } as unknown as CSSStyleSheet;
        const sheets = [blocked, ...makeSourceSheets('.a { color: red; }')];
        const clone = makeClonedDocument('');

        expect(() => inlinePageStyles(clone, sheets)).not.toThrow();
        expect(clone.head.querySelector('style')?.textContent).toContain('color: red');
    });
});

describe('prepareExportClone', () => {
    it('html2canvasのoncloneとして、複製DOMにCSSを埋め込む', () => {
        makeSourceSheets('.exporting { width: 794px; }');
        const clone = makeClonedDocument('<link rel="stylesheet" href="/assets/index.css">');
        const element = clone.createElement('div');
        clone.body.appendChild(element);

        prepareExportClone(clone, element);

        expect(clone.head.querySelector('style')?.textContent).toContain('794px');
        expect(clone.head.querySelector('link[rel="stylesheet"]')).toBeNull();
    });
});
