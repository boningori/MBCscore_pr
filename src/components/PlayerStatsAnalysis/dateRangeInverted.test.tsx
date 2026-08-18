// 期間の開始が終了より後になったときの扱い。
//
// 逆さまな範囲は必ず0件になるが、案内は「この期間に試合がありません」しか
// 出ていなかった。記録の有無の問題に見えて、範囲の向きが原因だと気づけない
// （実測: 5/1〜3/1 で同じ文面）。入力側では相手の日付を境にして選べなくし、
// それでも通った場合は理由を名指しする。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PlayerStatsAnalysis } from './PlayerStatsAnalysis';

function seed() {
    const team = {
        id: 't6', name: '6年生チーム', coachName: 'コーチ',
        players: [{ id: 'p4', number: 4, name: '田中' }],
        updatedAt: new Date().toISOString(),
    };
    localStorage.setItem('minibasket-my-teams', JSON.stringify([team]));
    localStorage.setItem('minibasket-game-history', JSON.stringify([{
        id: 'g1', date: new Date(Date.UTC(2026, 3, 10)).toISOString(), gameName: '第1節',
        teamA: {
            ...team, color: 'white', teamFouls: [0, 0, 0, 0], timeouts: [], savedTeamId: 't6', isMyTeam: true,
            players: [{
                id: 'p4', number: 4, name: '田中', isCaptain: false, fouls: [], isOnCourt: false,
                quartersPlayed: ['starter', false, false, false],
                stats: {
                    points: 10, twoPointMade: 5, twoPointAttempt: 8, threePointMade: 0, threePointAttempt: 0,
                    freeThrowMade: 0, freeThrowAttempt: 0, offensiveRebounds: 1, defensiveRebounds: 2,
                    assists: 1, steals: 0, blocks: 0, turnovers: 0,
                    turnoverDD: 0, turnoverTR: 0, turnoverPM: 0, turnoverCM: 0,
                },
            }],
        },
        teamB: {
            id: 't-blue', name: '相手', color: 'blue', coachName: 'C',
            players: [], teamFouls: [0, 0, 0, 0], timeouts: [],
        },
        finalScore: { teamA: 10, teamB: 8 },
        scoreHistory: [], statHistory: [], foulHistory: [],
        quarterMinutes: 6, showThreePoint: false, createdAt: new Date().toISOString(),
    }]));
}

const startInput = () => screen.getByLabelText('データ表示期間の開始日') as HTMLInputElement;
const endInput = () => screen.getByLabelText('データ表示期間の終了日') as HTMLInputElement;

beforeEach(() => {
    localStorage.clear();
    seed();
});
afterEach(cleanup);

describe('データ表示期間の開始と終了', () => {
    it('終了日を入れると、開始日はそれより後を選べなくなる', () => {
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        fireEvent.change(endInput(), { target: { value: '2026-04-30' } });

        expect(startInput().max).toBe('2026-04-30');
    });

    it('開始日を入れると、終了日はそれより前を選べなくなる', () => {
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        fireEvent.change(startInput(), { target: { value: '2026-04-01' } });

        expect(endInput().min).toBe('2026-04-01');
    });

    it('片側だけの絞り込みでは境界を付けない', () => {
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        expect(startInput().max).toBe('');
        expect(endInput().min).toBe('');
    });

    it('逆さまな範囲が入ったら、試合が無いのではなく向きが原因だと伝える', () => {
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        fireEvent.change(startInput(), { target: { value: '2026-05-01' } });
        fireEvent.change(endInput(), { target: { value: '2026-03-01' } });

        expect(screen.getByText('期間の開始と終了が逆になっています')).toBeTruthy();
        expect(screen.queryByText('この期間に試合がありません')).toBeNull();
    });

    it('正しい向きに直すと一覧が戻る', () => {
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        fireEvent.change(startInput(), { target: { value: '2026-05-01' } });
        fireEvent.change(endInput(), { target: { value: '2026-03-01' } });
        fireEvent.change(startInput(), { target: { value: '2026-03-01' } });
        fireEvent.change(endInput(), { target: { value: '2026-05-01' } });

        expect(screen.queryByText('期間の開始と終了が逆になっています')).toBeNull();
        expect(screen.getByText('田中')).toBeTruthy();
    });

    it('試合が本当に無い期間では、従来どおりの案内を出す', () => {
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        fireEvent.change(startInput(), { target: { value: '2026-01-01' } });
        fireEvent.change(endInput(), { target: { value: '2026-01-31' } });

        expect(screen.getByText('この期間に試合がありません')).toBeTruthy();
    });
});
