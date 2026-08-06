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
