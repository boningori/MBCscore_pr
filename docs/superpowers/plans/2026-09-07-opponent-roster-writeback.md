# 追加した相手選手を名簿へ取り込む 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 試合終了・保存の直後に、その試合で相手チームへ追加した選手を対戦チームの名簿へ取り込むか尋ねる。

**Architecture:** 突き合わせと名前照合は `src/utils/opponentRosterWriteback.ts` の純粋関数に閉じ込め、保存は `App.tsx` が既存の `saveOpponent` / `saveRecentOpponent` で行う。追加を追跡する状態は増やさず、試合終了時に「保存済みの名簿」と「試合中の名簿」を背番号で突き合わせて差分を出す。

**Tech Stack:** React 19 + TypeScript + Vite / Vitest + @testing-library/react

**設計書:** [docs/superpowers/specs/2026-09-07-opponent-roster-writeback-design.md](../specs/2026-09-07-opponent-roster-writeback-design.md)

## Global Constraints

- **相手チームは名前でしか特定できない。** `Team.savedTeamId` はマイチームにしか入らず、相手側に入れると「自分の別チームを相手として登録した練習試合が選手スタッツ分析から消える」既知の不具合が復活する（`types/game.ts:84-91`）。**`matchTeams.ts` と `types/game.ts` は触らない。**
- **保存先のキー名と定数名が交差している。** `saveOpponent` / `loadOpponents`（対戦チーム管理の登録一覧）は `minibasket-saved-opponents`、`saveRecentOpponent` / `loadRecentOpponents`（直近の対戦履歴）は `minibasket-opponent-teams`。名前から素直に推測すると逆になる。**テストでキーを直に触らず、`loadOpponents()` / `loadRecentOpponents()` で確かめる。**
- **`Team` を `SavedTeam` へ丸ごと変換しない。** 追加された選手だけを既存の `SavedTeam.players` へ足す。`teamStorage.ts` から `teamToSavedTeam` が削除された経緯（`courtName` / `licenseNo` / `bibNumber` / `uniformNumber` を静かに落とす）がコメントに残っている。
- 返す `SavedTeam` は元の `id` を保つ。`saveOpponent` は `id` で既存レコードを探して差し替えるため、`id` が変わると新しいレコードが増える。
- 並べ替えは `sortPlayersByNumber()`（`src/utils/playerNumber.ts`）。独自ソートを書かない。
- 背番号の表示は `formatPlayerNumber()`。
- 相手チームの背番号は `SavedPlayer.number` をそのまま使う（`savedTeamToTeam` は相手に `numberType` を渡さない）。`bibNumber` / `uniformNumber` は見ない。
- コメントは日本語で「なぜ」を書く。周囲の流儀に合わせる。
- インデントは4スペース（`src/App.tsx` だけ2スペース）。
- テストの実行: `npx vitest run <path>`

---

### Task 1: 取り込みの計画を立てる純粋関数

**Files:**
- Create: `src/utils/opponentRosterWriteback.ts`
- Test: `src/utils/opponentRosterWriteback.test.ts`

**Interfaces:**
- Consumes: `Team`（`src/types/game.ts`）、`SavedTeam` / `SavedPlayer`（`src/utils/teamStorage.ts`）、`sortPlayersByNumber`（`src/utils/playerNumber.ts`）
- Produces:
  - `export interface OpponentWriteback { teamName: string; added: SavedPlayer[]; updatedRegistry: SavedTeam | null; updatedRecent: SavedTeam | null; resultCount: number }`
  - `export function planOpponentWriteback(teamA: Team, teamB: Team, registry: SavedTeam[], recent: SavedTeam[]): OpponentWriteback | null`

- [ ] **Step 1: 失敗するテストを書く**

Create `src/utils/opponentRosterWriteback.test.ts`:

```ts
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
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx vitest run src/utils/opponentRosterWriteback.test.ts
```

Expected: FAIL — `Failed to resolve import "./opponentRosterWriteback"`。

- [ ] **Step 3: 実装する**

Create `src/utils/opponentRosterWriteback.ts`:

