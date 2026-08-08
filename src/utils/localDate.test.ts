import { describe, it, expect, afterEach, vi } from 'vitest';
import { formatInputDate, todayInputDate } from './localDate';

afterEach(() => {
    vi.useRealTimers();
});

describe('formatInputDate', () => {
    // toISOString はUTCの日付を返すため、日本(UTC+9)では現地の朝9時前が前日になる。
    // 試合開始が9時のミニバスでは、設定した瞬間の既定日付が丸ごと1日ずれる
    it('現地の午前0時30分は、その日の日付になる', () => {
        expect(formatInputDate(new Date(2026, 7, 8, 0, 30))).toBe('2026-08-08');
    });

    // 逆にUTCより西の地域では、現地の夜が翌日として扱われる
    it('現地の午後11時30分は、その日の日付になる', () => {
        expect(formatInputDate(new Date(2026, 7, 8, 23, 30))).toBe('2026-08-08');
    });

    it('月と日は2桁にそろえる', () => {
        expect(formatInputDate(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05');
    });
});

describe('todayInputDate', () => {
    it('いまの現地日付を返す', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 7, 8, 0, 30));

        expect(todayInputDate()).toBe('2026-08-08');
    });
});
