import { describe, it, expect } from 'vitest';
import { sanitizeFilename } from './pdfExport';

describe('sanitizeFilename', () => {
    it('ファイル名に使えない記号をすべて _ に置き換える', () => {
        // OS/ファイルシステムの予約文字を1文字ずつ含めて確認する
        expect(sanitizeFilename('6/5 練習試合')).toBe('6_5 練習試合');
        expect(sanitizeFilename('a\\b')).toBe('a_b');
        expect(sanitizeFilename('12:30開始')).toBe('12_30開始');
        expect(sanitizeFilename('3*4')).toBe('3_4');
        expect(sanitizeFilename('本当?')).toBe('本当_');
        expect(sanitizeFilename('"引用"')).toBe('_引用_');
        expect(sanitizeFilename('A<B>C')).toBe('A_B_C');
        expect(sanitizeFilename('a|b')).toBe('a_b');
    });

    it('複数の禁止文字が混在していてもすべて置き換える', () => {
        expect(sanitizeFilename('6/5 練習試合: A vs B?')).toBe('6_5 練習試合_ A vs B_');
    });

    it('禁止文字を含まない文字列はそのまま返す', () => {
        expect(sanitizeFilename('県大会決勝')).toBe('県大会決勝');
    });
});