```ts
// 試合中に相手チームへ足した選手を、対戦チームの名簿へ取り込む計画を立てる。
//
// 追加を追跡する状態は持たない。試合終了時に「保存済みの名簿」と「試合中の
// 名簿」を背番号で突き合わせ、試合側にしか無い背番号を追加分とする。
// 背番号は選手の識別子で、登録時に重複しないことが保証されている。

import type { Team } from '../types/game';
import type { SavedPlayer, SavedTeam } from './teamStorage';
import { sortPlayersByNumber } from './playerNumber';

export interface OpponentWriteback {
    /** ダイアログに出すチーム名 */
    teamName: string;
    /** 取り込む選手（背番号順） */
    added: SavedPlayer[];
    /** saveOpponent へそのまま渡す。名前が一致しなければ null */
    updatedRegistry: SavedTeam | null;
    /** saveRecentOpponent へそのまま渡す。名前が一致しなければ null */
    updatedRecent: SavedTeam | null;
    /** 登録後の人数。15人超過の案内に使う */
    resultCount: number;
}

/** 同名が1件だけ見つかればそれを返す。0件は null、2件以上は 'ambiguous' */
function uniqueByName(teams: SavedTeam[], name: string): SavedTeam | null | 'ambiguous' {
    const hits = teams.filter(t => t.name === name);
    if (hits.length === 0) return null;
    if (hits.length > 1) return 'ambiguous';
    return hits[0];
}

/**
 * 取り込みの計画を立てる。尋ねる必要が無ければ null。
 *
 * null を返すのは次のいずれか。
 * - 相手チームを判別できない（isMyTeam が偽の側がちょうど1つに決まらない）
 * - 追加された選手がいない
 * - どちらかの保存先で同名が2件以上見つかった（どちらに入れるべきか決められない）
 * - どちらの保存先にも見つからなかった（改名・未登録）
 *
 * 相手チームは名前でしか登録レコードと結び付けられない。Team.savedTeamId は
 * マイチームにしか入らず、相手側に入れると「自分の別チームを相手として登録した
 * 練習試合が選手スタッツ分析から消える」既知の不具合が復活する
 * （types/game.ts の savedTeamId のコメント）。名前が曖昧なら、違うチームの
 * 名簿に黙って書き込むより尋ねないほうが安全。
 */
export function planOpponentWriteback(
    teamA: Team,
    teamB: Team,
    registry: SavedTeam[],
    recent: SavedTeam[],
): OpponentWriteback | null {
    const opponents = [teamA, teamB].filter(t => t.isMyTeam === false);
    if (opponents.length !== 1) return null;
    const opponent = opponents[0];

    const registryHit = uniqueByName(registry, opponent.name);
    const recentHit = uniqueByName(recent, opponent.name);
    if (registryHit === 'ambiguous' || recentHit === 'ambiguous') return null;
    if (!registryHit && !recentHit) return null;

    // 差分の基準はどちらか一方でよい。通常は同じレコードが両方に入っている。
    // ずれている場合に備え、実際に足すときは保存先ごとに持っていない番号だけを足す
    const reference = registryHit ?? recentHit!;
    const known = new Set(reference.players.map(p => p.number));

    // 取り込むのは背番号と名前だけ。コートネームもライセンスNo.も試合中の
    // 追加では入力手段が無く、キャプテンは名簿側で決めること
    const added = sortPlayersByNumber(
        opponent.players
            .filter(p => !known.has(p.number))
            .map(p => ({ number: p.number, name: p.name, isCaptain: false })),
    );
    if (added.length === 0) return null;

    // 既存選手はそのまま残し、足りない分だけ足す。SavedTeam を作り直すと
    // courtName / licenseNo / bibNumber / uniformNumber が落ちる
    // （teamStorage.ts の teamToSavedTeam 削除の経緯を参照）。
    // id は変えない。saveOpponent は id で既存レコードを探して差し替える
    const withAdded = (team: SavedTeam): SavedTeam => {
        const have = new Set(team.players.map(p => p.number));
        return {
            ...team,
            players: sortPlayersByNumber([...team.players, ...added.filter(p => !have.has(p.number))]),
        };
    };

    const updatedRegistry = registryHit ? withAdded(registryHit) : null;
    const updatedRecent = recentHit ? withAdded(recentHit) : null;

    return {
        teamName: opponent.name,
        added,
        updatedRegistry,
        updatedRecent,
        resultCount: Math.max(
            updatedRegistry?.players.length ?? 0,
            updatedRecent?.players.length ?? 0,
        ),
    };
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/utils/opponentRosterWriteback.test.ts
```

