// iOS用の起動画像（スプラッシュ）を生成する。
//
// iOSは manifest の background_color を読まないため、ホーム画面から起動すると
// 起動時に白画面を挟む。暗い配色のアプリでは目立つ。
// これを消すには apple-touch-startup-image を端末解像度ごとに用意するしかない。
//
// 実行: node scripts/generate-splash-screens.mjs
// 生成物は public/splash/ に出力し、gitにコミットする（ビルド時には生成しない）。

// sharp は devDependencies で、配布物には入らない（このスクリプトを手で叩いたときだけ動く）。
// `npm audit` が high として報告し続けるが、上げない判断をしている。
// 理由と、外部スキャン対策が必要になった場合の代替は scripts/README.md を参照。
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const outDir = path.join(publicDir, 'splash');

// manifestのbackground_color / --bg-primary と一致させる
const BACKGROUND = { r: 15, g: 23, b: 42, alpha: 1 };
// 絵柄は短辺の40%に収める。どの縦横比でも見切れない上限。
const ARTWORK_RATIO = 0.4;

// 対象端末。w/hはCSSポイント、dprはデバイスピクセル比。
// index.html の <link media="..."> はこの配列と1対1で対応する。
export const SPLASH_TARGETS = [
    { w: 375, h: 667, dpr: 2 },   // iPhone SE(2nd/3rd) / 8 / 7 / 6s
    { w: 414, h: 736, dpr: 3 },   // iPhone 8 Plus
    { w: 375, h: 812, dpr: 3 },   // iPhone X / XS / 11 Pro / 12 mini / 13 mini
    { w: 414, h: 896, dpr: 2 },   // iPhone XR / 11
    { w: 414, h: 896, dpr: 3 },   // iPhone XS Max / 11 Pro Max
    { w: 390, h: 844, dpr: 3 },   // iPhone 12 / 12 Pro / 13 / 13 Pro / 14
    { w: 428, h: 926, dpr: 3 },   // iPhone 12 Pro Max / 13 Pro Max / 14 Plus
    { w: 393, h: 852, dpr: 3 },   // iPhone 14 Pro / 15 / 15 Pro / 16
    { w: 430, h: 932, dpr: 3 },   // iPhone 14 Pro Max / 15 Plus / 15 Pro Max
    { w: 768, h: 1024, dpr: 2 },  // iPad 9.7"（第5世代以前。miniは6世代以降744x1133のため別枠）
    { w: 810, h: 1080, dpr: 2 },  // iPad 10.2"
    { w: 834, h: 1112, dpr: 2 },  // iPad Air 10.5"
    { w: 834, h: 1194, dpr: 2 },  // iPad Pro 11"（M2以前）
    { w: 1024, h: 1366, dpr: 2 }, // iPad Pro 12.9"（M2以前）
    { w: 834, h: 1210, dpr: 2 },  // iPad Pro 11"（M4以降。1668x2420で高さが変わった）
    { w: 1032, h: 1376, dpr: 2 }, // iPad Pro 13"（M4以降。2064x2752）
    { w: 820, h: 1180, dpr: 2 },  // iPad Air 4/5・11" / iPad 10th/11th gen
    { w: 744, h: 1133, dpr: 2 },  // iPad mini 6/7
    { w: 402, h: 874, dpr: 3 },   // iPhone 16 Pro
    { w: 440, h: 956, dpr: 3 },   // iPhone 16 Pro Max
];

/** 1枚生成する。orientation は 'portrait' | 'landscape'、sourceWidth は元画像の幅 */
async function generate(source, sourceWidth, { w, h, dpr }, orientation) {
    const width = (orientation === 'portrait' ? w : h) * dpr;
    const height = (orientation === 'portrait' ? h : w) * dpr;

    // 元解像度を超えて拡大すると、補間で生じたグラデーションが256色パレットPNGで
    // ディザリングされてファイルが膨らみ、かつ絵柄もぼやけるため、拡大を元画像の幅に制限
    const artworkSize = Math.round(Math.min(Math.min(width, height) * ARTWORK_RATIO, sourceWidth));

    const artwork = await sharp(source)
        .resize(artworkSize, artworkSize, { fit: 'contain', background: BACKGROUND })
        .toBuffer();

    const output = path.join(outDir, `splash-${width}x${height}.png`);
    await sharp({
        create: { width, height, channels: 4, background: BACKGROUND },
    })
        .composite([{ input: artwork, gravity: 'center' }])
        .png({ compressionLevel: 9, palette: true, colors: 256 })
        .toFile(output);

    return path.basename(output);
}

async function main() {
    const source = path.join(publicDir, 'icon-512.png');

    // 元画像の解像度を取得（将来icon-512.pngが差し替えられたときに自動で追従するため）
    const sourceMetadata = await sharp(source).metadata();
    const sourceWidth = sourceMetadata.width;

    await fs.mkdir(outDir, { recursive: true });

    const made = [];
    for (const target of SPLASH_TARGETS) {
        made.push(await generate(source, sourceWidth, target, 'portrait'));
        made.push(await generate(source, sourceWidth, target, 'landscape'));
    }

    console.log(`✅ public/splash/ に ${made.length} 枚生成しました`);
    for (const name of made) console.log(`   ${name}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
