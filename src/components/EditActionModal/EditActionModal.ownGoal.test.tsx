// OG中はミスへの変換を選ばせない。
//
// reducer側は OG の得点をミスへ変換しない（scoreHandlers）。選択肢に残したままだと、
// 「2Pミス」を選んで保存ボタンを押しても何も起きず、理由も出ない無言の失敗になる。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { EditActionModal } from './EditActionModal';
import { createPlayer } from '../../types/game';

afterEach(cleanup);

const players = [createPlayer('p1', 4, 'A'), createPlayer('p2', 5, 'B')];

function renderModal(isOwnGoal: boolean) {
    render(
        <EditActionModal
            item={{ id: 's1', type: 'score', entryType: '2P', playerId: 'p1', playerNumber: 4, isOwnGoal }}
            players={players}
            onSave={vi.fn()}
            onCancel={vi.fn()}
        />
    );
    return screen.getByLabelText('シュート結果') as HTMLSelectElement;
}

const optionValues = (select: HTMLSelectElement) =>
    Array.from(select.options).map(o => o.value);

describe('EditActionModal のオウンゴール', () => {
    it('OGの得点ではミスの選択肢を出さない', () => {
        const select = renderModal(true);
        expect(optionValues(select)).toEqual(['2P', '3P', 'FT']);
    });

    it('OGでない得点では従来どおりミスも選べる', () => {
        const select = renderModal(false);
        expect(optionValues(select)).toEqual(['2P', '2PA', '3P', '3PA', 'FT', 'FTA']);
    });

    // OGを外してからミスへ変換する、という一連の訂正が1回の保存で起きる。
    // OG解除を変換より後に投げると、reducerは「まだOG」と見て変換を弾き、
    // 記録が変わらないまま画面だけ閉じる
    it('OGを外して同時にミスへ変換すると、解除が変換より先に届く', () => {
        const calls: string[] = [];
        const onToggleOwnGoal = vi.fn(() => { calls.push('toggleOwnGoal'); });
        const onConvertScoreToMiss = vi.fn(() => { calls.push('convertToMiss'); });

        render(
            <EditActionModal
                item={{ id: 's1', type: 'score', entryType: '2P', playerId: 'p1', playerNumber: 4, isOwnGoal: true }}
                players={players}
                onSave={vi.fn()}
                onToggleOwnGoal={onToggleOwnGoal}
                onConvertScoreToMiss={onConvertScoreToMiss}
                onCancel={vi.fn()}
            />
        );

        fireEvent.click(screen.getByLabelText('相手チームのオウンゴール（▲）'));
        fireEvent.change(screen.getByLabelText('シュート結果'), { target: { value: '2PA' } });
        fireEvent.click(screen.getByRole('button', { name: '変換' }));

        expect(calls).toEqual(['toggleOwnGoal', 'convertToMiss']);
        expect(onConvertScoreToMiss).toHaveBeenCalledWith('s1', '2PA');
    });
});
