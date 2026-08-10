import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { StatsPanel } from './StatsPanel';
import { createPlayer } from '../../types/game';
import type { Player, FoulRecord } from '../../types/game';

afterEach(cleanup);

// 試合中の統計パネルにファウル列が無く、スコアラーが一覧でファウル数を
// 確認できなかった（TeamPanel の選手カードを1枚ずつ見るしかない）。

const P = (): FoulRecord => ({ type: 'P', freeThrows: 0 });
const D = (): FoulRecord => ({ type: 'D', freeThrows: 2 });

function player(number: number, fouls: FoulRecord[] = [], points = 0): Player {
    const p = createPlayer(`p${number}`, number, `選手${number}`);
    p.fouls = fouls;
    p.stats.points = points;
    return p;
}

/** 背番号からその選手の行を引く */
function rowOf(number: number): HTMLElement {
    return screen.getByText(String(number)).closest('.stats-row') as HTMLElement;
}

describe('StatsPanel のファウル列', () => {
    it('見出しにFがある', () => {
        render(<StatsPanel players={[player(4)]} teamName="白チーム" />);

        const header = document.querySelector('.stats-header') as HTMLElement;
        expect(within(header).getByText('F')).toBeTruthy();
    });

    it('選手ごとのファウル数を出す', () => {
        render(<StatsPanel players={[player(4, [P(), P(), P()])]} teamName="白チーム" />);

        expect(within(rowOf(4)).getByText('3')).toBeTruthy();
    });

    it('チーム合計のファウル数も出す', () => {
        render(
            <StatsPanel
                players={[player(4, [P(), P()]), player(5, [P()])]}
                teamName="白チーム"
            />,
        );

        const total = document.querySelector('.stats-total') as HTMLElement;
        expect(within(total).getByText('3')).toBeTruthy();
    });

    // 5ファウルだけでなく D / U・T 2回でも退場になる（disqualification.ts）
    it('退場・失格した選手には印を付ける', () => {
        render(<StatsPanel players={[player(4, [D()])]} teamName="白チーム" />);

        expect(rowOf(4).querySelector('.stats-col-foul.fouled-out')).toBeTruthy();
    });

    it('退場していない選手には印を付けない', () => {
        render(<StatsPanel players={[player(4, [P(), P()])]} teamName="白チーム" />);

        expect(rowOf(4).querySelector('.stats-col-foul.fouled-out')).toBeNull();
    });
});
