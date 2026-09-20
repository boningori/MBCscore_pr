import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { createPlayer } from '../../types/game';
import { TeamPanel } from './TeamPanel';

afterEach(cleanup);

const handlers = {
    onRemoveScore: vi.fn(), onRemoveStat: vi.fn(), onRemoveFoul: vi.fn(),
    onEditScore: vi.fn(), onEditStat: vi.fn(), onEditFoul: vi.fn(),
    onEditFoulFreeThrows: vi.fn(), onConvertScoreToMiss: vi.fn(),
    onConvertMissToScore: vi.fn(), onToggleOwnGoal: vi.fn(),
};

function renderPanel(overrides: Partial<React.ComponentProps<typeof TeamPanel>> = {}) {
    return render(
        <TeamPanel
            teamId="teamB"
            side="left"
            teamName="港北ミニバス"
            teamColor="blue"
            players={[{ ...createPlayer('b1', 4, '選手B1', false), isOnCourt: true }]}
            isActive={false}
            selectedPlayerId={null}
            gameMode="full"
            scoreHistory={[]}
            statHistory={[]}
            foulHistory={[]}
            onPlayerSelect={vi.fn()}
            onSubstitute={vi.fn()}
            onCoachFoul={vi.fn()}
            actionHistoryHandlers={handlers}
            {...overrides}
        />,
    );
}

describe('TeamPanel: 場所とチームの識別を分ける', () => {
    it('side が場所のクラスになる（teamId には依存しない）', () => {
        const { container } = renderPanel({ teamId: 'teamB', side: 'left' });

        const panel = container.querySelector('.team-panel')!;
        // teamB でも左に置かれていれば panel-left。ここが teamId 由来だった頃は
        // カラーラインが画面の外側を向き、保留パネルが逆の端へ飛んでいた
        expect(panel.className).toContain('panel-left');
        expect(panel.className).not.toContain('panel-right');
    });

    it('チームの識別は data-team-id が持つ', () => {
        const { container } = renderPanel({ teamId: 'teamB', side: 'left' });

        expect(container.querySelector('.team-panel')!.getAttribute('data-team-id')).toBe('teamB');
    });
});

describe('TeamPanel: マイチームの印', () => {
    it('マイチームならチーム名に虹のクラスが付く', () => {
        renderPanel({ isMyTeam: true });

        expect(screen.getByText('港北ミニバス').className).toContain('is-my-team');
    });

    it('マイチームなら読み上げ専用の「マイチーム」を添える', () => {
        renderPanel({ isMyTeam: true });

        const label = screen.getByText('マイチーム');
        expect(label.className).toContain('sr-only');
        // 虹のかかる要素の外に置く（中に入れると transparent の巻き添えになる）
        expect(label.closest('.is-my-team')).toBeNull();
    });

    it('マイチームでなければどちらも出ない', () => {
        renderPanel({ isMyTeam: false });

        expect(screen.getByText('港北ミニバス').className).not.toContain('is-my-team');
        expect(screen.queryByText('マイチーム')).toBeNull();
    });

    it('指定が無ければ印は出ない（紅白戦・旧データで null が来る場合）', () => {
        renderPanel();

        expect(screen.getByText('港北ミニバス').className).not.toContain('is-my-team');
        expect(screen.queryByText('マイチーム')).toBeNull();
    });
});
