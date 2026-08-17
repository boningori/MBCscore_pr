// ターンオーバーの細目（ダブドリ・トラベ・パスミス・キャッチミス）を編集で開いたとき。
//
// TOボタンのスワイプで細目まで記録できるのに、編集の種類プルダウンには
// OREB/DREB/AST/STL/BLK/TO しか並んでいなかった。現在の種別がどの選択肢にも
// 一致しないため、ダブドリの記録を開くと「OREB」が選ばれているように見える。
// 選手だけ直したい記録で、事実と違う種別が表示される。
// さらに一度でも種類を触ると細目へ戻せず、削除して記録し直すしかなかった。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { EditActionModal } from './EditActionModal';
import { createPlayer } from '../../types/game';

afterEach(cleanup);

const players = [createPlayer('p1', 4, '選手A'), createPlayer('p2', 5, '選手B')];

function renderModal(entryType: string, onSave = vi.fn()) {
    render(
        <EditActionModal
            item={{ id: 'st1', type: 'stat', entryType, playerId: 'p1', playerNumber: 4 }}
            players={players}
            onSave={onSave}
            onCancel={vi.fn()}
        />
    );
    return { select: screen.getByLabelText('スタッツ種類') as HTMLSelectElement, onSave };
}

const optionValues = (select: HTMLSelectElement) =>
    Array.from(select.options).map(o => o.value);

describe('EditActionModal のターンオーバー細目', () => {
    it('ダブドリの記録を開くと、その種別が選ばれている', () => {
        const { select } = renderModal('TO:DD');
        expect(select.value).toBe('TO:DD');
    });

    it('細目どうしで直せる', () => {
        const { select } = renderModal('TO:DD');
        expect(optionValues(select)).toEqual([
            'OREB', 'DREB', 'AST', 'STL', 'BLK',
            'TO', 'TO:DD', 'TO:TR', 'TO:PM', 'TO:CM',
        ]);
    });

    it('細目へ直して保存すると、その種別が渡る', () => {
        const { select, onSave } = renderModal('TO:DD');

        fireEvent.change(select, { target: { value: 'TO:TR' } });
        fireEvent.click(screen.getByRole('button', { name: '保存' }));

        expect(onSave).toHaveBeenCalledWith('st1', 'p1', 'TO:TR');
    });

    it('細目のない TO は従来どおり選ばれている', () => {
        const { select } = renderModal('TO');
        expect(select.value).toBe('TO');
    });

    it('シュート関連の記録には細目を出さない', () => {
        render(
            <EditActionModal
                item={{ id: 's1', type: 'stat', entryType: '2PA', playerId: 'p1', playerNumber: 4 }}
                players={players}
                onSave={vi.fn()}
                onCancel={vi.fn()}
            />
        );
        const select = screen.getByLabelText('シュート結果') as HTMLSelectElement;
        expect(optionValues(select)).toEqual(['2P', '2PA', '3P', '3PA', 'FT', 'FTA']);
    });
});
