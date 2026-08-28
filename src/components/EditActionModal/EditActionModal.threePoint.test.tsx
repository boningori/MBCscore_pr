// 3Pを使わない試合では、記録画面に3Pボタンが出ない（ActionButtons が
// showThreePoint を見ている）。ところが履歴の編集ダイアログだけは種別の
// プルダウンに 3P成功/3Pミス を並べ続けていたため、そこからは規則にない
// 記録を作れた。ミニバスは通常3Pを使わないので、設定を明示的にOFFにした
// 試合ほど誤タップの影響が分かりにくい。
//
// ただし既に3Pで入っている記録では隠さない。隠すとプルダウンが実体と違う値を
// 選んでいるように見える（試合の途中で3PをONからOFFへ変えると実際に起きる）。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { EditActionModal } from './EditActionModal';
import { createPlayer } from '../../types/game';

const players = [createPlayer('p1', 4, '山田太郎'), createPlayer('p2', 5, '鈴木花子')];

function renderModal(props: {
    entryType?: string;
    type?: 'score' | 'stat';
    showThreePoint?: boolean;
} = {}) {
    const { entryType = '2P', type = 'score', showThreePoint } = props;
    render(
        <EditActionModal
            item={{ id: 's1', type, entryType, playerId: 'p1', playerNumber: 4 }}
            players={players}
            showThreePoint={showThreePoint}
            onSave={vi.fn()}
            onCancel={vi.fn()}
        />,
    );
    return screen.getByLabelText('シュート結果') as HTMLSelectElement;
}

const optionValues = (select: HTMLSelectElement) =>
    [...select.options].map(o => o.value);

afterEach(cleanup);

describe('編集ダイアログの3P', () => {
    it('3Pを使わない試合では 3P/3PA を出さない', () => {
        const select = renderModal({ showThreePoint: false });

        expect(optionValues(select)).toEqual(['2P', '2PA', 'FT', 'FTA']);
    });

    it('3Pを使う試合では従来どおり全部出す', () => {
        const select = renderModal({ showThreePoint: true });

        expect(optionValues(select)).toContain('3P');
        expect(optionValues(select)).toContain('3PA');
    });

    it('設定が渡されない古い呼び出し元では全部出す', () => {
        const select = renderModal();

        expect(optionValues(select)).toContain('3P');
    });

    it('すでに3Pで入っている記録では隠さない（実体と違う値が選ばれて見える）', () => {
        const select = renderModal({ entryType: '3P', showThreePoint: false });

        expect(optionValues(select)).toContain('3P');
        expect(select.value).toBe('3P');
    });

    it('3Pミスの記録でも隠さない', () => {
        const select = renderModal({ entryType: '3PA', type: 'stat', showThreePoint: false });

        expect(optionValues(select)).toContain('3PA');
        expect(select.value).toBe('3PA');
    });
});
