import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SwipeableScoreButton } from './SwipeableScoreButton';

afterEach(cleanup);

function renderWithOutside() {
    const onScore = vi.fn();
    const onMiss = vi.fn();
    const onOutsideClick = vi.fn();
    render(
        <div>
            <button onClick={onOutsideClick}>選手カードの代わり</button>
            <SwipeableScoreButton scoreType="2P" onScore={onScore} onMiss={onMiss} />
        </div>,
    );
    return { onScore, onMiss, onOutsideClick };
}

// 2Pボタンをタップして成功/ミスの選択メニューを開く
function openSelector() {
    fireEvent.click(screen.getByLabelText('2Pシュート'));
}

describe('SwipeableScoreButton: 選択メニューの外側タップ', () => {
    it('タップすると成功/ミスの選択メニューが開く', () => {
        renderWithOutside();
        openSelector();
        expect(screen.getByText('2P成功')).toBeTruthy();
        expect(screen.getByText('2Pミス')).toBeTruthy();
    });

    // 選手→アクション→選手の連続入力で、メニューが開いたままだと
    // 次の選手タップが黒幕に吸われて選択できなくなる。
    // click ではなく pointerdown で閉じることで、同じタップが下の要素へ届くようにする
    it('メニュー表示中に外側をpointerdownすると閉じる', () => {
        renderWithOutside();
        openSelector();

        fireEvent.pointerDown(screen.getByText('選手カードの代わり'));

        expect(screen.queryByText('2P成功')).toBeNull();
        expect(screen.queryByText('2Pミス')).toBeNull();
    });

    it('メニュー内のpointerdownでは閉じない（成功/ミスを選べる）', () => {
        const { onScore } = renderWithOutside();
        openSelector();

        const success = screen.getByText('2P成功');
        fireEvent.pointerDown(success);
        expect(screen.queryByText('2P成功')).toBeTruthy();

        fireEvent.click(success);
        expect(onScore).toHaveBeenCalledWith('2P');
        expect(screen.queryByText('2P成功')).toBeNull();
    });

    it('外側タップで閉じたあと、下の要素のクリックは妨げられない', () => {
        const { onOutsideClick } = renderWithOutside();
        openSelector();

        const outside = screen.getByText('選手カードの代わり');
        fireEvent.pointerDown(outside);
        fireEvent.click(outside);

        expect(onOutsideClick).toHaveBeenCalledTimes(1);
    });
});
