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

/** 各選手の「前半ファウル数」を指定してチームAを組む */
function gameWithHalfCounts(counts: number[]): Game {
    const base = createInitialGame();
    const teamA = createTeam('teamA', 'A', 'コーチ');
    teamA.players = counts.map((n, i) => {
        const p = createPlayer(`p${i}`, i + 4, `選手${i + 1}`);
        p.fouls = Array.from({ length: n }, () => P);
        return p;
    });
    const foulHistory: FoulEntry[] = [];
    let ts = 1000;
    counts.forEach((n, i) => {
        for (let f = 0; f < n; f++) foulHistory.push(foulEntry(`f${i}-${f}`, `p${i}`, 1, ts++));
    });
    return {
        ...base,
        teamA,
        teamB: createTeam('teamB', 'B', 'コーチ'),
        currentQuarter: 4,
        phase: 'playing',
        foulHistory,
    };
}

/**
 * チームAの行ごと・ファウル欄ごとに付いた境界クラス。
 * 'B' = 下辺に太線 / 'T' = 上辺に太線 / '.' = なし
 */
function borderMap(game: Game): string[][] {
    const { container } = render(<RunningScoresheet game={game} />);
    const table = container.querySelectorAll('.rs-roster-table')[0];
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    return rows.map(r => Array.from(r.querySelectorAll('td.cell-foul')).map(c => {
        const mark = (c.classList.contains('foul-half-border-top') ? 'T' : '')
            + (c.classList.contains('foul-half-border-bottom') ? 'B' : '');
        return mark || '.';
    }));
}

// 階段線の水平部分の引き方。
//
// 名簿表は「片側border方式」で描く —— テーブルが上辺と左辺を、セルが右辺と
// 下辺を担当する。html2canvas が border-collapse を実装せず、隣り合うセルの
// border を両方描いてしまうためである（RunningScoresheet.css）。
//
// 階段線の水平部分だけがこの方式を破り、上辺に border を置いていた。画面では
// collapse が 2px にまとめるので正しく見えるが、collapse の無い html2canvas では
// 上セルの border-bottom(1px) と このセルの border-top(2px) が並んで 3px になり、
// 線が太くなったうえ 1px 下へずれる（実測: border-collapse を separate にして
// 再現し、共有辺の合計が 3px になることを確認）。
//
// PDF/JPEG は人へ渡す成果物なので、画面と出力が食い違ってはいけない。
// 同じ線を「上の行の下辺」として引き直し、方式を表全体でそろえる。
// collapse 下では同じ罫線を指すので、画面上の見た目は変わらない。
describe('ハーフタイムの太線: 水平部分の引き方', () => {
    it('セルの上辺には引かない（片側border方式を守る）', () => {
        const { container } = render(<RunningScoresheet game={gameWithHalfCounts([0, 2, 0])} />);

        expect(container.querySelectorAll('.foul-half-border-top')).toHaveLength(0);
    });

    it('未使用→使用済み の境界は、上の行の下辺として引く', () => {
        // 選手1は前半0個・選手2は2個。線は「選手1の欄①②の下」に来る
        const map = borderMap(gameWithHalfCounts([0, 2, 0]));

        expect(map[0].slice(0, 2)).toEqual(['B', 'B']);
    });

    it('使用済み→未使用 の境界は、従来どおりその行の下辺', () => {
        const map = borderMap(gameWithHalfCounts([0, 2, 0]));

        expect(map[1].slice(0, 2)).toEqual(['B', 'B']);
    });

    it('線を引くのは境界だけ（③以降には引かない）', () => {
        const map = borderMap(gameWithHalfCounts([0, 2, 0]));

        expect(map[0].slice(2)).toEqual(['.', '.', '.']);
        expect(map[1].slice(2)).toEqual(['.', '.', '.']);
        expect(map[2].every(c => c === '.')).toBe(true);
    });

    it('前半ファウル数が同じ行の間には引かない', () => {
        // 3行目は空行との境界になるので、比べるのは1行目と2行目の間
        const map = borderMap(gameWithHalfCounts([2, 2, 2]));

        expect(map[0].slice(0, 2)).toEqual(['.', '.']);
        expect(map[1].slice(0, 2)).toEqual(['.', '.']);
    });

    it('名簿の最後の行の下は空行なので、そこで階段を閉じる', () => {
        const map = borderMap(gameWithHalfCounts([0, 3]));

        expect(map[0].slice(0, 3)).toEqual(['B', 'B', 'B']); // 0→3 の段
        expect(map[1].slice(0, 3)).toEqual(['B', 'B', 'B']); // 3→空行 の段
    });

    it('15人目の下辺は表の外枠なので引かない', () => {
        const counts = Array.from({ length: 15 }, (_, i) => (i === 14 ? 2 : 0));
        const map = borderMap(gameWithHalfCounts(counts));

        expect(map[13].slice(0, 2)).toEqual(['B', 'B']); // 14人目の下辺として引く
        expect(map[14].every(c => c === '.')).toBe(true); // 15人目は何も要求しない
    });
});
