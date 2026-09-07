// 試合中に相手チームへ足した選手は、その試合にしか残らない。
// 名簿へ取り込むかを尋ねるための「計画」をここで立てる。
//
// 相手チームは名前でしか登録レコードと結び付けられない（Team.savedTeamId は
// マイチームにしか入らない。相手に入れると選手スタッツ分析の名前照合が壊れる）。
// そのため一意に決まらないときは尋ねない＝null を返す。
import { describe, it, expect } from 'vitest';
import { planOpponentWriteback } from './opponentRosterWriteback';
import { createTeam, createPlayer } from '../types/game';
import type { Team } from '../types/game';
import type { SavedTeam } from './teamStorage';

/** 試合中のチーム。isMyTeam で自陣か相手かを表す */
function gameTeam(name: string, numbers: number[], isMyTeam: boolean): Team {
    return {
        ...createTeam('teamB', name, ''),
        isMyTeam,
        players: numbers.map((n, i) => createPlayer(`p${i}`, n, `選手${n}`)),
    };
}

/** 保存済みの名簿 */
function saved(id: string, name: string, numbers: number[]): SavedTeam {
    return {
        id,
        name,
        coachName: '',
        assistantCoachName: '',
        players: numbers.map(n => ({ number: n, name: `選手${n}`, isCaptain: false })),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

const myTeam = () => gameTeam('ホーム', [4, 5], true);

describe('planOpponentWriteback: 尋ねない場合', () => {
    it('追加された選手がいなければ null', () => {
        const opponent = gameTeam('相手', [10, 11], false);
        expect(planOpponentWriteback(myTeam(), opponent, [saved('o1', '相手', [10, 11])], [])).toBeNull();
    });

    it('相手チームを判別できなければ null（両方が自陣扱い）', () => {
        const a = gameTeam('ホーム', [4], true);
        const b = gameTeam('相手', [10, 99], true);
        expect(planOpponentWriteback(a, b, [saved('o1', '相手', [10])], [])).toBeNull();
    });

    it('相手チームを判別できなければ null（isMyTeam が未設定）', () => {
        const a = { ...gameTeam('ホーム', [4], true), isMyTeam: undefined };
        const b = { ...gameTeam('相手', [10, 99], false), isMyTeam: undefined };
        expect(planOpponentWriteback(a, b, [saved('o1', '相手', [10])], [])).toBeNull();
    });

    it('登録一覧で同名が2件見つかったら null', () => {
        const opponent = gameTeam('相手', [10, 99], false);
        const registry = [saved('o1', '相手', [10]), saved('o2', '相手', [10])];
        expect(planOpponentWriteback(myTeam(), opponent, registry, [])).toBeNull();
    });

    it('直近履歴で同名が2件見つかったら null', () => {
        const opponent = gameTeam('相手', [10, 99], false);
        const recent = [saved('r1', '相手', [10]), saved('r2', '相手', [10])];
        expect(planOpponentWriteback(myTeam(), opponent, [], recent)).toBeNull();
    });

    it('どちらにも見つからなければ null（改名・未登録）', () => {
        const opponent = gameTeam('新チーム名', [10, 99], false);
        expect(planOpponentWriteback(myTeam(), opponent, [saved('o1', '旧チーム名', [10])], [])).toBeNull();
    });
});

describe('planOpponentWriteback: 取り込む内容', () => {
    it('試合側にしか無い背番号を追加分として拾う', () => {
        const opponent = gameTeam('相手', [10, 11, 99], false);
        const plan = planOpponentWriteback(myTeam(), opponent, [saved('o1', '相手', [10, 11])], []);

        expect(plan).not.toBeNull();
        expect(plan!.teamName).toBe('相手');
        expect(plan!.added).toEqual([{ number: 99, name: '選手99', isCaptain: false }]);
    });

    it('取り込むのは背番号と名前だけ。キャプテンにはしない', () => {
        const opponent = {
            ...gameTeam('相手', [10], false),
            players: [{ ...createPlayer('p0', 99, '遅刻太郎'), isCaptain: true, courtName: 'タロウ' }],
        };
        const plan = planOpponentWriteback(myTeam(), opponent, [saved('o1', '相手', [10])], []);

        expect(plan!.added).toEqual([{ number: 99, name: '遅刻太郎', isCaptain: false }]);
    });

    it('追加分は背番号順に並ぶ', () => {
        const opponent = gameTeam('相手', [10, 99, 7], false);
        const plan = planOpponentWriteback(myTeam(), opponent, [saved('o1', '相手', [10])], []);

        expect(plan!.added.map(p => p.number)).toEqual([7, 99]);
    });

    it('更新後の名簿も背番号順に並ぶ（若い番号は先頭に来る）', () => {
        const opponent = gameTeam('相手', [10, 11, 7], false);
        const plan = planOpponentWriteback(myTeam(), opponent, [saved('o1', '相手', [10, 11])], []);

        expect(plan!.updatedRegistry!.players.map(p => p.number)).toEqual([7, 10, 11]);
    });

    it('元の SavedTeam を書き換えない', () => {
        const original = saved('o1', '相手', [10]);
        const opponent = gameTeam('相手', [10, 99], false);
        planOpponentWriteback(myTeam(), opponent, [original], []);

        expect(original.players.map(p => p.number)).toEqual([10]);
    });

    it('id を保つ（保存時に新しいレコードを増やさないため）', () => {
        const opponent = gameTeam('相手', [10, 99], false);
        const plan = planOpponentWriteback(myTeam(), opponent, [saved('o1', '相手', [10])], [saved('r1', '相手', [10])]);

        expect(plan!.updatedRegistry!.id).toBe('o1');
        expect(plan!.updatedRecent!.id).toBe('r1');
    });

    it('resultCount が登録後の人数になる', () => {
        const opponent = gameTeam('相手', [10, 11, 99], false);
        const plan = planOpponentWriteback(myTeam(), opponent, [saved('o1', '相手', [10, 11])], []);

        expect(plan!.resultCount).toBe(3);
    });
});

describe('planOpponentWriteback: どの保存先を更新するか', () => {
    it('登録一覧だけに一致したら、そちらだけ埋まる', () => {
        const opponent = gameTeam('相手', [10, 99], false);
        const plan = planOpponentWriteback(myTeam(), opponent, [saved('o1', '相手', [10])], []);

        expect(plan!.updatedRegistry!.players.map(p => p.number)).toEqual([10, 99]);
        expect(plan!.updatedRecent).toBeNull();
    });

    it('直近履歴だけに一致したら、そちらだけ埋まる', () => {
        const opponent = gameTeam('相手', [10, 99], false);
        const plan = planOpponentWriteback(myTeam(), opponent, [], [saved('r1', '相手', [10])]);

        expect(plan!.updatedRegistry).toBeNull();
        expect(plan!.updatedRecent!.players.map(p => p.number)).toEqual([10, 99]);
    });

    it('両方に一致したら両方が埋まる（片方だけだと次の試合で反映されて見えない）', () => {
        const opponent = gameTeam('相手', [10, 99], false);
        const plan = planOpponentWriteback(myTeam(), opponent, [saved('o1', '相手', [10])], [saved('r1', '相手', [10])]);

        expect(plan!.updatedRegistry!.players.map(p => p.number)).toEqual([10, 99]);
        expect(plan!.updatedRecent!.players.map(p => p.number)).toEqual([10, 99]);
    });

    it('保存先ごとに中身が違っても、その保存先に無い番号だけを足す', () => {
        // 直近履歴の側だけ #99 を既に持っている、というずれた状態でも二重に足さない
        const opponent = gameTeam('相手', [10, 99], false);
        const plan = planOpponentWriteback(myTeam(), opponent, [saved('o1', '相手', [10])], [saved('r1', '相手', [10, 99])]);

        expect(plan!.updatedRecent!.players.map(p => p.number)).toEqual([10, 99]);
    });
});
