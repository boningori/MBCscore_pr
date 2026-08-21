// ファウル編集からFTの成否を直せること。
//
// 外したFTは記録を1件も作らない（本数だけシューターのスタッツに入る）ので、
// シューター側のアクション履歴には現れない。この行がFTの成否を持っている唯一の
// 記録なのに、以前は「誰が犯したか」しか直せず、成否を直すにはファウルごと削除して
// 入れ直すしかなかった。試合中の誤タップとしてはいちばん起きやすい訂正。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { EditActionModal } from './EditActionModal';
import { createPlayer } from '../../types/game';
import type { FreeThrowResult } from '../../types/game';

const players = [createPlayer('p1', 4, '山田太郎'), createPlayer('p2', 5, '鈴木花子')];

type Item = Parameters<typeof EditActionModal>[0]['item'];

function renderModal(item: Partial<Item> = {}, handlers: {
    onEditFreeThrows?: (id: string, r: FreeThrowResult[]) => void;
    onSave?: (id: string, playerId: string, type: string) => void;
} = {}) {
    const onEditFreeThrows = handlers.onEditFreeThrows ?? vi.fn();
    const onSave = handlers.onSave ?? vi.fn();
    render(
        <EditActionModal
            item={{
                id: 'f1', type: 'foul', entryType: 'P', playerId: 'p1', playerNumber: 4,
                typeLabel: 'パーソナルファウル', hasFreeThrows: true,
                freeThrowResults: ['made', 'missed'], canEditFreeThrows: true,
                ...item,
            }}
            players={players}
            onSave={onSave}
            onEditFreeThrows={onEditFreeThrows}
            onCancel={vi.fn()}
        />,
    );
    return { onEditFreeThrows, onSave };
}

const choices = (nth: number) =>
    [...screen.getAllByRole('radiogroup')[nth].querySelectorAll('button')];
const hint = () => screen.queryByText(/FTの成否を直すには/);

afterEach(cleanup);

describe('ファウル編集のFT成否', () => {
    it('本数ぶんの成否が出て、いまの結果が選ばれている', () => {
        renderModal();

        expect(screen.getByText('1本目')).toBeTruthy();
        expect(screen.getByText('2本目')).toBeTruthy();
        expect(choices(0)[0].getAttribute('aria-checked')).toBe('true');   // 1本目=成功
        expect(choices(1)[1].getAttribute('aria-checked')).toBe('true');   // 2本目=失敗
        expect(screen.getByText('結果: 1/2 成功')).toBeTruthy();
    });

    it('外した→入ったに直して保存できる', () => {
        const { onEditFreeThrows } = renderModal();

        fireEvent.click(choices(1)[0]);   // 2本目を成功に
        expect(screen.getByText('結果: 2/2 成功')).toBeTruthy();
        fireEvent.click(screen.getByText('保存'));

        expect(onEditFreeThrows).toHaveBeenCalledWith('f1', ['made', 'made']);
    });

    it('入った→外したにも直せる', () => {
        const { onEditFreeThrows } = renderModal();

        fireEvent.click(choices(0)[1]);   // 1本目を失敗に
        fireEvent.click(screen.getByText('保存'));

        expect(onEditFreeThrows).toHaveBeenCalledWith('f1', ['missed', 'missed']);
    });

    // 成否を触っていなければ、従来どおり選手の付け替えだけを投げる
    it('成否を触らなければFTの訂正は投げない', () => {
        const { onEditFreeThrows, onSave } = renderModal();

        fireEvent.click(screen.getByText('保存'));

        expect(onEditFreeThrows).not.toHaveBeenCalled();
        expect(onSave).toHaveBeenCalledWith('f1', 'p1', 'P');
    });

    // 背番号の見間違いと成否の押し間違いは同時に起きる。両方残ること
    it('選手の付け替えと同時に直せる', () => {
        const { onEditFreeThrows, onSave } = renderModal();

        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p2' } });
        fireEvent.click(choices(1)[0]);
        fireEvent.click(screen.getByText('保存'));

        expect(onEditFreeThrows).toHaveBeenCalledWith('f1', ['made', 'made']);
        expect(onSave).toHaveBeenCalledWith('f1', 'p2', 'P');
    });

    it('編集できるあいだは「削除して入れ直す」案内を出さない', () => {
        renderModal();
        expect(hint()).toBeNull();
    });

    // ミスへ変換した・シューターを付け替えた記録は本数と得点が1対1で対応しない
    it('直せない記録は案内だけを出す', () => {
        renderModal({ canEditFreeThrows: false });

        expect(screen.queryByText('1本目')).toBeNull();
        expect(hint()).toBeTruthy();
    });

    it('FTの無いファウルには何も出さない', () => {
        renderModal({ hasFreeThrows: false, freeThrowResults: [], canEditFreeThrows: false });

        expect(screen.queryByText('1本目')).toBeNull();
        expect(hint()).toBeNull();
    });
});
