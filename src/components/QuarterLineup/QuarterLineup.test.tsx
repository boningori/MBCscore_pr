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

/** 指定数のパーソナルファウルを持たせる */
function withFouls(p: Player, count: number): Player {
    return { ...p, fouls: Array.from({ length: count }, () => 'P' as const) };
}

function team(id: string, name: string, color: 'white' | 'blue', players: Player[]): Team {
    return { ...createTeam(id, name, ''), color, players };
}

const whiteTeam = (players: Player[] = fivePlayers('白')) =>
    team('teamA', '白チーム', 'white', players);
const blueTeam = (players: Player[] = fivePlayers('青')) =>
    team('teamB', '青チーム', 'blue', players);

/** 先頭から順に得点を割り当てた選手配列を返す */
function withPoints(players: Player[], points: number[]): Player[] {
    return players.map((p, i) => ({ ...p, stats: { ...p.stats, points: points[i] ?? 0 } }));
}

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

    it('両チームとも未完了のときは両方の案内を並べて表示する', () => {
        render(
            <QuarterLineup quarter={2} teamA={whiteTeam()} teamB={blueTeam()} onStart={() => {}} />,
        );

        expect(
            screen.getByText('白のスタメンが未選択です（0/5） / 青のスタメンが未選択です（0/5）'),
        ).toBeTruthy();
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
            player('heavy', 5, '白5', ['starter', 'starter', 'starter', false], true),
            // 2Q出場済み → 違反なし（誤検知しないこと）
            player('normal', 6, '白6', ['starter', 'starter', false, false], true),
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
            player('heavy', 5, '白5', ['starter', 'starter', 'starter', false], true),
            player('p6', 6, '白6', ['starter', false, false, false], true),
            player('p7', 7, '白7', [false, 'starter', false, false], true),
            player('p8', 8, '白8', ['starter', false, false, false], true),
            player('p9', 9, '白9', [false, 'starter', false, false], true),
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

describe('QuarterLineup ファウルアウト（非強制・練習試合での続行に対応）', () => {
    it('5ファウルの選手もカードに表示され、選択できる', () => {
        const players = [
            withFouls(player('out', 9, '退場者', ['starter', false, false, false], false), 5),
            ...fivePlayers('白'),
        ];
        render(
            <QuarterLineup quarter={2} teamA={whiteTeam(players)} teamB={blueTeam()} onStart={() => {}} />,
        );

        const card = screen.getByRole('button', { name: /退場者/ });
        expect(card).toBeTruthy();

        fireEvent.click(card);
        expect(card.getAttribute('aria-pressed')).toBe('true');
    });

    it('5ファウルの選手には「退場」チップを出し、4ファウルには出さない', () => {
        const players = [
            withFouls(player('out', 9, '退場者', ['starter', false, false, false], false), 5),
            withFouls(player('trouble', 8, 'トラブル', ['starter', false, false, false], false), 4),
            ...fivePlayers('白'),
        ];
        render(
            <QuarterLineup quarter={2} teamA={whiteTeam(players)} teamB={blueTeam()} onStart={() => {}} />,
        );

        expect(screen.getAllByText('退場')).toHaveLength(1);
        expect(screen.getByRole('button', { name: /退場者/ }).textContent).toContain('退場');
        expect(screen.getByRole('button', { name: /トラブル/ }).textContent).not.toContain('退場');
    });

    it('退場者を含めないと5名に届かない編成でも、選べば開始できる（進行不能にならない）', () => {
        // 6人編成で2人が5ファウル。除外すると4人しか残らず、従来は開始不能だった
        const players = [
            withFouls(player('o1', 1, '白1', ['starter', false, false, false], false), 5),
            withFouls(player('o2', 2, '白2', ['starter', false, false, false], false), 5),
            player('p3', 3, '白3', ['starter', false, false, false], false),
            player('p4', 4, '白4', ['starter', false, false, false], false),
            player('p5', 5, '白5', ['starter', false, false, false], false),
            player('p6', 6, '白6', ['starter', false, false, false], false),
        ];
        const onStart = vi.fn();
        const bluePlayers = fivePlayers('青').map(p => ({ ...p, isOnCourt: true }));
        render(
            <QuarterLineup
                quarter={2}
                teamA={whiteTeam(players)}
                teamB={blueTeam(bluePlayers)}
                onStart={onStart}
            />,
        );

        for (const n of [1, 2, 3, 4, 5]) {
            fireEvent.click(screen.getByRole('button', { name: new RegExp(`白${n}`) }));
        }

        const startBtn = screen.getByRole('button', { name: 'Q2 開始' }) as HTMLButtonElement;
        expect(startBtn.disabled).toBe(false);
        fireEvent.click(startBtn);
        expect(onStart.mock.calls[0][0].teamA).toEqual(['o1', 'o2', 'p3', 'p4', 'p5']);
    });

    it('初期選択には退場者を含めない（既定は公式ルール寄り・必要なら手で選び直せる）', () => {
        const players = [
            withFouls(player('out', 1, '白1', ['starter', false, false, false], true), 5),
            ...fivePlayers('白').slice(1).map(p => ({ ...p, isOnCourt: true })),
        ];
        render(
            <QuarterLineup quarter={2} teamA={whiteTeam(players)} teamB={blueTeam()} onStart={() => {}} />,
        );

        expect(screen.getByRole('button', { name: /白1/ }).getAttribute('aria-pressed')).toBe('false');
        expect(screen.getByRole('button', { name: /白2/ }).getAttribute('aria-pressed')).toBe('true');
    });
});

describe('QuarterLineup 現在スコアの表示', () => {
    it('ヘッダーに両チームの現在スコアを表示する（確認のためにゲーム画面へ戻る必要をなくす）', () => {
        render(
            <QuarterLineup
                quarter={2}
                teamA={whiteTeam(withPoints(fivePlayers('白'), [10, 2, 0, 0, 0]))}
                teamB={blueTeam(withPoints(fivePlayers('青'), [5, 3, 0, 0, 0]))}
                onStart={() => {}}
            />,
        );

        const score = screen.getByLabelText('現在のスコア');
        expect(score.textContent).toContain('12');
        expect(score.textContent).toContain('8');
    });

    it('得点がまだない場合も 0 を表示する', () => {
        render(
            <QuarterLineup quarter={1} teamA={whiteTeam()} teamB={blueTeam()} onStart={() => {}} />,
        );

        const score = screen.getByLabelText('現在のスコア');
        expect(score.textContent).toContain('0');
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

describe('QuarterLineup 選手の追加', () => {
    it('onAddPlayers が無ければ追加ボタンを出さない', () => {
        render(<QuarterLineup quarter={1} teamA={whiteTeam()} teamB={blueTeam()} onStart={vi.fn()} />);
        expect(screen.queryByRole('button', { name: '+ 選手を追加' })).toBeNull();
    });

    it('開いているタブのチームが追加先になる', () => {
        const onAddPlayers = vi.fn();
        render(
            <QuarterLineup
                quarter={1}
                teamA={whiteTeam()}
                teamB={blueTeam()}
                onStart={vi.fn()}
                onAddPlayers={onAddPlayers}
            />,
        );

        // 青タブに切り替えてから追加する
        fireEvent.click(screen.getByRole('tab', { name: /青/ }));
        fireEvent.click(screen.getByRole('button', { name: '+ 選手を追加' }));
        // タブにも「青チーム」の文字があるので、見出しを名指しで確かめる
        expect(screen.getByRole('heading', { name: '選手を追加 - 青チーム' })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: '背番号9' }));
        fireEvent.click(screen.getByRole('button', { name: '1人を追加' }));

        expect(onAddPlayers).toHaveBeenCalledTimes(1);
        expect(onAddPlayers.mock.calls[0][0]).toBe('teamB');
        expect(onAddPlayers.mock.calls[0][1]).toEqual([{ number: 9, name: '選手9' }]);
    });

    it('追加しても選択中の5人は解除されない', () => {
        const onAddPlayers = vi.fn();
        const { rerender } = render(
            <QuarterLineup
                quarter={1}
                teamA={whiteTeam()}
                teamB={blueTeam()}
                onStart={vi.fn()}
                onAddPlayers={onAddPlayers}
            />,
        );

        selectFive('白');
        fireEvent.click(screen.getByRole('button', { name: '+ 選手を追加' }));
        fireEvent.click(screen.getByRole('button', { name: '背番号9' }));
        fireEvent.click(screen.getByRole('button', { name: '1人を追加' }));

        // App 側の dispatch を模して、選手が増えた名簿で再描画する
        const added = player('白9', 9, '白9', [false, false, false, false]);
        rerender(
            <QuarterLineup
                quarter={1}
                teamA={whiteTeam([...fivePlayers('白'), added])}
                teamB={blueTeam()}
                onStart={vi.fn()}
                onAddPlayers={onAddPlayers}
            />,
        );

        // 5人の選択は残っている（＝開始できる状態のまま）
        expect(screen.getByText('5 / 5 名選択')).toBeTruthy();
        // 追加した選手は自動選択されない
        expect(screen.getByRole('button', { name: /白9/ }).getAttribute('aria-pressed')).toBe('false');
    });

    it('追加した背番号を状況表示で知らせる', () => {
        const onAddPlayers = vi.fn();
        render(
            <QuarterLineup
                quarter={1}
                teamA={whiteTeam()}
                teamB={blueTeam()}
                onStart={vi.fn()}
                onAddPlayers={onAddPlayers}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '+ 選手を追加' }));
        fireEvent.click(screen.getByRole('button', { name: '背番号9' }));
        fireEvent.click(screen.getByRole('button', { name: '背番号12' }));
        fireEvent.click(screen.getByRole('button', { name: '2人を追加' }));

        expect(screen.getByText('白チーム に #9 #12 を追加しました')).toBeTruthy();
    });

    it('キャンセルすると onAddPlayers は呼ばれない', () => {
        const onAddPlayers = vi.fn();
        render(
            <QuarterLineup
                quarter={1}
                teamA={whiteTeam()}
                teamB={blueTeam()}
                onStart={vi.fn()}
                onAddPlayers={onAddPlayers}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '+ 選手を追加' }));
        fireEvent.click(screen.getByRole('button', { name: '背番号9' }));
        fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

        expect(onAddPlayers).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: '背番号9' })).toBeNull();
    });

    it('タブを切り替えると状況表示は消える（別チームの話だと誤読させない）', () => {
        const onAddPlayers = vi.fn();
        render(
            <QuarterLineup
                quarter={1}
                teamA={whiteTeam()}
                teamB={blueTeam()}
                onStart={vi.fn()}
                onAddPlayers={onAddPlayers}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '+ 選手を追加' }));
        fireEvent.click(screen.getByRole('button', { name: '背番号9' }));
        fireEvent.click(screen.getByRole('button', { name: '1人を追加' }));
        expect(screen.getByText('白チーム に #9 を追加しました')).toBeTruthy();

        fireEvent.click(screen.getByRole('tab', { name: /青/ }));
        expect(screen.queryByText('白チーム に #9 を追加しました')).toBeNull();
    });

    it('クォーターが変わると状況表示は消える', () => {
        const onAddPlayers = vi.fn();
        const shared = { teamA: whiteTeam(), teamB: blueTeam(), onStart: vi.fn(), onAddPlayers };
        const { rerender } = render(<QuarterLineup quarter={1} {...shared} />);

        fireEvent.click(screen.getByRole('button', { name: '+ 選手を追加' }));
        fireEvent.click(screen.getByRole('button', { name: '背番号9' }));
        fireEvent.click(screen.getByRole('button', { name: '1人を追加' }));
        expect(screen.getByText('白チーム に #9 を追加しました')).toBeTruthy();

        rerender(<QuarterLineup quarter={2} {...shared} />);
        expect(screen.queryByText('白チーム に #9 を追加しました')).toBeNull();
    });
});

describe('QuarterLineup 15人超過の常設注意', () => {
    /** 背番号 1〜16 の16人（様式の15枠を1人超える） */
    const sixteenPlayers = Array.from({ length: 16 }, (_, i) =>
        player(`w${i + 1}`, i + 1, `白${i + 1}`, [false, false, false, false]),
    );

    it('16人いるチームでは常設の注意が出る', () => {
        render(
            <QuarterLineup
                quarter={1}
                teamA={whiteTeam(sixteenPlayers)}
                teamB={blueTeam()}
                onStart={() => {}}
            />,
        );

        expect(screen.getByText(/このチームは15人を超えています（16名）/)).toBeTruthy();
    });

    it('15人以下では注意を出さない', () => {
        render(
            <QuarterLineup quarter={1} teamA={whiteTeam()} teamB={blueTeam()} onStart={() => {}} />,
        );

        expect(screen.queryByText(/人を超えています/)).toBeNull();
    });
});
