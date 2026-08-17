// アクション履歴の編集・削除がキーボードから使えなかった。
//
// 各行は div で、ポインタの長押し（500ms）でしかメニューが開かない。
// role も tabIndex も onKeyDown も無いため、記録の訂正という重要操作が
// キーボード・支援技術から完全に閉じていた。
// 長押しできること自体もどこにも書いていない。
//
// 長押しの分岐は残す（一覧をスクロールするだけで開いてしまうのを避けるため）。
// FoulInputFlow のPファウルと同じく、同じ操作子へキー操作を足す。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react';
import { ActionHistory } from './ActionHistory';
import { createPlayer } from '../../types/game';
import type { ScoreEntry } from '../../types/game';

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

const players = [createPlayer('p1', 4, '選手4')];
const scores: ScoreEntry[] = [{
    id: 's1', teamId: 'teamA', playerId: 'p1', playerNumber: 4,
    scoreType: '2P', points: 2, quarter: 1, timestamp: 1000,
    runningScoreA: 2, runningScoreB: 0,
}];

function renderHistory() {
    const onRemoveScore = vi.fn();
    render(
        <ActionHistory
            teamId="teamA" teamName="ホーム"
            scoreHistory={scores} statHistory={[]} foulHistory={[]}
            players={players}
            onRemoveScore={onRemoveScore} onRemoveStat={vi.fn()} onRemoveFoul={vi.fn()}
            onEditScore={vi.fn()} onEditStat={vi.fn()}
        />
    );
    return { onRemoveScore, row: screen.getByRole('button', { name: /2P成功/ }) };
}

const menuOf = (row: HTMLElement) =>
    row.closest('.history-item')?.querySelector('.action-menu') as HTMLElement | null;

describe('アクション履歴のキーボード操作', () => {
    it('各行はキーボードで到達できるボタンになっている', () => {
        const { row } = renderHistory();

        expect(row.tagName).toBe('BUTTON');
        expect(row.getAttribute('aria-expanded')).toBe('false');
    });

    it('Enterで編集・削除メニューが開く', () => {
        const { row } = renderHistory();

        fireEvent.keyDown(row, { key: 'Enter' });

        expect(menuOf(row)).toBeTruthy();
        expect(row.getAttribute('aria-expanded')).toBe('true');
    });

    it('Spaceでも開く', () => {
        const { row } = renderHistory();

        fireEvent.keyDown(row, { key: ' ' });

        expect(menuOf(row)).toBeTruthy();
    });

    it('開いたメニューの削除をキーボードから実行できる', () => {
        const { row, onRemoveScore } = renderHistory();
        fireEvent.keyDown(row, { key: 'Enter' });

        fireEvent.click(within(menuOf(row)!).getByRole('button', { name: '削除' }));

        expect(onRemoveScore).toHaveBeenCalledWith('s1');
    });

    // 押しっぱなしのキーリピートでメニューが開閉を繰り返さないようにする
    it('キーリピートは無視する', () => {
        const { row } = renderHistory();

        fireEvent.keyDown(row, { key: 'Enter', repeat: true });

        expect(menuOf(row)).toBeNull();
    });

    it('長押しでは従来どおり開く', () => {
        vi.useFakeTimers();
        const { row } = renderHistory();

        fireEvent.mouseDown(row);
        act(() => { vi.advanceTimersByTime(500); });

        expect(menuOf(row)).toBeTruthy();
    });

    it('短く押しただけでは開かない（一覧のスクロールで開かせない）', () => {
        vi.useFakeTimers();
        const { row } = renderHistory();

        fireEvent.mouseDown(row);
        act(() => { vi.advanceTimersByTime(200); });
        fireEvent.mouseUp(row);
        act(() => { vi.advanceTimersByTime(500); });

        expect(menuOf(row)).toBeNull();
    });

    it('長押しで編集・削除できることを画面に書いておく', () => {
        renderHistory();

        expect(screen.getByText(/長押し/)).toBeTruthy();
    });
});
