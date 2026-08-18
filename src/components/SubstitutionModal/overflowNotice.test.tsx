// 16人目を追加するときの案内。
//
// 従来は「これ以上は印刷・出力に収まりません」とだけ出していたが、実際に様式から
// 外れるのは追加する選手とは限らない。名簿は背番号順に並ぶため、若い番号を足すと
// 番号の大きい既存選手が押し出される（実測: 得点済みの #24 が消えた）。
// 事実と違う結果を伝えていたので、誰が外れるかを名指しする。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SubstitutionModal } from './SubstitutionModal';
import { createPlayer } from '../../types/game';
import type { Player } from '../../types/game';

afterEach(cleanup);

/** 背番号 10〜24 の15人（様式の枠がちょうど埋まった状態） */
const fifteen: Player[] = Array.from({ length: 15 }, (_, i) =>
    createPlayer(`p${i}`, 10 + i, `選手${10 + i}`));

function openAddForm(players: Player[]) {
    render(
        <SubstitutionModal
            teamName="ホーム"
            teamId="teamA"
            players={players}
            onSubstitute={vi.fn()}
            onAddPlayer={vi.fn()}
            onClose={vi.fn()}
        />
    );
    fireEvent.click(screen.getByText('+ 選手を追加'));
    return screen.getByPlaceholderText('No.') as HTMLInputElement;
}

const notice = () => screen.queryByRole('status');

describe('SubstitutionModal: 様式からあふれる選手の案内', () => {
    it('14人なら案内を出さない', () => {
        openAddForm(fifteen.slice(0, 14));
        expect(notice()).toBeNull();
    });

    it('15人で若い番号を入れると、押し出される既存選手を名指しする', () => {
        const input = openAddForm(fifteen);
        fireEvent.change(input, { target: { value: '4' } });

        const text = notice()?.textContent ?? '';
        expect(text).toContain('24');
        expect(text).toContain('選手24');
    });

    it('15人でいちばん大きい番号を入れると、追加する本人が載らないと伝える', () => {
        const input = openAddForm(fifteen);
        fireEvent.change(input, { target: { value: '99' } });

        const text = notice()?.textContent ?? '';
        expect(text).toContain('99');
        expect(text).not.toContain('選手24');
    });

    it('番号を入れる前でも、あふれること自体は伝える', () => {
        openAddForm(fifteen);
        expect(notice()?.textContent ?? '').toContain('15');
    });

    it('記録自体は残ることを伝える', () => {
        const input = openAddForm(fifteen);
        fireEvent.change(input, { target: { value: '4' } });
        expect(notice()?.textContent ?? '').toContain('記録は残ります');
    });
});
