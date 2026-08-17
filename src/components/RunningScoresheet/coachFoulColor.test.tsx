// コーチ行のファウルは記入色（1Q/3Q=赤、2Q/4Q/OT=黒）で書き分ける。
//
// 色はファウル履歴のクォーターから決めるが、コーチ行(team.coachFouls)には
// コーチ本人のT以外に、A.コーチ・ベンチ関係者・交代要員のテクニカルが
// 「B」として二重計上される。履歴側を coachFoulTarget === 'COACH' だけに
// 絞ると2つの列の長さが揃わず、i番目どうしが別のファウルを指す。

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { RunningScoresheet } from './RunningScoresheet';
import { gameReducer } from '../../context/reducers';
import { createInitialGame, createTeam, createPlayer } from '../../types/game';
import type { Game } from '../../types/game';

afterEach(cleanup);

function baseGame(): Game {
    const t = (id: string) => {
        const team = createTeam(id, `T-${id}`, 'コーチ');
        team.players = [{ ...createPlayer(`${id}-1`, 4, 'A'), isOnCourt: true }];
        return team;
    };
    return { ...createInitialGame(), teamA: t('teamA'), teamB: t('teamB'), phase: 'playing' };
}

/** ベンチテクニカルを1つ記録する（FT入力フロー経由） */
function addBenchTech(state: Game, playerId: string | null, quarter: number): Game {
    return gameReducer({ ...state, currentQuarter: quarter }, {
        type: 'ADD_FOUL_WITH_FREE_THROWS',
        payload: {
            teamId: 'teamA', playerId, foulType: 'T', shotSituation: 'none',
            freeThrows: 1, freeThrowResults: ['made'],
            shooterTeamId: 'teamB', shooterPlayerId: 'teamB-1',
        },
    });
}

/** チームAのコーチ行のセル [表示文字, 色クラス] */
function coachRowCells(game: Game): [string, string][] {
    const { container } = render(<RunningScoresheet game={game} />);
    const row = container.querySelectorAll('.coach-row')[0];
    return Array.from(row.querySelectorAll('.cell-foul')).slice(0, 3).map(c => [
        c.textContent ?? '',
        c.classList.contains('q-red') ? 'q-red' : c.classList.contains('q-black') ? 'q-black' : '',
    ]);
}

describe('コーチ行のファウルの記入色', () => {
    it('A.コーチのB（1Q）とコーチのC（2Q）がそれぞれの色になる', () => {
        let s = baseGame();
        s = addBenchTech(s, 'ACOACH', 1);  // コーチ行に B、A.コーチ行に C
        s = addBenchTech(s, 'COACH', 2);   // コーチ行に C

        expect(s.teamA.coachFouls).toEqual(['BT', 'T']);
        expect(coachRowCells(s)).toEqual([
            ['B', 'q-red'],    // 1Q
            ['C', 'q-black'],  // 2Q
            ['', ''],
        ]);
    });

    it('ベンチ関係者のB（3Q）も自分のクォーターの色になる', () => {
        let s = baseGame();
        s = addBenchTech(s, 'BENCH', 3);

        expect(coachRowCells(s)[0]).toEqual(['B', 'q-red']);
    });

    it('交代要員のB（4Q）も自分のクォーターの色になる', () => {
        let s = baseGame();
        s = gameReducer({ ...baseGame(), currentQuarter: 4 }, {
            type: 'ADD_FOUL_WITH_FREE_THROWS',
            payload: {
                teamId: 'teamA', playerId: 'teamA-1', foulType: 'T', shotSituation: 'none',
                freeThrows: 1, freeThrowResults: ['made'],
                shooterTeamId: 'teamB', shooterPlayerId: 'teamB-1',
                benchTechType: 'Sub',
            },
        });

        expect(s.teamA.coachFouls).toEqual(['BT']);
        expect(coachRowCells(s)[0]).toEqual(['B', 'q-black']);
    });
});
