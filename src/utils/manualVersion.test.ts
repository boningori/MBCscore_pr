import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 使用説明書は public/ に置く静的HTMLで、ビルド時の __APP_VERSION__ を埋められない。
// そのため版数は手書きになり、放っておくと実際に食い違う（アプリが v1.3.10 の
// 時点で説明書は "Version 1.1.0" のままだった）。
//
// パッチ版のたびに書き換えるのは現実的でないので、揃えるのはマイナーまでにする。
// 画面や操作が変わるのはマイナー更新のときで、説明書を見直すべきなのもそこ。
const root = process.cwd();
const manual = readFileSync(resolve(root, 'public/manual.html'), 'utf8');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string };

const [major, minor] = pkg.version.split('.');
const expectedLabel = `v${major}.${minor}`;

describe('使用説明書', () => {
    it('版数の表記がアプリのマイナーバージョンと一致する', () => {
        const labels = [...manual.matchAll(/v(\d+)\.(\d+)\s*対応/g)].map(m => `v${m[1]}.${m[2]}`);
        expect(labels.length).toBeGreaterThan(0);
        expect([...new Set(labels)]).toEqual([expectedLabel]);
    });

    it('古い "Version x.y.z" 形式が残っていない', () => {
        // パッチまで書くと毎リリース手直しが要る。マイナーまでの表記に一本化する
        expect(/Version\s+\d+\.\d+\.\d+/.test(manual)).toBe(false);
    });

    it('アプリへ戻る導線がある（standaloneでは他に戻る手段が無い）', () => {
        // 配置パスが変わっても壊れないよう相対リンクにしてある
        expect(/<a[^>]*class="back-btn[^"]*"[^>]*href="\.\/"/.test(manual)).toBe(true);
    });

    it('戻る導線と印刷ボタンは印刷物に出さない', () => {
        for (const cls of ['back-btn', 'print-btn']) {
            const tag = manual.match(new RegExp(`<(?:a|button)[^>]*class="${cls}[^"]*"`));
            expect(tag?.[0]).toContain('no-print');
        }
    });
});
