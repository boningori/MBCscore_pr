import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TeamPanel } from './TeamPanel';
import { createPlayer } from '../../types/game';
import type { FoulRecord } from '../../types/game';

afterEach(cleanup);

const noopHandlers = {
    onRemoveScore: vi.fn(),
    onRemoveStat: vi.fn(),
    onRemoveFoul: vi.fn(),
    onEditScore: vi.fn(),
    onEditStat: vi.fn(),
    onEditFoul: vi.fn(),
    onEditFoulFreeThrows: vi.fn(),
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

    // タイムアウトはアクション履歴に載らないため、チップを押せなくすると
    // 経過分の打ち間違いを試合中ずっと直せず、そのまま公式様式に印字される
    it('タイムアウト使用済みは「済」で、押すと取り消しが呼ばれる', () => {
        const onTimeoutCancel = vi.fn();
        renderPanel({ teamFouls: 0, timeoutUsed: true, onTimeoutRequest: vi.fn(), onTimeoutCancel });
        const chip = screen.getByRole('button', { name: 'タイムアウトを取り消す' }) as HTMLButtonElement;
        expect(chip.textContent).toContain('済');
        expect(chip.disabled).toBe(false);
        fireEvent.click(chip);
        expect(onTimeoutCancel).toHaveBeenCalledTimes(1);
    });

    it('取り消し先が無ければ従来どおり押せない', () => {
        renderPanel({ teamFouls: 0, timeoutUsed: true, onTimeoutRequest: vi.fn() });
        const chip = screen.getByRole('button', { name: 'タイムアウトを取り消す' }) as HTMLButtonElement;
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
        // Player.fouls は (FoulType | FoulRecord)[]。
        // FoulEntry（履歴側の型）とは別物で、以前はここで取り違えていた
        const foul: FoulRecord = { type: 'P', freeThrows: 0 };
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

// 退場は5ファウルだけではない。D 1つ、T/U 合わせて2つでも失格で、いずれも
// 5個目より先に来る（詳細は utils/disqualification.ts）。
// スタッツ表・スタメン選択・ファウル入力・到達トーストは判定を移行済みで、
// 試合中いちばん見るこのカードだけが数だけを見ていた。
describe('TeamPanel: 5ファウル以外の失格の表示', () => {
    const withFoulTypes = (types: ('P' | 'T' | 'U' | 'D')[]) => ({
        ...createPlayer('a1', 4, '選手4'),
        isOnCourt: true,
        fouls: types.map(type => ({ type, freeThrows: 0 }) as FoulRecord),
    });

    it('Dファウル1つで fouled-out が付く', () => {
        renderPanel({ players: [withFoulTypes(['D'])] });
        const badge = screen.getByRole('button', { name: /選手4/ }).querySelector('.player-fouls');
        expect(badge?.className).toContain('fouled-out');
    });

    it('T・U 合わせて2つで fouled-out が付く', () => {
        renderPanel({ players: [withFoulTypes(['T', 'U'])] });
        const badge = screen.getByRole('button', { name: /選手4/ }).querySelector('.player-fouls');
        expect(badge?.className).toContain('fouled-out');
    });

    it('読み上げでは失格の理由まで分かる', () => {
        renderPanel({ players: [withFoulTypes(['D'])] });
        const label = screen.getByRole('button', { name: /選手4/ }).getAttribute('aria-label');
        expect(label).toContain('失格(D)');
    });

    it('Pファウル2つでは失格にしない', () => {
        renderPanel({ players: [withFoulTypes(['P', 'P'])] });
        const badge = screen.getByRole('button', { name: /選手4/ }).querySelector('.player-fouls');
        expect(badge?.className).not.toContain('fouled-out');
    });
});

// 相手チームの選手も、ファウル・FT・得点まで全部このアプリで記録する。
// フルモードでマイチームだけ名前を出していたため、相手だけ番号で人を選ばされていた。
// しかも aria-label には名前が入っていたので、読み上げ利用者だけが名前を読める
// という逆転も起きていた。
describe('TeamPanel: 選手カードの名前表示', () => {
    const player = { ...createPlayer('b1', 7, '鈴木一郎', false, 'イチロー'), isOnCourt: true };

    it('フルモードなら相手チームでも名前を出す', () => {
        renderPanel({ teamId: 'teamB', players: [player], gameMode: 'full' });
        const card = screen.getByRole('button', { name: /イチロー/ });
        // コートネームがあればそちらを優先する（マイチームと同じ規則）
        expect(card.querySelector('.player-num')?.textContent).toContain('イチロー');
    });

    it('マイチームでも従来どおり名前を出す', () => {
        renderPanel({ players: [player], gameMode: 'full' });
        expect(screen.getByRole('button', { name: /イチロー/ }).querySelector('.player-num')?.textContent)
            .toContain('イチロー');
    });

    // シンプルモードは1枚あたりの幅が狭く、番号と得点で埋まる
    it('シンプルモードでは名前を出さない', () => {
        renderPanel({ players: [player], gameMode: 'simple' });
        expect(screen.getByRole('button', { name: /イチロー/ }).querySelector('.player-num')?.textContent)
            .not.toContain('イチロー');
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

// 試合終了後は記録できない（アクションボタンが disabled になる）のに、
// 選手カードだけは押せて選択マークが付いていた。押しても何も記録されない
// 空振りの操作が残っているうえ、「終了するとデータの編集ができません」と
// 確認したばかりの画面で選べてしまうのは、まだ記録できるように読める。
describe('TeamPanel: 記録できない状態', () => {
    it('disabled のとき選手カードは押せない', () => {
        const onPlayerSelect = vi.fn();
        renderPanel({ disabled: true, onPlayerSelect });

        const card = screen.getByRole('button', { name: /選手4/ }) as HTMLButtonElement;
        expect(card.disabled).toBe(true);

        fireEvent.click(card);
        expect(onPlayerSelect).not.toHaveBeenCalled();
    });

    it('既定（試合中）は押せる', () => {
        const onPlayerSelect = vi.fn();
        renderPanel({ onPlayerSelect });

        const card = screen.getByRole('button', { name: /選手4/ }) as HTMLButtonElement;
        expect(card.disabled).toBe(false);

        fireEvent.click(card);
        expect(onPlayerSelect).toHaveBeenCalledWith('a1', 'teamA');
    });
});
