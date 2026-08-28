// quarterEnd 中の「次のQへ」で、退場・失格した選手を無言で持ち越さない。
//
// このボタンは START_GAME を直接投げる。handleStartGame は isOnCourt しか見ないため、
// 前のクォーターで5ファウル（またはD1つ・T/U2つ）になった選手がコートに残ったまま、
// 次のクォーターのスターターとして記録されていた（実測: quartersPlayed[1] === 'starter'）。
//
// スタメン選択画面を通れば初期選択から外れる（QuarterLineup の initialSelection）ので、
// 同じ「次のQを始める」操作なのに経路で結果が食い違っていたことになる。
// 出場そのものは止めない（練習試合では合意のうえ続行することがある。utils/disqualification
// の方針）が、選び直す導線を添えて必ず知らせる。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useEffect } from 'react';
import { GameProvider, useGame } from '../../context/GameContext';
import type { GameAction, Team, Player } from '../../types/game';
import { createTeam, createPlayer } from '../../types/game';
import { Scoreboard } from './Scoreboard';

afterEach(cleanup);

function buildTeams(): { teamA: Team; teamB: Team } {
    const onCourt = (p: Player) => ({ ...p, isOnCourt: true });
    const teamA = createTeam('teamA', 'ホーム', 'コーチA');
    teamA.players = [
        createPlayer('a1', 4, '選手A1', true),
        createPlayer('a2', 5, '選手A2'),
    ].map(onCourt);
    const teamB = createTeam('teamB', 'ビジター', 'コーチB');
    teamB.players = [createPlayer('b1', 6, '選手B1', true)].map(onCourt);
    return { teamA, teamB };
}

// 検査したいのは記録の中身（a1 のQ2出場欄）で、スコアボードには出ない。
// レンダー中に外の変数へ書くのは副作用なので、状態を属性として描いて読む
function Harness({ initActions, onOpenLineup }: { initActions: GameAction[]; onOpenLineup?: () => void }) {
    const { state, dispatch } = useGame();
    useEffect(() => {
        initActions.forEach(a => dispatch(a));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 初回のみ
    }, []);
    return (
        <>
            <Scoreboard onOpenLineup={onOpenLineup} />
            <div
                data-testid="probe"
                data-phase={state.phase}
                // 初回レンダーは initActions が走る前なので名簿がまだ空
                data-a1-q2={String(state.teamA.players[0]?.quartersPlayed[1])}
            />
        </>
    );
}

const probe = () => screen.getByTestId('probe').dataset;

function renderWith(extraActions: GameAction[], { withOpenLineup = true } = {}) {
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
                onOpenLineup={withOpenLineup ? onOpenLineup : undefined}
            />
        </GameProvider>,
    );
    return { onOpenLineup };
}

const fiveFouls: GameAction[] = Array.from({ length: 5 }, () => ({
    type: 'ADD_FOUL' as const,
    payload: { teamId: 'teamA', playerId: 'a1', foulType: 'P' as const },
}));

/** a1 に5ファウルを付けてQ1を終え、quarterEnd（＝記録画面に戻った状態）にする */
const renderAfterFoulOut = (options?: { withOpenLineup?: boolean }) =>
    renderWith([...fiveFouls, { type: 'END_QUARTER' }], options);

describe('Scoreboard: 退場・失格の選手を残したまま次のクォーターへ進むとき', () => {
    it('「Q2へ」を押しても即座には開始せず、誰が退場なのかを知らせる', () => {
        renderAfterFoulOut();

        fireEvent.click(screen.getByText('Q2へ'));

        expect(screen.getByText('退場・失格の選手がコートに残っています')).toBeTruthy();
        // 誰なのかを言わないと、確認を出しても直しようがない
        expect(screen.getByText(/選手A1/)).toBeTruthy();
        // まだ開始していない
        expect(probe().phase).toBe('quarterEnd');
        expect(probe().a1Q2).toBe('false');
    });

    it('「このまま開始」を選べば従来どおり始められる（出場は止めない）', () => {
        renderAfterFoulOut();

        fireEvent.click(screen.getByText('Q2へ'));
        fireEvent.click(screen.getByText('このまま開始'));

        expect(probe().phase).toBe('playing');
        expect(probe().a1Q2).toBe('starter');
    });

    it('「スタメンを選び直す」でスタメン選択へ抜けられる（開始はしない）', () => {
        const { onOpenLineup } = renderAfterFoulOut();

        fireEvent.click(screen.getByText('Q2へ'));
        fireEvent.click(screen.getByText('スタメンを選び直す'));

        expect(onOpenLineup).toHaveBeenCalledTimes(1);
        expect(probe().phase).toBe('quarterEnd');
    });

    it('確認を閉じただけなら何も起きない', () => {
        renderAfterFoulOut();

        fireEvent.click(screen.getByText('Q2へ'));
        fireEvent.click(screen.getByText('キャンセル'));

        expect(screen.queryByText('退場・失格の選手がコートに残っています')).toBeNull();
        expect(probe().phase).toBe('quarterEnd');
    });

    it('開いた直後のフォーカスは「そのまま開始しない」側にある', () => {
        // Q終了直後は連打しがちで、素直に先頭へフォーカスが乗ると
        // その一打で退場者ごと開始してしまう（quarterEndConfirmModal と同じ判断）
        renderAfterFoulOut();

        fireEvent.click(screen.getByText('Q2へ'));

        expect((document.activeElement as HTMLElement)?.textContent).toContain('スタメンを選び直す');
    });

    it('スタメン選択へ抜ける導線が無い場合はキャンセルにフォーカスする', () => {
        renderAfterFoulOut({ withOpenLineup: false });

        fireEvent.click(screen.getByText('Q2へ'));

        expect(screen.queryByText('スタメンを選び直す')).toBeNull();
        expect((document.activeElement as HTMLElement)?.textContent).toContain('キャンセル');
    });

    it('D（ディスクォリファイイング）1つでも知らせる（5ファウルより先に来る）', () => {
        renderWith([
            { type: 'ADD_FOUL', payload: { teamId: 'teamA', playerId: 'a1', foulType: 'D' } },
            { type: 'END_QUARTER' },
        ]);

        fireEvent.click(screen.getByText('Q2へ'));

        expect(screen.getByText('退場・失格の選手がコートに残っています')).toBeTruthy();
        expect(screen.getByText('失格(D)')).toBeTruthy();
    });

    it('退場者がコートに居なければ確認を挟まず、従来どおり即座に開始する', () => {
        renderWith([
            { type: 'ADD_FOUL', payload: { teamId: 'teamA', playerId: 'a1', foulType: 'P' } },
            { type: 'END_QUARTER' },
        ]);

        fireEvent.click(screen.getByText('Q2へ'));

        expect(probe().phase).toBe('playing');
    });

    it('ベンチに下がった退場者は確認の対象にしない（次Qの記録に乗らないため）', () => {
        renderWith([
            ...fiveFouls,
            { type: 'SUBSTITUTE_PLAYER', payload: { teamId: 'teamA', playerInId: 'a2', playerOutId: 'a1' } },
            { type: 'END_QUARTER' },
        ]);

        fireEvent.click(screen.getByText('Q2へ'));

        expect(probe().phase).toBe('playing');
    });
});
