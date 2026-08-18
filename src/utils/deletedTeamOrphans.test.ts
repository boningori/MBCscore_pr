// マイチームを削除すると、そのチームで記録した過去試合が選手スタッツ分析から
// 完全に消えていた。
//
// isMyTeamSide は savedTeamId があれば id だけで判定し、名前へフォールバック
// しない（改名時の取り違えを防ぐ設計）。削除されたチームの id は二度と一致
// しないため、記録は履歴に残るのに分析からだけ見えなくなる。実測で
// getMyTeamGames が 1件 → 0件 になった。
//
// 削除の時点で紐付けを外し、名前照合（旧データと同じ経路）へ戻す。
// 同名で作り直せば起動時のバックフィルが再び id を結び直す。

import { describe, it, expect, beforeEach } from 'vitest';
import { deleteMyTeam, saveMyTeam } from './teamStorage';
import type { SavedTeam } from './teamStorage';
import { loadGameHistory } from './gameHistoryStorage';
import type { GameRecord } from './gameHistoryStorage';
import { getMyTeamGames } from './playerStatsAnalysis';

function record(id: string, savedTeamId: string | undefined, name: string): GameRecord {
    const team = {
        id: 'teamA', name, coachName: '', assistantCoachName: '', players: [],
        timeouts: [], teamFouls: [0, 0, 0, 0], coachFouls: [], assistantCoachFouls: [],
        benchFouls: [], isMyTeam: true, color: 'white',
        ...(savedTeamId ? { savedTeamId } : {}),
    };
    return {
        id, date: '2026-06-01T00:00:00.000Z', gameName: 'テスト',
        teamA: team as never,
        teamB: { ...team, id: 'teamB', name: '相手', isMyTeam: false, savedTeamId: undefined } as never,
        finalScore: { teamA: 1, teamB: 0 },
        scoreHistory: [], statHistory: [], foulHistory: [],
        createdAt: `2026-06-01T10:00:0${id.slice(-1)}.000Z`,
    };
}

const team = (id: string, name: string): SavedTeam => ({
    id, name, coachName: '', assistantCoachName: '', players: [],
    createdAt: '', updatedAt: '',
} as SavedTeam);

beforeEach(() => localStorage.clear());

describe('マイチーム削除と過去試合の紐付け', () => {
    it('削除したチームを指す紐付けが外れる', () => {
        localStorage.setItem('minibasket-game-history', JSON.stringify([record('g1', 'team-old', 'ホーム')]));

        deleteMyTeam('team-old');

        expect(loadGameHistory()[0].teamA.savedTeamId).toBeUndefined();
    });

    it('同じ名前で作り直すと過去試合が分析に戻る', () => {
        localStorage.setItem('minibasket-game-history', JSON.stringify([record('g1', 'team-old', 'ホーム')]));

        deleteMyTeam('team-old');

        expect(getMyTeamGames(team('team-new', 'ホーム'))).toHaveLength(1);
    });

    it('別のチームの紐付けは触らない', () => {
        localStorage.setItem('minibasket-game-history', JSON.stringify([
            record('g1', 'team-old', 'ホーム'),
            record('g2', 'team-keep', '別チーム'),
        ]));

        deleteMyTeam('team-old');

        const history = loadGameHistory();
        expect(history.find(r => r.id === 'g1')!.teamA.savedTeamId).toBeUndefined();
        expect(history.find(r => r.id === 'g2')!.teamA.savedTeamId).toBe('team-keep');
    });

    it('残ったチームは従来どおり削除される', () => {
        saveMyTeam(team('t1', 'ホーム'));
        saveMyTeam(team('t2', '別'));

        deleteMyTeam('t1');

        const remaining = JSON.parse(localStorage.getItem('minibasket-my-teams') ?? '[]');
        expect(remaining.map((t: SavedTeam) => t.id)).toEqual(['t2']);
    });

    it('該当する試合が無ければ履歴を書き換えない', () => {
        const before = JSON.stringify([record('g1', 'team-other', 'よそ')]);
        localStorage.setItem('minibasket-game-history', before);

        deleteMyTeam('team-old');

        expect(localStorage.getItem('minibasket-game-history')).toBe(before);
    });
});
