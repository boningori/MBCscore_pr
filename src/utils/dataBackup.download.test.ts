// ダウンロード経路の後始末のタイミング。
//
// downloadBlob は createObjectURL → a.click() → revokeObjectURL を1つの同期区間で
// 続けて走らせていた。仕様上 revoke されたURLはその場で無効になるため、クリックを
// 受けたブラウザが実際にBlobを読み始める前に取り上げてしまう余地がある。
// 全体バックアップは数MBになることがあり、そこが一番効くのに、失敗しても
// downloadBlob には気づく手段が無い（a[download] は成否を返さない）。
//
// 「クリックと同じタスクでは破棄しない」ことだけを固定する。何ms待つかは実装の
// 都合なので見ない。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { downloadCSV, downloadJSON } from './dataBackup';

let order: string[];
let originalCreate: typeof URL.createObjectURL;
let originalRevoke: typeof URL.revokeObjectURL;

beforeEach(() => {
    vi.useFakeTimers();
    order = [];

    originalCreate = URL.createObjectURL;
    originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:mock';
    URL.revokeObjectURL = () => { order.push('revoke'); };

    const createEl = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = createEl(tag);
        if (tag === 'a') el.click = () => { order.push('click'); };
        return el as HTMLElement;
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
});

describe('ダウンロードのObjectURLの解放', () => {
    it('JSONのダウンロードは、クリックと同じタスクでは破棄しない', () => {
        downloadJSON({ hello: 'world' }, 'backup.json');

        expect(order).toEqual(['click']);

        vi.runAllTimers();
        expect(order).toEqual(['click', 'revoke']);
    });

    it('CSVのダウンロードも同じ扱いにする', () => {
        downloadCSV('a,b\n1,2\n', 'history.csv');

        expect(order).toEqual(['click']);

        vi.runAllTimers();
        expect(order).toEqual(['click', 'revoke']);
    });

    it('クリック後にアンカーはDOMに残さない（解放を遅らせても掃除はその場で済ませる）', () => {
        downloadJSON({ hello: 'world' }, 'backup.json');

        expect(document.querySelectorAll('a[download]')).toHaveLength(0);
    });
});