Expected: PASS（18件）。件数は目安で、実際に落ちていなければよい。

- [ ] **Step 5: コミット**

```bash
git add src/utils/opponentRosterWriteback.ts src/utils/opponentRosterWriteback.test.ts
git commit -m "feat(team): 追加した相手選手の取り込み計画を立てる

試合中の名簿と保存済みの名簿を背番号で突き合わせ、差分を出す。
相手は名前でしか結び付けられないので、同名が2件以上あるときや
見つからないときは null を返して尋ねない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: ConfirmModal に確認ボタンの見た目を足す

**Files:**
- Modify: `src/components/Modal/ConfirmModal.tsx`
- Test: `src/components/Modal/ConfirmModal.test.tsx`（新規）

**Interfaces:**
- Consumes: なし
- Produces: `ConfirmModal` の任意 prop `confirmVariant?: 'danger' | 'primary'`（既定 `'danger'`）

- [ ] **Step 1: 失敗するテストを書く**

Create `src/components/Modal/ConfirmModal.test.tsx`:

```tsx
// ConfirmModal の実行ボタンは取り返しのつかない削除のために btn-danger（赤）で
// 固定されていた。破壊的でない確認（名簿への登録など）を赤で出すと危険な操作に
// 見えるため、見た目だけ選べるようにする。既定は danger のまま——既存の
// 呼び出し側の見た目を変えないことがこのテストの主目的。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ConfirmModal } from './ConfirmModal';

afterEach(cleanup);

const renderModal = (props: Partial<Parameters<typeof ConfirmModal>[0]> = {}) =>
    render(
        <ConfirmModal
            title="確認"
            message="よろしいですか"
            confirmLabel="実行する"
            onConfirm={vi.fn()}
            onCancel={vi.fn()}
            {...props}
        />,
    );

describe('ConfirmModal 実行ボタンの見た目', () => {
    it('既定では btn-danger（既存の呼び出し側が変わらない）', () => {
        renderModal();
        const btn = screen.getByRole('button', { name: '実行する' });
        expect(btn.classList.contains('btn-danger')).toBe(true);
        expect(btn.classList.contains('btn-primary')).toBe(false);
    });

    it('confirmVariant="primary" で btn-primary になる', () => {
        renderModal({ confirmVariant: 'primary' });
        const btn = screen.getByRole('button', { name: '実行する' });
        expect(btn.classList.contains('btn-primary')).toBe(true);
        expect(btn.classList.contains('btn-danger')).toBe(false);
    });

    it('打ち消し側は見た目を変えない', () => {
        renderModal({ confirmVariant: 'primary' });
        const btn = screen.getByRole('button', { name: 'キャンセル' });
        expect(btn.classList.contains('btn-secondary')).toBe(true);
    });
});
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx vitest run src/components/Modal/ConfirmModal.test.tsx
```

Expected: 「`confirmVariant="primary"` で btn-primary になる」が FAIL（常に `btn-danger`）。TypeScript も未知の prop としてエラーになる。他2件は PASS。

- [ ] **Step 3: 実装する**

`src/components/Modal/ConfirmModal.tsx` の `interface ConfirmModalProps` に足す（`cancelLabel` の下）:

```tsx
    /**
     * 実行側の見た目（既定: danger）。
     * 赤は取り返しのつかない操作のための色。名簿への登録のような
     * 破壊的でない確認では primary にする
     */
    confirmVariant?: 'danger' | 'primary';
```

関数の引数リストに既定値つきで足す（`cancelLabel = 'キャンセル',` の下）:

```tsx
    confirmVariant = 'danger',
