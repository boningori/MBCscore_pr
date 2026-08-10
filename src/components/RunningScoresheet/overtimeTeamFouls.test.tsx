// OTのチームファウルが公式様式から消えていた。
//
// END_QUARTER は「OTは第4Qの延長」として teamFouls に5つ目の枠を足し、
// 直前ピリオドの数から通算し続ける（gameFlowHandlers）。ペナルティ判定は
// その枠を見るので画面上は正しいのに、シートは teamFouls[0..3] しか描かず、
// OT中に増えた分がどこにも出なかった。
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { RunningScoresheet } from './RunningScoresheet';
import { createInitialGame, createTeam } from '../../types/game';
import type { Game } from '../../types/game';

afterEach(cleanup);

function gameWithTeamFouls(teamFouls: number[], currentQuarter: number): Game {
    const base = createInitialGame();
    return {
        ...base,
        teamA: { ...createTeam('teamA', 'A', 'コーチ'), teamFouls },
        teamB: { ...createTeam('teamB', 'B', 'コーチ'), teamFouls: [0, 0, 0, 0] },
        currentQuarter,
        phase: 'playing',
    };
}

/** チームAの4Q列で塗られている枠の数 */
function marked4Q(game: Game): number {
    const { container } = render(<RunningScoresheet game={game} />);
    // チームファウル欄は [1Q/2Q] [3Q/4Q] の2グループ。後半グループの偶数番目が4Q
    const group = container.querySelectorAll('.rs-center-team-block')[0]
        .querySelectorAll('.rs-tf-grid')[1];
    const cells = Array.from(group.querySelectorAll('.rs-tf-cell'));
    // ヘッダー(3Q/4Q)を除いた並びは 3Q,4Q,3Q,4Q… なので奇数インデックスが4Q
    return cells.filter((c, i) => i % 2 === 1 && c.classList.contains('marked')).length;
}

describe('OTのチームファウル', () => {
    it('OT中に増えた分を4Q欄に通算で出す', () => {
        // Q4で1個 → OT突入で1から継続し、OT中に2個追加して計3個
        expect(marked4Q(gameWithTeamFouls([0, 0, 0, 1, 3], 5))).toBe(3);
    });

    it('OTが2回目でも最後の枠を見る', () => {
        expect(marked4Q(gameWithTeamFouls([0, 0, 0, 1, 2, 4], 6))).toBe(4);
    });

    it('OTが無ければ従来どおり4Qの数をそのまま出す', () => {
        expect(marked4Q(gameWithTeamFouls([0, 0, 0, 2], 4))).toBe(2);
    });
});
