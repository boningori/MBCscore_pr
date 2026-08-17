// 試合が終わって初めて確定する情報を、進行中から印字していた。
//
// スコアシートは試合中でもPDF/JPEGに出せる。その紙に「勝利チーム」が
// 埋まっていたり、まだ試合が続くのに最新の得点へ試合終了の丸が付いていると、
// 確定した記録として読まれてしまう。
//
// クォーター終了の丸も同じで、進行中のクォーターの最新得点に付いていた
// （得点が入るたびに丸が次の行へ移っていく）。

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { RunningScoresheet } from './RunningScoresheet';
import { createInitialGame, createTeam, createPlayer } from '../../types/game';
import type { Game, ScoreEntry, Team } from '../../types/game';

afterEach(cleanup);

function team(id: string, name: string, points: number): Team {
    const t = createTeam(id, name, 'コーチ');
    const p = createPlayer(`${id}-1`, 4, 'A');
    p.stats = { ...p.stats, points };
    t.players = [p];
    return t;
}

/** teamA が Q1で2点・Q2で2点、teamB は無得点 */
function gameWithScores(currentQuarter: number, phase: Game['phase']): Game {
    const scoreHistory: ScoreEntry[] = [
        { id: 's1', teamId: 'teamA', playerId: 'teamA-1', playerNumber: 4, scoreType: '2P', points: 2, quarter: 1, timestamp: 1000, runningScoreA: 2, runningScoreB: 0 },
        { id: 's2', teamId: 'teamA', playerId: 'teamA-1', playerNumber: 4, scoreType: '2P', points: 2, quarter: 2, timestamp: 2000, runningScoreA: 4, runningScoreB: 0 },
    ];
    return {
        ...createInitialGame(),
        teamA: team('teamA', 'レッド', 4),
        teamB: team('teamB', 'ブルー', 0),
        scoreHistory,
        currentQuarter,
        phase,
    };
}

const winner = (game: Game) => {
    const { container } = render(<RunningScoresheet game={game} />);
    return container.querySelector('.rs-winner .rs-result-value')?.textContent;
};

/** 累計得点 n の行（Aチーム側）が持つクラス */
function classesAtScore(game: Game, score: number): string {
    const { container } = render(<RunningScoresheet game={game} />);
    const rows = container.querySelectorAll('.rs-rs-row');
    return (rows[score - 1].querySelector('.a-no') as HTMLElement).className;
}

describe('試合終了まで確定しない表示', () => {
    it('試合中は勝利チームを空にしておく', () => {
        expect(winner(gameWithScores(2, 'playing'))).toBe('');
    });

    it('試合が終わったら勝利チームを出す', () => {
        expect(winner({ ...gameWithScores(4, 'finished') })).toBe('レッド');
    });

    it('試合が終わって同点なら引き分けと出す', () => {
        const tied = gameWithScores(4, 'finished');
        expect(winner({ ...tied, teamB: team('teamB', 'ブルー', 4) })).toBe('引き分け');
    });

    it('試合中は最新の得点に試合終了の丸を付けない', () => {
        expect(classesAtScore(gameWithScores(2, 'playing'), 4)).not.toContain('game-end');
    });

    it('試合が終わったら最終得点に試合終了の丸を付ける', () => {
        expect(classesAtScore(gameWithScores(4, 'finished'), 4)).toContain('game-end');
    });

    it('進行中のクォーターの最新得点にクォーター終了の丸を付けない', () => {
        // Q2進行中。Q2最後の得点（累計4）はまだ確定していない
        expect(classesAtScore(gameWithScores(2, 'playing'), 4)).not.toContain('quarter-end');
    });

    it('終わったクォーターの最後の得点にはクォーター終了の丸を付ける', () => {
        // Q2進行中なので、Q1最後の得点（累計2）は確定済み
        expect(classesAtScore(gameWithScores(2, 'playing'), 2)).toContain('quarter-end');
    });
});
