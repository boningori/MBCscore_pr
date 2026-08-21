import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SPLASH_TARGETS, type SplashTarget } from '../../scripts/generate-splash-screens.mjs';

// iOSは manifest の background_color を読まないため、apple-touch-startup-image が
// 無い（またはmedia が端末と一致しない）と、ホーム画面からの起動で白画面を挟む。
// 一致条件が device-width / device-height の完全一致なので、機種の追加漏れも
// 綴り違いも「静かに効かなくなる」形で現れる。3者のずれをここで固定する。
//
// 実際に、M4以降のiPad Pro（11" が 834x1210、13" が 1032x1376 へ変わった）が
// 対象表から漏れていた。
const root = process.cwd();
const indexHtml = readFileSync(resolve(root, 'index.html'), 'utf8');

/** index.html の apple-touch-startup-image を (media, href) で拾う */
const startupImages = [...indexHtml.matchAll(
    /<link\s+rel="apple-touch-startup-image"\s+media="([^"]+)"\s+href="([^"]+)"\s*\/>/g,
)].map(([, media, href]) => ({ media, href }));

function expectedFor({ w, h, dpr }: SplashTarget, orientation: 'portrait' | 'landscape') {
    const width = (orientation === 'portrait' ? w : h) * dpr;
    const height = (orientation === 'portrait' ? h : w) * dpr;
    return {
        media: `(device-width: ${w}px) and (device-height: ${h}px) `
            + `and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${orientation})`,
        href: `/splash/splash-${width}x${height}.png`,
    };
}

describe('iOSの起動画像', () => {
    it('対象機種は縦横それぞれ1枚ずつ宣言されている', () => {
        expect(startupImages).toHaveLength(SPLASH_TARGETS.length * 2);
    });

    it('SPLASH_TARGETSの全機種が縦横そろってindex.htmlに宣言されている', () => {
        const missing = SPLASH_TARGETS.flatMap(target =>
            (['portrait', 'landscape'] as const)
                .map(orientation => expectedFor(target, orientation))
                .filter(expected => !startupImages.some(
                    image => image.media === expected.media && image.href === expected.href,
                )),
        );
        expect(missing).toEqual([]);
    });

    it('宣言したファイルがすべて実在する（生成し忘れを検知する）', () => {
        const missing = startupImages
            .map(({ href }) => href)
            .filter(href => !existsSync(resolve(root, 'public', href.replace(/^\//, ''))));
        expect(missing).toEqual([]);
    });

    it('同じ機種を二重に宣言していない', () => {
        const medias = startupImages.map(({ media }) => media);
        expect(new Set(medias).size).toBe(medias.length);
    });
});
