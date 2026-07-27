import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QuarterLineup } from './QuarterLineup';
import { createPlayer, createTeam } from '../../types/game';
import type { Player, Team } from '../../types/game';

afterEach(cleanup);

function player(
    id: string,
    number: number,
    name: string,
    quartersPlayed: Player['quartersPlayed'],
    isOnCourt = false,
): Player {
    return { ...createPlayer(id, number, name), quartersPlayed, isOnCourt };
}

/** 未出場の5名を作る。選手名は `${label}1`〜`${label}5` */
function fivePlayers(label: string): Player[] {
    return [1, 2, 3, 4, 5].map(n =>
        player(`${label}${n}`, n, `${label}${n}`, [false, false, false, false]),
    );
}

function team(id: string, name: string, color: 'white' | 'blue', players: Player[]): Team {
    return { ...createTeam(id, name, ''), color, players };
}

const whiteTeam = (players: Player[] = fivePlayers('白')) =>
    team('teamA', '白チーム', 'white', players);
const blueTeam = (players: Player[] = fivePlayers('青')) =>
    team('teamB', '青チーム', 'blue', players);

/** 選手カード（role=button）をクリックして5名選ぶ */
function selectFive(label: string) {
    for (let n = 1; n <= 5; n++) {
        fireEvent.click(screen.getByRole('button', { name: new RegExp(`${label}${n}`) }));
    }
}

describe('QuarterLineup チームタブ', () => {
    it('青タブから先に5名選んでも、白を選び終えれば開始でき、両チームのIDが1回で渡る', () => {
        const onStart = vi.fn();
        render(
            <QuarterLineup quarter={1} teamA={whiteTeam()} teamB={blueTeam()} onStart={onStart} />,
        );

        // 先に青から登録する
        fireEvent.click(screen.getByRole('tab', { name: /青/ }));
        selectFive('青');
        // 片方だけでは開始できない
        expect((screen.getByRole('button', { name: '試合開始' }) as HTMLButtonElement).disabled).toBe(true);

        fireEvent.click(screen.getByRole('tab', { name: /白/ }));
        selectFive('白');

        const startBtn = screen.getByRole('button', { name: '試合開始' }) as HTMLButtonElement;
        expect(startBtn.disabled).toBe(false);
        fireEvent.click(startBtn);

        expect(onStart).toHaveBeenCalledTimes(1);
        expect(onStart.mock.calls[0][0]).toEqual({
            teamA: ['白1', '白2', '白3', '白4', '白5'],
            teamB: ['青1', '青2', '青3', '青4', '青5'],
        });
    });

    it('タブを往復しても選択は保持される', () => {
        render(
            <QuarterLineup quarter={1} teamA={whiteTeam()} teamB={blueTeam()} onStart={() => {}} />,
        );

        fireEvent.click(screen.getByRole('button', { name: /白1/ }));
        expect(screen.getByRole('button', { name: /白1/ }).getAttribute('aria-pressed')).toBe('true');

        fireEvent.click(screen.getByRole('tab', { name: /青/ }));
        fireEvent.click(screen.getByRole('tab', { name: /白/ }));

        expect(screen.getByRole('button', { name: /白1/ }).getAttribute('aria-pressed')).toBe('true');
    });

    it('片方だけ5名のときは開始できず、未完了チームの色ラベルと人数を表示する', () => {
        render(
            <QuarterLineup quarter={2} teamA={whiteTeam()} teamB={blueTeam()} onStart={() => {}} />,
        );

        selectFive('白');

        expect((screen.getByRole('button', { name: 'Q2 開始' }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText('青のスタメンが未選択です（0/5）')).toBeTruthy();
        expect(screen.queryByText(/白のスタメンが未選択です/)).toBeNull();
    });

    it('initialTab に teamB を渡すと青タブが選択された状態で始まる', () => {
        render(
            <QuarterLineup
                quarter={1}
                teamA={whiteTeam()}
                teamB={blueTeam()}
                initialTab="teamB"
                onStart={() => {}}
            />,
        );

        expect(screen.getByRole('tab', { name: /青/ }).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByRole('tab', { name: /白/ }).getAttribute('aria-selected')).toBe('false');
        // 青チームの選手が表示されている
        expect(screen.getByRole('button', { name: /青1/ })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /白1/ })).toBeNull();
    });

    it('タブ切替で onTabChange が新しいタブIDで呼ばれる', () => {
        const onTabChange = vi.fn();
        render(
            <QuarterLineup
                quarter={1}
                teamA={whiteTeam()}
                teamB={blueTeam()}
                onTabChange={onTabChange}
                onStart={() => {}}
            />,
        );

        fireEvent.click(screen.getByRole('tab', { name: /青/ }));
        expect(onTabChange).toHaveBeenCalledWith('teamB');
    });

    it('タブに各チームの選択状況を表示する', () => {
        render(
            <QuarterLineup quarter={1} teamA={whiteTeam()} teamB={blueTeam()} onStart={() => {}} />,
        );

        selectFive('白');

        expect(screen.getByRole('tab', { name: /白/ }).textContent).toContain('5/5');
        expect(screen.getByRole('tab', { name: /青/ }).textContent).toContain('0/5');
    });
});

