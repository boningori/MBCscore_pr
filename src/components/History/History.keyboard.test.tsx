import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { History } from './History';

vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

// 試合カードは <div onClick> で、キーボードから開けなかった。
// 他画面（選手カード・スタメン選択）は <button type="button"> に揃っているのに
// ここだけ取り残されていた。中に「共有」「削除」ボタンを抱えているため、
// カード全体をbuttonにはできない（buttonの入れ子は不正）。開く操作だけを
// buttonに切り出す。

function seed() {
    const team = (name: string) => ({
        id: name, name, coachName: 'C', assistantCoachName: '',
        players: [], timeouts: [], teamFouls: [0, 0, 0, 0],
        coachFouls: [], assistantCoachFouls: [], benchFouls: [], color: 'white',
    });
    localStorage.setItem('minibasket-game-history', JSON.stringify([{
        id: 'g1', date: new Date(Date.UTC(2026, 5, 5)).toISOString(), gameName: '第1節',
        teamA: team('レッドミニバス'), teamB: team('ブルーミニバス'),
        finalScore: { teamA: 30, teamB: 20 },
        scoreHistory: [], statHistory: [], foulHistory: [],
        createdAt: new Date().toISOString(),
    }]));
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('試合履歴のカード', () => {
    it('開く操作がボタンになっている（キーボードで到達できる）', () => {
        seed();
        render(<History onBack={vi.fn()} />);

        const card = screen.getByRole('button', { name: /第1節/ });
        expect(card.tagName).toBe('BUTTON');
    });

    it('ボタンを押すと詳細が開く', () => {
        seed();
        render(<History onBack={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /第1節/ }));

        expect(screen.getByRole('button', { name: '← 一覧に戻る' })).toBeTruthy();
    });

    it('共有・削除はカードの外側に置く（buttonを入れ子にしない）', () => {
        seed();
        render(<History onBack={vi.fn()} />);

        const card = screen.getByRole('button', { name: /第1節/ });
        expect(card.querySelector('button')).toBeNull();
        expect(screen.getByRole('button', { name: /共有/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: '削除' })).toBeTruthy();
    });

    it('削除は確認してから実行する（カードは開かない）', () => {
        seed();
        render(<History onBack={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: '削除' }));

        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(screen.queryByRole('button', { name: '← 一覧に戻る' })).toBeNull();
    });
});
