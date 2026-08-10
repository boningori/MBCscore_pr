import { describe, it, expect } from 'vitest';
import { getDisqualification, isDisqualified } from './disqualification';
import type { FoulType, FoulRecord } from '../types/game';

const P = (): FoulRecord => ({ type: 'P', freeThrows: 0 });
const T = (): FoulRecord => ({ type: 'T', freeThrows: 1 });
const U = (): FoulRecord => ({ type: 'U', freeThrows: 2 });
const D = (): FoulRecord => ({ type: 'D', freeThrows: 2 });

describe('getDisqualification', () => {
    it('ファウルが少なければ退場ではない', () => {
        expect(getDisqualification([P(), P()])).toBeNull();
        expect(isDisqualified([P(), P()])).toBe(false);
    });

    it('5ファウルで退場', () => {
        expect(getDisqualification([P(), P(), P(), P(), P()])).toBe('fiveFouls');
    });

    it('D（ディスクォリファイイング）は1つで即失格', () => {
        expect(getDisqualification([D()])).toBe('disqualifying');
    });

    // FIBA: U+U / T+T / T+U はいずれも失格
    it('アンスポーツマンライク2つで失格', () => {
        expect(getDisqualification([U(), U()])).toBe('twoSevere');
    });

    it('テクニカル2つで失格', () => {
        expect(getDisqualification([T(), T()])).toBe('twoSevere');
    });

    it('テクニカル＋アンスポーツマンライクで失格', () => {
        expect(getDisqualification([T(), U()])).toBe('twoSevere');
    });

    it('U1つだけ、T1つだけでは失格にしない', () => {
        expect(getDisqualification([U()])).toBeNull();
        expect(getDisqualification([T()])).toBeNull();
        expect(getDisqualification([P(), P(), T()])).toBeNull();
    });

    it('Dは5ファウルより優先して理由を返す（重いほうを伝える）', () => {
        expect(getDisqualification([P(), P(), P(), P(), D()])).toBe('disqualifying');
    });

    // 旧データはファウル種別が素の文字列で入っている
    it('レガシー形式（FoulType[]）でも判定できる', () => {
        const legacy: FoulType[] = ['U', 'T'];
        expect(getDisqualification(legacy)).toBe('twoSevere');
        expect(getDisqualification(['P', 'P', 'P', 'P', 'P'])).toBe('fiveFouls');
        expect(getDisqualification(['D'])).toBe('disqualifying');
    });

    it('空配列でも落ちない', () => {
        expect(getDisqualification([])).toBeNull();
    });
});