```

実行ボタンの className を差し替える:

```tsx
                <button className={`btn btn-${confirmVariant}`} onClick={onConfirm}>
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/components/Modal/
```

Expected: PASS。既存の `Modal.test.tsx` / `closeOnBack.test.tsx` も緑。

- [ ] **Step 5: コミット**

```bash
git add src/components/Modal/
git commit -m "feat(modal): ConfirmModal の実行ボタンの見た目を選べるようにする

赤は取り返しのつかない操作の色。名簿への登録のような破壊的でない
確認を赤で出すと危険な操作に見える。既定は danger のままなので
既存の呼び出し側は変わらない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 試合終了時に尋ねて保存する

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.opponentRosterWriteback.test.tsx`（新規）

**Interfaces:**
- Consumes: Task 1 の `planOpponentWriteback` / `OpponentWriteback`、Task 2 の `confirmVariant`
- Produces: なし（アプリ内で完結する配線）

- [ ] **Step 1: 失敗するテストを書く**

Create `src/App.opponentRosterWriteback.test.tsx`:

```tsx
// 試合中に相手チームへ足した選手は、その試合にしか残らない。
// 試合終了・保存の直後に、対戦チームの名簿へ取り込むか尋ねる。
//
// 相手チームは名前でしか登録レコードと結び付けられないので、
// 一意に決まるときだけ尋ねる（同名が2件・見つからないときは尋ねない）。
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { createInitialGame, createTeam, createPlayer } from './types/game';
import { loadOpponents, loadRecentOpponents } from './utils/teamStorage';
import type { SavedTeam } from './utils/teamStorage';

// 保存先のキーは定数名と交差している。直に触らず、この2つのキーを使う
// （minibasket-saved-opponents = 登録一覧、minibasket-opponent-teams = 直近履歴）
const REGISTRY_KEY = 'minibasket-saved-opponents';
const RECENT_KEY = 'minibasket-opponent-teams';

function savedOpponent(id: string, name: string, numbers: number[]): SavedTeam {
    return {
        id,
        name,
        coachName: '相手コーチ',
        assistantCoachName: '',
        players: numbers.map(n => ({ number: n, name: `相手${n}`, isCaptain: false })),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

/**
 * 試合終了直後（保存待ち）の中断セッションを仕込む。
 * 相手チームには保存済みの名簿に無い #99 が居る＝この試合で追加された選手
 */
function seedFinishedSession(opponentNumbers: number[] = [10, 99]) {
    const game = createInitialGame();
    game.phase = 'finished';
    game.currentQuarter = 4;
    game.teamA = {
        ...createTeam('teamA', 'ホームチーム', 'コーチ'),
        isMyTeam: true,
        players: [{ ...createPlayer('teamA-player-0', 4, 'ホーム1'), isOnCourt: true }],
    };
    game.teamB = {
        ...createTeam('teamB', '相手チーム', '相手コーチ'),
        isMyTeam: false,
        players: opponentNumbers.map((n, i) => ({
            ...createPlayer(`teamB-player-${i}`, n, `相手${n}`),
            isOnCourt: i === 0,
        })),
    };
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game, gameName: '決勝戦', date: '2026-09-07', savedAt: new Date().toISOString(),
    }));
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    // マイチームが1つも無いと Home はメニューを出さず「まずマイチームを
    // 登録してください」の案内になる（Home.tsx の hasMyTeams）。
    // 「試合結果を保存」に辿り着けないので必ず仕込む
    localStorage.setItem('minibasket-my-teams', JSON.stringify([{
        id: 'team-1',
        name: 'ホームチーム',
        coachName: 'コーチ',
        assistantCoachName: '',
        players: [{ number: 4, name: 'ホーム1', isCaptain: true }],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    }]));
    // 試合を保存すると履歴が1件増え、バックアップ未記録なら isBackupDue() が
    // 真になる。督促は画面ごと差し替える早期returnなので、素のままだと
    // ホーム画面の表明が落ちる。既にバックアップ済みということにして黙らせる
    // （順序そのものは専用のテストで確かめる）
    localStorage.setItem('minibasket-last-backup', JSON.stringify({ timestamp: Date.now(), gameCount: 99 }));
});

