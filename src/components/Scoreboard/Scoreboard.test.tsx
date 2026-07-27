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
function Harness({ initActions, onQuarterEnd, onOpenLineup, mode }: {
    initActions: GameAction[];
    onQuarterEnd: () => void;
    onOpenLineup?: () => void;
    mode: 'full' | 'simple';
}) {
    const { dispatch } = useGame();
    useEffect(() => {
        initActions.forEach(a => dispatch(a));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 初回のみ
    }, []);
    return (
        <Scoreboard
            onQuarterEnd={onQuarterEnd}
            onOpenLineup={onOpenLineup}
            onTimeout={() => {}}
            mode={mode}
        />
    );
}

function renderScoreboard(
    extraActions: GameAction[] = [],
    { withOpenLineup = false, mode = 'full' as 'full' | 'simple' } = {},
) {
    const onQuarterEnd = vi.fn();
    const onOpenLineup = vi.fn();
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
                onOpenLineup={withOpenLineup ? onOpenLineup : undefined}
                mode={mode}
            />
        </GameProvider>,
    );
    return { onQuarterEnd, onOpenLineup };
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

describe('Scoreboard: フルモードのスコアブロック', () => {
    it('スコアブロックに両チーム名が表示される', () => {
        renderScoreboard();
        expect(screen.getByText('ホーム')).toBeTruthy();
        expect(screen.getByText('ビジター')).toBeTruthy();
    });

    it('TF・タイムアウトはTeamPanel側に移設したためスコアボードには表示しない', () => {
        renderScoreboard();
        expect(screen.queryByRole('button', { name: 'タイムアウト' })).toBeNull();
        expect(screen.queryByText(/^TF /)).toBeNull();
    });
});

describe('Scoreboard: スタメン選択画面への復帰', () => {
    it('quarterEnd中は「スタメン選択へ」が表示され、押すとonOpenLineupが呼ばれる', () => {
        const { onOpenLineup } = renderScoreboard([{ type: 'END_QUARTER' }], { withOpenLineup: true });

        fireEvent.click(screen.getByText('スタメン選択へ'));

        expect(onOpenLineup).toHaveBeenCalledTimes(1);
    });

    it('シンプルモードでも quarterEnd 中は「スタメン選択へ」を表示する', () => {
        const { onOpenLineup } = renderScoreboard([{ type: 'END_QUARTER' }], {
            withOpenLineup: true,
            mode: 'simple',
        });

        fireEvent.click(screen.getByText('スタメン選択へ'));

        expect(onOpenLineup).toHaveBeenCalledTimes(1);
    });

    it('playing中は「スタメン選択へ」を表示しない', () => {
        renderScoreboard([], { withOpenLineup: true });

        expect(screen.queryByText('スタメン選択へ')).toBeNull();
    });

    it('onOpenLineup未指定なら表示しない（既存の呼び出し元を壊さない）', () => {
        renderScoreboard([{ type: 'END_QUARTER' }]);

        expect(screen.queryByText('スタメン選択へ')).toBeNull();
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
