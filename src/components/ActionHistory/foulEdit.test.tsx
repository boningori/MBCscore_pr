// 履歴からファウルの選手を直す。
//
// 「編集」はファウル行にも出ていたが、保存しても何も起きなかった。しかも
// entryType が 'P' で「シュート関連ではない」と判定されるため、種別の選択肢に
// OREB/DREB/AST/STL/BLK/TO が並び、初期値が OREB になっていた。
// 記録者にはモーダルが閉じるだけで、保存できたように見える。

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, within } from '@testing-library/react';
import { ActionHistory } from './ActionHistory';
import { createPlayer } from '../../types/game';
import type { FoulEntry } from '../../types/game';

afterEach(cleanup);

const players = [
    { ...createPlayer('p1', 4, 'たろう'), isOnCourt: true },
    { ...createPlayer('p2', 5, 'じろう'), isOnCourt: true },
];

const playerFoul: FoulEntry = {
    id: 'f1', teamId: 'teamA', playerId: 'p1', playerNumber: 4,
    foulType: 'P', quarter: 1, timestamp: 1000, isCoachOrBench: false,
    freeThrows: 2, freeThrowResults: ['made', 'missed'],
};

const coachFoul: FoulEntry = {
    id: 'f2', teamId: 'teamA', playerId: null, playerNumber: -1,
    foulType: 'T', quarter: 1, timestamp: 2000, isCoachOrBench: true,
    coachFoulTarget: 'COACH',
};

function renderHistory(fouls: FoulEntry[], handlers: Record<string, unknown> = {}) {
    const utils = render(
        <ActionHistory
            teamId="teamA" teamName="A"
            scoreHistory={[]} statHistory={[]} foulHistory={fouls}
            players={players}
            onRemoveScore={vi.fn()} onRemoveStat={vi.fn()} onRemoveFoul={vi.fn()}
            onEditScore={vi.fn()} onEditStat={vi.fn()}
            {...handlers}
        />
    );
    return within(utils.baseElement);
}

function openMenu(q: ReturnType<typeof within>) {
    fireEvent.keyDown(q.getAllByTitle('長押し、またはEnterで編集・削除')[0], { key: 'Enter' });
}

describe('ActionHistory: ファウルの編集', () => {
    it('選手を選び直して保存すると付け替えが呼ばれる', () => {
        const onEditFoul = vi.fn();
        const q = renderHistory([playerFoul], { onEditFoul });

        openMenu(q);
        fireEvent.click(q.getByText('編集'));
        fireEvent.change(q.getByLabelText('選手'), { target: { value: 'p2' } });
        fireEvent.click(q.getByText('保存'));

        expect(onEditFoul).toHaveBeenCalledWith('f1', 'p2');
    });

    it('スタッツの種別を選ばせない（ファウルはリバウンドに化けない）', () => {
        const q = renderHistory([playerFoul], { onEditFoul: vi.fn() });

        openMenu(q);
        fireEvent.click(q.getByText('編集'));

        // 背後の履歴一覧にも同じ文言があるので、モーダルの中だけを見る
        const dialog = within(q.getByRole('dialog'));
        expect(dialog.queryByLabelText('スタッツ種類')).toBeNull();
        expect(dialog.queryByLabelText('シュート結果')).toBeNull();
        // 何のファウルを直しているかは読めるようにする
        expect(dialog.getByText(/パーソナルファウル/)).toBeTruthy();
    });

    it('コーチ・ベンチのファウルには編集を出さない（移す先の選手行が無い）', () => {
        const q = renderHistory([coachFoul], { onEditFoul: vi.fn() });

        openMenu(q);

        expect(q.queryByText('編集')).toBeNull();
        expect(q.getByText('削除')).toBeTruthy();
    });

    it('付け替えの手段が無いときは編集を出さない', () => {
        const q = renderHistory([playerFoul]); // onEditFoul を渡さない

        openMenu(q);

        expect(q.queryByText('編集')).toBeNull();
    });
});