afterEach(cleanup);

/** ホーム →「試合結果を保存」→「保存して終了」まで進める */
async function finishGame() {
    render(<App />);
    fireEvent.click(await screen.findByText('試合結果を保存'));
    fireEvent.click(await screen.findByText('保存して終了'));
}

describe('App: 追加した相手選手を名簿へ取り込む', () => {
    it('登録一覧と直近履歴の両方に一致したら、両方に登録される', async () => {
        localStorage.setItem(REGISTRY_KEY, JSON.stringify([savedOpponent('o1', '相手チーム', [10])]));
        localStorage.setItem(RECENT_KEY, JSON.stringify([savedOpponent('r1', '相手チーム', [10])]));
        seedFinishedSession();

        await finishGame();

        expect(await screen.findByText('相手チームの名簿に登録しますか？')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '登録する' }));

        await waitFor(() => {
            expect(loadOpponents()[0].players.map(p => p.number)).toEqual([10, 99]);
        });
        expect(loadRecentOpponents()[0].players.map(p => p.number)).toEqual([10, 99]);
        // id を保つ＝新しいレコードを増やさない
        expect(loadOpponents()).toHaveLength(1);
        expect(loadRecentOpponents()).toHaveLength(1);
    });

    it('「登録しない」を選ぶと名簿は変わらない', async () => {
        localStorage.setItem(REGISTRY_KEY, JSON.stringify([savedOpponent('o1', '相手チーム', [10])]));
        seedFinishedSession();

        await finishGame();

        fireEvent.click(await screen.findByRole('button', { name: '登録しない' }));

        await waitFor(() => {
            expect(screen.queryByText('相手チームの名簿に登録しますか？')).toBeNull();
        });
        expect(loadOpponents()[0].players.map(p => p.number)).toEqual([10]);
    });

    it('追加された選手がいなければ尋ねない', async () => {
        localStorage.setItem(REGISTRY_KEY, JSON.stringify([savedOpponent('o1', '相手チーム', [10, 99])]));
        seedFinishedSession();

        await finishGame();

        await waitFor(() => {
            expect(screen.getByText('新規試合開始')).toBeTruthy();
        });
        expect(screen.queryByText('相手チームの名簿に登録しますか？')).toBeNull();
    });

    it('同名の相手チームが2件あるときは尋ねない（どちらに入れるか決められない）', async () => {
        localStorage.setItem(REGISTRY_KEY, JSON.stringify([
            savedOpponent('o1', '相手チーム', [10]),
            savedOpponent('o2', '相手チーム', [10]),
        ]));
        seedFinishedSession();

        await finishGame();

        await waitFor(() => {
            expect(screen.getByText('新規試合開始')).toBeTruthy();
        });
        expect(screen.queryByText('相手チームの名簿に登録しますか？')).toBeNull();
        expect(loadOpponents().every(t => t.players.length === 1)).toBe(true);
    });

    it('名簿に見つからなければ尋ねない（改名・未登録）', async () => {
        localStorage.setItem(REGISTRY_KEY, JSON.stringify([savedOpponent('o1', '旧チーム名', [10])]));
        seedFinishedSession();

        await finishGame();

        await waitFor(() => {
            expect(screen.getByText('新規試合開始')).toBeTruthy();
        });
        expect(screen.queryByText('相手チームの名簿に登録しますか？')).toBeNull();
    });

    it('追加する選手の背番号と名前、登録先のチーム名を出す', async () => {
        localStorage.setItem(REGISTRY_KEY, JSON.stringify([savedOpponent('o1', '相手チーム', [10])]));
        seedFinishedSession();

        await finishGame();

        const dialog = await screen.findByRole('dialog');
        expect(dialog.textContent).toContain('#99 相手99');
        expect(dialog.textContent).toContain('相手チーム');
    });

    // バックアップ督促は画面ごと差し替える早期return。取り込みダイアログと
    // 同時に立てると、ダイアログが一度も出ないまま消える
    it('取り込みダイアログを閉じてからバックアップ督促が出る', async () => {
        // 督促を黙らせる仕込みを外す＝保存後に督促が要る状態にする
        localStorage.removeItem('minibasket-last-backup');
        localStorage.setItem(REGISTRY_KEY, JSON.stringify([savedOpponent('o1', '相手チーム', [10])]));
        seedFinishedSession();

        await finishGame();

        // まず取り込みダイアログ。督促に押しつぶされていない
        expect(await screen.findByText('相手チームの名簿に登録しますか？')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: '登録する' }));

        // 閉じた後に督促が出る
        await waitFor(() => {
            expect(screen.queryByText('相手チームの名簿に登録しますか？')).toBeNull();
        });
        expect(await screen.findByText(/バックアップ/)).toBeTruthy();
    });
});
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx vitest run src/App.opponentRosterWriteback.test.tsx
```

Expected: 「両方に登録される」「登録しない」「背番号と名前を出す」「督促の順序」の4件が FAIL（ダイアログが出ない）。「尋ねない」3件は PASS（もともと出ないため）。

- [ ] **Step 3: 実装する**

`src/App.tsx` を直す。

(1) import を足す。`import { isBackupDue } from './utils/lastBackupStorage';` の下に:

```tsx
import { planOpponentWriteback, type OpponentWriteback } from './utils/opponentRosterWriteback';
```

既存の `import { saveRecentOpponent } from './utils/teamStorage';` を差し替える:

```tsx
import { saveRecentOpponent, saveOpponent, loadOpponents, loadRecentOpponents } from './utils/teamStorage';
```

`MAX_PLAYERS_PER_TEAM` を `./types/game` の既存 import に足す。

(2) state を足す。`const [showBackupPrompt, setShowBackupPrompt] = useState(false);` の下に:

```tsx
  // 試合中に相手チームへ足した選手を名簿に取り込むかの確認。
  // null なら尋ねない（一意に特定できたときだけ値が入る）
  const [rosterWriteback, setRosterWriteback] = useState<OpponentWriteback | null>(null);
