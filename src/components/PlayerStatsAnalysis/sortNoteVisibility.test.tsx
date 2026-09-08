// FG%順に切り替えたときだけ、規定試投の注記を一覧の頭に出す。
//
// FG%順は規定試投（いちばん多く出場した選手の試合数）に満たない選手を末尾へ
// 落とす（playerSort の qualifyingAttempts）。その規則が画面のどこにも書かれて
// いなかったため、100%(1/1)の選手が理由の説明なく最下位に並んでいた。
// 文面と「出すかどうか」の判断は playerSort.sortNote が持つ。ここでは
// 並び順を切り替えたときに一覧へ実際に現れる／消えることを見る。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PlayerStatsAnalysis } from './PlayerStatsAnalysis';
import type { PlayerStats } from '../../types/game';

function stats(made: number, attempt: number): PlayerStats {
    return {
        points: made * 2, twoPointMade: made, twoPointAttempt: attempt,
        threePointMade: 0, threePointAttempt: 0, freeThrowMade: 0, freeThrowAttempt: 0,
        offensiveRebounds: 0, defensiveRebounds: 0, assists: 0, steals: 0, blocks: 0,
        turnovers: 0, turnoverDD: 0, turnoverTR: 0, turnoverPM: 0, turnoverCM: 0,
    };
}

function player(number: number, name: string, made: number, attempt: number, games: number) {
    return {
        id: `p${number}`, number, name, isCaptain: false,
        stats: stats(made, attempt), fouls: [], isOnCourt: false,
        // 出場した試合数ぶんだけクォーターを埋める（gamesPlayed の元になる）
        quartersPlayed: ['starter', false, false, false],
        games,
    };
}

/**
 * 2選手のチーム。多く出た側の試合数が規定試投になるので、
 * games を変えることで「下限に満たない選手」を作れる
 */
function seed(games: number) {
    const roster = [player(4, 'よく打つ選手', 9, 20, games), player(5, 'あまり打たない選手', 1, 1, 1)];
    const team = {
        id: 't-red', name: 'レッドミニバス', coachName: 'C',
        players: roster.map(({ number, name }) => ({ number, name, isCaptain: false })),
        updatedAt: new Date().toISOString(),
    };
    localStorage.setItem('minibasket-my-teams', JSON.stringify([team]));

    const history = [];
    for (let i = 0; i < games; i++) {
        // 2人目は1試合目にだけ出す
        const players = roster
            .filter(p => i === 0 || p.number === 4)
            .map(({ id, number, name, isCaptain, stats: s, fouls, isOnCourt, quartersPlayed }) => ({
                id, number, name, isCaptain, fouls, isOnCourt, quartersPlayed,
                // 通算が上のstatsになるよう、出場した試合数で割って積む
                stats: number === 4
                    ? stats(Math.round(s.twoPointMade / games), Math.round(s.twoPointAttempt / games))
                    : s,
            }));
        history.push({
            id: `g${i}`, date: new Date(2026, 5, 5 + i).toISOString(), gameName: `第${i + 1}節`,
            teamA: { id: 't-red', name: 'レッドミニバス', color: 'white', coachName: 'C', players, teamFouls: [0, 0, 0, 0], timeouts: [] },
            teamB: { id: 't-blue', name: 'ブルーミニバス', color: 'blue', coachName: 'C', players: [], teamFouls: [0, 0, 0, 0], timeouts: [] },
            finalScore: { teamA: 30, teamB: 20 },
            scoreHistory: [], statHistory: [], foulHistory: [], quarterMinutes: 6, showThreePoint: false,
        });
    }
    localStorage.setItem('minibasket-game-history', JSON.stringify(history));
}

const sortSelect = () => screen.getByLabelText('並び順：') as HTMLSelectElement;
const noteText = () => screen.queryByText(/FG%順では/);

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('FG%順の注記', () => {
    it('背番号順のあいだは出さない', () => {
        seed(3);
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        expect(noteText()).toBeNull();
    });

    it('FG%順に切り替えると出る', () => {
        seed(3);
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        fireEvent.change(sortSelect(), { target: { value: 'fgPercent' } });

        expect(noteText()).not.toBeNull();
    });

    it('別の並び順に戻すと消える', () => {
        seed(3);
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        fireEvent.change(sortSelect(), { target: { value: 'fgPercent' } });
        fireEvent.change(sortSelect(), { target: { value: 'points' } });

        expect(noteText()).toBeNull();
    });
});
