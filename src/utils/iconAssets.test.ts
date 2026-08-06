import { describe, it, expect } from 'vitest';
import { statSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// PWAアイコンは manifest とSWのprecacheの両方に載るため、インストール時に必ず
// ダウンロードされる。体育館の回線で最初に払うコストなので上限を決めておく。
//
// icon-512.png は一時期 396KB あった。同じ512pxの maskable が72KBだったので
// 5.5倍で、パレット量子化（scripts/optimize-icons.mjs）が当たっていなかった。
// 見た目を保ったまま十分下げられるため、戻ったら気づけるようにする。
const PUBLIC_DIR = resolve(process.cwd(), 'public');

const BUDGET_KB: Record<string, number> = {
    'icon-192.png': 80,
    'icon-512.png': 120,
    'icon-512-maskable.png': 120,
};

describe('PWAアイコンの容量', () => {
    for (const [file, limitKb] of Object.entries(BUDGET_KB)) {
        it(`${file} は ${limitKb}KB 以内`, () => {
            const path = resolve(PUBLIC_DIR, file);
            expect(existsSync(path)).toBe(true);
            expect(statSync(path).size / 1024).toBeLessThanOrEqual(limitKb);
        });
    }
});
