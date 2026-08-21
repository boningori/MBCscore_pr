// 長押しで開いた編集・削除メニューでの、端末の戻る操作。
//
// メニューには画面上の「キャンセル」があるのに、戻る操作を受け取っていなかった。
// そのため記録の訂正を開いたままエッジスワイプすると、閉じるどころか記録画面
// ごとホームへ飛ぶ。保留パネル・得点セレクター・ファウルフローと同じ扱いに揃える。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { ActionHistory } from './ActionHistory';
import { closeTopModal, hasOpenModal } from '../Modal/modalStack';
import { createPlayer } from '../../types/game';
import type { ScoreEntry } from '../../types/game';

afterEach(cleanup);

const players = [createPlayer('p1', 4, '選手4')];
const scores: ScoreEntry[] = [{
    id: 's1', teamId: 'teamA', playerId: 'p1', playerNumber: 4,
    scoreType: '2P', points: 2, quarter: 1, timestamp: 1000,
    runningScoreA: 2, runningScoreB: 0,
}];

function renderHistory() {
    render(
        <ActionHistory
            teamId="teamA" teamName="ホーム"
            scoreHistory={scores} statHistory={[]} foulHistory={[]}
            players={players}
            onRemoveScore={vi.fn()} onRemoveStat={vi.fn()} onRemoveFoul={vi.fn()}
            onEditScore={vi.fn()} onEditStat={vi.fn()}
        />
    );
    return screen.getByRole('button', { name: /2P成功/ });
}

/** 長押しの代わりにキー操作でメニューを開く（同じ操作子・同じ state） */
const openMenu = (row: HTMLElement) => fireEvent.keyDown(row, { key: 'Enter' });
const menuIsOpen = () => document.querySelector('.action-menu') !== null;

describe('アクション履歴メニューの戻る操作', () => {
    it('閉じている間は戻る操作を横取りしない（ホームへ抜けられる）', () => {
        renderHistory();

        expect(menuIsOpen()).toBe(false);
        expect(hasOpenModal()).toBe(false);
    });

    it('開いている間は戻る操作を受け取り、閉じるだけで済む', () => {
        const row = renderHistory();
        openMenu(row);
        expect(menuIsOpen()).toBe(true);
        expect(hasOpenModal()).toBe(true);

        act(() => { closeTopModal(); });

        expect(menuIsOpen()).toBe(false);
        // 閉じたあとはもう横取りしない（次の戻るでホームへ抜けられる）
        expect(hasOpenModal()).toBe(false);
        // 記録は消えていない
        expect(screen.getByRole('button', { name: /2P成功/ })).toBeTruthy();
    });

    it('編集ダイアログが開いていれば、そちらが先に閉じる', () => {
        const row = renderHistory();
        openMenu(row);
        fireEvent.click(screen.getByRole('button', { name: '編集' }));
        expect(screen.getByText('記録を編集')).toBeTruthy();

        act(() => { closeTopModal(); });

        expect(screen.queryByText('記録を編集')).toBeNull();
        // 記録画面には留まったまま
        expect(screen.getByRole('button', { name: /2P成功/ })).toBeTruthy();
    });
});
