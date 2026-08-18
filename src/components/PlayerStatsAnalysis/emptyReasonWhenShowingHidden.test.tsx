import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PlayerStatsAnalysis } from './PlayerStatsAnalysis';
import { createInitialStats } from '../../types/game';

// 空案内の理由判定が「非表示選手も一覧に表示する」の状態を見ていなかった。
// hiddenPlayerCount > 0 だけで 'hidden' を返していたため、全員表示にしても
// 「N人を非表示にしています」と、事実と違う理由を出し続けていた。
//
// 起きるのは、非表示の設定だけが残って対象の選手がいない場合
// （選手名を変えた・その選手の記録を消した・期間の絞り込みで外れた等）。

/** 選手は名簿にいるが、スタッツも出場クォーターも記録されていない試合 */
function seedGameWithoutPlayerRecords(hiddenKeys: string[]) {
    const team = {
        id: 't-red', name: 'レッドミニバス', coachName: 'C',
        players: [{
            id: 'p4', number: 4, name: '山田太郎', isCaptain: true,
            stats: createInitialStats(), fouls: [], isOnCourt: false,
            quartersPlayed: [false, false, false, false],
        }],
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
        finalScore: { teamA: 30, teamB: 20 },
        scoreHistory: [], statHistory: [], foulHistory: [],
    }]));
    // 名簿にもう存在しない選手の非表示設定だけが残っている
    localStorage.setItem('minibasket-hidden-players', JSON.stringify({ 't-red': hiddenKeys }));
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('非表示選手も表示していて、それでも0件のとき', () => {
    it('非表示のせいだとは言わない（全員表示しているのだから理由になっていない）', () => {
        seedGameWithoutPlayerRecords(['退部した選手']);
        render(<PlayerStatsAnalysis onBack={() => { }} />);
        fireEvent.click(screen.getByLabelText('非表示にした選手も一覧に表示する'));

        expect(screen.queryByText('表示できる選手がいません')).toBeNull();
    });

    it('本当の理由（選手の記録が無い）を出す', () => {
        seedGameWithoutPlayerRecords(['退部した選手']);
        render(<PlayerStatsAnalysis onBack={() => { }} />);
        fireEvent.click(screen.getByLabelText('非表示にした選手も一覧に表示する'));

        expect(screen.getByText('選手の記録がありません')).toBeTruthy();
    });

    it('非表示のままなら従来どおり非表示が理由だと案内する', () => {
        seedGameWithoutPlayerRecords(['退部した選手']);
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        expect(screen.getByText('表示できる選手がいません')).toBeTruthy();
    });
});
