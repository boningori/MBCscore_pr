import { describe, it, expect } from 'vitest';
import { matchesQuery } from './matchesQuery';

// 試合履歴の検索と対戦チーム管理の検索は「同じ振る舞い」と決めてある。
// 規則をここ1か所に置き、両方がこれを呼ぶ（別々に書くと片方だけ直したときに
// 静かにずれ、利用者には「同じ言葉で引いたのに片方だけ出ない」形で見える）。

describe('matchesQuery', () => {
    it('部分一致で引ける（前方一致ではない）', () => {
        expect(matchesQuery('西陵ミニバスケットボールクラブ', 'ミニバス')).toBe(true);
    });

    it('英字の大文字小文字を区別しない', () => {
        expect(matchesQuery('MBC Jr', 'mbc')).toBe(true);
        expect(matchesQuery('mbc jr', 'MBC')).toBe(true);
    });

    it('検索語の前後の空白は落とす', () => {
        expect(matchesQuery('西陵ミニバス', '  西陵  ')).toBe(true);
    });

    it('空の検索語は常に true（絞り込みなし）', () => {
        expect(matchesQuery('西陵ミニバス', '')).toBe(true);
        expect(matchesQuery('西陵ミニバス', '   ')).toBe(true);
        expect(matchesQuery('', '')).toBe(true);
    });

    it('対象が空文字なら、検索語があるとき false', () => {
        expect(matchesQuery('', '西陵')).toBe(false);
    });

    it('含まれない語では false', () => {
        expect(matchesQuery('西陵ミニバス', '東陵')).toBe(false);
    });

    it('全角と半角は同一視しない（履歴の検索と揃えるため）', () => {
        // 入れるなら両方の画面に同時に入れる話。片方だけ賢くするとずれる
        expect(matchesQuery('ＭＢＣ', 'MBC')).toBe(false);
    });
});
