// FTを打つ選手が負傷退場した場合。
//
// 規則では、シューターが負傷・失格でコートを離れたら、交代で入った選手が
// 残りのFTを打つ。ところが候補リストは isOnCourt から引き直すので、
// 選択済みのシューターが下がると候補から消える。
//
// 1本目を打った後に離れた場合、成功分は本人に残り、残りは交代選手が打つ。
// この記録が持てるシューターは1人だけ（FoulRecord.shooterPlayerId）なので、
// 正確には表せない。黙って寄せず、ずれることを画面に出す。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FoulInputFlow } from './FoulInputFlow';
import { createPlayer } from '../../types/game';
import type { Player } from '../../types/game';

afterEach(cleanup);

const onCourt = (id: string, number: number, name: string): Player =>
    ({ ...createPlayer(id, number, name), isOnCourt: true });

function flow(opponentPlayers: Player[]) {
    return (
        <FoulInputFlow
            hasSelectedPlayer
            playerName="佐藤 花子"
            playerNumber={5}
            teamFouls={4}
            opponentTeamId="teamB"
            opponentTeamName="相手"
            opponentPlayers={opponentPlayers}
            onComplete={vi.fn()}
            onCancel={vi.fn()}
        />
    );
}

function renderFlow(opponentPlayers: Player[]) {
    const { rerender } = render(flow(opponentPlayers));
    /** 交代が起きた後の再描画。App から新しい opponentPlayers が降ってくる想定 */
    const substitute = (next: Player[]) => rerender(flow(next));
    return { substitute };
}

function tapPFoul() {
    fireEvent.keyDown(screen.getByText('パーソナルファウル').closest('button')!, { key: 'Enter' });
}

describe('シューターがコートを離れたとき', () => {
    it('シューター選択の段階なら「次へ」が押せなくなり、選び直しを促す', () => {
        const injured = onCourt('b1', 10, '相手1');
        const bench = { ...createPlayer('b3', 12, '交代選手'), isOnCourt: false };
        const { substitute } = renderFlow([injured, onCourt('b2', 11, '相手2'), bench]);

        tapPFoul();
        fireEvent.click(screen.getByText('相手1').closest('button')!);
        expect((screen.getByText('次へ') as HTMLButtonElement).disabled).toBe(false);

        // 負傷交代: 相手1 が下がり、交代選手が入る
        substitute([
            { ...injured, isOnCourt: false },
            onCourt('b2', 11, '相手2'),
            { ...bench, isOnCourt: true },
        ]);

        expect(screen.getByText(/シューターが交代でコートを離れました/)).toBeTruthy();
        expect((screen.getByText('次へ') as HTMLButtonElement).disabled).toBe(true);
        // 交代で入った選手が候補に並ぶ
        expect(screen.getByText('交代選手')).toBeTruthy();
    });

    it('FT未入力なら「シューターを選び直す」でシューター選択へ戻る', () => {
        const injured = onCourt('b1', 10, '相手1');
        const bench = { ...createPlayer('b3', 12, '交代選手'), isOnCourt: false };
        const { substitute } = renderFlow([injured, onCourt('b2', 11, '相手2'), bench]);

        tapPFoul();
        fireEvent.click(screen.getByText('相手1').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));
        substitute([
            { ...injured, isOnCourt: false },
            onCourt('b2', 11, '相手2'),
            { ...bench, isOnCourt: true },
        ]);

        expect(screen.getByText('シューターを選び直す')).toBeTruthy();
        // 個人成績がずれる旨の注意は、まだ1本も打っていないので出さない
        expect(screen.queryByText(/個人の得点とFT%が実際とずれます/)).toBeNull();

        fireEvent.click(screen.getByText('シューターを選び直す'));
        expect(screen.getByText('シューターを選択')).toBeTruthy();
    });

    it('FT入力済みなら、ずれる旨を出したうえで「記録」は押せる', () => {
        const injured = onCourt('b1', 10, '相手1');
        const bench = { ...createPlayer('b3', 12, '交代選手'), isOnCourt: false };
        const { substitute } = renderFlow([injured, onCourt('b2', 11, '相手2'), bench]);

        tapPFoul();
        fireEvent.click(screen.getByText('相手1').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));
        // 2本とも入力しておく（記録が押せる状態にする）
        fireEvent.click(screen.getAllByText('○ 成功')[0]);
        fireEvent.click(screen.getAllByText('× 失敗')[1]);

        substitute([
            { ...injured, isOnCourt: false },
            onCourt('b2', 11, '相手2'),
            { ...bench, isOnCourt: true },
        ]);

        expect(screen.getByText(/個人の得点とFT%が実際とずれます/)).toBeTruthy();
        expect(screen.getByText('シューターを変更')).toBeTruthy();
        expect((screen.getByText('記録') as HTMLButtonElement).disabled).toBe(false);
    });

    it('「シューターを変更」で戻っても、入力済みのFT結果が消えない', () => {
        const injured = onCourt('b1', 10, '相手1');
        const bench = { ...createPlayer('b3', 12, '交代選手'), isOnCourt: false };
        const { substitute } = renderFlow([injured, onCourt('b2', 11, '相手2'), bench]);

        tapPFoul();
        fireEvent.click(screen.getByText('相手1').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));
        fireEvent.click(screen.getAllByText('○ 成功')[0]);
        substitute([
            { ...injured, isOnCourt: false },
            onCourt('b2', 11, '相手2'),
            { ...bench, isOnCourt: true },
        ]);

        fireEvent.click(screen.getByText('シューターを変更'));
        fireEvent.click(screen.getByText('交代選手').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));

        // 1本目の成功が残っている（handleBack と違い結果を初期化しない）
        expect(screen.getByText('結果: 1/2 成功 (+1点)')).toBeTruthy();
        expect(screen.getByText('シューター: #12 交代選手')).toBeTruthy();
    });

    it('コートを離れてもシューター表示が空欄にならない', () => {
        const injured = onCourt('b1', 10, '相手1');
        const { substitute } = renderFlow([injured, onCourt('b2', 11, '相手2')]);

        tapPFoul();
        fireEvent.click(screen.getByText('相手1').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));
        expect(screen.getByText('シューター: #10 相手1')).toBeTruthy();

        substitute([{ ...injured, isOnCourt: false }, onCourt('b2', 11, '相手2')]);

        expect(screen.getByText('シューター: #10 相手1')).toBeTruthy();
    });
});
