import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

async function optimizeIcons() {
    const sizes = [192, 512];

    // Read original 512px icon (or largest available)
    const originalPath = path.join(publicDir, 'icon-512.png');

    console.log('📦 Optimizing PWA icons...\n');

    for (const size of sizes) {
        const outputPath = path.join(publicDir, `icon-${size}.png`);
        const originalSize = fs.statSync(originalPath).size;

        await sharp(originalPath)
            .resize(size, size, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .png({
                quality: 80,
                compressionLevel: 9,
                palette: true,
                colors: 256
            })
            .toFile(outputPath + '.tmp');

        // Replace original with optimized
        fs.renameSync(outputPath + '.tmp', outputPath);

        const newSize = fs.statSync(outputPath).size;
        const savings = ((originalSize - newSize) / originalSize * 100).toFixed(1);

        console.log(`✅ icon-${size}.png: ${(originalSize / 1024).toFixed(0)}KB → ${(newSize / 1024).toFixed(0)}KB (${savings}% saved)`);
    }

    console.log('\n🎉 Icon optimization complete!');
}

optimizeIcons().catch(console.error);