```

(3) バックアップ督促を関数に切り出す。`handleGameFinished` の定義の直前に置く:

```tsx
  /**
   * 前回バックアップ後に試合が増えていれば督促する。
   *
   * 呼ぶ場所を選べるように切り出す。showBackupPrompt は画面ごと差し替える
   * 早期returnなので、先に立てると名簿の取り込みダイアログが描画されない。
   * 取り込みを尋ねるときは、閉じた後にここを呼ぶ
   */
  const promptBackupIfDue = () => {
    if (isBackupDue()) {
      setShowBackupPrompt(true);
    }
  };
```

(4) `handleGameFinished` の末尾（`clearGameSession();` から関数の終わりまで）を差し替える:

```tsx
    clearGameSession();
    // 音声メモは手入力のための下書きなので、試合が終われば役目は終わり
    voiceMemo.clearAll();
    setScreen('home');

    // 試合中に相手チームへ足した選手を名簿へ取り込むか尋ねる。
    // 相手は名前でしか登録レコードと結び付けられないので、一意に決まるときだけ。
    // 詳しくは utils/opponentRosterWriteback.ts
    const writeback = planOpponentWriteback(
      state.teamA,
      state.teamB,
      loadOpponents(),
      loadRecentOpponents(),
    );
    if (writeback) {
      setRosterWriteback(writeback);
      // 督促はダイアログを閉じてから。同時に立てると督促が画面ごと差し替えて
      // ダイアログが出ないまま消える
      return;
    }

    promptBackupIfDue();
  };
```

(5) ダイアログを描画する。ファイル末尾の

```tsx
  return (
    <>
      {renderScreen()}
      {/* 設定はどの画面からでも開ける（保存失敗時の案内先になるため） */}
      <AppSettingsModal
        isOpen={showAppSettings}
        onClose={() => setShowAppSettings(false)}
      />
    </>
  );
