import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FoulInputFlow } from './FoulInputFlow';

afterEach(cleanup);

// Pファウルボタンは onMouseDown/onMouseUp/onTouch* だけを持ち、onClick が無い。
// キーボードのEnter/Spaceが発火させるのは click なので、Pファウルだけ
// キーボードから記録できなかった（T/U/Dは onClick があるので押せる）。
// ボタンを2つに割らずに、同じボタンへキー操作を足す。

function renderFlow(onComplete = vi.fn()) {
    render(
        <FoulInputFlow
            onComplete={onComplete}
            onCancel={vi.fn()}
            hasSelectedPlayer={true}
            teamFouls={0}
            opponentTeamId="teamB"
            opponentPlayers={[]}
            opponentTeamName="相手チーム"
            showThreePoint={true}
        />,
    );
    return onComplete;
}

const pButton = () => screen.getByText('パーソナルファウル').closest('button')!;

describe('Pファウルのキーボード操作', () => {
    it('EnterでPファウルを記録できる', () => {
        const onComplete = renderFlow();

        fireEvent.keyDown(pButton(), { key: 'Enter' });

        expect(onComplete).toHaveBeenCalledWith(
            expect.objectContaining({ foulType: 'P', shotSituation: 'none', freeThrows: 0 }),
        );
    });

    it('SpaceでもPファウルを記録できる', () => {
        const onComplete = renderFlow();

        fireEvent.keyDown(pButton(), { key: ' ' });

        expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ foulType: 'P' }));
    });

    it('Shift+Enterはシュートファウル（長押しと同じ分岐）', () => {
        const onComplete = renderFlow();

        fireEvent.keyDown(pButton(), { key: 'Enter', shiftKey: true });

        // 記録は完了せず、シュート状況の選択へ進む
        expect(onComplete).not.toHaveBeenCalled();
        expect(screen.getByText('シュート状況を選択（シュートファウル）')).toBeTruthy();
    });

    // キーを押しっぱなしにすると keydown が連射される。
    // 1回の操作で何個もファウルが入ってはいけない
    it('キーリピートでは記録しない', () => {
        const onComplete = renderFlow();

        fireEvent.keyDown(pButton(), { key: 'Enter', repeat: true });

        expect(onComplete).not.toHaveBeenCalled();
    });

    it('関係ないキーでは記録しない', () => {
        const onComplete = renderFlow();

        fireEvent.keyDown(pButton(), { key: 'a' });
        fireEvent.keyDown(pButton(), { key: 'Tab' });

        expect(onComplete).not.toHaveBeenCalled();
    });

    it('操作方法を支援技術にも伝える', () => {
        renderFlow();

        expect(pButton().getAttribute('aria-keyshortcuts')).toContain('Enter');
    });
});
