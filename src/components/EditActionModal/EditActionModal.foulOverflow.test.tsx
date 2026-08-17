// ファウルの選手を付け替えると、記録フローの確認を通らずに6個目を作れる。
// handleEditFoul は付け替え先のファウル数を見ていない。
// 付け替えは長押し→編集と既に慎重な操作なので、警告だけ出して保存は止めない。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { EditActionModal } from './EditActionModal';
import { createPlayer } from '../../types/game';
import type { FoulType, Player } from '../../types/game';

afterEach(cleanup);

const withFouls = (player: Player, count: number): Player => ({
    ...player,
    fouls: Array.from({ length: count }, () => 'P' as FoulType),
});

const players: Player[] = [
    withFouls(createPlayer('p1', 4, '選手A'), 1),
    withFouls(createPlayer('p2', 5, '選手B'), 5),
    withFouls(createPlayer('p3', 6, '選手C'), 4),
];

const foulItem = {
    id: 'f1',
    type: 'foul' as const,
    entryType: 'P',
    playerId: 'p1',
    playerNumber: 4,
    typeLabel: 'パーソナルファウル',
};

function renderModal(item = foulItem) {
    render(
        <EditActionModal
            item={item}
            players={players}
            onSave={vi.fn()}
            onCancel={vi.fn()}
        />
    );
    return screen.getByLabelText('選手') as HTMLSelectElement;
}

const warning = () => screen.queryByText(/付け替えると6個目になり/);

describe('EditActionModal: 付け替えで6個目になるファウル', () => {
    it('開いた直後（元の選手のまま）は警告を出さない', () => {
        renderModal();
        expect(warning()).toBeNull();
    });

    it('付け替え先が5ファウルなら警告を出す', () => {
        const select = renderModal();

        fireEvent.change(select, { target: { value: 'p2' } });

        // 選手プルダウンの <option> にも同じ「選手B」表記があるため、
        // 未スコープの getByText は警告文と衝突する。警告要素自身の
        // テキストで確認する
        const warningEl = warning();
        expect(warningEl).toBeTruthy();
        expect(warningEl?.textContent).toMatch(/選手B/);
    });

    it('付け替え先が4ファウルなら警告を出さない', () => {
        const select = renderModal();

        fireEvent.change(select, { target: { value: 'p3' } });

        expect(warning()).toBeNull();
    });

    it('警告が出ていても保存はできる', () => {
        const select = renderModal();

        fireEvent.change(select, { target: { value: 'p2' } });

        const save = screen.getByRole('button', { name: '保存' }) as HTMLButtonElement;
        expect(save.disabled).toBe(false);
    });

    it('得点の編集では出さない（様式のファウル欄を消費しない）', () => {
        render(
            <EditActionModal
                item={{ id: 's1', type: 'score', entryType: '2P', playerId: 'p1', playerNumber: 4 }}
                players={players}
                onSave={vi.fn()}
                onCancel={vi.fn()}
            />
        );

        fireEvent.change(screen.getByLabelText('選手'), { target: { value: 'p2' } });

        expect(warning()).toBeNull();
    });
});
