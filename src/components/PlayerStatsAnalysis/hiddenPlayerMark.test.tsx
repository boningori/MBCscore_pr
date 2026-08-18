import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PlayerStatsAnalysis } from './PlayerStatsAnalysis';
import { createInitialStats } from '../../types/game';

// 「非表示選手も一覧に表示する」をONにすると全員が並ぶが、どれを非表示にしたのかが
// カードから分からなかった（実測: 6枚とも className が "player-card" のまま、
// 印も注記も無い）。戻すには1人ずつ詳細を開いて確かめるしかなく、
// 隠す機能の可逆性が実質失われていた。

function player(number: number, name: string) {
    return {
        id: `p${number}`, number, name, isCaptain: false,
        stats: { ...createInitialStats(), points: 10 }, fouls: [],
        isOnCourt: false, quartersPlayed: ['starter', false, false, false],
    };
}

function seed(hiddenKeys: string[]) {
    const team = {
        id: 't-red', name: 'レッドミニバス', coachName: 'C',
        players: [player(4, '山田太郎'), player(5, '鈴木花子')],
        updatedAt: new Date().toISOString(),
    };
    localStorage.setItem('minibasket-my-teams', JSON.stringify([team]));
    localStorage.setItem('minibasket-game-history', JSON.stringify([{
        id: 'g1', date: new Date(Date.UTC(2026, 5, 5)).toISOString(), gameName: '第1節',
        teamA: { ...team, color: 'white', teamFouls: [0, 0, 0, 0], timeouts: [], isMyTeam: true, savedTeamId: 't-red' },
        teamB: {
            id: 't-blue', name: 'ブルーミニバス', color: 'blue', coachName: 'C',
            players: [], teamFouls: [0, 0, 0, 0], timeouts: [],
        },
        finalScore: { teamA: 20, teamB: 10 },
        scoreHistory: [], statHistory: [], foulHistory: [],
    }]));
    localStorage.setItem('minibasket-hidden-players', JSON.stringify({ 't-red': hiddenKeys }));
}

/** カードの並びを「名前 → 非表示の印が付いているか」で取り出す */
function cardMarks(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const card of document.querySelectorAll('.player-card')) {
        const name = card.querySelector('.player-name')?.textContent ?? '';
        result[name] = card.classList.contains('hidden-player');
    }
    return result;
}

function showAllPlayers() {
    fireEvent.click(screen.getByLabelText('非表示にした選手も一覧に表示する'));
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('非表示選手も表示しているとき', () => {
    it('どのカードが非表示の選手か分かる', () => {
        seed(['山田太郎']);
        render(<PlayerStatsAnalysis onBack={() => { }} />);
        showAllPlayers();

        expect(cardMarks()).toEqual({ 山田太郎: true, 鈴木花子: false });
    });

    it('印は文字でも伝える（色や枠だけでは読み取れない）', () => {
        seed(['山田太郎']);
        render(<PlayerStatsAnalysis onBack={() => { }} />);
        showAllPlayers();

        const marked = [...document.querySelectorAll('.player-card')]
            .find(c => c.classList.contains('hidden-player'));
        expect(marked?.textContent).toContain('非表示');
    });

    it('通常表示（非表示選手を除いた一覧）には印を出さない', () => {
        seed(['山田太郎']);
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        expect(cardMarks()).toEqual({ 鈴木花子: false });
    });

    it('非表示が1人もいなければ印は出ない', () => {
        seed([]);
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        expect(cardMarks()).toEqual({ 山田太郎: false, 鈴木花子: false });
    });
});
