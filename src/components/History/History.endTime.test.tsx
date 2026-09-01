// 履歴から開いたスコアシートの「試合終了時間」。
//
// 保存された endTime を出す（無い旧レコードだけ createdAt に落とす）。
// また、ここで編集した値が保存されるようにする。以前は onEndTimeChange を
// 渡していなかったため、入力欄は普通に編集でき「保存」も押せて閉じるのに、
// 値がどこにも行かない無言の失敗になっていた。

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { History } from './History';

vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

const CREATED_AT = new Date('2026-06-05T15:30:00').toISOString();

function seed(endTime?: string, createdAt: string | null = CREATED_AT) {
    const team = (name: string) => ({
        id: name, name, coachName: 'C', assistantCoachName: '',
        players: [], timeouts: [], teamFouls: [0, 0, 0, 0],
        coachFouls: [], assistantCoachFouls: [], benchFouls: [], color: 'white',
    });
    localStorage.setItem('minibasket-game-history', JSON.stringify([{
        id: 'g1', date: new Date(Date.UTC(2026, 5, 5)).toISOString(), gameName: '第1節',
        teamA: team('レッドミニバス'), teamB: team('ブルーミニバス'),
        finalScore: { teamA: 30, teamB: 20 },
        scoreHistory: [], statHistory: [], foulHistory: [],
        ...(endTime ? { endTime } : {}),
        ...(createdAt ? { createdAt } : {}),
    }]));
}

function openScoresheet() {
    render(<History onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /第1節/ }));
    fireEvent.click(screen.getByRole('button', { name: 'スコアシート（保存/PDF）' }));
}

const shownEndTime = () =>
    document.querySelector('.rs-game-end-time .rs-result-value')?.textContent;

const storedEndTime = () =>
    JSON.parse(localStorage.getItem('minibasket-game-history') ?? '[]')[0]?.endTime;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('履歴のスコアシート: 試合終了時間', () => {
    it('保存された終了時間を出す', () => {
        seed(new Date('2026-06-05T11:45:00').toISOString());
        openScoresheet();

        expect(shownEndTime()).toBe('11:45');
    });

    it('終了時間を持たない旧レコードは保存時刻で代用する', () => {
        seed();
        openScoresheet();

        expect(shownEndTime()).toBe('15:30');
    });

    // 終了時間も保存時刻も読めないレコード（手で編集した／途中で切れたバックアップ）。
    //
    // recordToGame は endTime を持たないレコードで `new Date(record.createdAt)` に
    // 落とすため、createdAt が無いと Invalid Date になる。様式側はそれを truthy と
    // 見て getHours() するので、公式様式の欄に「NaN:NaN」が印字されていた
    // （実測(v1.6.14・実ブラウザ)。PDF/JPEG出力にもそのまま乗る）。
    // 日付の表示は formatRecordDate が「読めなければ空文字」を守っているのに、
    // 時刻の表示にだけ同じ守りが無かった。
    it('終了時間も保存時刻も読めなければ空欄にする（NaN:NaN を出さない）', () => {
        seed(undefined, null);
        openScoresheet();

        expect(shownEndTime()).toBe('');
    });

    it('保存された終了時間が読めない値でも空欄にする', () => {
        seed('not-a-date', null);
        openScoresheet();

        expect(shownEndTime()).toBe('');
    });

    // 読めない終了時間を持つレコードでも、入力し直せば直せること。
    //
    // 保存は既存の endTime を日付の土台にして setHours する。読めない値をその
    // まま土台にすると setHours しても Invalid Date のままなので、入力欄には
    // 12:03 と打てて「保存」も押せるのに、保存されるのは Invalid Date になる
    // ——「NaN:NaN」を直そうとした操作が直せない、という行き止まりになる。
    it('読めない終了時間でも、入力し直せば保存できる', () => {
        seed('not-a-date', null);
        openScoresheet();

        fireEvent.click(screen.getByRole('button', { name: '試合情報編集' }));
        fireEvent.change(screen.getByLabelText('終了時間'), { target: { value: '12:03' } });
        fireEvent.click(screen.getByRole('button', { name: '保存' }));

        expect(shownEndTime()).toBe('12:03');
        expect(Number.isNaN(new Date(storedEndTime()).getTime())).toBe(false);
    });

    it('編集した終了時間が履歴に保存される', () => {
        seed(new Date('2026-06-05T11:45:00').toISOString());
        openScoresheet();

        fireEvent.click(screen.getByRole('button', { name: '試合情報編集' }));
        fireEvent.change(screen.getByLabelText('終了時間'), { target: { value: '12:03' } });
        fireEvent.click(screen.getByRole('button', { name: '保存' }));

        expect(new Date(storedEndTime()).getHours()).toBe(12);
        expect(new Date(storedEndTime()).getMinutes()).toBe(3);
        expect(shownEndTime()).toBe('12:03');
    });
});
