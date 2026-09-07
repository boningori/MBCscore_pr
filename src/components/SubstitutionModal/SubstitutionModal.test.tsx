import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SubstitutionModal } from './SubstitutionModal';
import { createPlayer } from '../../types/game';
import type { Player, FoulRecord } from '../../types/game';

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

// 「退場」を5ファウルだけで判定していた。競技規則では D 1つ、U/T 合わせて2つでも
// 失格で、いずれも5個目より先に来る。スタメン選択・選手カード・統計表は
// disqualification.ts に移行済みだったが、クォーター途中で戻す経路である
// この交代モーダルだけ古い判定のままだった。
describe('SubstitutionModal 失格の併記（5ファウル以外の理由）', () => {
    function playerWithFouls(id: string, number: number, name: string, fouls: FoulRecord[]): Player {
        return { ...createPlayer(id, number, name), isOnCourt: false, fouls };
    }

    it('Dファウル1つのベンチ選手に失格を併記する', () => {
        render(
            <SubstitutionModal
                teamName="白チーム"
                teamId="teamA"
                players={[
                    player('onCourt', 4, 'コート上', true),
                    playerWithFouls('dq', 9, '失格者', [{ type: 'D', freeThrows: 2 }]),
                ]}
                onSubstitute={vi.fn()}
                onClose={() => {}}
            />,
        );

        expect(screen.getByRole('button', { name: /失格者/ }).textContent).toContain('失格(D)');
    });

    it('U2つのベンチ選手に失格を併記する', () => {
        render(
            <SubstitutionModal
                teamName="白チーム"
                teamId="teamA"
                players={[
                    player('onCourt', 4, 'コート上', true),
                    playerWithFouls('dq', 9, '失格者', [
                        { type: 'U', freeThrows: 2 },
                        { type: 'U', freeThrows: 2 },
                    ]),
                ]}
                onSubstitute={vi.fn()}
                onClose={() => {}}
            />,
        );

        expect(screen.getByRole('button', { name: /失格者/ }).textContent).toContain('失格(2回)');
    });

    it('ファウル2つだけの選手には何も併記しない', () => {
        render(
            <SubstitutionModal
                teamName="白チーム"
                teamId="teamA"
                players={[
                    player('onCourt', 4, 'コート上', true),
                    playerWithFouls('ok', 9, '通常', [
                        { type: 'P', freeThrows: 0 },
                        { type: 'P', freeThrows: 0 },
                    ]),
                ]}
                onSubstitute={vi.fn()}
                onClose={() => {}}
            />,
        );

        const card = screen.getByRole('button', { name: /通常/ }).textContent ?? '';
        expect(card).not.toContain('失格');
        expect(card).not.toContain('退場');
    });
});

