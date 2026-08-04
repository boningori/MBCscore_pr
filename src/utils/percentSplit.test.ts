import { describe, it, expect } from 'vitest';
import { splitPercent } from './percentSplit';

// 内訳を「割合＋残り」で見せる箇所で、両方を独立に丸めると合計が100%にならない。
// 例: OFF 13 / DEF 27 / 計40 では 32.5%→33%、67.5%→68% で合計101%になっていた。

describe('splitPercent', () => {
    it('合計は常に100になる', () => {
        for (let total = 1; total <= 60; total++) {
            for (let part = 0; part <= total; part++) {
                const { part: p, rest } = splitPercent(part, total);
                expect(p + rest).toBe(100);
            }
        }
    });

    it('101%になっていた実例（13/40）を正しく割る', () => {
        expect(splitPercent(13, 40)).toEqual({ part: 33, rest: 67 });
    });

    it('端数のない場合はそのまま', () => {
        expect(splitPercent(1, 4)).toEqual({ part: 25, rest: 75 });
        expect(splitPercent(1, 2)).toEqual({ part: 50, rest: 50 });
    });

    it('全部・ゼロを扱える', () => {
        expect(splitPercent(0, 10)).toEqual({ part: 0, rest: 100 });
        expect(splitPercent(10, 10)).toEqual({ part: 100, rest: 0 });
    });

    it('母数0では0%扱いにする（0除算を出さない）', () => {
        expect(splitPercent(0, 0)).toEqual({ part: 0, rest: 0 });
    });
});
