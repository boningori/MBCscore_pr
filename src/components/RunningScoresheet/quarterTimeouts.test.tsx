// 様式の①〜④のタイムアウト欄も、OT欄と同じ理由で記録した分を全部出す。
//
// UIは1ピリオド1回しか押させない（TeamPanel のチップが「済」に変わり、次は
// 取り消しになる）ので通常運用では1件だが、同じピリオドに複数入りうることは
// 記録側も認めている（handleRemoveTimeout は「復元データ等で同じピリオドに
// 複数入っている場合」を明示してその期の最後の1件だけを消す）。
//
// 表示側は find() で最初の1件しか拾っていなかったため、2件目は記録に残るのに
// シートから消えていた。OT欄で「片方だけ出すと必ずもう片方の記録を捨てる」と
// 判断したのと同じことがここでも起きる。枠は増やさず、同じマスへ並べる。

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { RunningScoresheet } from './RunningScoresheet';
import { createInitialGame, createTeam } from '../../types/game';
import type { Game, Timeout } from '../../types/game';

afterEach(cleanup);

function gameWithTimeouts(timeouts: Timeout[], phase: Game['phase'] = 'playing'): Game {
    return {
        ...createInitialGame(),
        teamA: { ...createTeam('teamA', 'A', 'コーチ'), timeouts },
        teamB: createTeam('teamB', 'B', 'コーチ'),
        currentQuarter: 4,
        phase,
    };
}

/** チームAの第qピリオドのタイムアウト欄（①〜④） */
function quarterCell(game: Game, q: number): HTMLElement {
    const { container } = render(<RunningScoresheet game={game} />);
    // 1チームぶんの並びは ① ② ③ ④ OT。teamA が先頭
    const cells = container.querySelectorAll('.rs-roster-table .to-cell-val:not(.ot)');
    return cells[q - 1] as HTMLElement;
}

describe('スコアシートの①〜④タイムアウト欄', () => {
    it('同じピリオドに複数あっても記録した分を全部出す', () => {
        const cell = quarterCell(gameWithTimeouts([
            { quarter: 2, elapsedMinutes: 1 },
            { quarter: 2, elapsedMinutes: 4 },
        ]), 2);

        expect(cell.textContent).toBe('1,4');
    });

    it('1回だけなら従来どおり数字ひとつ', () => {
        const cell = quarterCell(gameWithTimeouts([{ quarter: 1, elapsedMinutes: 3 }]), 1);

        expect(cell.textContent).toBe('3');
        expect(cell.querySelector('.to-multiple')).toBeNull();
    });

    // 1マスに複数入ると既定の字では溢れる。OT欄と同じ扱いにする
    it('複数入るときだけ字を小さくする', () => {
        const cell = quarterCell(gameWithTimeouts([
            { quarter: 3, elapsedMinutes: 1 },
            { quarter: 3, elapsedMinutes: 2 },
        ]), 3);

        expect(cell.querySelector('.to-multiple')).toBeTruthy();
    });

    it('経過0分の記録も数字として出す（未記録と区別する）', () => {
        const cell = quarterCell(gameWithTimeouts([{ quarter: 4, elapsedMinutes: 0 }]), 4);

        expect(cell.textContent).toBe('0');
        expect(cell.classList.contains('to-has-value')).toBe(true);
    });

    it('タイムアウトが無いまま試合が終われば未使用の印を付ける', () => {
        const cell = quarterCell(gameWithTimeouts([{ quarter: 1, elapsedMinutes: 4 }], 'finished'), 2);

        expect(cell.textContent).toBe('');
        expect(cell.classList.contains('to-unused')).toBe(true);
    });
});
