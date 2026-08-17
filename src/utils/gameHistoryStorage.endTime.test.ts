// 試合終了時間は履歴に残す。
//
// 公式様式の「試合終了時間」欄は GameInfoModal から入力でき、試合中の
// スコアシートには出る。ところが GameRecord に持ち場が無かったため、
// 保存した瞬間に消えていた。履歴から開いたスコアシートは代わりに
// createdAt（保存ボタンを押した時刻）を出すので、同じ試合なのに
// 試合中に出したPDFと履歴から出したPDFで終了時間が食い違っていた。

import { describe, it, expect, beforeEach } from 'vitest';
import { saveGameResult, loadGameRecord, updateGameRecordEndTime } from './gameHistoryStorage';
import { createTeam, createInitialGameInfo } from '../types/game';

beforeEach(() => {
    localStorage.clear();
});

const save = (endTime: Date | null) =>
    saveGameResult(
        '大会',
        createTeam('teamA', 'A', 'コーチ'),
        createTeam('teamB', 'B', 'コーチ'),
        [], [], [],
        new Date('2026-08-17'),
        createInitialGameInfo(),
        [],
        { endTime },
    );

describe('試合終了時間の保存', () => {
    it('保存した試合終了時間が履歴から読み出せる', () => {
        const endTime = new Date('2026-08-17T11:45:00');
        const { record } = save(endTime);

        const loaded = loadGameRecord(record.id);
        expect(loaded?.endTime).toBe(endTime.toISOString());
    });

    it('終了時間が無い試合はフィールドを持たない（旧データと同じ形）', () => {
        const { record } = save(null);
        expect('endTime' in record).toBe(false);
    });

    it('保存後に終了時間だけを差し替えられる', () => {
        const { record } = save(new Date('2026-08-17T11:45:00'));

        const updated = new Date('2026-08-17T12:03:00');
        updateGameRecordEndTime(record.id, updated);

        expect(loadGameRecord(record.id)?.endTime).toBe(updated.toISOString());
    });
});
