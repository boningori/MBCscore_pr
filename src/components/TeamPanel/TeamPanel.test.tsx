import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TeamPanel } from './TeamPanel';
import { createPlayer } from '../../types/game';

afterEach(cleanup);

const noopHandlers = {
    onRemoveScore: vi.fn(),
    onRemoveStat: vi.fn(),
    onRemoveFoul: vi.fn(),
    onEditScore: vi.fn(),
    onEditStat: vi.fn(),
    onConvertScoreToMiss: vi.fn(),
    onConvertMissToScore: vi.fn(),
    onToggleOwnGoal: vi.fn(),
};

function renderPanel(extra: Partial<React.ComponentProps<typeof TeamPanel>> = {}) {
    const onTimeoutRequest = vi.fn();
    render(
        <TeamPanel
            teamId="teamA"
            teamName="ホーム"
            teamColor="white"
            players={[{ ...createPlayer('a1', 4, '選手4', true), isOnCourt: true }]}
            isActive={false}
            selectedPlayerId={null}
            gameMode="full"
            scoreHistory={[]}
            statHistory={[]}
            foulHistory={[]}
            onPlayerSelect={vi.fn()}
            onSubstitute={vi.fn()}
            onCoachFoul={vi.fn()}
            actionHistoryHandlers={noopHandlers}
            {...extra}
        />,
    );
    return { onTimeoutRequest };
}

describe('TeamPanel: ヘッダーのTF・タイムアウト表示', () => {
    it('teamFoulsを渡すとヘッダーにTFバッジが表示される', () => {
        renderPanel({ teamFouls: 3 });
        expect(screen.getByText('TF 3')).toBeTruthy();
    });

    it('タイムアウト未使用時はチップが「残1」で有効、クリックでonTimeoutRequestが呼ばれる', () => {
        const onTimeoutRequest = vi.fn();
        renderPanel({ teamFouls: 0, timeoutUsed: false, onTimeoutRequest });
        const chip = screen.getByRole('button', { name: 'タイムアウト' });
        expect(chip.textContent).toContain('残1');
        fireEvent.click(chip);
        expect(onTimeoutRequest).toHaveBeenCalledTimes(1);
    });

    it('タイムアウト使用済みは「済」で無効化される', () => {
        renderPanel({ teamFouls: 0, timeoutUsed: true, onTimeoutRequest: vi.fn() });
        const chip = screen.getByRole('button', { name: 'タイムアウト' }) as HTMLButtonElement;
        expect(chip.textContent).toContain('済');
        expect(chip.disabled).toBe(true);
    });

    it('props未指定(シンプルモード等)ではTF・タイムアウトを表示しない', () => {
        renderPanel();
        expect(screen.queryByText(/^TF /)).toBeNull();
        expect(screen.queryByRole('button', { name: 'タイムアウト' })).toBeNull();
    });
});
