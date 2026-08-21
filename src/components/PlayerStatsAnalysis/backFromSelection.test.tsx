import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { PlayerStatsAnalysis } from './PlayerStatsAnalysis';
import { closeTopModal, hasOpenModal } from '../Modal/modalStack';

// 統合の選択モードでの戻る操作。
//
// 選択モードは画面の中の一段で、抜ける手段（「やめる」）も画面にある。
// ここが戻る操作を受け取らないと、統合する相手を何枚か選んだ状態で
// エッジスワイプした瞬間に、選択ごとホームまで飛ぶ（実測）。
// 詳細ビュー（backToSummary.test.tsx）と同じ扱いに揃える。

function stats(points: number) {
    return {
        points, twoPointMade: points / 2, twoPointAttempt: points / 2 + 1,
        threePointMade: 0, threePointAttempt: 0, freeThrowMade: 0, freeThrowAttempt: 0,
        offensiveRebounds: 2, defensiveRebounds: 3, assists: 2, steals: 1, blocks: 0,
        turnovers: 1, turnoverDD: 0, turnoverTR: 0, turnoverPM: 0, turnoverCM: 0,
    };
}

function player(id: string, number: number, name: string, points: number) {
    return {
        id, number, name, isCaptain: false,
        stats: stats(points), fouls: [], isOnCourt: false,
        quartersPlayed: ['starter', '', '', ''],
    };
}

// 統合の入口は2枚以上ないと出ない（1枚では統合する相手が居ない）。
//
// 2人を別々の試合に置くこと。同じ試合に一緒に出ている2枚は別人だと確定でき、
// まとめるとその試合が二重に数えられるので「統合する」が押せない
// （mergeCandidates の sharesSameGame）。ここで見たいのは戻る操作の扱いなので、
// 統合そのものは成立する形にしておく
function seed() {
    const team = {
        id: 't-red', name: 'レッドミニバス', coachName: 'C',
        players: [player('p4', 4, '山田太郎', 10), player('p5', 5, '鈴木花子', 8)],
        updatedAt: new Date().toISOString(),
    };
    const game = (id: string, day: number, players: ReturnType<typeof player>[]) => ({
        id, date: new Date(2026, 5, day).toISOString(), gameName: id,
        teamA: { ...team, players, color: 'white', teamFouls: [0, 0, 0, 0], timeouts: [] },
        teamB: {
            id: 't-blue', name: 'ブルーミニバス', color: 'blue', coachName: 'C',
            players: [], teamFouls: [0, 0, 0, 0], timeouts: [],
        },
        finalScore: { teamA: 30, teamB: 20 },
        scoreHistory: [], statHistory: [], foulHistory: [],
    });
    localStorage.setItem('minibasket-my-teams', JSON.stringify([team]));
    localStorage.setItem('minibasket-game-history', JSON.stringify([
        game('g1', 5, [player('p4', 4, '山田太郎', 10)]),
        game('g2', 12, [player('p5', 5, '鈴木花子', 8)]),
    ]));
}

function enterSelection() {
    seed();
    const onBack = vi.fn();
    render(<PlayerStatsAnalysis onBack={onBack} />);
    fireEvent.click(screen.getByText('選手を統合'));
    return onBack;
}

const inSelectionMode = () => screen.queryByText('統合する') !== null;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('選手の統合・選択モードでの戻る操作', () => {
    it('選択モードのあいだは戻る操作を受け取る', () => {
        enterSelection();
        expect(inSelectionMode()).toBe(true);
        expect(hasOpenModal()).toBe(true);
    });

    it('戻る操作で選択モードを抜ける（画面から抜けない）', () => {
        const onBack = enterSelection();

        act(() => { closeTopModal(); });

        // 一覧に留まり、選択モードだけが解ける
        expect(screen.getByText('📊 選手スタッツ分析')).toBeTruthy();
        expect(inSelectionMode()).toBe(false);
        expect(screen.getByText('選手を統合')).toBeTruthy();
        expect(onBack).not.toHaveBeenCalled();
    });

    it('選んだカードも一緒に解除される（入り直すと0枚から）', () => {
        enterSelection();
        fireEvent.click(screen.getByText('#4').closest('button')!);
        expect(screen.getByText(/1枚選択中/)).toBeTruthy();

        act(() => { closeTopModal(); });
        fireEvent.click(screen.getByText('選手を統合'));

        expect(screen.getByText(/0枚選択中/)).toBeTruthy();
    });

    // 確認モーダルはあとからマウントされる＝スタックの上に載る（modalStack の LIFO）。
    // 選択モードより先に閉じないと、確認を取り消したいだけで選択が消える
    it('確認モーダルが開いていれば、そちらが先に閉じる', () => {
        enterSelection();
        fireEvent.click(screen.getByText('#4').closest('button')!);
        fireEvent.click(screen.getByText('#5').closest('button')!);
        fireEvent.click(screen.getByText('統合する'));
        expect(screen.getByText('選手を統合しますか？')).toBeTruthy();

        act(() => { closeTopModal(); });

        expect(screen.queryByText('選手を統合しますか？')).toBeNull();
        // 選択モードは残っていて、選んだ2枚もそのまま
        expect(inSelectionMode()).toBe(true);
        expect(screen.getByText(/2枚選択中/)).toBeTruthy();
    });

    it('選択モードに入っていなければ戻る操作を横取りしない（ホームへ抜けられる）', () => {
        seed();
        render(<PlayerStatsAnalysis onBack={vi.fn()} />);
        expect(hasOpenModal()).toBe(false);
    });
});