describe('QuarterLineup 出場ルールの目安（非強制の警告表示）', () => {
    it('Q1では警告チップも未出場バナーも表示しない', () => {
        render(
            <QuarterLineup quarter={1} teamA={whiteTeam()} teamB={blueTeam()} onStart={() => {}} />,
        );

        expect(screen.queryByText('3Q超')).toBeNull();
        expect(screen.queryByText('2Q未達')).toBeNull();
        expect(screen.queryByText(/未出場（全員出場の目安）/)).toBeNull();
    });

    it('Q4: 既に3Q出場済みの選手を出そうとすると「3Q超」、未出場の選手は「2Q未達」＋未出場バナー', () => {
        const players = [
            // Q1-Q3出場済み・コート上（初期選択される）→ 4Q目で最大3Q超過
            player('heavy', 5, '白5', [true, true, true, false], true),
            // 2Q出場済み → 違反なし（誤検知しないこと）
            player('normal', 6, '白6', [true, true, false, false], true),
            // 未出場 → 残り1Qでは2Qに届かない ＋ 全員出場の目安に該当
            player('bench', 9, '白9', [false, false, false, false], false),
        ];
        render(
            <QuarterLineup
                quarter={4}
                teamA={whiteTeam(players)}
                teamB={blueTeam()}
                onStart={() => {}}
            />,
        );

        // 「3Q超」はheavyの1件のみ
        expect(screen.getAllByText('3Q超')).toHaveLength(1);
        // 「2Q未達」はbenchの1件のみ
        expect(screen.getAllByText('2Q未達')).toHaveLength(1);
        // 全員出場の目安バナーに #9 が含まれる
        expect(screen.getByText(/未出場（全員出場の目安）/).textContent).toContain('#9');
    });

    it('警告があっても開始ボタンはブロックしない（強制しない）', () => {
        // 5名ちょうどでスタメンが揃えば、ルール警告に関わらず開始可能
        const heavyPlayers = [
            player('heavy', 5, '白5', [true, true, true, false], true),
            player('p6', 6, '白6', [true, false, false, false], true),
            player('p7', 7, '白7', [false, true, false, false], true),
            player('p8', 8, '白8', [true, false, false, false], true),
            player('p9', 9, '白9', [false, true, false, false], true),
        ];
        const bluePlayers = fivePlayers('青').map(p => ({ ...p, isOnCourt: true }));
        render(
            <QuarterLineup
                quarter={4}
                teamA={whiteTeam(heavyPlayers)}
                teamB={blueTeam(bluePlayers)}
                onStart={() => {}}
            />,
        );

        // 「3Q超」の警告は出るが…
        expect(screen.getByText('3Q超')).toBeTruthy();
        // 開始ボタンは押下可能（disabledでない）
        const startBtn = screen.getByRole('button', { name: 'Q4 開始' }) as HTMLButtonElement;
        expect(startBtn.disabled).toBe(false);
    });
});

describe('QuarterLineup 開始ボタンのラベル', () => {
    it('Q1は「試合開始」、Q3以降は「Qx 開始」、OTは「OT 開始」', () => {
        const { unmount } = render(
            <QuarterLineup quarter={1} teamA={whiteTeam()} teamB={blueTeam()} onStart={() => {}} />,
        );
        expect(screen.getByRole('button', { name: '試合開始' })).toBeTruthy();
        unmount();

        const q3 = render(
            <QuarterLineup quarter={3} teamA={whiteTeam()} teamB={blueTeam()} onStart={() => {}} />,
        );
        expect(screen.getByRole('button', { name: 'Q3 開始' })).toBeTruthy();
        q3.unmount();

        render(
            <QuarterLineup quarter={5} teamA={whiteTeam()} teamB={blueTeam()} onStart={() => {}} />,
        );
        expect(screen.getByRole('button', { name: 'OT 開始' })).toBeTruthy();
    });
});
