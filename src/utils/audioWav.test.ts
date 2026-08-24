import { describe, it, expect } from 'vitest';
import { encodeWavBuffer } from './audioWav';

// WAVヘッダを読むための小さなヘルパ
const readAscii = (view: DataView, offset: number, length: number) =>
    Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join('');

describe('audioWav: WAVヘッダ', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const buffer = encodeWavBuffer(samples, 16000);
    const view = new DataView(buffer);

    it('RIFF/WAVEコンテナである', () => {
        expect(readAscii(view, 0, 4)).toBe('RIFF');
        expect(readAscii(view, 8, 4)).toBe('WAVE');
        expect(readAscii(view, 12, 4)).toBe('fmt ');
        expect(readAscii(view, 36, 4)).toBe('data');
    });

    it('16bit PCM・モノラル・16kHzである', () => {
        expect(view.getUint16(20, true)).toBe(1);      // フォーマット: PCM
        expect(view.getUint16(22, true)).toBe(1);      // チャンネル数: モノラル
        expect(view.getUint32(24, true)).toBe(16000);  // サンプリングレート
        expect(view.getUint32(28, true)).toBe(32000);  // バイト/秒 = 16000 * 2
        expect(view.getUint16(32, true)).toBe(2);      // ブロックアライン
        expect(view.getUint16(34, true)).toBe(16);     // ビット深度
    });

    it('サイズがサンプル数と一致する', () => {
        expect(buffer.byteLength).toBe(44 + samples.length * 2);
        expect(view.getUint32(4, true)).toBe(36 + samples.length * 2);
        expect(view.getUint32(40, true)).toBe(samples.length * 2);
    });
});

describe('audioWav: サンプル値の変換', () => {
    it('無音は0になる', () => {
        const view = new DataView(encodeWavBuffer(new Float32Array([0]), 16000));
        expect(view.getInt16(44, true)).toBe(0);
    });

    it('振幅の上下限が飽和せず範囲内に収まる', () => {
        const view = new DataView(encodeWavBuffer(new Float32Array([1, -1]), 16000));
        expect(view.getInt16(44, true)).toBe(32767);
        expect(view.getInt16(46, true)).toBe(-32768);
    });

    it('範囲外の値はクリップする', () => {
        // 音割れした入力で int16 が巻き戻って轟音になるのを防ぐ
        const view = new DataView(encodeWavBuffer(new Float32Array([2, -2]), 16000));
        expect(view.getInt16(44, true)).toBe(32767);
        expect(view.getInt16(46, true)).toBe(-32768);
    });
});
