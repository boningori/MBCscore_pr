import { describe, it, expect } from 'vitest';
import { formatWinRate } from './winRate';

// 勝率は引き分けを分母から外す（勝 ÷ (勝+敗)）。
// 以前は勝 ÷ 全試合だったため、引き分けが増えるほど勝率が下がって見えた。
// チームサマリーは「分」を別枠で出しているのに、勝率にだけ混ざっていた。

describe('formatWinRate', () => {
    it('引き分けを分母に入れない', () => {
        // 2勝2敗2分 → 50%（全6試合で割ると33%）
        expect(formatWinRate({ wins: 2, losses: 2, draws: 2, totalGames: 6 })).toBe('50%');
    });

    it('引き分けが無ければ従来どおり', () => {
        expect(formatWinRate({ wins: 3, losses: 1, draws: 0, totalGames: 4 })).toBe('75%');
    });

    it('全勝は100%', () => {
        expect(formatWinRate({ wins: 4, losses: 0, draws: 0, totalGames: 4 })).toBe('100%');
    });

    // 全部引き分けだと勝率は定義できない。0%と出すと「全敗」に見える
    it('勝敗のついた試合が無ければ「—」', () => {
        expect(formatWinRate({ wins: 0, losses: 0, draws: 3, totalGames: 3 })).toBe('—');
        expect(formatWinRate({ wins: 0, losses: 0, draws: 0, totalGames: 0 })).toBe('—');
    });
});
