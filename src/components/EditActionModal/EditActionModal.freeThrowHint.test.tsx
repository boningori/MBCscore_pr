// 外したFTは StatEntry を作らない（本数だけシューターのスタッツに入る）ため、
// シューター側のアクション履歴には現れず、そこからは直せない。
// FTの成否を持っている記録はファウルの行だけなのに、その編集で直せるのは
// 「誰が犯したか」だけ——本数と成否まで変えられるようにすると、公式様式の表記と
// FTの本数が辻褄の合わない組み合わせを作れてしまうため（handleEditFoul）。
// 入れ直しが要ることを言わないと、利用者は直す場所を探し続けることになる。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { EditActionModal } from './EditActionModal';
import { createPlayer } from '../../types/game';

const players = [createPlayer('p1', 4, '山田太郎'), createPlayer('p2', 5, '鈴木花子')];

function renderModal(item: Partial<Parameters<typeof EditActionModal>[0]['item']> = {}) {
    render(
        <EditActionModal
            item={{
                id: 'f1', type: 'foul', entryType: 'P', playerId: 'p1', playerNumber: 4,
                typeLabel: 'パーソナルファウル', ...item,
            }}
            players={players}
            onSave={vi.fn()}
            onCancel={vi.fn()}
        />,
    );
}

const hint = () => screen.queryByText(/FTの成否を直すには/);

afterEach(cleanup);

describe('ファウル編集でのFTの案内', () => {
    it('FT付きのファウルなら直し方を案内する', () => {
        renderModal({ hasFreeThrows: true });
        expect(hint()).toBeTruthy();
    });

    it('FTの無いファウルには出さない（関係のない注意書きを増やさない）', () => {
        renderModal({ hasFreeThrows: false });
        expect(hint()).toBeNull();
    });

    // 旧い呼び出し元がフラグを渡さない場合も、余計な案内を出さない
    it('フラグが無ければ出さない', () => {
        renderModal();
        expect(hint()).toBeNull();
    });

    it('得点の編集には出さない（FTのミスはこの行の話ではない）', () => {
        renderModal({ type: 'score', entryType: 'FT', hasFreeThrows: true });
        expect(hint()).toBeNull();
    });
});