```

を差し替える:

```tsx
  return (
    <>
      {renderScreen()}
      {/* 設定はどの画面からでも開ける（保存失敗時の案内先になるため） */}
      <AppSettingsModal
        isOpen={showAppSettings}
        onClose={() => setShowAppSettings(false)}
      />
      {/* 試合終了直後、相手チームへ足した選手を名簿へ取り込むかの確認。
          ホームへ遷移した後に出るので、早期returnの外側に置く */}
      {rosterWriteback && (
        <ConfirmModal
          title="相手チームの名簿に登録しますか？"
          message={`この試合で追加した ${rosterWriteback.added.map(p => `#${formatPlayerNumber(p.number)} ${p.name}`).join('、')} を「${rosterWriteback.teamName}」の名簿に登録します。次の試合から選べるようになります。`}
          // 上限は超えても止めない。退場者やスコアシートあふれと同じで、
          // 事実だけ伝えて判断は利用者に任せる
          note={rosterWriteback.resultCount > MAX_PLAYERS_PER_TEAM
            ? `登録すると${rosterWriteback.resultCount}人になります。対戦チーム管理の上限は${MAX_PLAYERS_PER_TEAM}人です。`
            : undefined}
          confirmLabel="登録する"
          cancelLabel="登録しない"
          // 名簿への登録は取り返しのつかない操作ではないので赤にしない
          confirmVariant="primary"
          onConfirm={() => {
            if (rosterWriteback.updatedRegistry) saveOpponent(rosterWriteback.updatedRegistry);
            if (rosterWriteback.updatedRecent) saveRecentOpponent(rosterWriteback.updatedRecent);
            setRosterWriteback(null);
            promptBackupIfDue();
          }}
          onCancel={() => {
            setRosterWriteback(null);
            promptBackupIfDue();
          }}
        />
      )}
    </>
  );
```

> **注:** この節の文言は最終レビューで誤りと分かり、実装では差し替えた。現行の文言は設計書を参照。

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/App.opponentRosterWriteback.test.tsx src/App.gameFinishSave.test.tsx
```

Expected: PASS。既存の試合終了・保存のテストが壊れていないこと。

- [ ] **Step 5: このテストが効いていることを確かめる**

`planOpponentWriteback` の呼び出しを一時的に `null` を返すよう書き換え、「両方に登録される」が落ちることを確認してから戻す。実際の出力を報告に残す。

- [ ] **Step 6: 全体を検証する**

```bash
npm run lint && npx tsc -b && npm run typecheck:test && npm test
```

Expected: 4つとも通る。落ちたら原因を直してから次へ進む。

- [ ] **Step 7: コミット**

```bash
git add src/App.tsx src/App.opponentRosterWriteback.test.tsx
git commit -m "feat(team): 試合終了時に追加した相手選手を名簿へ取り込むか尋ねる

遅れて来た選手を次の試合でまた手で登録し直す必要があった。
一意に特定できたときだけ尋ね、登録一覧と直近履歴の両方を更新する
（片方だけだと、もう片方から選んだ次の試合で反映されて見えない）。

バックアップ督促は画面ごと差し替える早期returnなので、取り込み
ダイアログを閉じてから判定するよう順序を分けた。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 完了の条件

- `npm run lint` / `npx tsc -b` / `npm run typecheck:test` / `npm test` がすべて通る
- 相手チームへ選手を追加して試合を終えると、名簿へ取り込むか尋ねられる
- 「登録する」で登録一覧・直近履歴の両方が更新され、レコードが増えない（id が保たれる）
- 「登録しない」で名簿が変わらない
- 追加が無い・同名が2件・見つからない、のいずれでも尋ねない
- 取り込むのは背番号と名前だけで、既存選手のコートネームやライセンスNo. が消えない
- 取り込みダイアログとバックアップ督促が重ならない

## 実機で確かめること（自動テストで見にくい部分）

- 実際に相手チームへ選手を追加して試合を終え、ダイアログが出ること
- 「登録する」の後、対戦チーム管理でその選手が名簿に居ること
- 次の試合設定でその相手を選ぶと、追加した選手が最初から居ること
- 「登録する」ボタンが赤ではないこと
