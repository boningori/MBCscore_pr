import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { QuarterLineup } from './QuarterLineup';
import { createTeam, createPlayer } from '../../types/game';
import type { Team, FoulRecord } from '../../types/game';

// 「退場」は5ファウルだけを見ていた。競技規則では D 1つ、U/T 合わせて2つでも失格で、
// いずれも5個目より先に来る。判定が抜けていたため、Dを記録しても次のクォーターで
// 何の警告もなくコートへ戻せていた。

const P = (): FoulRecord => ({ type: 'P', freeThrows: 0 });
const T = (): FoulRecord => ({ type: 'T', freeThrows: 1 });
const U = (): FoulRecord => ({ type: 'U', freeThrows: 2 });
const D = (): FoulRecord => ({ type: 'D', freeThrows: 2 });

function makeTeam(id: 'teamA' | 'teamB', foulsByIndex: Record<number, FoulRecord[]> = {}): Team {
    const team = createTeam(id, id === 'teamA' ? '白チーム' : '青チーム', 'コーチ');
    team.color = id === 'teamA' ? 'white' : 'blue';
    team.players = Array.from({ length: 6 }, (_, i) => {
        const p = createPlayer(`${id}-player-${i}`, i + 4, `選手${i + 4}`);
        p.fouls = foulsByIndex[i] ?? [];
        return p;
    });
    return team;
}

/** 背番号からその選手のカードを引く */
function cardOf(number: number): HTMLElement {
    const numberEl = screen.getAllByText(`#${number}`)[0];
    return numberEl.closest('.lineup-player-card') as HTMLElement;
}

afterEach(cleanup);

describe('スタメン選択の失格表示', () => {
    it('Dファウル1つで失格を示す', () => {
        render(
            <QuarterLineup
                quarter={2}
                teamA={makeTeam('teamA', { 0: [D()] })}
                teamB={makeTeam('teamB')}
                onStart={vi.fn()}
            />,
        );

        expect(within(cardOf(4)).getByText('失格(D)')).toBeTruthy();
    });

    it('U2つで失格を示す', () => {
        render(
            <QuarterLineup
                quarter={2}
                teamA={makeTeam('teamA', { 1: [U(), U()] })}
                teamB={makeTeam('teamB')}
                onStart={vi.fn()}
            />,
        );

        expect(within(cardOf(5)).getByText('失格(2回)')).toBeTruthy();
    });

    it('T+Uでも失格を示す', () => {
        render(
            <QuarterLineup
                quarter={2}
                teamA={makeTeam('teamA', { 2: [T(), U()] })}
                teamB={makeTeam('teamB')}
                onStart={vi.fn()}
            />,
        );

        expect(within(cardOf(6)).getByText('失格(2回)')).toBeTruthy();
    });

    it('5ファウルは従来どおり「退場」', () => {
        render(
            <QuarterLineup
                quarter={2}
                teamA={makeTeam('teamA', { 0: [P(), P(), P(), P(), P()] })}
                teamB={makeTeam('teamB')}
                onStart={vi.fn()}
            />,
        );

        expect(within(cardOf(4)).getByText('退場')).toBeTruthy();
    });

    it('U1つだけでは失格にしない', () => {
        render(
            <QuarterLineup
                quarter={2}
                teamA={makeTeam('teamA', { 0: [U(), P(), P()] })}
                teamB={makeTeam('teamB')}
                onStart={vi.fn()}
            />,
        );

        expect(within(cardOf(4)).queryByText(/失格/)).toBeNull();
        expect(within(cardOf(4)).queryByText('退場')).toBeNull();
    });

    it('失格した選手はコート上でも既定の選択から外す', () => {
        const teamA = makeTeam('teamA', { 0: [D()] });
        teamA.players.forEach((p, i) => { p.isOnCourt = i < 5; });

        render(
            <QuarterLineup quarter={2} teamA={teamA} teamB={makeTeam('teamB')} onStart={vi.fn()} />,
        );

        expect(cardOf(4).getAttribute('aria-pressed')).toBe('false');
        // 失格していない残り4人は選ばれたまま
        expect(cardOf(5).getAttribute('aria-pressed')).toBe('true');
    });
});
