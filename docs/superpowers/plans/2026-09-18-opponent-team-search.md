# 対戦チーム管理の名前検索 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 対戦チーム管理の一覧を、チーム名の部分一致で絞り込めるようにする。

**Architecture:** 照合の規則を `src/utils/matchesQuery.ts` に1本化し、既存の試合履歴検索（`historyFilter.ts`）と新規のチーム検索（`teamFilter.ts`）の両方がそれを呼ぶ。画面（`OpponentManager.tsx`）に足すのは state 1つと `useMemo` 1つ、そして履歴と同じ形の操作子だけにする。

**Tech Stack:** React 19 / TypeScript 5.9 / Vitest 4 + @testing-library/react / 素のCSS（`src/index.css` のトークンを使う）

## Global Constraints

- 設計書: `docs/superpowers/specs/2026-09-18-opponent-team-search-design.md`。判断に迷ったらこれが正。
- 対象は**対戦チーム管理の一覧画面だけ**。`OpponentSelect.tsx`（試合設定の対戦相手選択）と `MyTeamManager.tsx` には触らない。
- 検索の対象は `team.name` **だけ**。コーチ名・選手名・IDは見ない。
- 照合の規則は「前後の空白を落とす・英字の大文字小文字を区別しない・部分一致・空の検索語は絞り込みなし」。全角半角やかなカナの同一視は**しない**。
- 一覧の**並び順は変えない**（`loadOpponents()` が返す登録順のまま）。
- 検索語は localStorage に保存しない。画面を離れたら消えてよい。
- コメントは日本語。既存ファイルの書きぶり（なぜそうしたかを書く）に合わせる。
- `team.name` は文字列であることが保証されている。`repairSavedTeams.ts:47` が読み込み時に `String(...)` へ矯正しているため、`teamFilter` 側で `?? ''` や `String()` を重ねない（矯正は読み込みの1か所、という既存の約束）。
- テスト実行は `npx vitest run <ファイル>`。全体は `npm test`。
- コミットメッセージは Conventional Commits＋日本語の要約。末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を付ける。

## File Structure

| ファイル | 役割 |
|---|---|
| `src/utils/matchesQuery.ts`（新規） | 照合の規則そのもの。文字列1本と検索語を受けて真偽を返すだけ |
| `src/utils/matchesQuery.test.ts`（新規） | 上の規則の検査 |
| `src/components/History/historyFilter.ts`（変更） | 自前の `trim().toLowerCase().includes()` をやめ、`matchesQuery` を呼ぶ |
| `src/components/OpponentManager/teamFilter.ts`（新規） | チーム一覧を名前で絞る純粋関数 |
| `src/components/OpponentManager/teamFilter.test.ts`（新規） | 上の検査 |
| `src/components/OpponentManager/OpponentManager.tsx`（変更） | state・`useMemo`・操作子・空表示の出し分け |
| `src/components/OpponentManager/OpponentManager.css`（変更） | 操作子の見た目（`History.css` の対応部分に揃える） |
| `src/components/OpponentManager/OpponentManager.test.tsx`（変更） | 画面の検査を追記 |

---

### Task 1: 照合の規則を1か所に置き、履歴検索をそこへ寄せる

**Files:**
- Create: `src/utils/matchesQuery.ts`
- Create: `src/utils/matchesQuery.test.ts`
- Modify: `src/components/History/historyFilter.ts:17-36`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces: `matchesQuery(haystack: string, query: string): boolean` — Task 2 の `teamFilter.ts` が呼ぶ

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/matchesQuery.test.ts` を新規作成する。

```ts
import { describe, it, expect } from 'vitest';
import { matchesQuery } from './matchesQuery';

// 試合履歴の検索と対戦チーム管理の検索は「同じ振る舞い」と決めてある。
// 規則をここ1か所に置き、両方がこれを呼ぶ（別々に書くと片方だけ直したときに
// 静かにずれ、利用者には「同じ言葉で引いたのに片方だけ出ない」形で見える）。

