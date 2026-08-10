import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { StatsPanel } from './StatsPanel';
import { createPlayer } from '../../types/game';
import type { Player, FoulRecord, StatEntry, StatType } from '../../types/game';

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

// 保留アクションを「不明で記録」すると playerId が 'unknown' の StatEntry になる。
// 合計は選手スタッツの総和なので、この分はどの数字にも現れなかった。
// ボタンは「選手不明としてチーム統計に記録」と言うのに、記録先が無い状態だった。
function unknownStat(statType: StatType, teamId = 'teamA'): StatEntry {
    return {
        id: `u-${statType}-${Math.random()}`,
        teamId,
        playerId: 'unknown',
        playerNumber: -1,
        statType,
        quarter: 1,
        timestamp: Date.now(),
    };
}

describe('StatsPanel の選手不明の記録', () => {
    it('不明で記録した分を専用の行に出す', () => {
        render(
            <StatsPanel
                players={[player(4)]}
                teamName="白チーム"
                teamId="teamA"
                statHistory={[unknownStat('OREB'), unknownStat('DREB'), unknownStat('AST')]}
            />,
        );

        const row = document.querySelector('.stats-row.stats-unknown') as HTMLElement;
        expect(row).toBeTruthy();
        expect(within(row).getByText('選手不明')).toBeTruthy();
    });

    it('チーム合計にも含める', () => {
        render(
            <StatsPanel
                players={[player(4)]}
                teamName="白チーム"
                teamId="teamA"
                statHistory={[unknownStat('OREB'), unknownStat('DREB'), unknownStat('STL')]}
            />,
        );

        const total = document.querySelector('.stats-total') as HTMLElement;
        // REB列に不明分の2が入る
        expect(within(total).getAllByText('2').length).toBeGreaterThan(0);
    });

    it('相手チームの不明記録は混ぜない', () => {
        render(
            <StatsPanel
                players={[player(4)]}
                teamName="白チーム"
                teamId="teamA"
                statHistory={[unknownStat('OREB', 'teamB')]}
            />,
        );

        expect(document.querySelector('.stats-row.stats-unknown')).toBeNull();
    });

    it('不明の記録が無ければ行を出さない', () => {
        render(<StatsPanel players={[player(4)]} teamName="白チーム" teamId="teamA" statHistory={[]} />);

        expect(document.querySelector('.stats-row.stats-unknown')).toBeNull();
    });
});
