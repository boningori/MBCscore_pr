import { describe, it, expect } from 'vitest';
import { buildComparisonCaption } from './comparisonCaption';

describe('buildComparisonCaption', () => {
    it('自動生成された試合名（記録日で始まる）では日付を重ねない', () => {
        // GameSetup が試合名を空欄のまま作ると「YYYY-MM-DD vs 対戦相手」になる
        const caption = buildComparisonCaption({
            date: new Date(Date.UTC(2026, 7, 23)).toISOString(),
            gameName: '2026-08-23 vs 対戦相手',
            location: '',
        });

        expect(caption).toBe('2026-08-23 vs 対戦相手');
        // formatRecordDate のスラッシュ形式が別途足されていないこと
        expect(caption).not.toContain('2026/08/23');
    });

    it('実際に問題になった文字列で二重にならない', () => {
        const caption = buildComparisonCaption({
            date: '2026-08-23',
            gameName: '2026-08-23 vs ジュニアバスケットボールスポーツ少年団B',
            location: '',
        });

        expect(caption).toBe('2026-08-23 vs ジュニアバスケットボールスポーツ少年団B');
        const dateOccurrences = (caption.match(/2026[-/]08[-/]23/g) ?? []).length;
        expect(dateOccurrences).toBe(1);
    });

    it('利用者が自分で付けた試合名（日付で始まらない）では日付を先頭に付ける', () => {
        const caption = buildComparisonCaption({
            date: new Date(Date.UTC(2026, 5, 5)).toISOString(),
            gameName: '県大会決勝',
            location: '',
        });

        expect(caption).toBe('2026/06/05　県大会決勝');
    });

    it('会場があれば末尾に付ける', () => {
        const caption = buildComparisonCaption({
            date: new Date(Date.UTC(2026, 5, 5)).toISOString(),
            gameName: '第1節',
            location: '市民体育館',
        });

        expect(caption).toBe('2026/06/05　第1節　市民体育館');
    });

    it('会場が無ければ付けない', () => {
        const caption = buildComparisonCaption({
            date: new Date(Date.UTC(2026, 5, 5)).toISOString(),
            gameName: '第1節',
            location: '',
        });

        expect(caption).toBe('2026/06/05　第1節');
    });

    it('試合名が空なら日付のみになる', () => {
        const caption = buildComparisonCaption({
            date: new Date(Date.UTC(2026, 5, 5)).toISOString(),
            gameName: '',
            location: '',
        });

        expect(caption).toBe('2026/06/05');
    });

    it('別の日付で始まる試合名（記録日とは違う暦日）はそのまま日付を先頭に付ける', () => {
        // 手で「2020-01-01 開幕戦」のように付けた場合など、記録日と一致しない
        // 先頭の日付らしき文字列は「自動生成された日付」とみなさない
        const caption = buildComparisonCaption({
            date: new Date(Date.UTC(2026, 5, 5)).toISOString(),
            gameName: '2020-01-01 開幕戦',
            location: '',
        });

        expect(caption).toBe('2026/06/05　2020-01-01 開幕戦');
    });
});
