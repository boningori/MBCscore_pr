import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { History } from './History';
import type { GameRecord } from '../../utils/gameHistoryStorage';

vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

const gameRecord = {
    id: 'g1',
    date: new Date(Date.UTC(2026, 5, 5)).toISOString(),
    gameName: '第1節',
    location: '市民体育館',
    teamA: {
        id: 't-red', name: 'レッドミニバス', color: 'white', coachName: 'C',
        assistantCoachName: '', timeouts: [], teamFouls: [0, 0, 0, 0],
        coachFouls: [], assistantCoachFouls: [], benchFouls: [],
        players: [{
            id: 'a1', number: 4, name: '一郎', isCaptain: true, isOnCourt: false,
            fouls: [], quartersPlayed: ['starter', false, false, false],
            stats: {
                points: 10, twoPointMade: 5, twoPointAttempt: 9, threePointMade: 0, threePointAttempt: 0,
                freeThrowMade: 0, freeThrowAttempt: 0, offensiveRebounds: 2, defensiveRebounds: 3,
                assists: 2, steals: 1, blocks: 0, turnovers: 1,
                turnoverDD: 0, turnoverTR: 0, turnoverPM: 0, turnoverCM: 0,
            },
        }],
    },
    teamB: {
        id: 't-blue', name: 'ブルーミニバス', color: 'blue', coachName: 'C',
        assistantCoachName: '', timeouts: [], teamFouls: [0, 0, 0, 0],
        coachFouls: [], assistantCoachFouls: [], benchFouls: [],
        players: [{
            id: 'b1', number: 7, name: '三郎', isCaptain: true, isOnCourt: false,
            fouls: [], quartersPlayed: ['starter', false, false, false],
            stats: {
                points: 4, twoPointMade: 2, twoPointAttempt: 8, threePointMade: 0, threePointAttempt: 0,
                freeThrowMade: 0, freeThrowAttempt: 0, offensiveRebounds: 1, defensiveRebounds: 1,
                assists: 0, steals: 0, blocks: 0, turnovers: 3,
                turnoverDD: 0, turnoverTR: 0, turnoverPM: 0, turnoverCM: 0,
            },
        }],
    },
    finalScore: { teamA: 10, teamB: 4 },
    scoreHistory: [], statHistory: [], foulHistory: [],
    showThreePoint: false,
    createdAt: new Date().toISOString(),
};

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('minibasket-game-history', JSON.stringify([gameRecord]));
});

afterEach(cleanup);

/** 一覧から試合詳細を開く */
function openDetail() {
    render(<History onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /第1節/ }));
}

describe('履歴詳細のタブ', () => {
    it('開いた直後はチーム比較が見えている', () => {
        openDetail();

        expect(document.querySelector('.team-comparison')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'チーム比較' }).classList.contains('active')).toBe(true);
    });

    it('スタッツに切り替えると選手別の表が出る', () => {
        openDetail();

        fireEvent.click(screen.getByRole('button', { name: 'スタッツ（画面表示）' }));

        expect(document.querySelectorAll('.stats-panel').length).toBe(2);
        expect(document.querySelector('.team-comparison')).toBeNull();
    });

    it('チーム比較に戻れる', () => {
        openDetail();

        fireEvent.click(screen.getByRole('button', { name: 'スタッツ（画面表示）' }));
        fireEvent.click(screen.getByRole('button', { name: 'チーム比較' }));

        expect(document.querySelector('.team-comparison')).toBeTruthy();
    });

    it('履歴では出力ボタンを出す', () => {
        openDetail();

        expect(document.querySelector('.comparison-export')).toBeTruthy();
    });

    it('日付・大会名・会場を見出しに出す', () => {
        openDetail();

        const caption = document.querySelector('.comparison-caption') as HTMLElement;
        expect(caption.textContent).toContain('2026/06/05');
        expect(caption.textContent).toContain('第1節');
        expect(caption.textContent).toContain('市民体育館');
        // 日付は1回だけ（自動生成の「日付 vs 対戦相手」ではない試合名なので二重化しない）
        expect(caption.textContent).toBe('2026/06/05　第1節　市民体育館');
    });

    it('自動生成された試合名（日付 vs 対戦相手）では見出しの日付が重ならない', () => {
        const autoNamedRecord: GameRecord = {
            ...gameRecord,
            id: 'g2',
            gameName: '2026-06-05 vs ブルーミニバス',
        };
        localStorage.clear();
        localStorage.setItem('minibasket-game-history', JSON.stringify([autoNamedRecord]));

        render(<History onBack={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /2026-06-05 vs ブルーミニバス/ }));

        const caption = document.querySelector('.comparison-caption') as HTMLElement;
        expect(caption.textContent).toBe('2026-06-05 vs ブルーミニバス　市民体育館');
    });

    it('3P設定OFFの記録では未使用と示す', () => {
        openDetail();

        expect(screen.getByText('この試合は3Pを使用していません')).toBeTruthy();
    });

    it('履歴配列を持たない古い記録を開いても落ちず、チーム比較を描画する', () => {
        // 手で編集したバックアップなど、配列フィールドを持たない古い記録をシミュレート
        const recordWithoutArrays = {
            ...gameRecord,
            scoreHistory: undefined,
            statHistory: undefined,
            foulHistory: undefined,
        } as unknown as GameRecord;

        localStorage.clear();
        localStorage.setItem('minibasket-game-history', JSON.stringify([recordWithoutArrays]));

        render(<History onBack={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /第1節/ }));

        // チーム比較が描画されていることを確認（落ちていない）
        expect(document.querySelector('.team-comparison')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'チーム比較' }).classList.contains('active')).toBe(true);
    });
});