describe('matchesQuery', () => {
    it('部分一致で引ける（前方一致ではない）', () => {
        expect(matchesQuery('西陵ミニバスケットボールクラブ', 'ミニバス')).toBe(true);
    });

    it('英字の大文字小文字を区別しない', () => {
        expect(matchesQuery('MBC Jr', 'mbc')).toBe(true);
        expect(matchesQuery('mbc jr', 'MBC')).toBe(true);
    });

    it('検索語の前後の空白は落とす', () => {
        expect(matchesQuery('西陵ミニバス', '  西陵  ')).toBe(true);
    });

    it('空の検索語は常に true（絞り込みなし）', () => {
        expect(matchesQuery('西陵ミニバス', '')).toBe(true);
        expect(matchesQuery('西陵ミニバス', '   ')).toBe(true);
        expect(matchesQuery('', '')).toBe(true);
    });

    it('対象が空文字なら、検索語があるとき false', () => {
        expect(matchesQuery('', '西陵')).toBe(false);
    });

    it('含まれない語では false', () => {
        expect(matchesQuery('西陵ミニバス', '東陵')).toBe(false);
    });

    it('全角と半角は同一視しない（履歴の検索と揃えるため）', () => {
        // 入れるなら両方の画面に同時に入れる話。片方だけ賢くするとずれる
        expect(matchesQuery('ＭＢＣ', 'MBC')).toBe(false);
    });
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/utils/matchesQuery.test.ts`
Expected: FAIL（`Failed to resolve import "./matchesQuery"`）

- [ ] **Step 3: 実装する**

`src/utils/matchesQuery.ts` を新規作成する。

```ts
// 文字列の絞り込みで使う照合の規則。
//
// 試合履歴の検索（historyFilter.ts）と対戦チーム管理の検索（teamFilter.ts）は
// 「同じ振る舞い」と決めてある。それぞれが trim().toLowerCase().includes() を
// 書くと、片方だけ直したときに静かにずれる。利用者からは「同じ言葉で引いたのに
// 片方だけ出ない」という形で見えるので、規則はここ1か所に置く。
//
// 全角半角・かなカナの同一視はしない。入れるなら両方の画面に同時に入れる話で、
// 片方だけ賢くすると上と同じずれになる。

/**
 * haystack が query を含むか。
 *
 * - 検索語の前後の空白は落とす
 * - 英字の大文字小文字は区別しない
 * - 部分一致（前方一致ではない）
 * - 空の検索語は常に true（＝絞り込みなし）
 */
export function matchesQuery(haystack: string, query: string): boolean {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return haystack.toLowerCase().includes(needle);
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/utils/matchesQuery.test.ts`
Expected: PASS（7件）

- [ ] **Step 5: 履歴検索をこの規則へ寄せる**

`src/components/History/historyFilter.ts` を変更する。`import` を1行足し、`searchableText` から `.toLowerCase()` を外し（大文字小文字の扱いは `matchesQuery` が持つ）、絞り込みを置き換える。

変更前（17-36行目あたり）:

```ts
/** 1件を検索対象の文字列にまとめる */
function searchableText(record: GameRecord): string {
    return [
        record.gameName,
        record.teamA?.name,
        record.teamB?.name,
        // 「2026-06」で6月の試合を探せるように、暦日も対象に含める
        recordInputDate(record.date),
    ].filter(Boolean).join(' ').toLowerCase();
}

/** 絞り込んで並べ替えた新しい配列を返す（元の配列は変えない） */
export function filterAndSortRecords(
    records: GameRecord[],
    { query, order }: HistoryFilter,
): GameRecord[] {
    const needle = query.trim().toLowerCase();
    const filtered = needle
        ? records.filter(record => searchableText(record).includes(needle))
        : [...records];
```

変更後:

```ts
/** 1件を検索対象の文字列にまとめる */
function searchableText(record: GameRecord): string {
    return [
        record.gameName,
        record.teamA?.name,
        record.teamB?.name,
        // 「2026-06」で6月の試合を探せるように、暦日も対象に含める
        recordInputDate(record.date),
    ].filter(Boolean).join(' ');
}

/** 絞り込んで並べ替えた新しい配列を返す（元の配列は変えない） */
export function filterAndSortRecords(
    records: GameRecord[],
    { query, order }: HistoryFilter,
): GameRecord[] {
    // 照合の規則は matchesQuery が持つ（対戦チーム管理の検索と揃えるため）。
    // 空の検索語は matchesQuery が常に true を返すので、ここで分岐は要らない
    const filtered = records.filter(record => matchesQuery(searchableText(record), query));
```

あわせて、ファイル冒頭の import に次の1行を足す。

```ts
import { matchesQuery } from '../../utils/matchesQuery';
```

- [ ] **Step 6: 履歴の既存テストが通ることを確かめる（移行の検査）**

Run: `npx vitest run src/components/History/historyFilter.test.ts src/components/History/History.test.tsx`
Expected: PASS（既存の検査がそのまま通る＝振る舞いが変わっていない）

- [ ] **Step 7: コミット**

```bash
git add src/utils/matchesQuery.ts src/utils/matchesQuery.test.ts src/components/History/historyFilter.ts
git commit -m "refactor(search): 検索の照合の規則を1か所に置く

対戦チーム管理にも同じ検索を足すにあたって、trim().toLowerCase().includes()
を2か所に書くと片方だけ直したときに静かにずれる。規則を matchesQuery に
出し、履歴の検索もそれを呼ぶ形にした。振る舞いは変えていない（既存の
historyFilter.test.ts がそのまま通ることで確かめている）。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: チーム一覧を名前で絞る純粋関数

**Files:**
- Create: `src/components/OpponentManager/teamFilter.ts`
- Create: `src/components/OpponentManager/teamFilter.test.ts`

**Interfaces:**
- Consumes: `matchesQuery(haystack: string, query: string): boolean`（Task 1）
- Produces: `filterTeamsByName(teams: SavedTeam[], query: string): SavedTeam[]` — Task 3 の `OpponentManager.tsx` が呼ぶ

- [ ] **Step 1: 失敗するテストを書く**

`src/components/OpponentManager/teamFilter.test.ts` を新規作成する。

```ts
import { describe, it, expect } from 'vitest';
import { filterTeamsByName } from './teamFilter';
import type { SavedTeam } from '../../utils/teamStorage';

// 対戦チーム管理は全件を登録順に並べるだけで、探す手段が無かった。
// 編集も削除もこの一覧からしか辿れないので、探せないことが操作できない
// ことになる。引くのはチーム名だけ（コーチ名や選手名では引かない）。

function team(name: string, overrides: Partial<SavedTeam> = {}): SavedTeam {
    return {
        id: `opp-${name}`,
        name,
        coachName: '佐々木',
        assistantCoachName: '',
        players: [{ number: 4, name: '田中', isCaptain: false }],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

const teams = [
    team('西陵ミニバス'),
    team('東陵ミニバスケットボールクラブ'),
    team('MBC Jr'),
];

const namesOf = (list: SavedTeam[]) => list.map(t => t.name);

describe('filterTeamsByName', () => {
    it('名前の一部で絞れる', () => {
        expect(namesOf(filterTeamsByName(teams, '西陵'))).toEqual(['西陵ミニバス']);
    });

    it('複数が引っかかればすべて返す', () => {
        expect(namesOf(filterTeamsByName(teams, 'ミニバス')))
            .toEqual(['西陵ミニバス', '東陵ミニバスケットボールクラブ']);
    });

    it('英字の大文字小文字を区別しない', () => {
        expect(namesOf(filterTeamsByName(teams, 'mbc'))).toEqual(['MBC Jr']);
    });

    it('空の検索語では全件返る', () => {
        expect(namesOf(filterTeamsByName(teams, ''))).toEqual(namesOf(teams));
        expect(namesOf(filterTeamsByName(teams, '  '))).toEqual(namesOf(teams));
    });

    it('コーチ名では引けない（対象は名前だけ）', () => {
        expect(filterTeamsByName(teams, '佐々木')).toEqual([]);
    });

    it('選手名では引けない（対象は名前だけ）', () => {
        expect(filterTeamsByName(teams, '田中')).toEqual([]);
    });

    it('名前が空のチームは、検索語があると外れる', () => {
        const withUnnamed = [...teams, team('')];
        expect(namesOf(filterTeamsByName(withUnnamed, '西陵'))).toEqual(['西陵ミニバス']);
    });

    it('名前が空のチームも、検索語が無ければ残る', () => {
        const withUnnamed = [...teams, team('')];
        expect(filterTeamsByName(withUnnamed, '')).toHaveLength(4);
    });

    it('元の配列を変えない', () => {
        const input = [...teams];
        filterTeamsByName(input, '西陵');
        expect(namesOf(input)).toEqual(namesOf(teams));
    });

    it('並び順は入力のまま（並べ替えない）', () => {
        // 登録順という現行の規則を保つ。今回入れるのは探す手段であって
        // 並べ直す手段ではない
        expect(namesOf(filterTeamsByName(teams, 'ミニバス')))
            .toEqual(['西陵ミニバス', '東陵ミニバスケットボールクラブ']);
    });
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/components/OpponentManager/teamFilter.test.ts`
Expected: FAIL（`Failed to resolve import "./teamFilter"`）

- [ ] **Step 3: 実装する**

`src/components/OpponentManager/teamFilter.ts` を新規作成する。

```ts
// 対戦チーム一覧の絞り込み。
//
// 一覧は登録順に全件を並べるだけで、探す手段が無かった（teamStorage の
// saveOpponent は末尾に push するだけなので、後から足したチームほど下に
// 積み上がる）。編集も削除もこの一覧からしか辿れないため、探せないことが
// そのまま操作できないことになる。
//
// 引くのはチーム名だけにする。コーチ名や選手名まで拾うと、名前で引いた
// つもりの結果に理由の分からない1件が混ざる。
//
// team.name が文字列であることは読み込み側が保証している
// （repairSavedTeams が String(...) へ矯正する）ので、ここでは重ねない。

import type { SavedTeam } from '../../utils/teamStorage';
import { matchesQuery } from '../../utils/matchesQuery';

/**
 * 名前で絞った新しい配列を返す（元の配列は変えない）。
 *
 * 並べ替えはしない——登録順という現行の規則を保つ。
 * 空の検索語では全件返る（matchesQuery が常に true を返す）。
 */
export function filterTeamsByName(teams: SavedTeam[], query: string): SavedTeam[] {
    return teams.filter(team => matchesQuery(team.name, query));
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/components/OpponentManager/teamFilter.test.ts`
Expected: PASS（10件）

- [ ] **Step 5: コミット**

```bash
git add src/components/OpponentManager/teamFilter.ts src/components/OpponentManager/teamFilter.test.ts
git commit -m "feat(opponent): チーム一覧を名前で絞る関数を置く

画面に足す前に、判定だけを純粋関数として切り出す（historyFilter.ts と
同じ形）。OpponentManager.tsx は既に866行あり、ここへロジックを混ぜると
検査も画面越しになる。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 一覧画面に検索窓を出す

**Files:**
- Modify: `src/components/OpponentManager/OpponentManager.tsx:1`（import）, `:40`（state）, `:811-818`（空表示と一覧）
- Modify: `src/components/OpponentManager/OpponentManager.css`（末尾に追記）
- Test: `src/components/OpponentManager/OpponentManager.test.tsx`（末尾に追記）

**Interfaces:**
- Consumes: `filterTeamsByName(teams: SavedTeam[], query: string): SavedTeam[]`（Task 2）
- Produces: なし（最終タスク）

- [ ] **Step 1: 失敗するテストを書く**

`src/components/OpponentManager/OpponentManager.test.tsx` の末尾に次を追記する。ファイル先頭にある `team()` / `seed()` ヘルパーをそのまま使う。

```tsx
describe('OpponentManager: 名前で探す', () => {
    const seedThree = () => seed([
        team({ id: 'opp-1', name: '西陵ミニバス' }),
        team({ id: 'opp-2', name: '東陵ミニバスケットボールクラブ' }),
        team({ id: 'opp-3', name: 'MBC Jr' }),
    ]);

    const searchBox = () => screen.getByLabelText('検索：');

    it('入力すると名前で絞られる', () => {
        seedThree();
        render(<OpponentManager onBack={vi.fn()} />);

        fireEvent.change(searchBox(), { target: { value: '西陵' } });

        expect(screen.getByText('西陵ミニバス')).toBeTruthy();
        expect(screen.queryByText('東陵ミニバスケットボールクラブ')).toBeNull();
        expect(screen.queryByText('MBC Jr')).toBeNull();
    });

    it('✕ を押すと全件に戻る', () => {
        seedThree();
        render(<OpponentManager onBack={vi.fn()} />);
        fireEvent.change(searchBox(), { target: { value: '西陵' } });

        fireEvent.click(screen.getByRole('button', { name: '検索条件を消す' }));

        expect(screen.getByText('東陵ミニバスケットボールクラブ')).toBeTruthy();
        expect(screen.getByText('MBC Jr')).toBeTruthy();
    });

    it('件数を「n / m件」で示す', () => {
        seedThree();
        render(<OpponentManager onBack={vi.fn()} />);
        expect(screen.getByText('3 / 3件')).toBeTruthy();

        fireEvent.change(searchBox(), { target: { value: 'ミニバス' } });

        expect(screen.getByText('2 / 3件')).toBeTruthy();
    });

    it('検索で0件になったときは、登録が無いときと違う文面を出す', () => {
        // 「そもそも登録が無い」と「検索で消えた」を同じ文面にすると、
        // 事実と違う案内になる
        seedThree();
        render(<OpponentManager onBack={vi.fn()} />);

        fireEvent.change(searchBox(), { target: { value: '該当なし' } });

        expect(screen.getByText('「該当なし」に一致するチームはありません')).toBeTruthy();
        expect(screen.queryByText('登録された対戦チームはありません')).toBeNull();
    });

    it('0件になっても検索窓と ✕ は消えない', () => {
        // 条件を変える手段が消えると、その条件から抜け出せなくなる
        seedThree();
        render(<OpponentManager onBack={vi.fn()} />);

        fireEvent.change(searchBox(), { target: { value: '該当なし' } });

        expect(searchBox()).toBeTruthy();
        expect(screen.getByRole('button', { name: '検索条件を消す' })).toBeTruthy();
    });

    it('登録が1件も無いときは検索窓を出さない', () => {
        seed([]);
        render(<OpponentManager onBack={vi.fn()} />);

        expect(screen.queryByLabelText('検索：')).toBeNull();
        expect(screen.getByText('登録された対戦チームはありません')).toBeTruthy();
    });

    it('検索窓にもラベルが結び付いている', () => {
        // 読み上げで何の入力欄か分かり、ラベルのタップでフォーカスが移る
        seedThree();
        render(<OpponentManager onBack={vi.fn()} />);

        expect(findUnlabeledFields()).toEqual([]);
    });
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/components/OpponentManager/OpponentManager.test.tsx`
Expected: FAIL（新しい7件が `Unable to find a label with the text of: 検索：` 等で落ちる。既存の検査は通ったまま）

- [ ] **Step 3: 画面に state と絞り込みを足す**

`src/components/OpponentManager/OpponentManager.tsx` の1行目を変える。

```ts
import { useState, useRef, useMemo } from 'react';
```

`./OpponentManager.css` の import の直前（他のローカル import と並ぶ位置）に次を足す。

```ts
import { filterTeamsByName } from './teamFilter';
```

`const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);` の直後に次を足す。

```ts
    // 一覧をチーム名で絞る。画面を離れたら消えてよいので保存はしない。
    // 削除や再読み込みで teams が変わっても query は保つ（絞り込んだまま
    // 続けて消せるように）
    const [query, setQuery] = useState('');
    const visibleTeams = useMemo(() => filterTeamsByName(teams, query), [teams, query]);
```

- [ ] **Step 4: 操作子と空表示を書く**

同ファイルの一覧画面（`// 一覧画面` のコメント以降）で、`{teams.length === 0 ? (` から始まるブロックを次のように置き換える。

変更前:

```tsx
            {teams.length === 0 ? (
                <div className="empty-state">
                    <p>登録された対戦チームはありません</p>
                </div>
            ) : (
                <div className="teams-list">
                    {teams.map(team => (
```

変更後:

```tsx
            {/*
              絞り込みの操作子は結果が0件でも描画する。
              条件を変える手段が消えると、その条件から抜け出せなくなる
              （試合履歴の検索と同じ理由・同じ形）
            */}
            {teams.length > 0 && (
                <div className="opponent-controls">
                    <div className="opponent-search">
                        <label className="opponent-field-label" htmlFor="opponent-search-input">検索：</label>
                        <input
                            id="opponent-search-input"
                            type="search"
                            className="input"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="チーム名"
                        />
                        {query && (
                            <button
                                className="btn-reset"
                                onClick={() => setQuery('')}
                                aria-label="検索条件を消す"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                    <span className="opponent-count">{visibleTeams.length} / {teams.length}件</span>
                </div>
            )}

            {teams.length === 0 ? (
                <div className="empty-state">
                    <p>登録された対戦チームはありません</p>
                </div>
            ) : visibleTeams.length === 0 ? (
                // 「登録がない」と「検索で消えた」を混同しない
                <div className="empty-state">
                    <p>「{query}」に一致するチームはありません</p>
                </div>
            ) : (
                <div className="teams-list">
                    {visibleTeams.map(team => (
```

`teams.map` を `visibleTeams.map` に変えるのはこの1か所だけ。閉じ括弧の構造は変えない。

- [ ] **Step 5: 見た目を足す**

`src/components/OpponentManager/OpponentManager.css` の末尾（`@keyframes fadeIn` の**前**）に次を足す。`History.css` の対応部分と同じ寸法・同じトークンにするが、クラス名は画面ごとに分ける（片方の画面の都合でもう片方が崩れないように）。

```css
/* 名前での絞り込み。カード一覧と同じ幅に揃える */
.opponent-manager-container .opponent-controls {
    max-width: 500px;
    margin: 0 auto var(--spacing-md);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-sm) var(--spacing-md);
}

.opponent-manager-container .opponent-search {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    flex: 1 1 220px;
}

.opponent-manager-container .opponent-field-label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    white-space: nowrap;
}

.opponent-manager-container .opponent-search .input {
    flex: 1;
    min-width: 0;
}

/* 検索欄の✕。試合履歴・選手スタッツ分析と同じ見た目に揃える */
.opponent-manager-container .btn-reset {
    width: var(--touch-target);
    height: var(--touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: var(--bg-tertiary);
    border: none;
    border-radius: 50%;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.8rem;
}

.opponent-manager-container .opponent-count {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    white-space: nowrap;
}
```

- [ ] **Step 6: 通ることを確かめる**

Run: `npx vitest run src/components/OpponentManager/OpponentManager.test.tsx`
Expected: PASS（新しい7件を含め、このファイルの検査がすべて通る）

- [ ] **Step 7: 全体が壊れていないことを確かめる**

Run: `npm run lint && npm run typecheck:test && npm test`
Expected: lint 0件 / 型エラー0件 / 全テスト PASS（追加分だけ件数が増える）

- [ ] **Step 8: 本番ビルドが通ることを確かめる**

Run: `npm run build`
Expected: `✓ built in ...` と `PWA v1.3.0 ... precache 15 entries` が出て終了コード0

- [ ] **Step 9: コミット**

```bash
git add src/components/OpponentManager/OpponentManager.tsx src/components/OpponentManager/OpponentManager.css src/components/OpponentManager/OpponentManager.test.tsx
git commit -m "feat(opponent): 対戦チームを名前で探せるようにする

登録が増えるほど後から足したチームが下に積み上がり、目で探すしかなかった。
編集も削除もこの一覧からしか辿れないので、探せないことがそのまま操作でき
ないことになっていた。

操作子は試合履歴の検索と同じ形にする（検索窓・✕・n / m件）。0件になっても
消さないのは、条件を変える手段が消えるとその条件から抜け出せなくなるため。
空表示は「登録が無い」と「検索で消えた」で文面を分ける。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review（記入済み）

**1. 仕様の網羅**

| 設計書の項目 | 対応 |
|---|---|
| 対象は対戦チーム管理の一覧だけ | Task 3（`OpponentSelect` / `MyTeamManager` に触れるステップは無い） |
| チーム名だけを対象 | Task 2 Step 1 の「コーチ名では引けない」「選手名では引けない」 |
| 履歴と同じ照合規則 | Task 1（`matchesQuery`）＋ Task 1 Step 5 で履歴側を寄せる |
| 全角半角・かなカナは同一視しない | Task 1 Step 1 の最後の検査 |
| 並び順は変えない | Task 2 Step 1 の「並び順は入力のまま」 |
| 名前未設定のチームの扱い | Task 2 Step 1 の2件 |
| 操作子は0件でも消さない | Task 3 Step 1 の「0件になっても検索窓と ✕ は消えない」 |
| 空表示を2種類に分ける | Task 3 Step 1 の「登録が無いときと違う文面」 |
| `n / m件` | Task 3 Step 1 の件数の検査 |
| ラベルと入力の結び付け | Task 3 Step 1 の `findUnlabeledFields`（既存の a11y 検査は編集画面だけを見ていたので、一覧画面ぶんを足す） |
| 検索語を保存しない | Task 3 Step 3（`useState` のみ。localStorage を触るステップは無い） |

**2. placeholder 走査** — 「TBD」「あとで」「適宜」「上記のテストを書く」の類は無し。コードを変える全ステップに実物のコードを載せた。

**3. 型の一貫性** — `matchesQuery(haystack: string, query: string): boolean` は Task 1 で定義し Task 2 で同じ名前・同じ引数順で呼ぶ。`filterTeamsByName(teams: SavedTeam[], query: string): SavedTeam[]` は Task 2 で定義し Task 3 で同じ形で呼ぶ。CSS のクラス名（`opponent-controls` / `opponent-search` / `opponent-field-label` / `opponent-count` / `btn-reset`）は Step 4 の JSX と Step 5 の CSS で一致。テストが引く文字列（`検索：` / `検索条件を消す` / `3 / 3件`）も JSX と一致。
