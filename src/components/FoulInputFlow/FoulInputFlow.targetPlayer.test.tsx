// 「誰のファウルか」を、どの段でも出す。
//
// 以前は「現在N個のファウル」を出すついでに名前が見えるだけで、条件が
// currentFoulCount > 0 だった。つまりその選手の1個目——いちばん多いケース——では
// 対象選手がどこにも出ず、「ファウル種類を選択／チームファウル: 0個」しか
// 読めない。選手カードは暗幕の下なので、押し間違えても確定前に気づけない。
// ファウルは失格判定と公式様式に直結する。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FoulInputFlow } from './FoulInputFlow';
import { createPlayer } from '../../types/game';

afterEach(cleanup);

const OPPONENTS = [createPlayer('b1', 10, '相手1'), createPlayer('b2', 11, '相手2')];

function renderFlow(overrides: Partial<Parameters<typeof FoulInputFlow>[0]> = {}) {
    render(
        <FoulInputFlow
            hasSelectedPlayer
            playerName="佐藤 花子"
            playerNumber={5}
            teamFouls={0}
            opponentTeamId="teamB"
            opponentTeamName="相手"
            opponentPlayers={OPPONENTS}
            onComplete={vi.fn()}
            onCancel={vi.fn()}
            {...overrides}
        />,
    );
}

describe('ファウル入力: 対象選手の表示', () => {
    it('1個目のファウルでも背番号と氏名が出る', () => {
        renderFlow({ currentFoulCount: 0 });

        expect(screen.getByText('ファウルした選手')).toBeTruthy();
        expect(screen.getByText('#5 佐藤 花子')).toBeTruthy();
    });

    it('2個目以降はファウル数も添える', () => {
        renderFlow({ currentFoulCount: 2 });

        expect(screen.getByText('#5 佐藤 花子')).toBeTruthy();
        expect(screen.getByText(/現在2個/)).toBeTruthy();
    });

    it('種別を選んだあとの段でも出たまま', () => {
        renderFlow({ currentFoulCount: 0 });

        // Shift+Enter は長押し相当＝シュートファウルの分岐（handlePFoulKeyDown）
        const pFoul = screen.getByText('パーソナルファウル').closest('button')!;
        fireEvent.keyDown(pFoul, { key: 'Enter', shiftKey: true });

        // 種別選択の段から先へ進んでいること
        expect(screen.queryByText('ファウル種類を選択')).toBeNull();
        expect(screen.getByText('#5 佐藤 花子')).toBeTruthy();
    });

    it('ベンチ・コーチのファウルでは出さない（対象が選手ではない）', () => {
        renderFlow({
            hasSelectedPlayer: false,
            benchFoulMode: true,
            benchFoulType: 'T',
            benchFoulLabel: 'ヘッドコーチ',
            playerName: undefined,
            playerNumber: undefined,
        });

        expect(screen.queryByText('ファウルした選手')).toBeNull();
    });
});
