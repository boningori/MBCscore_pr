// ハーフタイムの太線は「前半（Q1-Q2）終了時点のファウル数」を指す。
//
// 実装が player.fouls.length（現在の合計）を見ていたため、後半にファウルが
// 増えるたびに線が右へ動いていた。前半・後半の区切りは試合中に動いてはならず、
// PDF/JPEGに出力した公式様式のシートで記録が誤るため、ここで位置を固定する。
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RunningScoresheet } from './RunningScoresheet';
import { createInitialGame, createTeam, createPlayer } from '../../types/game';
import type { Game, FoulEntry, FoulRecord } from '../../types/game';

const P: FoulRecord = { type: 'P', freeThrows: 0 };

function foulEntry(id: string, playerId: string, quarter: number, timestamp: number): FoulEntry {
    return {
        id, teamId: 'teamA', playerId, playerNumber: 4, foulType: 'P',
        quarter, timestamp, isCoachOrBench: false,
    };
}

/** 指定クォーターにファウルを持つ選手1人のチームAで試合を組み立てる */
function gameWithFouls(quarters: number[], currentQuarter = 4): Game {
    const base = createInitialGame();
    const teamA = createTeam('teamA', 'A', 'コーチ');
    const player = createPlayer('p1', 4, 'テスト選手');
    player.fouls = quarters.map(() => P);
    teamA.players = [player];
    return {
        ...base,
        teamA,
        teamB: createTeam('teamB', 'B', 'コーチ'),
        currentQuarter,
        phase: 'playing',
        foulHistory: quarters.map((q, i) => foulEntry(`f${i}`, 'p1', q, 1000 + i)),
    };
}

/** 1人目の選手のファウル欄のうち、太線（右境界）が付いた枠の位置。無ければ -1 */
function halfBorderIndex(game: Game): number {
    const { container } = render(<RunningScoresheet game={game} />);
    const row = container.querySelector('.rs-roster-table tbody tr');
    const cells = Array.from(row!.querySelectorAll('td.cell-foul'));
    return cells.findIndex(c => c.classList.contains('foul-half-border'));
}

describe('ハーフタイムの太線', () => {
    it('後半にファウルが増えても前半終了時点の位置から動かない', () => {
        // 前半(Q1)に1個、後半(Q3)に2個 → 前半分は1個なので1枠目の右
        expect(halfBorderIndex(gameWithFouls([1, 3, 3]))).toBe(0);
    });

    it('前半にファウルが無い選手には引かれない', () => {
        expect(halfBorderIndex(gameWithFouls([3, 4]))).toBe(-1);
    });

    it('5個を超えてファウルした選手にも引かれる', () => {
        // 退場させない方針のため6個以上が起こりうる。前半2個 → 2枠目の右
        expect(halfBorderIndex(gameWithFouls([1, 2, 3, 3, 4, 4]))).toBe(1);
    });

    it('前半のうちは（Q2終了前）引かれない', () => {
        expect(halfBorderIndex(gameWithFouls([1, 1], 2))).toBe(-1);
    });

    it('前半だけで枠数(5)を超えた場合は最後の枠の右に引く', () => {
        // 記入欄は5つしかないため、それ以上は最後の枠で頭打ちにする
        expect(halfBorderIndex(gameWithFouls([1, 1, 2, 2, 2, 2, 3]))).toBe(4);
    });
});
