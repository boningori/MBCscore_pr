import { describe, it, expect } from 'vitest';
import { quarterLabel } from './quarterLabel';

describe('ピリオド表示', () => {
    it('通常クォーターは Q1〜Q4', () => {
        expect([1, 2, 3, 4].map(quarterLabel)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    });

    // 1回しか無いのが普通なので、最初の延長には番号を付けない
    it('最初の延長は OT', () => {
        expect(quarterLabel(5)).toBe('OT');
    });

    it('2回目以降の延長は OT2, OT3', () => {
        expect(quarterLabel(6)).toBe('OT2');
        expect(quarterLabel(7)).toBe('OT3');
    });
});
