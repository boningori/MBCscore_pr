import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { createPlayer } from '../../types/game';
import { FoulInputFlow } from './FoulInputFlow';

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

function renderFlow(onCancel = vi.fn()) {
    render(
        <FoulInputFlow
            onComplete={() => { }}
            onCancel={onCancel}
            hasSelectedPlayer
            playerName="選手A1"
            currentFoulCount={0}
            teamFouls={0}
            opponentTeamId="teamB"
            opponentPlayers={[{ ...createPlayer('b1', 6, '選手B1'), isOnCourt: true }]}
            opponentTeamName="ビジター"
        />
    );
    return onCancel;
}

// ファウル入力は試合中いちばん深い階層のオーバーレイで、
// 開いている間は背後のスコアボードや選手カードを操作させてはいけない。
// 共通のModalに載せて dialog / フォーカストラップ / Escape を揃える。
describe('FoulInputFlow のオーバーレイ', () => {
    it('ダイアログとして扱われる', () => {
        renderFlow();
        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('見出しがダイアログの名前になっている', () => {
        renderFlow();
        expect(screen.getByRole('dialog', { name: /ファウル/ })).toBeTruthy();
    });

    it('開いたら中の要素へフォーカスが移る', () => {
        renderFlow();
        const dialog = screen.getByRole('dialog');
        expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('Escapeで取り消せる', () => {
        const onCancel = renderFlow();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});
