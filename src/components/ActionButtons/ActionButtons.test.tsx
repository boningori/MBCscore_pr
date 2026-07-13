import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
