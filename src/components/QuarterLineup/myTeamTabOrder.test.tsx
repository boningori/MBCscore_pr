import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { Team } from '../../types/game';
import { createTeam, createPlayer } from '../../types/game';
import { QuarterLineup } from './QuarterLineup';

afterEach(cleanup);

function teams(aIsMine: boolean | undefined, bIsMine: boolean | undefined): { teamA: Team; teamB: Team } {
    const teamA = createTeam('teamA', 'ホーム', 'コーチA');
    teamA.players = [1, 2, 3, 4, 5, 6].map(n => createPlayer(`a${n}`, n, `選手A${n}`, false));
    teamA.color = 'white';
    teamA.isMyTeam = aIsMine;
    const teamB = createTeam('teamB', 'ビジター', 'コーチB');
    teamB.players = [1, 2, 3, 4, 5, 6].map(n => createPlayer(`b${n}`, n + 10, `選手B${n}`, false));
    teamB.color = 'blue';
    teamB.isMyTeam = bIsMine;
    return { teamA, teamB };
}

function renderLineup(aIsMine: boolean | undefined, bIsMine: boolean | undefined) {
    const { teamA, teamB } = teams(aIsMine, bIsMine);
    return render(
        <QuarterLineup quarter={1} teamA={teamA} teamB={teamB} onStart={vi.fn()} />,
    );
}

/** タブに出ているチーム名を、DOMに現れる順で返す */
function tabNames(): string[] {
    return Array.from(document.querySelectorAll('.lineup-team-tab .lineup-team-tab-name'))
        .map(el => el.textContent!.replace(/^[白青]/, '').trim());
}

describe('スタメン選択: マイチームのタブを先頭にする', () => {
    it('マイチームが青(teamB)なら青のタブが先頭', () => {
        renderLineup(false, true);
        expect(tabNames()).toEqual(['ビジター', 'ホーム']);
    });

    it('マイチームが白(teamA)なら従来どおり', () => {
        renderLineup(true, false);
        expect(tabNames()).toEqual(['ホーム', 'ビジター']);
    });

    it('決められないときは従来どおり白が先頭', () => {
        renderLineup(true, true);
        expect(tabNames()).toEqual(['ホーム', 'ビジター']);
    });

    it('initialTab 省略時はマイチームのタブが開いている', () => {
        renderLineup(false, true);
        const active = document.querySelector('.lineup-team-tab.active')!;
        expect(active.textContent).toContain('ビジター');
    });

    it('initialTab を渡せばそちらが優先される（タブ切替後の復帰）', () => {
        const { teamA, teamB } = teams(false, true);
        render(
            <QuarterLineup quarter={1} teamA={teamA} teamB={teamB} initialTab="teamA" onStart={vi.fn()} />,
        );
        const active = document.querySelector('.lineup-team-tab.active')!;
        expect(active.textContent).toContain('ホーム');
    });
});
