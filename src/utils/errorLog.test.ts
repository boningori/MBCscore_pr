import { describe, it, expect, beforeEach } from 'vitest';
import { logError, getErrorLog, clearErrorLog, formatErrorLog } from './errorLog';

describe('errorLog', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('logErrorで新しいエントリが先頭に追加される', () => {
        logError('window', '1つ目');
        logError('react', '2つ目', 'Error: stack\n  at foo');
        const log = getErrorLog();
        expect(log).toHaveLength(2);
        expect(log[0].message).toBe('2つ目');
        expect(log[0].source).toBe('react');
        expect(log[0].stack).toContain('at foo');
    });

    it('50件を超えると古いエントリが捨てられる', () => {
        for (let i = 1; i <= 55; i++) {
            logError('window', `エラー${i}`);
        }
        const log = getErrorLog();
        expect(log).toHaveLength(50);
        expect(log[0].message).toBe('エラー55');
        expect(log[49].message).toBe('エラー6');
    });

    it('clearErrorLogで空になる', () => {
        logError('window', 'x');
        clearErrorLog();
        expect(getErrorLog()).toHaveLength(0);
    });

    it('formatErrorLogにバージョンとメッセージが含まれる', () => {
        logError('promise', '失敗しました');
        const text = formatErrorLog();
        expect(text).toContain('MBCscore エラーレポート');
        expect(text).toContain('失敗しました');
    });

    it('壊れたログデータがあっても例外を出さない', () => {
        localStorage.setItem('mbc_error_log', 'こわれたJSON');
        expect(getErrorLog()).toEqual([]);
        expect(() => logError('window', 'x')).not.toThrow();
    });
});
