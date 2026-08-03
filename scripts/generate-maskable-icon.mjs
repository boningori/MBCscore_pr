// maskableアイコンを生成する。
//
// maskable は端末側が任意の形（円・角丸四角・雫型など）に切り抜く前提のアイコンで、
// 中央80%だけが必ず残る「セーフゾーン」として保証される。
// icon-512.png は炎とボールが四辺いっぱいまで描かれているため、そのまま
// purpose:"maskable" として使うとAndroidの円形クロップで絵柄が欠ける。
// 絵柄を80%に縮小し、背景色で余白を足したものを別ファイルとして出力する。
//
// 実行: node scripts/generate-maskable-icon.mjs

import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const SIZE = 512;
// セーフゾーン（中央80%）に収める
const ARTWORK_RATIO = 0.8;
// icon-512.png の四隅と揃えた背景色。manifestのbackground_color(#0f172a)と同系。
const BACKGROUND = { r: 15, g: 25, b: 47, alpha: 1 };

async function generateMaskableIcon() {
    const source = path.join(publicDir, 'icon-512.png');
    const output = path.join(publicDir, 'icon-512-maskable.png');
    const artworkSize = Math.round(SIZE * ARTWORK_RATIO);

    const artwork = await sharp(source)
        .resize(artworkSize, artworkSize, { fit: 'contain', background: BACKGROUND })
        .toBuffer();

    await sharp({
        create: { width: SIZE, height: SIZE, channels: 4, background: BACKGROUND },
    })
        .composite([{ input: artwork, gravity: 'center' }])
        .png({ compressionLevel: 9, palette: true, colors: 256 })
        .toFile(output);

    console.log(`✅ icon-512-maskable.png を生成しました（絵柄 ${artworkSize}px / 全体 ${SIZE}px）`);
}

generateMaskableIcon().catch(error => {
    console.error(error);
    process.exit(1);
});
