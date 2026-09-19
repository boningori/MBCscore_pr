// 履歴のスタッツタブをJPEG/PDFで出す。
//
// このタブだけ出力手段が無く、選手ごとの数字を渡したいときに渡せるものが
// 無かった（公式様式のスコアシートは読み取り用途に向かない）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { History } from './History';

const exportElement = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../utils/pdfExport', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../utils/pdfExport')>()),
    exportElement: (...args: unknown[]) => exportElement(...args),
}));
vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

const emptyStats = {
    points: 0, twoPointsMade: 0, twoPointsAttempted: 0,
    threePointsMade: 0, threePointsAttempted: 0,
    freeThrowsMade: 0, freeThrowsAttempted: 0,
    offensiveRebounds: 0, defensiveRebounds: 0,
    assists: 0, steals: 0, blocks: 0, turnovers: 0,
};

function team(id: string, name: string, playerName: string, number: number) {
    return {
        id, name, coachName: 'C', assistantCoachName: '',
        players: [{
            id: `${id}-1`, number, name: playerName, isOnCourt: false,
            fouls: [], stats: { ...emptyStats, points: 6, twoPointsMade: 3, twoPointsAttempted: 5 },
        }],
        timeouts: [], teamFouls: [0, 0, 0, 0],
        coachFouls: [], assistantCoachFouls: [], benchFouls: [], color: id === 'teamA' ? 'white' : 'blue',
    };
}

function seed(extra: Record<string, unknown> = {}) {
    localStorage.setItem('minibasket-game-history', JSON.stringify([{
        id: 'g1',
        date: new Date(Date.UTC(2026, 5, 5)).toISOString(),
        gameName: '第1節',
        location: '市民体育館',
        teamA: team('teamA', 'レッドミニバス', '一郎', 4),
        teamB: team('teamB', 'ブルーミニバス', '三郎', 7),
        finalScore: { teamA: 6, teamB: 6 },
        scoreHistory: [], statHistory: [], foulHistory: [],
        createdAt: new Date('2026-06-05T15:30:00').toISOString(),
        ...extra,
    }]));
}

function openStatsTab(recordName: RegExp = /第1節/) {
    render(<History onBack={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: recordName })[0]);
    fireEvent.click(screen.getByRole('button', { name: /スタッツ（画面表示）/ }));
}

const exportRoot = () => document.querySelector('.history-stats-export');

beforeEach(() => {
    localStorage.clear();
    exportElement.mockClear();
});
afterEach(cleanup);

describe('履歴のスタッツ: 出力', () => {
    it('スタッツタブにPDF出力とJPEG出力のボタンが出る', () => {
        seed();
        openStatsTab();

        expect(screen.getByRole('button', { name: 'PDF出力' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'JPEG出力' })).toBeTruthy();
    });

    it('チーム比較タブと取り違えないよう、スタッツタブ以外では出さない', () => {
        seed();
        render(<History onBack={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /第1節/ }));

        // 既定はチーム比較タブ。そちらの出力ボタンは別物なので、
        // スタッツの出力対象は存在しない
        expect(exportRoot()).toBeNull();
    });

    it('出力対象は両チームの表をまとめた1つの要素', async () => {
        seed();
        openStatsTab();

        fireEvent.click(screen.getByRole('button', { name: 'JPEG出力' }));

        await waitFor(() => expect(exportElement).toHaveBeenCalledTimes(1));
        const target = exportElement.mock.calls[0][0] as HTMLElement;
        expect(target).toBe(exportRoot());
        expect(target.querySelectorAll('.stats-panel')).toHaveLength(2);
    });

    it('PDF出力とJPEG出力でformatが分かれる', async () => {
        seed();
        openStatsTab();

        fireEvent.click(screen.getByRole('button', { name: 'PDF出力' }));
        await waitFor(() => expect(exportElement).toHaveBeenCalledTimes(1));
        expect(exportElement.mock.calls[0][1].format).toBe('pdf');
    });

    it('ファイル名は試合名＋スタッツ', async () => {
        seed();
        openStatsTab();

        fireEvent.click(screen.getByRole('button', { name: 'JPEG出力' }));

        await waitFor(() => expect(exportElement).toHaveBeenCalled());
        expect(exportElement.mock.calls[0][1].filename).toBe('第1節_スタッツ');
    });

    // 試合名は利用者の自由入力。'/' がそのまま入るとパス区切りとして壊れる
    it('試合名にファイル名で使えない文字が入っていても除かれる', async () => {
        seed({ gameName: '6/5 練習試合' });
        openStatsTab(/練習試合/);

        fireEvent.click(screen.getByRole('button', { name: 'JPEG出力' }));

        await waitFor(() => expect(exportElement).toHaveBeenCalled());
        expect(exportElement.mock.calls[0][1].filename).toBe('6_5 練習試合_スタッツ');
    });

    it('試合名が空でもファイル名になる', async () => {
        seed({ gameName: '' });
        openStatsTab(/レッドミニバス/);

        fireEvent.click(screen.getByRole('button', { name: 'JPEG出力' }));

        await waitFor(() => expect(exportElement).toHaveBeenCalled());
        expect(exportElement.mock.calls[0][1].filename).toBe('スタッツ');
    });

    // 「チームA 統計」「チームB 統計」だけの画像は、渡された側が
    // どの試合か見分けられない
    it('出力対象に試合名・日付・会場の見出しが入る', () => {
        seed();
        openStatsTab();

        const caption = exportRoot()?.querySelector('.history-stats-caption')?.textContent ?? '';
        expect(caption).toContain('第1節');
        expect(caption).toContain('2026/06/05');
        expect(caption).toContain('市民体育館');
    });

    // どの選手のスタッツにも入らない記録なので、表だけ切り出すと
    // この試合の記録として欠けたものになる
    it('未割り当ての記録も出力対象に含める', () => {
        seed({
            pendingActions: [{
                id: 'p1', actionType: 'SCORE', value: '2P', teamId: 'teamA',
                quarter: 3, timestamp: 0, playersOnCourt: [],
            }],
        });
        openStatsTab();

        expect(exportRoot()?.querySelector('.history-pending-section')).toBeTruthy();
    });

    // ボタンが画像に写ると、出力物に押せない偽のボタンが残る
    it('出力ボタン自体は出力対象の外に置く', () => {
        seed();
        openStatsTab();

        expect(exportRoot()?.querySelector('button')).toBeNull();
    });
});
