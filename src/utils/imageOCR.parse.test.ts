import { describe, it, expect } from 'vitest';
import { parseOcrText } from './imageOCR';
import { DOUBLE_ZERO_INTERNAL } from './playerNumber';

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

// 背番号 00 は 0 とは別の正規の番号で、アプリ内部では DOUBLE_ZERO_INTERNAL(100)
// で表す（playerNumber.ts）。OCR だけ parseInt('00') = 0 として取り込んでおり、
// 名簿写真に 00 がいると別番号の選手として登録されていた。
describe('parseOcrText: 背番号00', () => {
    it('00 は 0 ではなく 00 として取り込む', () => {
        expect(parseOcrText('00 田中太郎')).toEqual([
            { number: DOUBLE_ZERO_INTERNAL, name: '田中太郎', isCaptain: false },
        ]);
    });

    it('0 は従来どおり 0 のまま', () => {
        expect(parseOcrText('0 佐藤')).toEqual([
            { number: 0, name: '佐藤', isCaptain: false },
        ]);
    });

    it('接頭辞付きの 00 も拾う', () => {
        expect(parseOcrText('No.00 鈴木')).toEqual([
            { number: DOUBLE_ZERO_INTERNAL, name: '鈴木', isCaptain: false },
        ]);
    });
});
