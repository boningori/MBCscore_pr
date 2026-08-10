// ペナルティ中でもFTを与えないファウルがある（オフェンスファウル＝player control foul）。
//
// チームファウル4個以降、Pをタップすると必ずシューター選択（FT2本）へ進み、
// 0本で記録する出口が無かった。逃げ道は「2本とも失敗」を入れるか、
// キャンセルしてファウル自体を記録しないかの2つで、前者は相手シューターに
// 架空のFTA2本が付いてFT%が狂う。後者はチームファウルも進まない。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { FoulInputFlow } from './FoulInputFlow';
import { createPlayer } from '../../types/game';

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

const onCourt = () => {
    const p = createPlayer('teamB-player-0', 7, '相手選手');
    p.isOnCourt = true;
    return p;
};

function renderFlow(teamFouls: number, onComplete = vi.fn()) {
    render(
        <FoulInputFlow
            onComplete={onComplete}
            onCancel={vi.fn()}
            hasSelectedPlayer={true}
            teamFouls={teamFouls}
            opponentTeamId="teamB"
            opponentPlayers={[onCourt()]}
            opponentTeamName="相手チーム"
        />,
    );
    return onComplete;
}

/** Pファウルを通常タップ（シュート中でないファウル） */
function tapPFoul() {
    const pButton = screen.getByText('パーソナルファウル').closest('button')!;
    fireEvent.mouseDown(pButton);
    fireEvent.mouseUp(pButton);
}

/** Pファウルを長押し（シュートファウル） */
function longPressPFoul() {
    const pButton = screen.getByText('パーソナルファウル').closest('button')!;
    fireEvent.mouseDown(pButton);
    act(() => {
        vi.advanceTimersByTime(600);
    });
    fireEvent.mouseUp(pButton);
}

describe('ペナルティ中のFTなし', () => {
    it('シューター選択にFTなしの出口がある', () => {
        renderFlow(4);
        tapPFoul();

        expect(screen.getByText('シューターを選択')).toBeTruthy();
        expect(screen.getByText(/FTなし/)).toBeTruthy();
    });

    it('FTなしを選ぶとFT0本で記録が完了する', () => {
        const onComplete = renderFlow(4);
        tapPFoul();
        fireEvent.click(screen.getByText(/FTなし/));

        expect(onComplete).toHaveBeenCalledWith({
            foulType: 'P',
            shotSituation: 'none',
            shotMade: false,
            freeThrows: 0,
            freeThrowResults: [],
            shooterPlayerId: null,
        });
    });

    it('シューターを選ばなくても押せる（FTが無いので選ぶ相手がいない）', () => {
        renderFlow(4);
        tapPFoul();

        const button = screen.getByText(/FTなし/).closest('button')!;
        expect(button.hasAttribute('disabled')).toBe(false);
    });

    // シュートファウルのFT本数はシュートの成否で決まる。ここに0本の出口を出すと
    // 「バスケットカウントなのにFTなし」といった規則にない記録ができてしまう
    it('シュートファウルのシューター選択には出さない', () => {
        vi.useFakeTimers();
        renderFlow(0);
        longPressPFoul();
        fireEvent.click(screen.getByText('2Pシュート中'));
        fireEvent.click(screen.getByText(/シュート失敗/));

        expect(screen.getByText('シューターを選択')).toBeTruthy();
        expect(screen.queryByText(/FTなし/)).toBeNull();
    });
});
