// 公式様式のタイムアウト欄はOTが1枠しかないが、記録側はOTピリオドごとに
// 1回のタイムアウトを許す（App の timeoutUsed は t.quarter === currentQuarter で判定）。
//
// 表示側が最初の1件しか拾っていなかったため、OT2で取ったタイムアウトは
// 記録されているのにシートから消えていた。どちらか片方を選ぶと必ず一方の
// 記録を捨てるので、紙で書くときと同じように同じマスへ全部並べる。
// 枠線・行・列は様式のまま変えない。

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
        currentQuarter: 5,
        phase,
    };
}

/** チームAのOT欄 */
function otCell(game: Game): HTMLElement {
    const { container } = render(<RunningScoresheet game={game} />);
    return container.querySelectorAll('.to-cell-val.ot')[0] as HTMLElement;
}

describe('スコアシートのOTタイムアウト欄', () => {
    it('OTが複数あっても記録した分を全部出す', () => {
        const cell = otCell(gameWithTimeouts([
            { quarter: 5, elapsedMinutes: 1 },
            { quarter: 6, elapsedMinutes: 2 },
        ]));

        expect(cell.textContent).toBe('1,2');
    });

    it('OTピリオドの順に並べる（記録順が前後していても）', () => {
        const cell = otCell(gameWithTimeouts([
            { quarter: 6, elapsedMinutes: 2 },
            { quarter: 5, elapsedMinutes: 1 },
        ]));

        expect(cell.textContent).toBe('1,2');
    });

    it('OTが1回だけなら従来どおり数字ひとつ', () => {
        const cell = otCell(gameWithTimeouts([{ quarter: 5, elapsedMinutes: 3 }]));

        expect(cell.textContent).toBe('3');
        expect(cell.querySelector('.to-multiple')).toBeNull();
    });

    // 1マスに複数入ると既定の10ptでは溢れる。溢れた分だけ縮める
    it('複数入るときだけ字を小さくする', () => {
        const cell = otCell(gameWithTimeouts([
            { quarter: 5, elapsedMinutes: 1 },
            { quarter: 6, elapsedMinutes: 2 },
        ]));

        expect(cell.querySelector('.to-multiple')).toBeTruthy();
    });

    it('OTでタイムアウトが無いまま試合が終われば未使用の印を付ける', () => {
        const cell = otCell(gameWithTimeouts([{ quarter: 2, elapsedMinutes: 4 }], 'finished'));

        expect(cell.textContent).toBe('');
        expect(cell.classList.contains('to-unused')).toBe(true);
    });
});
