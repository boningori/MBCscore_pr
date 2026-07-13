import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { useEffect } from 'react';
import { GameProvider, useGame } from '../../context/GameContext';
import type { GameAction, Team, Player } from '../../types/game';
import { createTeam, createPlayer } from '../../types/game';
import { Scoreboard } from './Scoreboard';

afterEach(cleanup);

function buildTeams(): { teamA: Team; teamB: Team } {
    const withCourt = (p: Player) => ({ ...p, isOnCourt: true });
    const teamA = createTeam('teamA', 'ホーム', 'コーチA');
    teamA.players = [createPlayer('a1', 4, '選手A1', true)].map(withCourt);
    const teamB = createTeam('teamB', 'ビジター', 'コーチB');
    teamB.players = [createPlayer('b1', 6, '選手B1', true)].map(withCourt);
    return { teamA, teamB };
}

// マウント時に指定アクションをディスパッチしてScoreboardを描画するハーネス
function Harness({ initActions, onQuarterEnd }: { initActions: GameAction[]; onQuarterEnd: () => void }) {
    const { dispatch } = useGame();
    useEffect(() => {
        initActions.forEach(a => dispatch(a));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 初回のみ
    }, []);
    return <Scoreboard onQuarterEnd={onQuarterEnd} onTimeout={() => {}} mode="full" />;
}

function renderScoreboard(extraActions: GameAction[] = []) {
    const onQuarterEnd = vi.fn();
    const { teamA, teamB } = buildTeams();
    render(
        <GameProvider>
            <Harness
                initActions={[
                    { type: 'SET_TEAMS', payload: { teamA, teamB } },
                    { type: 'START_GAME' },
                    ...extraActions,
                ]}
                onQuarterEnd={onQuarterEnd}
            />
        </GameProvider>,
    );
    return { onQuarterEnd };
}

describe('Scoreboard: クォーター終了の確認', () => {
    it('Q1終了を押すと確認モーダルが出て、即座にはonQuarterEndを呼ばない', () => {
        const { onQuarterEnd } = renderScoreboard();
        fireEvent.click(screen.getByText('Q1終了'));
        expect(onQuarterEnd).not.toHaveBeenCalled();
        expect(screen.getByText('Q1を終了しますか？')).toBeTruthy();
    });

    it('確認モーダルで「終了する」を押すとonQuarterEndが呼ばれる', () => {
        const { onQuarterEnd } = renderScoreboard();
        fireEvent.click(screen.getByText('Q1終了'));
        fireEvent.click(screen.getByText('終了する'));
        expect(onQuarterEnd).toHaveBeenCalledTimes(1);
    });

    it('確認モーダルで「キャンセル」を押すと閉じて何も起きない', () => {
        const { onQuarterEnd } = renderScoreboard();
        fireEvent.click(screen.getByText('Q1終了'));
        fireEvent.click(screen.getByText('キャンセル'));
        expect(onQuarterEnd).not.toHaveBeenCalled();
        expect(screen.queryByText('Q1を終了しますか？')).toBeNull();
    });

    it('Q4終了は確認なしで直接onQuarterEndを呼ぶ（試合終了確認はApp側で行うため）', () => {
        const { onQuarterEnd } = renderScoreboard([
            { type: 'END_QUARTER' }, { type: 'START_GAME' },
            { type: 'END_QUARTER' }, { type: 'START_GAME' },
            { type: 'END_QUARTER' }, { type: 'START_GAME' },
        ]);
        fireEvent.click(screen.getByText('Q4終了'));
        expect(onQuarterEnd).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Q4を終了しますか？')).toBeNull();
    });
});

describe('Scoreboard: クォーター終了の取り消し', () => {
    it('quarterEnd中は「終了を取り消す」ボタンが表示され、押すと前Qのplayingに戻る', () => {
        renderScoreboard([{ type: 'END_QUARTER' }]);
        // Q2の開始待ち状態
        expect(screen.getByText('Q2へ')).toBeTruthy();

        act(() => {
            fireEvent.click(screen.getByText('終了を取り消す'));
        });

        expect(screen.getByText('Q1終了')).toBeTruthy();
        expect(screen.queryByText('Q2へ')).toBeNull();
    });
});
