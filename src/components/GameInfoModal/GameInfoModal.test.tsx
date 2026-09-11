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

// 終了時間は gameInfo とは別フィールドで、受け手（App の SET_END_TIME、
// History の updateGameRecordEndTime）はどちらも null を「消す」として扱える。
// ところが送り出す側が falsy を弾いていたため、打ち間違えた終了時間を
// 空欄にして保存しても消えず、公式様式に誤った時刻が残り続けていた。
// タイムアウトの取り消しと同じで、様式に印字される値の唯一の訂正経路になる
describe('GameInfoModal: 終了時間', () => {
    it('入力した時刻を渡す', () => {
        const onEndTimeChange = vi.fn();
        renderModal({ endTime: null, onEndTimeChange });

        fireEvent.change(screen.getByLabelText('終了時間'), { target: { value: '11:45' } });
        fireEvent.click(screen.getByRole('button', { name: '保存' }));

        const passed = onEndTimeChange.mock.calls[0][0] as Date;
        expect(passed.getHours()).toBe(11);
        expect(passed.getMinutes()).toBe(45);
    });

    it('空欄にして保存すると、終了時間を消す', () => {
        const onEndTimeChange = vi.fn();
        renderModal({ endTime: new Date('2026-06-01T11:30:00'), onEndTimeChange });

        fireEvent.change(screen.getByLabelText('終了時間'), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: '保存' }));

        expect(onEndTimeChange).toHaveBeenCalledWith(null);
    });

    it('もともと空欄のまま保存したときは、消す指示を出さない', () => {
        const onEndTimeChange = vi.fn();
        renderModal({ endTime: null, onEndTimeChange });

        fireEvent.click(screen.getByRole('button', { name: '保存' }));

        expect(onEndTimeChange).not.toHaveBeenCalled();
    });
});

// このモーダルは大会名・会場・審判・TO・終了時間の10項目をローカルstateに溜め、
// 「保存」でしか外へ出さない。それなのに閉じる側は素通しで、オーバーレイを
// 一度触るだけ・端末の戻る操作ひとつで、打ち込んだ全部が無確認で消えていた。
// 同じ「フォームを持つモーダル」であるアプリ設定は handleRequestClose で
// 破棄確認を挟んでいて、扱いが割れていた。指で10項目打つぶん、こちらのほうが痛い。
//
// 確認を出すのは実際に書きかけがあるときだけ。何も触っていないのに
// 「破棄しますか？」と聞かれると、閉じる操作が毎回1手増える。
describe('GameInfoModal: 書きかけの破棄', () => {
    const overlay = () => document.querySelector('.game-info-modal-overlay') as HTMLElement;

    it('何も触っていなければ、オーバーレイのタップでそのまま閉じる', () => {
        const { onClose } = renderModal();

        fireEvent.click(overlay());

        expect(onClose).toHaveBeenCalled();
    });

    it('書きかけがあるときは、オーバーレイのタップで確認を出す（まだ閉じない）', () => {
        const { onClose } = renderModal();
        fireEvent.change(screen.getByLabelText('会場'), { target: { value: '港南体育館' } });

        fireEvent.click(overlay());

        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByText('破棄して閉じる')).toBeTruthy();
    });

    it('確認で「編集に戻る」を選ぶと、入力は残る', () => {
        const { onClose } = renderModal();
        fireEvent.change(screen.getByLabelText('会場'), { target: { value: '港南体育館' } });
        fireEvent.click(overlay());

        fireEvent.click(screen.getByRole('button', { name: '編集に戻る' }));

        expect(onClose).not.toHaveBeenCalled();
        expect((screen.getByLabelText('会場') as HTMLInputElement).value).toBe('港南体育館');
    });

    it('確認で「破棄して閉じる」を選ぶと、保存せずに閉じる', () => {
        const { onClose, onSave } = renderModal();
        fireEvent.change(screen.getByLabelText('会場'), { target: { value: '港南体育館' } });
        fireEvent.click(overlay());

        fireEvent.click(screen.getByRole('button', { name: '破棄して閉じる' }));

        expect(onClose).toHaveBeenCalled();
        expect(onSave).not.toHaveBeenCalled();
    });

    it('終了時間だけを触った場合も書きかけとして扱う', () => {
        const { onClose } = renderModal({ endTime: null, onEndTimeChange: vi.fn() });
        fireEvent.change(screen.getByLabelText('終了時間'), { target: { value: '11:45' } });

        fireEvent.click(overlay());

        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByText('破棄して閉じる')).toBeTruthy();
    });

    it('入力を元の値へ戻したら、書きかけ扱いしない', () => {
        const { onClose } = renderModal();
        const venue = screen.getByLabelText('会場');
        fireEvent.change(venue, { target: { value: '港南体育館' } });
        fireEvent.change(venue, { target: { value: '' } });

        fireEvent.click(overlay());

        expect(onClose).toHaveBeenCalled();
    });

    // 保存を押したあとは書きかけが無くなる＝そのまま閉じてよい
    it('保存したら確認を挟まずに閉じる', () => {
        const { onClose } = renderModal();
        fireEvent.change(screen.getByLabelText('会場'), { target: { value: '港南体育館' } });

        fireEvent.click(screen.getByRole('button', { name: '保存' }));

        expect(onClose).toHaveBeenCalled();
        expect(screen.queryByText('破棄して閉じる')).toBeNull();
    });
});
