// 「選手不明」で解決した記録（playerId が 'unknown'）を編集で開いたときの挙動。
//
// 選手プルダウンには名簿しか並ばないため、'unknown' はどの選択肢にも一致せず、
// 名簿の先頭が選ばれているように見えていた。表示と実体が食い違ううえ、
// そのまま保存しても reducer 側で誰にも当たらず黙って捨てられる。
// 得点への変換では帰属の無い得点エントリが生まれ、スコアボードと
// ランニングスコアの得点が食い違う（scoreHandlers の handleConvertMissToScore）。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { EditActionModal } from './EditActionModal';
import { createPlayer } from '../../types/game';

afterEach(cleanup);

const players = [createPlayer('a1', 4, '選手A1'), createPlayer('a2', 5, '選手A2')];

const unknownItem = {
    id: 'stat-1',
    type: 'stat' as const,
    entryType: '2PA',
    playerId: 'unknown',
    playerNumber: -1,
};

function renderModal(item = unknownItem, onSave = vi.fn()) {
    render(
        <EditActionModal
            item={item}
            players={players}
            onSave={onSave}
            onCancel={vi.fn()}
        />
    );
    return {
        select: screen.getByLabelText('選手') as HTMLSelectElement,
        saveButton: screen.getByRole('button', { name: '保存' }) as HTMLButtonElement,
        onSave,
    };
}

describe('EditActionModal: 選手不明の記録', () => {
    it('選手が決まるまで保存できない', () => {
        const { saveButton } = renderModal();
        expect(saveButton.disabled).toBe(true);
    });

    it('名簿の誰かが選ばれているように見せない', () => {
        const { select } = renderModal();
        expect(select.value).not.toBe('a1');
        expect(select.selectedOptions[0]?.textContent).toContain('選手不明');
    });

    it('選手を選ぶと保存でき、選んだ選手が渡る', () => {
        const { select, onSave } = renderModal();

        fireEvent.change(select, { target: { value: 'a2' } });
        fireEvent.click(screen.getByRole('button', { name: '保存' }));

        expect(onSave).toHaveBeenCalledWith('stat-1', 'a2', '2PA');
    });

    it('選手が分かっている記録では従来どおり保存できる', () => {
        const { saveButton } = renderModal({ ...unknownItem, playerId: 'a1', playerNumber: 4 });
        expect(saveButton.disabled).toBe(false);
        expect(screen.queryByText(/選手不明/)).toBeNull();
    });
});
