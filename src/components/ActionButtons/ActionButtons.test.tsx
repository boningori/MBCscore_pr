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

describe('ActionButtons: スワイプボタンのaccessible name', () => {
    it('2P/3P/FT/ターンオーバーのボタンに名前が付いている', () => {
        renderButtons(true);
        expect(screen.getByRole('button', { name: '2Pシュート' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '3Pシュート' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'フリースロー' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'ターンオーバー' })).toBeTruthy();
    });
});

describe('ActionButtons: アクション先行時のステータスバー', () => {
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
                activeActionLabel="2P成功"
                onHoldPending={onHoldPending}
                onCancelAction={onCancelAction}
            />,
        );
        return { onHoldPending, onCancelAction };
    }

    it('activeActionがあるとアクション名入りガイドと「選手がわからない」「キャンセル」が表示される', () => {
        renderWithActiveAction();
        expect(screen.getByText(/2P成功.*選手をタップ/)).toBeTruthy();
        expect(screen.getByText('選手がわからない')).toBeTruthy();
        expect(screen.getByText('キャンセル')).toBeTruthy();
    });

    // この状態では選手タップが「選択」ではなく「即記録」になるため、
    // 記録待ちであることが一目で分かる必要がある
    it('activeActionがあるとき「記録待ち」であることが明示される', () => {
        renderWithActiveAction();
        expect(screen.getByText(/記録待ち/)).toBeTruthy();
        expect(screen.getByRole('status').className).toMatch(/\bactive\b/);
    });

    it('activeActionがないときは「記録待ち」を表示しない', () => {
        renderButtons(true);
        expect(screen.queryByText(/記録待ち/)).toBeNull();
        expect(screen.getByRole('status').className).not.toMatch(/\bactive\b/);
    });

    it('ステータスバーはボタン群より前(上)に配置される', () => {
        renderWithActiveAction();
        const bar = screen.getByRole('status');
        const scoreLabel = screen.getByText('2P'); // 2Pボタンのラベル
        // barがscoreLabelより文書順で前にある
        expect(bar.compareDocumentPosition(scoreLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

    it('activeActionがなくてもバーは常設され(高さ確保)、操作ボタンは表示されない', () => {
        render(
            <ActionButtons onScore={noop} onStat={noop} onMiss={noop} onFoul={noop} gameMode="full" />,
        );
        expect(screen.getByRole('status')).toBeTruthy();
        expect(screen.queryByText('選手がわからない')).toBeNull();
        expect(screen.queryByText('キャンセル')).toBeNull();
    });

    it('idleNotice指定時(クォーター間)はアイドル文言の代わりに通知を表示する', () => {
        render(
            <ActionButtons
                onScore={noop}
                onStat={noop}
                onMiss={noop}
                onFoul={noop}
                gameMode="full"
                idleNotice="⚠ 今の記録は Q2 として保存されます"
            />,
        );
        expect(screen.getByText('⚠ 今の記録は Q2 として保存されます')).toBeTruthy();
        expect(screen.queryByText('選手とアクションをタップして記録')).toBeNull();
    });
});