// バスケの交代はタイムアウト明けなどで複数人まとめて行うのが普通。
// 1組ごとにモーダルが閉じると「交代ボタン→選択→実行」を人数分やり直すことになり、
// 試合が止まっている短い時間に間に合わない。実行しても閉じずに続けて次の組を選べる。
describe('SubstitutionModal 連続交代', () => {
    // 親（App）は交代を state に反映するため、実行後は選手の列が入れ替わる。
    // モーダルだけを固定の players で描画するとその再配置が起きず、
    // 2件目の交代が本当にできるかを確かめられないので親の挙動ごと再現する
    function renderWithParent(initial: Player[], onSubstitute = vi.fn(), onClose = vi.fn()) {
        function Parent() {
            const [list, setList] = useState(initial);
            return (
                <SubstitutionModal
                    teamName="白チーム"
                    teamId="teamA"
                    players={list}
                    onSubstitute={(playerInId, playerOutId) => {
                        onSubstitute(playerInId, playerOutId);
                        setList(prev =>
                            prev.map(p =>
                                p.id === playerInId
                                    ? { ...p, isOnCourt: true }
                                    : p.id === playerOutId
                                        ? { ...p, isOnCourt: false }
                                        : p,
                            ),
                        );
                    }}
                    onClose={onClose}
                />
            );
        }
        render(<Parent />);
        return { onSubstitute, onClose };
    }

    function substitute(outName: string, inName: string) {
        fireEvent.click(screen.getByRole('button', { name: new RegExp(outName) }));
        fireEvent.click(screen.getByRole('button', { name: new RegExp(inName) }));
        fireEvent.click(screen.getByRole('button', { name: '交代実行' }));
    }

    const roster = () => [
        player('a', 4, 'コートA', true),
        player('b', 5, 'コートB', true),
        player('x', 10, 'ベンチX', false),
        player('y', 11, 'ベンチY', false),
    ];

    it('交代実行してもモーダルは閉じない', () => {
        const { onClose } = renderWithParent(roster());

        substitute('コートA', 'ベンチX');

        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: '交代実行' })).toBeTruthy();
    });

    it('実行後は選択が解除され、次の組を選ぶまで実行できない', () => {
        renderWithParent(roster());

        substitute('コートA', 'ベンチX');

        const confirm = screen.getByRole('button', { name: '交代実行' }) as HTMLButtonElement;
        expect(confirm.disabled).toBe(true);
        expect(
            screen.queryAllByRole('button', { pressed: true }).length,
        ).toBe(0);
    });

    it('続けて2組目の交代ができる', () => {
        const { onSubstitute } = renderWithParent(roster());

        substitute('コートA', 'ベンチX');
        substitute('コートB', 'ベンチY');

        expect(onSubstitute.mock.calls).toEqual([
            ['x', 'a'],
            ['y', 'b'],
        ]);
    });

    // 実行前後で枠の高さを揃えるため、案内の枠は最初から置いてある。
    // 実行済みの表示（status）だけが後から入る
    it('実行前は連続交代できることを案内し、まだ status は出さない', () => {
        renderWithParent(roster());

        expect(screen.queryByRole('status')).toBeNull();
        expect(document.querySelector('.substitution-note')?.textContent).toContain('続けて');
    });

    it('実行済みの交代を件数つきで知らせる', () => {
        renderWithParent(roster());

        substitute('コートA', 'ベンチX');
        const status = screen.getByRole('status');
        expect(status.textContent).toContain('#4');
        expect(status.textContent).toContain('#10');

        substitute('コートB', 'ベンチY');
        expect(screen.getByRole('status').textContent).toContain('2件');
    });

    // 交代はその場で確定するため、実行後に「キャンセル」が残っていると
    // 取り消せると誤解される
    it('1件でも交代したら閉じるボタンの表示が「キャンセル」から「完了」に変わる', () => {
        renderWithParent(roster());

        expect(screen.getByRole('button', { name: 'キャンセル' })).toBeTruthy();

        substitute('コートA', 'ベンチX');

        expect(screen.queryByRole('button', { name: 'キャンセル' })).toBeNull();
        expect(screen.getByRole('button', { name: '完了' })).toBeTruthy();
    });
});

// 交代は背番号で認識する。氏名（フルネーム）ではなくコートネームを出す。
// courtName || name はアプリ全体の既定（Scoreboard / TeamPanel / ActionHistory ほか）で、
// 素の name を出していたのはこのモーダルだけだった
describe('SubstitutionModal 表示名', () => {
    const named = (id: string, number: number, name: string, courtName: string | undefined, isOnCourt: boolean): Player => ({
        ...player(id, number, name, isOnCourt),
        courtName,
    });

    it('コートネームがあればコートネームを出す（コート・ベンチとも）', () => {
        renderModal([
            named('a', 4, '山田太郎', 'タロウ', true),
            named('x', 10, '鈴木一郎', 'イチ', false),
        ]);

        expect(screen.getByRole('button', { name: /タロウ/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /イチ/ })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /山田太郎/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /鈴木一郎/ })).toBeNull();
    });

    it('コートネームが無ければ氏名に落ちる（対戦相手には courtName が無い）', () => {
        renderModal([
            named('a', 4, '山田太郎', undefined, true),
            named('x', 10, '鈴木一郎', undefined, false),
        ]);

        expect(screen.getByRole('button', { name: /山田太郎/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /鈴木一郎/ })).toBeTruthy();
    });

    it('実行結果の表示もコートネームを使う', () => {
        renderModal([
            named('a', 4, '山田太郎', 'タロウ', true),
            named('x', 10, '鈴木一郎', 'イチ', false),
        ]);

        fireEvent.click(screen.getByRole('button', { name: /タロウ/ }));
        fireEvent.click(screen.getByRole('button', { name: /イチ/ }));
        fireEvent.click(screen.getByRole('button', { name: '交代実行' }));

        expect(document.querySelector('.substitution-note-pair')?.textContent)
            .toBe('#4 タロウ → #10 イチ');
    });
});

