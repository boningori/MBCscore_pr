import { describe, it, expect } from 'vitest';
import { wouldOverflowFoulColumns } from './foulColumns';
import type { FoulType, FoulRecord } from '../types/game';

const p = (n: number): FoulType[] => Array.from({ length: n }, () => 'P' as FoulType);

describe('wouldOverflowFoulColumns', () => {
    it('4個なら次は5個目で、様式の5枠に収まる', () => {
        expect(wouldOverflowFoulColumns(p(4))).toBe(false);
    });

    it('5個なら次は6個目で、5枠に収まらない', () => {
        expect(wouldOverflowFoulColumns(p(5))).toBe(true);
    });

    it('6個以上でも収まらないまま', () => {
        expect(wouldOverflowFoulColumns(p(6))).toBe(true);
    });

    it('記録が無ければ収まる', () => {
        expect(wouldOverflowFoulColumns([])).toBe(false);
        expect(wouldOverflowFoulColumns(undefined)).toBe(false);
    });

    it('失格していても、枠に収まるかどうかは個数だけで決まる', () => {
        // D 1つで失格だが、まだ3個目。様式には収まるので警告の対象外
        const disqualifiedButShort: FoulType[] = ['D', 'P', 'P'];
        expect(wouldOverflowFoulColumns(disqualifiedButShort)).toBe(false);
    });

    it('FoulRecord形式（FT付き）も個数で数える', () => {
        const records: FoulRecord[] = Array.from({ length: 5 }, () => ({ type: 'P', freeThrows: 2 }));
        expect(wouldOverflowFoulColumns(records)).toBe(true);
    });
});
