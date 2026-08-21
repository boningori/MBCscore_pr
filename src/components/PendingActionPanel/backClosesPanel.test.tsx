// 保留パネルを開いている間の、端末の戻る操作。
//
// 展開中のパネルは下の操作を覆っていて、外側タップで閉じる作りなのに
// modalStack へ登録していなかった。そのため保留の選手を選んでいる途中で
// エッジスワイプすると、パネルが閉じるどころか記録画面ごとホームへ飛ぶ
// （実測）。記録自体は自動保存で残るが、試合中に「試合を再開」を押し直す
// ことになる。得点セレクター・ファウルフロー・スコアシート・スタッツ詳細と
// 同じ扱いに揃える。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { PendingActionPanel } from './PendingActionPanel';
import { closeTopModal, hasOpenModal } from '../Modal/modalStack';
import { createPendingAction } from '../../types/pendingAction';

const pending = () => [
    createPendingAction('SCORE', '2P', 'teamA', 1, [
        { id: 'p4', number: 4, name: '山田', courtName: '' },
        { id: 'p5', number: 5, name: '鈴木', courtName: '' },
    ]),
];

function renderPanel() {
    render(
        <PendingActionPanel
            pendingActions={pending()}
            onResolveUnknown={vi.fn()}
            onRemove={vi.fn()}
            onDirectResolve={vi.fn()}
        />,
    );
}

const openPanel = () => fireEvent.click(screen.getByText('保留'));
const isOpen = () => document.querySelector('.pending-action-panel') !== null;

beforeEach(() => {
    // 前のテストの登録が残っていると LIFO の順序が読めなくなる
    while (closeTopModal()) { /* 空にする */ }
});
afterEach(cleanup);

describe('保留パネルの戻る操作', () => {
    it('畳んでいる間は戻る操作を横取りしない（ホームへ抜けられる）', () => {
        renderPanel();

        expect(isOpen()).toBe(false);
        expect(hasOpenModal()).toBe(false);
    });

    it('開いている間は戻る操作を受け取り、畳むだけで済む', () => {
        renderPanel();
        openPanel();
        expect(isOpen()).toBe(true);
        expect(hasOpenModal()).toBe(true);

        act(() => { closeTopModal(); });

        expect(isOpen()).toBe(false);
        // 畳んだあとはもう横取りしない（次の戻るでホームへ抜けられる）
        expect(hasOpenModal()).toBe(false);
        // バッジは残るので開き直せる
        expect(screen.getByText('保留')).toBeTruthy();
    });

    it('削除の確認が開いていれば、そちらが先に閉じる', () => {
        renderPanel();
        openPanel();
        // 1件だけなので開くと同時に展開される
        fireEvent.click(screen.getByText('削除'));
        expect(screen.getByText('保留記録の削除')).toBeTruthy();

        act(() => { closeTopModal(); });

        expect(screen.queryByText('保留記録の削除')).toBeNull();
        // パネルは開いたまま（確認を取り消しただけで割り当てを続けられる）
        expect(isOpen()).toBe(true);
    });
});
