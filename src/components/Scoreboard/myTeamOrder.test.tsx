import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useEffect } from 'react';
import { GameProvider, useGame } from '../../context/GameContext';
import type { Team, Player } from '../../types/game';
import { createTeam, createPlayer } from '../../types/game';
import { Scoreboard } from './Scoreboard';

afterEach(cleanup);

/** isMyTeam だけを変えた2チームで Scoreboard を描く */
function renderWith(aIsMine: boolean | undefined, bIsMine: boolean | undefined) {
    const withCourt = (p: Player) => ({ ...p, isOnCourt: true });
    const teamA: Team = createTeam('teamA', 'ホーム', 'コーチA');
    teamA.players = [createPlayer('a1', 4, '選手A1', true)].map(withCourt);
    teamA.color = 'white';
    teamA.isMyTeam = aIsMine;
    const teamB: Team = createTeam('teamB', 'ビジター', 'コーチB');
    teamB.players = [createPlayer('b1', 6, '選手B1', true)].map(withCourt);
    teamB.color = 'blue';
    teamB.isMyTeam = bIsMine;

    function Harness() {
        const { dispatch } = useGame();
        useEffect(() => {
            dispatch({ type: 'SET_TEAMS', payload: { teamA, teamB, showThreePoint: false, quarterMinutes: 6 } });
            // eslint-disable-next-line react-hooks/exhaustive-deps -- 初回のみ
        }, []);
        return <Scoreboard onQuarterEnd={() => {}} />;
    }

    return render(<GameProvider><Harness /></GameProvider>);
}

/** 得点ブロックに出ているチーム名を、DOMに現れる順で返す */
function labelsInOrder(): string[] {
    return Array.from(document.querySelectorAll('.team-score-block .team-label'))
        .map(el => el.textContent!.trim());
}

describe('スコアボード: マイチームを左に固定する', () => {
    it('マイチームが青(teamB)なら先に描かれる', () => {
        renderWith(false, true);
        expect(labelsInOrder()).toEqual(['ビジター', 'ホーム']);
    });

    it('マイチームが白(teamA)なら従来どおり', () => {
        renderWith(true, false);
        expect(labelsInOrder()).toEqual(['ホーム', 'ビジター']);
    });

    it('決められないときは従来どおりで虹も出さない', () => {
        renderWith(true, true);
        expect(labelsInOrder()).toEqual(['ホーム', 'ビジター']);
        expect(document.querySelector('.team-label.is-my-team')).toBeNull();
    });

    it('マイチーム側にだけ虹が付く', () => {
        renderWith(false, true);
        const rainbow = document.querySelectorAll('.team-label.is-my-team');
        expect(rainbow).toHaveLength(1);
        expect(rainbow[0].textContent!.trim()).toBe('ビジター');
    });

    it('先頭のブロックに場所のクラスが付く', () => {
        renderWith(false, true);
        expect(document.querySelector('.team-score-block')!.className).toContain('block-left');
    });
});
