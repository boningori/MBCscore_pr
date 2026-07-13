import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ActionButtons } from './ActionButtons';

afterEach(cleanup);

// SwipeableScoreButtonは label に '2P' / '3P' / 'FT' を表示する
const noop = vi.fn();

function renderButtons(showThreePoint?: boolean) {
    render(
        <ActionButtons
            onScore={noop}
            onStat={noop}
            onMiss={noop}
            onFoul={noop}
            gameMode="full"
            showThreePoint={showThreePoint}
        />,
    );
}

describe('ActionButtons: 3Pボタンの表示制御', () => {
    it('showThreePoint=falseのとき3Pボタンは描画されない（2P/FTは描画される）', () => {
        renderButtons(false);
        expect(screen.queryByText('3P')).toBeNull();
        expect(screen.getByText('2P')).toBeTruthy();
        expect(screen.getByText('FT')).toBeTruthy();
    });

    it('showThreePoint=trueのとき3Pボタンが描画される', () => {
        renderButtons(true);
        expect(screen.getByText('3P')).toBeTruthy();
    });

    it('showThreePoint未指定のとき3Pボタンが描画される（後方互換）', () => {
        renderButtons(undefined);
        expect(screen.getByText('3P')).toBeTruthy();
    });
});

describe('ActionButtons: アクション先行時のヒント操作', () => {
    function renderWithActiveAction() {
        const onHoldPending = vi.fn();
        const onCancelAction = vi.fn();
        render(
            <ActionButtons
                onScore={noop}
                onStat={noop}
                onMiss={noop}
                onFoul={noop}
                gameMode="full"
                activeAction={{ type: 'SCORE', value: '2P' }}
                onHoldPending={onHoldPending}
                onCancelAction={onCancelAction}
            />,
        );
        return { onHoldPending, onCancelAction };
    }

    it('activeActionがあるとヒントと「選手がわからない」「キャンセル」ボタンが表示される', () => {
        renderWithActiveAction();
        expect(screen.getByText('👇 選手を選択してください')).toBeTruthy();
        expect(screen.getByText('選手がわからない')).toBeTruthy();
        expect(screen.getByText('キャンセル')).toBeTruthy();
    });

    it('「選手がわからない」でonHoldPendingが呼ばれる', () => {
        const { onHoldPending } = renderWithActiveAction();
        fireEvent.click(screen.getByText('選手がわからない'));
        expect(onHoldPending).toHaveBeenCalledTimes(1);
    });

    it('「キャンセル」でonCancelActionが呼ばれる', () => {
        const { onCancelAction } = renderWithActiveAction();
        fireEvent.click(screen.getByText('キャンセル'));
        expect(onCancelAction).toHaveBeenCalledTimes(1);
    });

    it('activeActionがなければヒント操作は表示されない', () => {
        render(
            <ActionButtons onScore={noop} onStat={noop} onMiss={noop} onFoul={noop} gameMode="full" />,
        );
        expect(screen.queryByText('選手がわからない')).toBeNull();
    });
});
