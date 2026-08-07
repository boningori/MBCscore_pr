import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SubstitutionModal } from './SubstitutionModal';
import { createPlayer } from '../../types/game';
import type { Player } from '../../types/game';

afterEach(cleanup);

function player(id: string, number: number, name: string, isOnCourt: boolean, fouls = 0): Player {
    return {
        ...createPlayer(id, number, name),
        isOnCourt,
        fouls: Array.from({ length: fouls }, () => 'P' as const),
    };
}

function renderModal(players: Player[], onSubstitute = vi.fn()) {
    render(
        <SubstitutionModal
            teamName="白チーム"
            teamId="teamA"
            players={players}
            onSubstitute={onSubstitute}
            onClose={() => {}}
        />,
    );
    return onSubstitute;
}

describe('SubstitutionModal ファウルアウト（非強制・練習試合での続行に対応）', () => {
    it('5ファウルのベンチ選手も IN 候補に表示され、交代を実行できる', () => {
        const onSubstitute = renderModal([
            player('onCourt', 4, 'コート上', true),
            player('out', 9, '退場者', false, 5),
        ]);

        const inCard = screen.getByRole('button', { name: /退場者/ });
        fireEvent.click(inCard);
        fireEvent.click(screen.getByRole('button', { name: /コート上/ }));
        fireEvent.click(screen.getByRole('button', { name: '交代実行' }));

        expect(onSubstitute).toHaveBeenCalledWith('out', 'onCourt');
    });

    it('5ファウルの選手には「退場」を併記し、4ファウルには併記しない', () => {
        renderModal([
            player('onCourt', 4, 'コート上', true),
            player('out', 9, '退場者', false, 5),
            player('trouble', 8, 'トラブル', false, 4),
        ]);

        expect(screen.getByRole('button', { name: /退場者/ }).textContent).toContain('退場');
        expect(screen.getByRole('button', { name: /トラブル/ }).textContent).not.toContain('退場');
    });

    it('ベンチ全員が5ファウルでも「ベンチに選手がいません」にはならない', () => {
        renderModal([
            player('onCourt', 4, 'コート上', true),
            player('out', 9, '退場者', false, 5),
        ]);

        expect(screen.queryByText('ベンチに選手がいません')).toBeNull();
    });
});

// 公式様式の選手欄は15人分しかない。試合中の追加には上限チェックが無く、
// 実測で22人まで登録できた（スコアシートの行があふれる）。
// ただし練習試合で人数が読めない場面もあるため、止めずに警告だけ出す。
describe('SubstitutionModal 登録人数の上限', () => {
    function renderWithAdd(count: number) {
        const onAddPlayer = vi.fn();
        const players = Array.from({ length: count }, (_, i) =>
            player(`p${i}`, i + 1, `選手${i + 1}`, i < 5),
        );
        render(
            <SubstitutionModal
                teamName="白チーム"
                teamId="teamA"
                players={players}
                onSubstitute={vi.fn()}
                onAddPlayer={onAddPlayer}
                onClose={() => {}}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: '+ 選手を追加' }));
        return onAddPlayer;
    }

    it('15人に達したら、スコアシートに収まらないことを知らせる', () => {
        renderWithAdd(15);

        expect(screen.getByText(/15人/)).toBeTruthy();
        expect(screen.getByText(/スコアシート/)).toBeTruthy();
    });

    it('15人未満では警告を出さない', () => {
        renderWithAdd(14);

        expect(screen.queryByText(/スコアシート/)).toBeNull();
    });

    it('警告が出ていても追加自体は止めない', () => {
        const onAddPlayer = renderWithAdd(15);

        fireEvent.change(screen.getByPlaceholderText('No.'), { target: { value: '77' } });
        fireEvent.click(screen.getByRole('button', { name: '追加' }));

        expect(onAddPlayer).toHaveBeenCalledWith(77, '選手77');
    });
});
