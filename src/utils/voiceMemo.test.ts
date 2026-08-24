import { describe, it, expect } from 'vitest';
import type { VoiceMemo } from './voiceMemo';
import { appendMemo, applyTranscription, markSending, removeMemo, sortMemos } from './voiceMemo';

const memo = (id: string, createdAt: number): VoiceMemo => ({
    id,
    quarter: 1,
    createdAt,
    status: 'sending',
});

describe('voiceMemo: 発話順の保証', () => {
    it('createdAtの昇順で並ぶ', () => {
        const list = sortMemos([memo('c', 300), memo('a', 100), memo('b', 200)]);
        expect(list.map(m => m.id)).toEqual(['a', 'b', 'c']);
    });

    it('後から追加しても、先に喋ったものが前に来る', () => {
        // 通信状況によっては後の発話が先に返る。並びは応答順ではなく発話順で決める
        let list = appendMemo([], memo('later', 200));
        list = appendMemo(list, memo('earlier', 100));
        expect(list.map(m => m.id)).toEqual(['earlier', 'later']);
    });
});

describe('voiceMemo: 文字起こし結果の反映', () => {
    it('成功したらdoneとテキストが入る', () => {
        const list = applyTranscription([memo('a', 100)], 'a', { success: true, text: '青5シュートミス' });
        expect(list[0].status).toBe('done');
        expect(list[0].text).toBe('青5シュートミス');
        expect(list[0].error).toBeUndefined();
    });

    it('失敗したらfailedと理由が入る', () => {
        const list = applyTranscription([memo('a', 100)], 'a', { success: false, error: '通信エラー' });
        expect(list[0].status).toBe('failed');
        expect(list[0].error).toBe('通信エラー');
    });

    it('該当IDが無ければ何も変えない', () => {
        const before = [memo('a', 100)];
        expect(applyTranscription(before, 'zzz', { success: true, text: 'x' })).toEqual(before);
    });

    it('再送するとfailedからsendingに戻り、前回のエラーが消える', () => {
        const failed = applyTranscription([memo('a', 100)], 'a', { success: false, error: '通信エラー' });
        const retried = markSending(failed, 'a');
        expect(retried[0].status).toBe('sending');
        expect(retried[0].error).toBeUndefined();
    });
});

describe('voiceMemo: 削除', () => {
    it('指定したIDだけ消える', () => {
        const list = removeMemo([memo('a', 100), memo('b', 200)], 'a');
        expect(list.map(m => m.id)).toEqual(['b']);
    });
});
