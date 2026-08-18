// 様式のライセンスNo.欄（3マス）が、選手行・コーチ行・A.コーチ行のどこでも
// 右詰めで印字されること。
//
// 3か所に同じ処理が複製されていて、どれも右詰めが効いていなかった
// （raw.padStart(3, '') はパッド文字が空なので何もしない）。集約した
// licenseDigits を全部が使っていることを、描画側でも固定する。

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { RunningScoresheet } from './RunningScoresheet';
import { createInitialGame, createTeam, createPlayer } from '../../types/game';
import type { Game } from '../../types/game';

afterEach(cleanup);

function gameWithLicenses(opts: {
    player?: string;
    coach?: string;
    assistantCoach?: string;
}): Game {
    const team = (id: string) => {
        const t = createTeam(id, `T-${id}`, 'コーチ名');
        t.coachLicenseNo = opts.coach;
        t.assistantCoachLicenseNo = opts.assistantCoach;
        t.players = [{ ...createPlayer(`${id}-1`, 4, 'A'), licenseNo: opts.player, isOnCourt: true }];
        return t;
    };
    return { ...createInitialGame(), teamA: team('teamA'), teamB: team('teamB'), phase: 'playing' };
}

/** 3マスの中身（空のマスは空文字） */
const cells = (root: Element | null) =>
    Array.from(root?.querySelectorAll('.license-digit') ?? []).map(c => c.textContent ?? '');

describe('ライセンスNo.欄の3マス', () => {
    it('選手行: 2桁は右詰め（一の位が右端）', () => {
        const { container } = render(<RunningScoresheet game={gameWithLicenses({ player: '12' })} />);

        expect(cells(container.querySelector('.cell-license'))).toEqual(['', '1', '2']);
    });

    it('選手行: 3桁を超えるときは下3桁を1マスずつ', () => {
        const { container } = render(<RunningScoresheet game={gameWithLicenses({ player: 'JBA1234567' })} />);

        expect(cells(container.querySelector('.cell-license'))).toEqual(['5', '6', '7']);
    });

    it('選手行: 未入力なら3マスとも空', () => {
        const { container } = render(<RunningScoresheet game={gameWithLicenses({})} />);

        expect(cells(container.querySelector('.cell-license'))).toEqual(['', '', '']);
    });

    it('コーチ行・A.コーチ行も右詰めになる', () => {
        const { container } = render(
            <RunningScoresheet game={gameWithLicenses({ coach: '7', assistantCoach: '89' })} />,
        );
        const areas = container.querySelectorAll('.coach-license-area');

        expect(cells(areas[0])).toEqual(['', '', '7']);
        expect(cells(areas[1])).toEqual(['', '8', '9']);
    });
});
