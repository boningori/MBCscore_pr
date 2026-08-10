import { describe, it, expect, afterEach, vi } from 'vitest';
import {
    formatInputDate,
    todayInputDate,
    recordDateParts,
    formatRecordDate,
    formatRecordDateShort,
    recordInputDate,
    startOfInputDateUtc,
    endOfInputDateUtc,
} from './localDate';

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

// 試合日は <input type="date"> の 'YYYY-MM-DD' を new Date() に通して保存するため、
// 記録の中では必ず「その暦日のUTC0時」になっている。
// これを現地ゲッター（getMonth/getDate）で読み戻すと、UTCより西の地域では
// 前日として表示される。読み取りは記録された暦日をそのまま取り出す。
describe('recordDateParts', () => {
    it('保存されたISO文字列から暦日を取り出す', () => {
        expect(recordDateParts('2026-06-05T00:00:00.000Z')).toEqual({ year: 2026, month: 6, day: 5 });
    });

    // 現地時刻に変換してから読むと、この入力は端末のタイムゾーン次第で翌日になる。
    // 記録された暦日は文字列に書いてあるので、そちらを信じる
    it('端末のタイムゾーンによって日付が動かない', () => {
        expect(recordDateParts('2026-06-05T23:30:00.000Z')).toEqual({ year: 2026, month: 6, day: 5 });
        expect(recordDateParts('2026-06-05T00:30:00.000Z')).toEqual({ year: 2026, month: 6, day: 5 });
    });

    it('日付だけの文字列も読める', () => {
        expect(recordDateParts('2026-06-05')).toEqual({ year: 2026, month: 6, day: 5 });
    });

    it('読めない値は null', () => {
        expect(recordDateParts('')).toBeNull();
        expect(recordDateParts('not a date')).toBeNull();
    });
});

describe('formatRecordDate / formatRecordDateShort / recordInputDate', () => {
    it('表示用に整形する', () => {
        expect(formatRecordDate('2026-06-05T23:30:00.000Z')).toBe('2026/06/05');
        expect(formatRecordDateShort('2026-06-05T23:30:00.000Z')).toBe('6/5');
        expect(recordInputDate('2026-06-05T23:30:00.000Z')).toBe('2026-06-05');
    });

    it('読めない値は空文字（画面に Invalid Date を出さない）', () => {
        expect(formatRecordDate('こわれた値')).toBe('');
        expect(formatRecordDateShort('こわれた値')).toBe('');
        expect(recordInputDate('こわれた値')).toBe('');
    });
});

// 期間の絞り込みも、記録側と同じUTC基準でそろえないと境界の1日がずれる。
// 以前は開始日がUTC・終了日が現地と混在していた
describe('startOfInputDateUtc / endOfInputDateUtc', () => {
    it('開始日はその日のUTC0時', () => {
        expect(startOfInputDateUtc('2026-06-05')?.toISOString()).toBe('2026-06-05T00:00:00.000Z');
    });

    it('終了日はその日のUTC末尾（同じ日の試合を取りこぼさない）', () => {
        expect(endOfInputDateUtc('2026-06-05')?.toISOString()).toBe('2026-06-05T23:59:59.999Z');
    });

    it('終了日の翌日は入らない', () => {
        const end = endOfInputDateUtc('2026-06-05')!;
        expect(new Date('2026-06-06T00:00:00.000Z') > end).toBe(true);
    });

    it('空文字は undefined（絞り込みなし）', () => {
        expect(startOfInputDateUtc('')).toBeUndefined();
        expect(endOfInputDateUtc('')).toBeUndefined();
    });
});
