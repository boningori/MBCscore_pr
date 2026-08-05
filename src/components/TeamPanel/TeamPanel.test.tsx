import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TeamPanel } from './TeamPanel';
import { createPlayer } from '../../types/game';
import type { FoulEntry } from '../../types/game';

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

describe('TeamPanel: 選択中の選手の強調表示', () => {
    const onCourtPlayers = [
        { ...createPlayer('a1', 4, '選手4'), isOnCourt: true },
        { ...createPlayer('a2', 7, '選手7'), isOnCourt: true },
    ];

    it('選択中のカードにselectedクラスと✓が付く', () => {
        renderPanel({ players: onCourtPlayers, selectedPlayerId: 'a1' });
        const selected = screen.getByRole('button', { name: /選手4/ });
        expect(selected.className).toContain('selected');
        expect(selected.getAttribute('aria-pressed')).toBe('true');
        expect(selected.querySelector('.player-check')).toBeTruthy();
    });

    it('非選択のカードには✓が付かない', () => {
        renderPanel({ players: onCourtPlayers, selectedPlayerId: 'a1' });
        const other = screen.getByRole('button', { name: /選手7/ });
        expect(other.className).not.toContain('selected');
        expect(other.getAttribute('aria-pressed')).toBe('false');
        expect(other.querySelector('.player-check')).toBeNull();
    });

    it('✓はaria-hiddenで読み上げを二重化しない', () => {
        renderPanel({ players: onCourtPlayers, selectedPlayerId: 'a1' });
        const check = screen
            .getByRole('button', { name: /選手4/ })
            .querySelector('.player-check');
        expect(check?.getAttribute('aria-hidden')).toBe('true');
    });

    // ✓の右寄せCSSは .player-fouls + .player-check の隣接セレクタに依存するため、
    // この並び順が崩れるとファウル表示がカード中央に浮いてしまう
    it('ファウルがある選手では✓がファウル表示の直後に並ぶ', () => {
        const foul: FoulEntry = {
            id: 'f1',
            teamId: 'teamA',
            playerId: 'a1',
            playerNumber: 4,
            foulType: 'P',
            quarter: 1,
            timestamp: 0,
            isCoachOrBench: false,
        };
        const fouled = { ...createPlayer('a1', 4, '選手4'), isOnCourt: true, fouls: [foul] };
        renderPanel({ players: [fouled], selectedPlayerId: 'a1' });
        const tail = [...screen.getByRole('button', { name: /選手4/ }).children].slice(-2);
        expect(tail[0].classList.contains('player-fouls')).toBe(true);
        expect(tail[1].classList.contains('player-check')).toBe(true);
    });
});

// 5個目のファウルは審判へ即座に伝える必要がある。F4と同じ見た目のままだと
// 記録者が気づけないため、F5だけを別扱いにしていることを固定する。
// （出続けること自体は妨げない。練習試合では同意のうえで続行する運用がある）
describe('TeamPanel: ファウルアウトの表示', () => {
    const withFouls = (n: number) => ({
        ...createPlayer('a1', 4, '選手4'),
        isOnCourt: true,
        fouls: Array.from({ length: n }, () => 'P' as const),
    });

    it('5ファウルの選手のファウル表示に fouled-out が付く', () => {
        renderPanel({ players: [withFouls(5)] });
        const badge = screen.getByRole('button', { name: /選手4/ }).querySelector('.player-fouls');
        expect(badge?.className).toContain('fouled-out');
    });

    it('4ファウルは warning のままで fouled-out にはならない', () => {
        renderPanel({ players: [withFouls(4)] });
        const badge = screen.getByRole('button', { name: /選手4/ }).querySelector('.player-fouls');
        expect(badge?.className).toContain('warning');
        expect(badge?.className).not.toContain('fouled-out');
    });

    it('5ファウルは読み上げでも「退場」と分かる', () => {
        renderPanel({ players: [withFouls(5)] });
        const label = screen.getByRole('button', { name: /選手4/ }).getAttribute('aria-label');
        expect(label).toContain('退場');
    });

    it('5ファウルでもカードは押せる（コートから外さない）', () => {
        const onPlayerSelect = vi.fn();
        renderPanel({ players: [withFouls(5)], onPlayerSelect });
        const card = screen.getByRole('button', { name: /選手4/ }) as HTMLButtonElement;
        expect(card.disabled).toBe(false);
        fireEvent.click(card);
        expect(onPlayerSelect).toHaveBeenCalledWith('a1', 'teamA');
    });
});

// .btn は border:none だけを指定し背景色を持たないため、色バリアントクラスが
// 無いとブラウザ既定の buttonface（ライトグレー・黒文字）で描画される。
// ダークUIの中に素のボタンが出る不具合の再発を検知する。
describe('TeamPanel: ベンチ操作ボタンの色バリアント', () => {
    it('交代ボタンは btn-secondary を持つ', () => {
        renderPanel();
        const sub = screen.getByRole('button', { name: '交代' });
        expect(sub.className).toContain('btn-secondary');
    });

    it('ベンチファウルボタンは btn-danger を持つ（破壊的操作として交代と色で区別する）', () => {
        renderPanel();
        const foul = screen.getByRole('button', { name: /ベンチ\s*ファウル/ });
        expect(foul.className).toContain('btn-danger');
    });
});
