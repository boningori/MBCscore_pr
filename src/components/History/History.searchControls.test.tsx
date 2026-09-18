// 検索で一覧が絞られたことを、読み上げにも伝える。
//
// 画面を見ていれば「n / m件」で分かるが、読み上げでは入力しても何も起きず、
// 絞り込んだ結果が0件になったことにすら気づけなかった。件数の表示を
// live region にして、変化をその場で伝える。
//
// 付ける先を件数にするのは、live region が「中身の変わる前からDOMに在る」
// ことを要るため。後から現れる要素に role を付けても読み上げられないことが
// あり、「一致する試合はありません」の文面はまさに後から現れる側になる。
// 件数は絞り込みの操作子と一緒に出ているので、この条件を満たす。
//
// 同じ作りを対戦チーム管理にも入れてある（OpponentManager.test.tsx）。
// 2つの検索は同じ作法に揃える約束なので、片方だけ直さない。

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { History } from './History';

vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

function seed() {
    const team = (name: string) => ({
        id: name, name, coachName: 'C', assistantCoachName: '',
        players: [], timeouts: [], teamFouls: [0, 0, 0, 0],
        coachFouls: [], assistantCoachFouls: [], benchFouls: [], color: 'white',
    });
    const record = (id: string, gameName: string, a: string, b: string) => ({
        id, date: new Date(Date.UTC(2026, 5, 5)).toISOString(), gameName,
        teamA: team(a), teamB: team(b),
        finalScore: { teamA: 30, teamB: 20 },
        scoreHistory: [], statHistory: [], foulHistory: [],
        createdAt: new Date().toISOString(),
    });
    localStorage.setItem('minibasket-game-history', JSON.stringify([
        record('g1', '第1節', 'レッドミニバス', 'ブルーミニバス'),
        record('g2', '練習試合', 'グリーンクラブ', 'イエロークラブ'),
    ]));
}

const searchBox = () => screen.getByLabelText('検索：');

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('試合履歴の検索', () => {
    it('件数の表示が live region になっている', () => {
        seed();
        render(<History onBack={vi.fn()} />);

        const status = screen.getByRole('status');
        expect(status.textContent).toBe('2 / 2件');
    });

    it('絞り込むと、その live region の中身が変わる', () => {
        seed();
        render(<History onBack={vi.fn()} />);

        fireEvent.change(searchBox(), { target: { value: 'レッド' } });

        expect(screen.getByRole('status').textContent).toBe('1 / 2件');
    });

    it('0件になっても live region は消えない（変化を伝え続ける）', () => {
        // 消えると、その後どう変えても読み上げに何も届かなくなる
        seed();
        render(<History onBack={vi.fn()} />);

        fireEvent.change(searchBox(), { target: { value: '該当なし' } });

        expect(screen.getByRole('status').textContent).toBe('0 / 2件');
    });
});
