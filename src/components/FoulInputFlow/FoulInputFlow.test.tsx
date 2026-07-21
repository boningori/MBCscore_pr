import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { FoulInputFlow } from './FoulInputFlow';

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

const noop = vi.fn();

function renderFlow(showThreePoint?: boolean) {
    render(
        <FoulInputFlow
            onComplete={noop}
            onCancel={noop}
            hasSelectedPlayer={true}
            teamFouls={0}
            opponentTeamId="teamB"
            opponentPlayers={[]}
            opponentTeamName="相手チーム"
            showThreePoint={showThreePoint}
        />,
    );
}

// Pファウルボタンを長押し（500ms超）してシュートファウル入力に入る
function longPressPFoul() {
    const pButton = screen.getByText('パーソナルファウル').closest('button')!;
    fireEvent.mouseDown(pButton);
    act(() => {
        vi.advanceTimersByTime(600);
    });
    fireEvent.mouseUp(pButton);
}

describe('FoulInputFlow: 3P非表示時のシュートファウル', () => {
    it('showThreePoint=falseのときP長押しでシュート状況選択をスキップし直接シュート結果へ進む（2P扱い）', () => {
        vi.useFakeTimers();
        renderFlow(false);
        longPressPFoul();
        // シュート状況選択は表示されない
        expect(screen.queryByText('シュート状況を選択（シュートファウル）')).toBeNull();
        expect(screen.queryByText('3Pシュート中')).toBeNull();
        // 直接シュート結果選択が表示され、失敗時FTは2本（=2P扱い）
        expect(screen.getByText('シュートの結果')).toBeTruthy();
        expect(screen.getByText('シュート失敗（FT2本）')).toBeTruthy();
    });

    it('showThreePoint=falseのときシュート結果画面から戻るとファウル種類選択に戻る', () => {
        vi.useFakeTimers();
        renderFlow(false);
        longPressPFoul();
        fireEvent.click(screen.getByText('← 戻る'));
        expect(screen.getByText('ファウル種類を選択')).toBeTruthy();
        expect(screen.getByText('パーソナルファウル')).toBeTruthy();
    });

    it('showThreePoint=trueのときは従来どおり2P/3Pの選択が表示される', () => {
        vi.useFakeTimers();
        renderFlow(true);
        longPressPFoul();
        expect(screen.getByText('シュート状況を選択（シュートファウル）')).toBeTruthy();
        expect(screen.getByText('2Pシュート中')).toBeTruthy();
        expect(screen.getByText('3Pシュート中')).toBeTruthy();
    });

    it('showThreePoint未指定のときも従来どおり2P/3Pの選択が表示される（後方互換）', () => {
        vi.useFakeTimers();
        renderFlow(undefined);
        longPressPFoul();
        expect(screen.getByText('2Pシュート中')).toBeTruthy();
        expect(screen.getByText('3Pシュート中')).toBeTruthy();
    });
});