// バスケではタイムアウト明けに複数人まとめて替えるのが普通で、コーチの指示も
// 「4番と5番を下げて9番と10番を入れて」とまとめて来る。1組ずつに分解させない
describe('SubstitutionModal 一括交代', () => {
    const roster5 = () => [
        player('a', 4, 'コートA', true),
        player('b', 5, 'コートB', true),
        player('c', 6, 'コートC', true),
        player('x', 10, 'ベンチX', false),
        player('y', 11, 'ベンチY', false),
        player('z', 12, 'ベンチZ', false),
    ];

    const confirmBtn = () => screen.getByRole('button', { name: '交代実行' }) as HTMLButtonElement;
    const card = (name: string) => screen.getByRole('button', { name: new RegExp(name) });

    it('コート・ベンチとも複数選べ、もう一度タップで外れる', () => {
        renderModal(roster5());

        fireEvent.click(card('コートA'));
        fireEvent.click(card('コートB'));
        expect(card('コートA').getAttribute('aria-pressed')).toBe('true');
        expect(card('コートB').getAttribute('aria-pressed')).toBe('true');

        fireEvent.click(card('コートA'));
        expect(card('コートA').getAttribute('aria-pressed')).toBe('false');
        expect(card('コートB').getAttribute('aria-pressed')).toBe('true');
    });

    it('人数が違うあいだは実行できない（コートが多い場合）', () => {
        renderModal(roster5());

        fireEvent.click(card('コートA'));
        fireEvent.click(card('コートB'));
        fireEvent.click(card('ベンチX'));

        expect(confirmBtn().disabled).toBe(true);
    });

    it('人数が違うあいだは実行できない（ベンチが多い場合）', () => {
        renderModal(roster5());

        fireEvent.click(card('コートA'));
        fireEvent.click(card('ベンチX'));
        fireEvent.click(card('ベンチY'));

        expect(confirmBtn().disabled).toBe(true);
    });

    it('同数にすると実行できるようになる', () => {
        renderModal(roster5());

        fireEvent.click(card('コートA'));
        fireEvent.click(card('コートB'));
        fireEvent.click(card('ベンチX'));
        expect(confirmBtn().disabled).toBe(true);

        fireEvent.click(card('ベンチY'));
        expect(confirmBtn().disabled).toBe(false);
    });

    it('3人まとめて実行すると onSubstitute が背番号順に3回呼ばれる', () => {
        const onSubstitute = renderModal(roster5());

        // わざとばらばらの順にタップする
        fireEvent.click(card('コートC'));
        fireEvent.click(card('コートA'));
        fireEvent.click(card('コートB'));
        fireEvent.click(card('ベンチZ'));
        fireEvent.click(card('ベンチX'));
        fireEvent.click(card('ベンチY'));

        fireEvent.click(confirmBtn());

        expect(onSubstitute.mock.calls).toEqual([
            ['x', 'a'],
            ['y', 'b'],
            ['z', 'c'],
        ]);
    });

    it('実行後は選択が解除され、モーダルは閉じない', () => {
        renderModal(roster5());

        fireEvent.click(card('コートA'));
        fireEvent.click(card('ベンチX'));
        fireEvent.click(confirmBtn());

        expect(screen.queryAllByRole('button', { pressed: true }).length).toBe(0);
        expect(confirmBtn().disabled).toBe(true);
    });

    it('複数のときの案内は背番号だけを並べる', () => {
        renderModal(roster5());

        fireEvent.click(card('コートA'));
        fireEvent.click(card('コートB'));
        fireEvent.click(card('ベンチX'));
        fireEvent.click(card('ベンチY'));
        fireEvent.click(confirmBtn());

        expect(document.querySelector('.substitution-note-pair')?.textContent)
            .toBe('#4 #5 ⇄ #10 #11');
        expect(document.querySelector('.substitution-note-sub')?.textContent)
            .toContain('2人交代しました');
    });

    it('1組のときの案内は今までどおり氏名まで出す', () => {
        renderModal(roster5());

        fireEvent.click(card('コートA'));
        fireEvent.click(card('ベンチX'));
        fireEvent.click(confirmBtn());

        expect(document.querySelector('.substitution-note-pair')?.textContent)
            .toBe('#4 コートA → #10 ベンチX');
        expect(document.querySelector('.substitution-note-sub')?.textContent)
            .toContain('交代しました');
    });

    it('人数が食い違うと、その理由を出す', () => {
        renderModal(roster5());

        fireEvent.click(card('コートA'));
        fireEvent.click(card('コートB'));
        expect(document.querySelector('.substitution-note')?.textContent)
            .toContain('ベンチから2人選んでください');

        fireEvent.click(card('ベンチX'));
        expect(document.querySelector('.substitution-note')?.textContent)
            .toContain('コート2人・ベンチ1人を選んでいます');
    });

    it('何も選んでいないときは理由ではなく既存の案内を出す', () => {
        renderModal(roster5());

        const note = document.querySelector('.substitution-note')?.textContent ?? '';
        expect(note).toContain('続けて');
        expect(note).not.toContain('選んでください');
    });
});

