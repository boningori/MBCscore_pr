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
function Harness({ initActions, onQuarterEnd, onOpenLineup }: {
    initActions: GameAction[];
    onQuarterEnd: () => void;
    onOpenLineup?: () => void;
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
        />
    );
}

function renderScoreboard(
    extraActions: GameAction[] = [],
    { withOpenLineup = false } = {},
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

    it('開いた直後のフォーカスは打ち消し側にある', () => {
        // 試合中は片手で連打しているため、確認が出た瞬間にもう一度指が触れる。
        // 素直に先頭（終了する）へフォーカスが乗ると、その一打で確定してしまう
        renderScoreboard();
        fireEvent.click(screen.getByText('Q1終了'));
        expect(document.activeElement?.textContent).toBe('キャンセル');
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

    // Scoreboard はフル/シンプルで分岐しない（component側のコメント参照）。
    // 以前このテストは mode='simple' を渡していたが、Scoreboard は
    // その prop を受け取らないので黙って無視されており、
    // 「シンプルモードでも」を実際には確かめていなかった
    it('quarterEnd 中の「スタメン選択へ」はモードに関係なく出る', () => {
        const { onOpenLineup } = renderScoreboard([{ type: 'END_QUARTER' }], {
            withOpenLineup: true,
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

    // reducer側は新Qの保留が残っていると取り消しを拒む（handleUndoQuarterEnd）。
    // ボタンの出し分けが同じ条件を見ていないと、押しても何も起きない
    // ボタンが残り、記録者は「効かない」としか分からない
    it('新Qの保留アクションが残っている間は「終了を取り消す」を出さない', () => {
        renderScoreboard([
            { type: 'END_QUARTER' },
            {
                type: 'ADD_PENDING_ACTION',
                payload: {
                    id: 'pending-1',
                    actionType: 'FOUL',
                    value: 'P',
                    teamId: 'teamA',
                    quarter: 2,
                    timestamp: Date.now(),
                    playersOnCourt: [],
                    candidatePlayerIds: [],
                },
            },
        ]);

        expect(screen.getByText('Q2へ')).toBeTruthy();
        expect(screen.queryByText('終了を取り消す')).toBeNull();
    });
});

// クォーター色はJBA様式の「赤=1Q/3Q・黒=2Q/4Q」に統一する。
// RunningScoresheet と QuarterLineup が既にこの規約に従っており、
// スコアボードだけが緑グラデーションで食い違っていた。
describe('Scoreboard: Qバッジのクォーター色クラス', () => {
    const badgeClass = () =>
        document.querySelector('.quarter-badge-large')!.className;

    const advance = (times: number) =>
        Array.from({ length: times }, () => [
            { type: 'END_QUARTER' } as const,
            { type: 'START_GAME' } as const,
        ]).flat();

    it('Q1は q-odd', () => {
        renderScoreboard();
        expect(badgeClass()).toContain('q-odd');
    });

    it('Q2は q-even', () => {
        renderScoreboard(advance(1));
        expect(badgeClass()).toContain('q-even');
    });

    it('Q3は q-odd', () => {
        renderScoreboard(advance(2));
        expect(badgeClass()).toContain('q-odd');
    });

    it('Q4は q-even', () => {
        renderScoreboard(advance(3));
        expect(badgeClass()).toContain('q-even');
    });

    it('OTは q-even（QuarterLineupと同じ扱い）', () => {
        renderScoreboard(advance(4));
        expect(badgeClass()).toContain('q-even');
    });

    it('旧クラス（q1〜q4 / ot）は残っていない', () => {
        renderScoreboard();
        const cls = badgeClass().split(/\s+/);
        expect(cls).not.toContain('q1');
        expect(cls).not.toContain('ot');
    });
});
