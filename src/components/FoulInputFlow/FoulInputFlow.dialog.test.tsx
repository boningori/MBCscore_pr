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

// 端末の戻る操作（Androidの戻るボタン／エッジスワイプ）は popstate として届き、
// useScreenHistorySync が最前面のモーダルへ閉じる要求を出す（modalStack）。
// それが onCancel に繋がっていたため、シューター選択やFT結果まで進んでいても
// 入力全部が消えていた。画面上の「← 戻る」は1ステップ戻すので、
// 同じ「戻る」でハードとソフトの挙動が食い違っていたことになる。
describe('FoulInputFlow の戻る操作', () => {
    /** T（テクニカル）を選んでFT本数選択へ進む */
    function advanceToFtCount() {
        fireEvent.click(screen.getByText('テクニカルファウル').closest('button')!);
    }

    it('途中のステップでのEscapeは1ステップ戻すだけで、入力を捨てない', () => {
        const onCancel = renderFlow();
        advanceToFtCount();
        expect(screen.getByText('フリースロー本数を選択')).toBeTruthy();

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        expect(screen.getByText('ファウル種類を選択')).toBeTruthy();
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('最初のステップでのEscapeは従来どおり取り消し', () => {
        const onCancel = renderFlow();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    // 記録中にダイアログの外を触るのは日常的に起きる。試合終了確認などは
    // すでに closeOnOverlayClick={false} を指定しているのに、いちばん入力量の
    // 多いここだけ既定の true のままだった
    it('オーバーレイを触っても閉じない', () => {
        const onCancel = renderFlow();
        advanceToFtCount();

        fireEvent.click(document.querySelector('.foul-input-flow-overlay')!);

        expect(onCancel).not.toHaveBeenCalled();
        expect(screen.getByText('フリースロー本数を選択')).toBeTruthy();
    });
});
