import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { GameInfoModal } from './GameInfoModal';
import { createInitialGameInfo } from '../../types/game';
import { findUnlabeledFields } from '../../test/accessibleNames';

afterEach(cleanup);

function renderModal(overrides: Partial<React.ComponentProps<typeof GameInfoModal>> = {}) {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
        <GameInfoModal
            gameInfo={createInitialGameInfo()}
            endTime={null}
            onSave={onSave}
            onClose={onClose}
            {...overrides}
        />,
    );
    return { onSave, onClose };
}

// 会場・審判・TOで10フィールドあり、すべて <label> が htmlFor を持たずに
// 置かれていた。読み上げでは何の欄か分からず、ラベルをタップしても
// フォーカスが移らない
describe('GameInfoModal: 入力欄のラベル', () => {
    it('すべての入力欄がラベルと結び付いている', () => {
        renderModal();
        expect(findUnlabeledFields()).toEqual([]);
    });

    it('ラベル名で入力欄を引ける', () => {
        renderModal();
        for (const name of [
            '会場', '開始時間', 'Game No.', '終了時間',
            'クルーチーフ', 'アンパイア',
            'スコアラー', 'A・スコアラー', 'タイマー', 'ショットクロックオペレーター',
        ]) {
            expect(screen.getByLabelText(name)).toBeTruthy();
        }
    });

    it('ラベル経由で入力できる', () => {
        const { onSave } = renderModal();

        fireEvent.change(screen.getByLabelText('会場'), { target: { value: '港南体育館' } });
        fireEvent.click(screen.getByRole('button', { name: '保存' }));

        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ venue: '港南体育館' }));
    });
});
