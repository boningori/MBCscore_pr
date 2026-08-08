// チームファウル4個の状態で入力するファウルは、それ自体がペナルティ（FT2本）。
//
// 表示は「次からペナルティ」と読ませていたが、同じ画面の isPenalty と
// suggestFreeThrowCount は teamFouls >= 4 で既にFT2本を提案する。
// 記録者が「まだFTなし」と判断した直後にFT入力を求められ、案内と挙動が食い違う。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FoulInputFlow } from './FoulInputFlow';
import { suggestFreeThrowCount } from '../../types/game';

afterEach(cleanup);

const noop = vi.fn();

function renderWithTeamFouls(teamFouls: number) {
    render(
        <FoulInputFlow
            onComplete={noop}
            onCancel={noop}
            hasSelectedPlayer={true}
            teamFouls={teamFouls}
            opponentTeamId="teamB"
            opponentPlayers={[]}
            opponentTeamName="相手チーム"
        />,
    );
}

describe('チームファウルのペナルティ表示', () => {
    it('4個の時点で入力するファウルは実際にFT2本になる', () => {
        // 表示の前提。ここが0本なら「次からペナルティ」が正しいことになる
        expect(suggestFreeThrowCount('P', 4, 'none')).toBe(2);
    });

    it('4個ならこのファウルがペナルティだと表示する', () => {
        renderWithTeamFouls(4);
        expect(screen.getByText(/このファウルからペナルティ/)).toBeTruthy();
        expect(screen.queryByText(/次からペナルティ/)).toBeNull();
    });

    it('3個以下ならペナルティ表示は出さない', () => {
        renderWithTeamFouls(3);
        expect(screen.queryByText(/ペナルティ/)).toBeNull();
    });
});
