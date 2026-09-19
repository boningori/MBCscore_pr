// 履歴の詳細で開くスコアシートは「タブの1つ」で、画面上部にタブバーと
// 「← 一覧に戻る」が常に出ている。そこに「閉じる」を重ねて出していたが、
// これは setViewMode('comparison') するだけで、チーム比較タブを押すのと
// 同じ動きだった。
//
// さらに行き先が固定のため、スタッツタブから様式を開いて閉じるとスタッツ
// ではなくチーム比較に着いていた。ボタンを外し、端末の戻るは「開く前に
// 見ていたタブ」へ返す。
//
// 試合中のスコアシート（App の scoresheet 画面）は単独の画面で、
// 「閉じる」が画面上で唯一の戻り手段なのでそのまま残す。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { History } from './History';
import { closeTopModal } from '../Modal/modalStack';

vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

const emptyStats = {
    points: 0, twoPointMade: 0, twoPointAttempt: 0, threePointMade: 0, threePointAttempt: 0,
    freeThrowMade: 0, freeThrowAttempt: 0, offensiveRebounds: 0, defensiveRebounds: 0,
    assists: 0, steals: 0, blocks: 0, turnovers: 0,
    turnoverDD: 0, turnoverTR: 0, turnoverPM: 0, turnoverCM: 0,
};

function team(id: string, name: string, color: string) {
    return {
        id, name, coachName: 'C', assistantCoachName: '',
        players: [{ id: `${id}-1`, number: 4, name: '一郎', isOnCourt: false, fouls: [], stats: { ...emptyStats } }],
        timeouts: [], teamFouls: [0, 0, 0, 0],
        coachFouls: [], assistantCoachFouls: [], benchFouls: [], color,
    };
}

function seed() {
    localStorage.setItem('minibasket-game-history', JSON.stringify([{
        id: 'g1', date: new Date(Date.UTC(2026, 5, 5)).toISOString(), gameName: '第1節',
        teamA: team('teamA', 'レッドミニバス', 'white'),
        teamB: team('teamB', 'ブルーミニバス', 'blue'),
        finalScore: { teamA: 0, teamB: 0 },
        scoreHistory: [], statHistory: [], foulHistory: [],
        createdAt: new Date('2026-06-05T15:30:00').toISOString(),
    }]));
}

function openDetail() {
    render(<History onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /第1節/ }));
}

const tab = (name: RegExp) => screen.getByRole('button', { name });
const pressBack = () => act(() => { closeTopModal(); });

/** いま開いているタブ（タブバーで active が付いているもの） */
const activeTab = () =>
    document.querySelector('.history-tabs button.active')?.textContent?.trim();

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('履歴のスコアシートタブ', () => {
    it('タブバーと重複する「閉じる」は出さない', () => {
        seed();
        openDetail();

        fireEvent.click(tab(/スコアシート/));

        // 様式自体は開いている
        expect(document.querySelector('.running-scoresheet-container')).toBeTruthy();
        expect(screen.queryByRole('button', { name: '閉じる' })).toBeNull();
    });

    it('端末の戻るは、様式を開く前に見ていたタブへ返す', () => {
        seed();
        openDetail();

        fireEvent.click(tab(/スタッツ（画面表示）/));
        fireEvent.click(tab(/スコアシート/));
        pressBack();

        expect(document.querySelector('.running-scoresheet-container')).toBeNull();
        expect(activeTab()).toContain('スタッツ');
        // 詳細は開いたまま
        expect(screen.getByRole('button', { name: '← 一覧に戻る' })).toBeTruthy();
    });

    it('チーム比較から開いたときはチーム比較へ返す', () => {
        seed();
        openDetail();

        fireEvent.click(tab(/スコアシート/));
        pressBack();

        expect(activeTab()).toBe('チーム比較');
    });

    it('様式を閉じたあとの戻るは、詳細ごと閉じて一覧へ', () => {
        seed();
        openDetail();

        fireEvent.click(tab(/スコアシート/));
        pressBack();
        pressBack();

        expect(screen.queryByRole('button', { name: '← 一覧に戻る' })).toBeNull();
    });
});
