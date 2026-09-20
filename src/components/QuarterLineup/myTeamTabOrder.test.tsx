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

/** タブに出ているチーム名を、DOMに現れる順で返す（色ラベルと読み上げ専用ラベルは除く） */
function tabNames(): string[] {
    return Array.from(document.querySelectorAll('.lineup-team-tab .lineup-team-tab-name'))
        .map(el => el.textContent!.replace(/^[白青]/, '').replace(/マイチーム$/, '').trim());
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

describe('スタメン選択: タブに読み上げ用の「マイチーム」ラベルを足す', () => {
    it('マイチームが青(teamB)ならビジターのタブにだけ付く', () => {
        renderLineup(false, true);
        const tabs = Array.from(document.querySelectorAll('.lineup-team-tab'));
        expect(tabs).toHaveLength(2);

        const withLabel = tabs.filter(tab => tab.querySelector('.sr-only')?.textContent === 'マイチーム');
        expect(withLabel).toHaveLength(1);
        expect(withLabel[0].textContent).toContain('ビジター');
    });

    it('マイチームが白(teamA)ならホームのタブにだけ付く', () => {
        renderLineup(true, false);
        const tabs = Array.from(document.querySelectorAll('.lineup-team-tab'));

        const withLabel = tabs.filter(tab => tab.querySelector('.sr-only')?.textContent === 'マイチーム');
        expect(withLabel).toHaveLength(1);
        expect(withLabel[0].textContent).toContain('ホーム');
    });

    it('決められないときはどちらのタブにも付かない', () => {
        renderLineup(true, true);
        const tabs = Array.from(document.querySelectorAll('.lineup-team-tab'));

        tabs.forEach(tab => expect(tab.querySelector('.sr-only')).toBeNull());
    });

    it('虹（is-my-team）は付けない', () => {
        renderLineup(false, true);
        const tabs = Array.from(document.querySelectorAll('.lineup-team-tab'));

        tabs.forEach(tab => expect(tab.querySelector('.is-my-team')).toBeNull());
    });
});
