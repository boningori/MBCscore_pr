// ペナルティの境目は TEAM_FOUL_LIMIT ひとつから来ていなければならない。
//
// FoulInputFlow は `teamFouls >= 4` と直に書いていた。値は types/game の
// TEAM_FOUL_LIMIT と同じなので、いまは誰も困らない。困るのは規則が変わった
// ときで、types/game 側（isTeamPenalty と suggestFreeThrowCount）だけが新しい
// 境目に移り、この画面の「(このファウルからペナルティ)」だけが 4 に取り残される。
// 記録者から見ると、FTを2本求められているのに画面には何の断りも出ない、
// あるいはその逆になる。
//
// そこで、定数を差し替えたときに画面がついてくるかを見る。定数の値そのもの
// （4）は試験しない——それは types/game の規則であって、この画面の仕事は
// 「規則を読むこと」だけである。
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/** 実際の 4 とは違う値。ここを読んでいなければ画面は 4 のまま振る舞う */
const FAKE_LIMIT = 6;

beforeEach(() => {
    vi.doMock('../../types/game', async () => {
        const actual = await vi.importActual<typeof import('../../types/game')>('../../types/game');
        return { ...actual, TEAM_FOUL_LIMIT: FAKE_LIMIT };
    });
});

afterEach(() => {
    cleanup();
    vi.doUnmock('../../types/game');
    vi.resetModules();
});

async function renderWithTeamFouls(teamFouls: number) {
    const { FoulInputFlow } = await import('./FoulInputFlow');
    const noop = vi.fn();
    render(
        <FoulInputFlow
            onComplete={noop}
            onCancel={noop}
            hasSelectedPlayer={true}
            teamFouls={teamFouls}
            opponentTeamId="teamB"
            opponentPlayers={[]}
            opponentTeamName="相手チーム"
        />,
    );
}

describe('ペナルティの境目は TEAM_FOUL_LIMIT で決まる', () => {
    it('定数を上げたら、その手前ではペナルティと言わない', async () => {
        await renderWithTeamFouls(FAKE_LIMIT - 1);
        expect(screen.queryByText(/このファウルからペナルティ/)).toBeNull();
    });

    it('定数に届いたらペナルティと言う', async () => {
        await renderWithTeamFouls(FAKE_LIMIT);
        expect(screen.getByText(/このファウルからペナルティ/)).toBeTruthy();
    });
});
