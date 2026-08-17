// 6個目以降のファウルは公式様式のファウル欄（5枠）に収まらず、
// これまでは無言で消えていた。記録は止めないが、確認は挟む。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { FoulInputFlow } from './FoulInputFlow';
import type { FoulType } from '../../types/game';

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

const CONFIRM_TITLE = 'このファウルは6個目です';

function renderFlow(currentFouls: FoulType[], onComplete = vi.fn()) {
    render(
        <FoulInputFlow
            onComplete={onComplete}
            onCancel={vi.fn()}
            hasSelectedPlayer={true}
            currentFoulCount={currentFouls.length}
            currentFouls={currentFouls}
            playerName="選手A"
            teamFouls={0}
            opponentTeamId="teamB"
            opponentPlayers={[]}
            opponentTeamName="相手チーム"
        />,
    );
    return onComplete;
}

/** Pファウルを通常タップ（長押し判定に入る前に離す） */
function tapPFoul() {
    const button = screen.getByText('パーソナルファウル').closest('button')!;
    fireEvent.mouseDown(button);
    fireEvent.mouseUp(button);
}

/** Pファウルを長押し（500ms超）してシュートファウルへ */
function longPressPFoul() {
    const button = screen.getByText('パーソナルファウル').closest('button')!;
    fireEvent.mouseDown(button);
    act(() => {
        vi.advanceTimersByTime(600);
    });
    fireEvent.mouseUp(button);
}

describe('FoulInputFlow: 6個目以降の確認', () => {
    it('4ファウルなら確認なしでそのまま記録される', () => {
        const onComplete = renderFlow(['P', 'P', 'P', 'P']);
        tapPFoul();

        expect(screen.queryByText(CONFIRM_TITLE)).toBeNull();
        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('5ファウルなら確認が出て、まだ記録されない', () => {
        const onComplete = renderFlow(['P', 'P', 'P', 'P', 'P']);
        tapPFoul();

        expect(screen.getByText(CONFIRM_TITLE)).toBeTruthy();
        expect(onComplete).not.toHaveBeenCalled();
    });

    it('「記録する」を押すと記録される', () => {
        const onComplete = renderFlow(['P', 'P', 'P', 'P', 'P']);
        tapPFoul();

        fireEvent.click(screen.getByRole('button', { name: '記録する' }));

        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('「やめる」を押すと記録されず、種類選択に留まる', () => {
        const onComplete = renderFlow(['P', 'P', 'P', 'P', 'P']);
        tapPFoul();

        fireEvent.click(screen.getByRole('button', { name: 'やめる' }));

        expect(onComplete).not.toHaveBeenCalled();
        expect(screen.queryByText(CONFIRM_TITLE)).toBeNull();
        expect(screen.getByText('ファウル種類を選択')).toBeTruthy();
    });

    it('Dで失格済みでも3ファウルなら確認は出ない', () => {
        const onComplete = renderFlow(['D', 'P', 'P']);
        tapPFoul();

        expect(screen.queryByText(CONFIRM_TITLE)).toBeNull();
        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('テクニカルでも6個目なら確認が出る', () => {
        const onComplete = renderFlow(['P', 'P', 'P', 'P', 'P']);

        fireEvent.click(screen.getByText('テクニカルファウル').closest('button')!);

        expect(screen.getByText(CONFIRM_TITLE)).toBeTruthy();
        expect(onComplete).not.toHaveBeenCalled();
    });

    it('シュートファウル（長押し）でも6個目なら確認が出る', () => {
        vi.useFakeTimers();
        renderFlow(['P', 'P', 'P', 'P', 'P']);

        longPressPFoul();

        expect(screen.getByText(CONFIRM_TITLE)).toBeTruthy();
        // シュート状況選択へは進まない
        expect(screen.queryByText('シュート状況を選択（シュートファウル）')).toBeNull();
    });

    it('既に6ファウルなら、タイトルも実際の個数（7個目）に合わせる', () => {
        const onComplete = renderFlow(['P', 'P', 'P', 'P', 'P', 'P']);
        tapPFoul();

        expect(screen.getByText('このファウルは7個目です')).toBeTruthy();
        expect(screen.queryByText(CONFIRM_TITLE)).toBeNull();
        expect(onComplete).not.toHaveBeenCalled();
    });
});
