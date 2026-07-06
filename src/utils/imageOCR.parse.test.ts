import { describe, it, expect } from 'vitest';
import { parseOcrText } from './imageOCR';

describe('parseOcrText: 番号+名前の抽出', () => {
    it('半角数字＋スペース区切りの行を抽出する', () => {
        expect(parseOcrText('4 田中太郎')).toEqual([
            { number: 4, name: '田中太郎', isCaptain: false },
        ]);
    });

    it('全角数字・全角スペースを正規化して抽出する', () => {
        expect(parseOcrText('４　佐藤花子')).toEqual([
            { number: 5 - 1, name: '佐藤花子', isCaptain: false },
        ]);
    });

    it('「No.」接頭辞を除去して背番号を抽出する', () => {
        expect(parseOcrText('No.7 SUZUKI')).toEqual([
            { number: 7, name: 'SUZUKI', isCaptain: false },
        ]);
    });

    it('「#」接頭辞にも対応する', () => {
        expect(parseOcrText('#12 山田')).toEqual([
            { number: 12, name: '山田', isCaptain: false },
        ]);
    });

    it('番号と名前の間に区切りが無くても抽出する（4田中）', () => {
        expect(parseOcrText('5田中')).toEqual([
            { number: 5, name: '田中', isCaptain: false },
        ]);
    });

    it('番号なしの見出し行は無視する', () => {
        expect(parseOcrText('メンバー表')).toEqual([]);
    });

    it('年号など100以上の数字始まりは選手として拾わない', () => {
        expect(parseOcrText('2024年度チーム')).toEqual([]);
    });

    it('複数行を順に抽出する', () => {
        const result = parseOcrText('4 田中\n5 佐藤\nゴミ行\n6 鈴木');
        expect(result.map(p => p.number)).toEqual([4, 5, 6]);
        expect(result.map(p => p.name)).toEqual(['田中', '佐藤', '鈴木']);
    });
});
