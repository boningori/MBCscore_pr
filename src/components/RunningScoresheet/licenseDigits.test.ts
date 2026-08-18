// 様式のライセンスNo.欄（3マス）への割り当て。
//
// 右詰めの意図で raw.padStart(3, '') と書かれていたが、パッド文字が空文字だと
// padStart は何もしない。2桁以下は左詰めで印字され、一の位が真ん中のマスに
// 入っていた（「下3桁」なので一の位は右端に来るべき）。

import { describe, it, expect } from 'vitest';
import { licenseDigits } from './licenseDigits';

describe('licenseDigits', () => {
    it('3桁はそのまま1マスずつ入る', () => {
        expect(licenseDigits('123')).toEqual(['1', '2', '3']);
    });

    it('3桁を超えるときは下3桁を使う', () => {
        expect(licenseDigits('JBA1234567')).toEqual(['5', '6', '7']);
    });

    it('2桁は右詰め（一の位が右端）', () => {
        expect(licenseDigits('12')).toEqual(['', '1', '2']);
    });

    it('1桁は右端だけに入る', () => {
        expect(licenseDigits('7')).toEqual(['', '', '7']);
    });

    it('未入力・undefined は3マスとも空', () => {
        expect(licenseDigits('')).toEqual(['', '', '']);
        expect(licenseDigits(undefined)).toEqual(['', '', '']);
    });

    it('常に3マス分を返す', () => {
        for (const value of ['', '1', '12', '123', '12345', undefined]) {
            expect(licenseDigits(value)).toHaveLength(3);
        }
    });
});