// 見出しの <h3> が選手カードの <button> と同じ背景色・同じ角丸で、
// 押せるように見えて押せなかった（スマホのメディアクエリの上書きが原因）
describe('SubstitutionModal 見出し', () => {
    const roster = () => [
        player('a', 4, 'コートA', true),
        player('b', 5, 'コートB', true),
        player('x', 10, 'ベンチX', false),
    ];

    const counts = () => [...document.querySelectorAll('.sub-column-count')].map(e => ({
        text: e.textContent,
        match: e.classList.contains('match'),
        mismatch: e.classList.contains('mismatch'),
    }));

    it('何も選んでいないときは選択数を出さない', () => {
        renderModal(roster());
        expect(counts()).toEqual([]);
    });

    it('人数が食い違うあいだは「足りない」側の色になる', () => {
        renderModal(roster());

        fireEvent.click(screen.getByRole('button', { name: /コートA/ }));

        expect(counts()).toEqual([
            { text: '1人選択', match: false, mismatch: true },
        ]);
    });

    it('同数になると「揃った」側の色になる', () => {
        renderModal(roster());

        fireEvent.click(screen.getByRole('button', { name: /コートA/ }));
        fireEvent.click(screen.getByRole('button', { name: /ベンチX/ }));

        expect(counts()).toEqual([
            { text: '1人選択', match: true, mismatch: false },
            { text: '1人選択', match: true, mismatch: false },
        ]);
    });

    it('見出しに選手カードと同じ背景色を敷かない（押せる要素と見分けられる）', () => {
        const css = readFileSync(
            resolve(process.cwd(), 'src/components/SubstitutionModal/SubstitutionModal.css'),
            'utf-8',
        );
        // スマホの上書きで .sub-column-title に --bg-tertiary（選手カードの地）を
        // 敷いていた。同じ地を敷き直したらこのテストで気づける
        const titleRules = [...css.matchAll(/\.sub-column-title\s*\{([^}]*)\}/g)].map(m => m[1]);
        expect(titleRules.length).toBeGreaterThan(0);
        for (const body of titleRules) {
            expect(body).not.toMatch(/background\s*:\s*var\(--bg-tertiary\)/);
        }
    });
});
