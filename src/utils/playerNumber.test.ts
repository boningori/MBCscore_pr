import { describe, it, expect } from 'vitest';
import {
    DOUBLE_ZERO_INTERNAL,
    formatPlayerNumber,
    parsePlayerNumber,
    isValidPlayerNumber,
    comparePlayerNumbers,
    sortPlayersByNumber,
} from './playerNumber';

describe('playerNumber', () => {
    it('formatPlayerNumber: 100は"00"、それ以外はそのまま文字列化する', () => {
        expect(formatPlayerNumber(DOUBLE_ZERO_INTERNAL)).toBe('00');
        expect(formatPlayerNumber(0)).toBe('0');
        expect(formatPlayerNumber(23)).toBe('23');
    });

    it('parsePlayerNumber: "00"は100、"0"は0、範囲外・非数値はnull', () => {
        expect(parsePlayerNumber('00')).toBe(DOUBLE_ZERO_INTERNAL);
        expect(parsePlayerNumber('0')).toBe(0);
        expect(parsePlayerNumber(' 15 ')).toBe(15);
        expect(parsePlayerNumber('100')).toBeNull();
        expect(parsePlayerNumber('-1')).toBeNull();
        expect(parsePlayerNumber('abc')).toBeNull();
    });

    it('isValidPlayerNumber: 0-99と100(=00)のみ有効', () => {
        expect(isValidPlayerNumber(0)).toBe(true);
        expect(isValidPlayerNumber(99)).toBe(true);
        expect(isValidPlayerNumber(DOUBLE_ZERO_INTERNAL)).toBe(true);
        expect(isValidPlayerNumber(101)).toBe(false);
        expect(isValidPlayerNumber(-1)).toBe(false);
    });

    it('comparePlayerNumbers: 00(100)は必ず最後に来る', () => {
        expect(comparePlayerNumbers(DOUBLE_ZERO_INTERNAL, 99)).toBeGreaterThan(0);
        expect(comparePlayerNumbers(5, DOUBLE_ZERO_INTERNAL)).toBeLessThan(0);
        expect(comparePlayerNumbers(4, 7)).toBeLessThan(0);
    });

    it('sortPlayersByNumber: 0,1,...,99,00の順にソートし元配列は変更しない', () => {
        const players = [
            { number: DOUBLE_ZERO_INTERNAL },
            { number: 7 },
            { number: 0 },
        ];
        const sorted = sortPlayersByNumber(players);
        expect(sorted.map(p => p.number)).toEqual([0, 7, DOUBLE_ZERO_INTERNAL]);
        expect(players.map(p => p.number)).toEqual([DOUBLE_ZERO_INTERNAL, 7, 0]);
    });
});
