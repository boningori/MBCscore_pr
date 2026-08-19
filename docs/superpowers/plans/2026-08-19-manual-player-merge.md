# 割れた選手カードの手動統合 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 選手スタッツ分析で、氏名の表記ゆれ等により2枚以上に割れた選手カードを、利用者が統合・解除できるようにする。

**Architecture:** 統合は「集計時の名寄せ」。`localStorage` にチームごとの対応表（記録上のキー → 代表キー）を持ち、`aggregatePlayerStats` のキー決定の**最後の上書き**として適用する。`GameRecord` は一切書き換えない。対応表は深さ1に保つ（連鎖・循環を作らない）。

**Tech Stack:** TypeScript / React 19 / Vitest + @testing-library/react / localStorage（`createJsonStorage` 経由）

設計仕様: `docs/superpowers/specs/2026-08-19-manual-player-merge-design.md`

## Global Constraints

- 試合記録（`GameRecord`）は読み取り専用。統合機能は一切書き換えない
- 統合は**マイチームごと**。チームをまたがない
- 候補の検知は**提案のみ**。確認なしに統合しない
- 候補の検知に**背番号の一致は使わない**（下級生の番号引き継ぎで毎年誤検知が出るため）
- 統合したときに名簿の訂正を促さない
- コメントは既存ファイルと同じく日本語。「なぜそうしたか」を書く（何をしているかはコードが示す）
- ストレージキーは `minibasket-merged-players`
- 各タスクの最後に `npm run lint` と `npx tsc -b` が通ること

---

### Task 1: 対応表モジュール（保存・解決・統合・解除）

**Files:**
- Create: `src/utils/mergedPlayers.ts`
- Test: `src/utils/mergedPlayers.test.ts`

**Interfaces:**
- Consumes: `createJsonStorage` from `src/utils/createStorage.ts`
- Produces:
  ```ts
  export type MergeMap = Record<string, string>;
  export type AllMergedPlayers = Record<string, MergeMap>;
  export interface MergeChoice { playerKey: string; name: string; latestDate: string; }

  export function normalizeNameForMerge(name: string): string;
  export function loadAllMergedPlayers(): AllMergedPlayers;
  export function loadMergedPlayers(teamId: string): MergeMap;
  export function saveMergedPlayers(teamId: string, map: MergeMap): void;
  export function resolveMergedKey(map: MergeMap, key: string): string;
  export function mergeKeys(map: MergeMap, keys: readonly string[], canonical: string): MergeMap;
  export function unmergeKey(map: MergeMap, canonical: string): MergeMap;
  export function mergedCanonicalKeys(map: MergeMap): Set<string>;
  export function chooseCanonicalKey(cards: readonly MergeChoice[], rosterNames: readonly string[]): string;
  export function carryOverHidden(hidden: readonly string[], mergedKeys: readonly string[], canonical: string): string[];
  ```

- [ ] **Step 1: 失敗するテストを書く**

Create `src/utils/mergedPlayers.test.ts`:

```ts
// 割れた選手カードの手動統合の対応表。
//
// 統合は集計時の名寄せで、試合記録は書き換えない。だから解除は対応表から
// 項目を消すだけで済み、間違えて統合しても記録は無傷のまま戻せる。
//
// 保存する対応表は深さ1に保つ。A→B と B→C が同時にあると解決が連鎖し、
// 循環も作れてしまうため。

import { describe, it, expect, beforeEach } from 'vitest';
import {
    normalizeNameForMerge,
    loadMergedPlayers,
    saveMergedPlayers,
    resolveMergedKey,
    mergeKeys,
    unmergeKey,
    mergedCanonicalKeys,
    chooseCanonicalKey,
    carryOverHidden,
} from './mergedPlayers';

beforeEach(() => localStorage.clear());

describe('normalizeNameForMerge', () => {
    it('半角・全角の空白を取り除く', () => {
        expect(normalizeNameForMerge('佐藤 太郎')).toBe('佐藤太郎');
        expect(normalizeNameForMerge('佐藤　太郎')).toBe('佐藤太郎');
        expect(normalizeNameForMerge('佐藤太郎')).toBe('佐藤太郎');
    });

    it('空白以外は変えない（別人を混ぜないため正規化は最小限にする）', () => {
        expect(normalizeNameForMerge('齋藤 太郎')).toBe('齋藤太郎');
        expect(normalizeNameForMerge('斉藤 太郎')).toBe('斉藤太郎');
    });
});

describe('resolveMergedKey', () => {
    it('対応表にあれば代表キーを返す', () => {
        expect(resolveMergedKey({ '佐藤　太郎': '佐藤 太郎' }, '佐藤　太郎')).toBe('佐藤 太郎');
    });

    it('対応表に無ければ元のキーを返す', () => {
        expect(resolveMergedKey({}, '佐藤 太郎')).toBe('佐藤 太郎');
    });

    it('自分自身を指す項目は無視する', () => {
        expect(resolveMergedKey({ 'A': 'A' }, 'A')).toBe('A');
    });
});

describe('mergeKeys', () => {
    it('まとめたキーが代表を指す（代表自身は書かない）', () => {
        const map = mergeKeys({}, ['佐藤　太郎', '佐藤 太郎'], '佐藤 太郎');
        expect(map).toEqual({ '佐藤　太郎': '佐藤 太郎' });
    });

    // A→B のあとに B を C へまとめると、A→C まで張り替えないと連鎖ができる
    it('代表が既に別の代表へ寄っていれば終端を代表にする', () => {
        const first = mergeKeys({}, ['A', 'B'], 'B');
        const second = mergeKeys(first, ['B', 'C'], 'C');
        expect(second).toEqual({ A: 'C', B: 'C' });
        expect(resolveMergedKey(second, 'A')).toBe('C');
    });

    it('既存項目のうち今回まとめるキーを指すものを新しい代表へ張り替える', () => {
        const first = mergeKeys({}, ['A', 'B'], 'B');
        const second = mergeKeys(first, ['B', 'C'], 'B');
        expect(second).toEqual({ A: 'B', C: 'B' });
    });

    it('元の対応表は書き換えない', () => {
        const original = { A: 'B' };
        mergeKeys(original, ['C', 'B'], 'B');
        expect(original).toEqual({ A: 'B' });
    });

    it('2つ未満なら何もしない', () => {
        expect(mergeKeys({}, ['A'], 'A')).toEqual({});
    });
});

describe('unmergeKey', () => {
    it('その代表を指す項目だけを消す', () => {
        const map = { A: 'B', C: 'B', D: 'E' };
        expect(unmergeKey(map, 'B')).toEqual({ D: 'E' });
    });

    it('該当が無ければそのまま', () => {
        expect(unmergeKey({ A: 'B' }, 'Z')).toEqual({ A: 'B' });
    });
});

describe('mergedCanonicalKeys', () => {
    it('まとめ先になっているキーを返す', () => {
        expect([...mergedCanonicalKeys({ A: 'B', C: 'B', D: 'E' })].sort()).toEqual(['B', 'E']);
    });
});

// 代表の選び方は3段。カードに出る氏名は名簿どおりであってほしいので、
// 表記まで一致するものを最優先する。空白の有無だけが違うカードは、
// 名簿と無関係な表記（コートネーム等）より優先する。
describe('chooseCanonicalKey', () => {
    const card = (playerKey: string, name: string, latestDate: string) => ({ playerKey, name, latestDate });

    it('名簿と表記まで同じカードを代表にする（記録が古くても）', () => {
        const chosen = chooseCanonicalKey(
            [card('佐藤　太郎', '佐藤　太郎', '2026-07-01'), card('佐藤 太郎', '佐藤 太郎', '2026-04-01')],
            ['佐藤 太郎'],
        );
        expect(chosen).toBe('佐藤 太郎');
    });

    it('表記まで一致するものが無ければ、空白を無視して名簿に一致するカード', () => {
        const chosen = chooseCanonicalKey(
            [card('タロウ', 'タロウ', '2026-07-01'), card('佐藤　太郎', '佐藤　太郎', '2026-04-01')],
            ['佐藤 太郎'],
        );
        expect(chosen).toBe('佐藤　太郎');
    });

    // ライセンスNo.の打ち間違いで割れた場合、氏名はどちらも名簿どおり
    it('優先度が同じなら、記録がいちばん新しいほう', () => {
        const chosen = chooseCanonicalKey(
            [card('佐藤 太郎_123', '佐藤 太郎', '2026-04-01'), card('佐藤 太郎_456', '佐藤 太郎', '2026-07-01')],
            ['佐藤 太郎'],
        );
        expect(chosen).toBe('佐藤 太郎_456');
    });

    it('どれも名簿に無ければ、記録がいちばん新しいほう', () => {
        const chosen = chooseCanonicalKey(
            [card('A', '田中', '2026-04-01'), card('B', '鈴木', '2026-07-01')],
            ['佐藤 太郎'],
        );
        expect(chosen).toBe('B');
    });

    it('カードが無ければ空文字（呼び出し側が統合を実行しない）', () => {
        expect(chooseCanonicalKey([], ['佐藤 太郎'])).toBe('');
    });
});

describe('carryOverHidden', () => {
    // 統合するとキーが変わる。引き継がないと、非表示にしていた選手が
    // 統合した瞬間に一覧へ復活したように見える
    it('まとめる組のどれかが非表示なら代表を非表示にする', () => {
        expect(carryOverHidden(['A'], ['A', 'B'], 'B').sort()).toEqual(['B']);
    });

    it('元のキーの設定は消す', () => {
        expect(carryOverHidden(['A', 'B'], ['A', 'B'], 'B')).toEqual(['B']);
    });

    it('どれも非表示でなければ何も足さない', () => {
        expect(carryOverHidden(['Z'], ['A', 'B'], 'B')).toEqual(['Z']);
    });

    it('無関係な非表示設定は残す', () => {
        expect(carryOverHidden(['Z', 'A'], ['A', 'B'], 'B').sort()).toEqual(['B', 'Z']);
    });
});

describe('保存と読み込み', () => {
    it('チームごとに保存して読み戻せる', () => {
        saveMergedPlayers('t1', { A: 'B' });
        saveMergedPlayers('t2', { C: 'D' });
        expect(loadMergedPlayers('t1')).toEqual({ A: 'B' });
        expect(loadMergedPlayers('t2')).toEqual({ C: 'D' });
    });

    it('未設定のチームは空', () => {
        expect(loadMergedPlayers('none')).toEqual({});
    });

    // 配列やnullが入っているとチームIDでの索引が壊れる
    it('壊れた形が入っていたら統合なしとして扱う', () => {
        localStorage.setItem('minibasket-merged-players', JSON.stringify([1, 2]));
        expect(loadMergedPlayers('t1')).toEqual({});
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run src/utils/mergedPlayers.test.ts`
Expected: FAIL — `Failed to resolve import "./mergedPlayers"`

- [ ] **Step 3: 実装を書く**

Create `src/utils/mergedPlayers.ts`:

```ts
// 割れた選手カードの手動統合。
//
// 選手の識別キーは氏名＋ライセンスNo.（playerStatsAnalysis の generatePlayerKey）。
// ライセンスNo.の揺れは名簿を手掛かりに自動で吸収しているが、手掛かりが氏名で
// ある以上「氏名が動くケース」は原理的に救えない（全角/半角スペースの混在、
// 誤字の訂正、コートネームで登録していた時期など。実測でいずれも2枚に割れる）。
//
// 自動判定はこれ以上ルールを足すと別人を混ぜる危険のほうが増えるので、
// 「安全側に倒した自動判定 ＋ 人が直せる出口」で完結させる。ここはその出口。
//
// 統合は集計時の名寄せで、試合記録（GameRecord）は一切書き換えない。
// だから解除は対応表から項目を消すだけで済み、間違えても記録は無傷。

import { createJsonStorage } from './createStorage';

/** 記録上のキー → 代表キー */
export type MergeMap = Record<string, string>;
/** チームID → 対応表 */
export type AllMergedPlayers = Record<string, MergeMap>;

/** 代表キーを選ぶのに要る最小限のカード情報 */
export interface MergeChoice {
    playerKey: string;
    name: string;
    /** この選手のいちばん新しい試合日（ISO）。記録が無ければ空文字 */
    latestDate: string;
}

const isMergeMapRecord = (v: unknown): v is AllMergedPlayers =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

// 配列やnullが入っているとチームIDでの索引が壊れるため、素のオブジェクトのみ受ける
// （非表示選手ストレージと同じ判定）
const mergedStorage = createJsonStorage<AllMergedPlayers>(
    'minibasket-merged-players', {}, 'merged players', isMergeMapRecord,
);

/**
 * 氏名の比較用の正規化。空白（半角・全角）だけを取り除く。
 *
 * 正規化を強くするほど別人を同じ氏名と見なす危険が増えるので、実際に混ざる
 * ことが分かっている空白だけに絞る。日本語入力では全角・半角スペースが
 * 日常的に混ざり、名簿を打ち直した年に必ず出る。
 */
export function normalizeNameForMerge(name: string): string {
    // \s は全角スペース(U+3000)も含む（実測）。文字クラスに全角スペースを直接
    // 書くと lint の no-irregular-whitespace に掛かるうえ冗長になる
    return name.replace(/\s/g, '');
}

export function loadAllMergedPlayers(): AllMergedPlayers {
    return mergedStorage.load();
}

export function loadMergedPlayers(teamId: string): MergeMap {
    const all = loadAllMergedPlayers();
    const map = all[teamId];
    // チーム単位の中身まで壊れている場合に備える（手で編集したバックアップ等）
    return isMergeMapRecord(map) ? (map as MergeMap) : {};
}

export function saveMergedPlayers(teamId: string, map: MergeMap): void {
    const all = loadAllMergedPlayers();
    all[teamId] = map;
    mergedStorage.save(all);
}

/**
 * 記録上のキーを代表キーへ解決する。
 *
 * 対応表は深さ1に保っている（mergeKeys）ので参照は1回でよい。
 * 自分自身を指す項目は無視する。
 */
export function resolveMergedKey(map: MergeMap, key: string): string {
    const canonical = map[key];
    if (!canonical || canonical === key) return key;
    return canonical;
}

/**
 * キーの組を1つの代表へまとめた新しい対応表を返す（元の対応表は変えない）。
 *
 * 深さ1に保つため、次の2つを行う:
 *   - 代表が既に別の代表へ寄っていれば、その終端を代表にする
 *   - 既存項目のうち、今回まとめるキーを指しているものを新しい代表へ張り替える
 * これをしないと A→B→C の連鎖ができ、解決が何段になるか決まらなくなる。
 */
export function mergeKeys(map: MergeMap, keys: readonly string[], canonical: string): MergeMap {
    if (keys.length < 2) return { ...map };

    const target = resolveMergedKey(map, canonical);
    const merging = new Set(keys);
    const next: MergeMap = {};

    for (const [source, dest] of Object.entries(map)) {
        if (source === target) continue; // 代表自身への項目は残さない
        // 深さ1を保っているので、代表自身が別へ寄っている場合そこを指す項目は存在しない。
        // したがって「今回まとめるキーを指しているか」だけ見れば足りる
        next[source] = merging.has(dest) ? target : dest;
    }
    for (const key of keys) {
        if (key === target) continue;
        next[key] = target;
    }
    return next;
}

/** 指定した代表へ寄せている項目をすべて外した新しい対応表を返す */
export function unmergeKey(map: MergeMap, canonical: string): MergeMap {
    const next: MergeMap = {};
    for (const [source, dest] of Object.entries(map)) {
        if (dest === canonical) continue;
        next[source] = dest;
    }
    return next;
}

/** まとめ先になっている代表キーの集合（カードに「統合済み」を出すのに使う） */
export function mergedCanonicalKeys(map: MergeMap): Set<string> {
    return new Set(Object.values(map));
}

/**
 * まとめる組のどれを代表にするか決める。
 *
 * 代表の氏名がそのままカードに出るので、名簿どおりの表記になってほしい。
 * 名簿は「いま正しい情報」だから（既存の番号の寄せ方が、ユニフォーム番号を
 * 代表にするのと同じ考え方）。そこで優先度を3段にする:
 *
 *   0. 名簿と表記まで一致する
 *   1. 空白を無視すれば名簿に一致する
 *   2. 名簿に無い（コートネームや誤字）
 *
 * 空白を無視した一致だけで見ると、全角スペースと半角スペースのカードが
 * どちらも名簿に一致してしまい、肝心の「どちらの表記を残すか」を決められない。
 * 同じ優先度どうしは、記録がいちばん新しいカード。
 */
export function chooseCanonicalKey(
    cards: readonly MergeChoice[],
    rosterNames: readonly string[],
): string {
    if (cards.length === 0) return '';

    const exact = new Set(rosterNames);
    const loose = new Set(rosterNames.map(normalizeNameForMerge));
    const rank = (card: MergeChoice): number =>
        exact.has(card.name) ? 0
            : loose.has(normalizeNameForMerge(card.name)) ? 1
                : 2;

    let best = cards[0];
    for (const card of cards) {
        const diff = rank(card) - rank(best);
        if (diff < 0 || (diff === 0 && card.latestDate > best.latestDate)) best = card;
    }
    return best.playerKey;
}

/**
 * 統合にあわせて非表示設定を引き継いだ新しい一覧を返す。
 *
 * 統合するとキーが変わるので、引き継がないと非表示にしていた選手が
 * 統合した瞬間に一覧へ復活したように見える。
 */
export function carryOverHidden(
    hidden: readonly string[],
    mergedKeys: readonly string[],
    canonical: string,
): string[] {
    const merging = new Set(mergedKeys);
    const anyHidden = hidden.some(key => merging.has(key));
    const rest = hidden.filter(key => !merging.has(key));
    if (!anyHidden) return rest;
    return rest.includes(canonical) ? rest : [...rest, canonical];
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/utils/mergedPlayers.test.ts`
Expected: PASS（30件前後）

- [ ] **Step 5: lint と型チェック**

Run: `npm run lint && npx tsc -b`
Expected: どちらも出力なし（成功）

- [ ] **Step 6: コミット**

```bash
git add src/utils/mergedPlayers.ts src/utils/mergedPlayers.test.ts
git commit -m "feat: 選手カードの統合の対応表を追加する"
```

---

### Task 2: 集計への組み込み

**Files:**
- Modify: `src/utils/playerStatsAnalysis.ts`（`aggregatePlayerStats` 内）
- Test: `src/utils/playerStatsAnalysis.merge.test.ts`

**Interfaces:**
- Consumes: `loadMergedPlayers`, `resolveMergedKey` from Task 1
- Produces: `aggregatePlayerStats` の戻り値が統合を反映する（シグネチャは変えない）

- [ ] **Step 1: 失敗するテストを書く**

Create `src/utils/playerStatsAnalysis.merge.test.ts`:

```ts
// 手動で統合したカードが1枚にまとまること。
//
// 自動の名寄せ（buildIdentityAliases）は氏名を手掛かりにするので、氏名そのものが
// 動くケース（全角/半角スペース、誤字の訂正、コートネーム）は救えない。
// そこは利用者が統合して直す。手動が常に自動判定に勝つ。

import { describe, it, expect, beforeEach } from 'vitest';
import { aggregatePlayerStats } from './playerStatsAnalysis';
import { saveMergedPlayers } from './mergedPlayers';
import type { SavedTeam } from './teamStorage';
import { saveGameResult } from './gameHistoryStorage';
import { createTeam, createPlayer } from '../types/game';

const MY_TEAM: SavedTeam = {
    id: 't1', name: 'チーム', coachName: 'C', assistantCoachName: '',
    players: [{ number: 4, uniformNumber: 4, name: '佐藤 太郎', isCaptain: false }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

function recordGame(name: string, number: number, points: number, date: string) {
    const p = createPlayer('p', number, name);
    p.stats = { ...p.stats, points };
    p.quartersPlayed = ['starter', 'starter', false, false];
    const mine = createTeam('teamA', MY_TEAM.name, 'C');
    mine.isMyTeam = true;
    mine.savedTeamId = MY_TEAM.id;
    mine.players = [p];
    const other = createTeam('teamB', '相手', 'C');
    other.players = [createPlayer('b', 9, '相手')];
    saveGameResult('試合', mine, other, [], [], [], new Date(date));
}

beforeEach(() => localStorage.clear());

describe('手動統合の反映', () => {
    it('統合すると1枚になり、通算・試合数・出場Qが合算される', () => {
        recordGame('佐藤　太郎', 4, 10, '2026-04-01'); // 全角スペース
        recordGame('佐藤 太郎', 4, 8, '2026-06-01');
        expect(aggregatePlayerStats(MY_TEAM)).toHaveLength(2);

        saveMergedPlayers(MY_TEAM.id, { '佐藤　太郎': '佐藤 太郎' });
        const result = aggregatePlayerStats(MY_TEAM);

        expect(result).toHaveLength(1);
        expect(result[0].playerKey).toBe('佐藤 太郎');
        expect(result[0].gamesPlayed).toBe(2);
        expect(result[0].totalStats.points).toBe(18);
        expect(result[0].totalQuartersPlayed).toBe(4);
    });

    it('試合別履歴が日付の新しい順に並んだまま合算される', () => {
        recordGame('佐藤　太郎', 4, 10, '2026-04-01');
        recordGame('佐藤 太郎', 4, 8, '2026-06-01');
        saveMergedPlayers(MY_TEAM.id, { '佐藤　太郎': '佐藤 太郎' });

        const dates = aggregatePlayerStats(MY_TEAM)[0].gameHistory.map(g => g.date.slice(0, 10));

        expect(dates).toEqual(['2026-06-01', '2026-04-01']);
    });

    it('代表の氏名と背番号は代表キーの記録のうちいちばん新しいものを使う', () => {
        // 代表キー側の記録のほうが古くても、代表の表記を使う
        recordGame('佐藤 太郎', 4, 10, '2026-04-01');
        recordGame('タロウ', 7, 8, '2026-06-01');
        saveMergedPlayers(MY_TEAM.id, { 'タロウ': '佐藤 太郎' });

        const result = aggregatePlayerStats(MY_TEAM);

        expect(result[0].name).toBe('佐藤 太郎');
        expect(result[0].number).toBe(4);
    });

    it('代表キーの記録が1件も無ければ、組の中でいちばん新しい記録の表記を使う', () => {
        recordGame('タロウ', 7, 8, '2026-06-01');
        saveMergedPlayers(MY_TEAM.id, { 'タロウ': '佐藤 太郎' });

        const result = aggregatePlayerStats(MY_TEAM);

        expect(result).toHaveLength(1);
        expect(result[0].playerKey).toBe('佐藤 太郎');
        expect(result[0].name).toBe('タロウ');
        expect(result[0].number).toBe(7);
    });

    it('期間で絞っても統合は外れない', () => {
        recordGame('佐藤　太郎', 4, 10, '2026-04-01');
        recordGame('佐藤 太郎', 4, 8, '2026-06-01');
        saveMergedPlayers(MY_TEAM.id, { '佐藤　太郎': '佐藤 太郎' });

        const result = aggregatePlayerStats(MY_TEAM, new Date('2026-05-01T00:00:00.000Z'));

        expect(result).toHaveLength(1);
        expect(result[0].gamesPlayed).toBe(1);
    });

    it('統合したキーを非表示にすると一覧から消える', () => {
        recordGame('佐藤　太郎', 4, 10, '2026-04-01');
        recordGame('佐藤 太郎', 4, 8, '2026-06-01');
        saveMergedPlayers(MY_TEAM.id, { '佐藤　太郎': '佐藤 太郎' });
        localStorage.setItem('minibasket-hidden-players', JSON.stringify({ [MY_TEAM.id]: ['佐藤 太郎'] }));

        expect(aggregatePlayerStats(MY_TEAM)).toHaveLength(0);
        expect(aggregatePlayerStats(MY_TEAM, undefined, undefined, { includeHidden: true })).toHaveLength(1);
    });

    it('記録に存在しないキーが対応表に残っていても壊れない', () => {
        recordGame('佐藤 太郎', 4, 8, '2026-06-01');
        saveMergedPlayers(MY_TEAM.id, { '居ない人': '別の居ない人' });

        const result = aggregatePlayerStats(MY_TEAM);

        expect(result.map(r => r.playerKey)).toEqual(['佐藤 太郎']);
    });

    it('別チームの対応表は効かない', () => {
        recordGame('佐藤　太郎', 4, 10, '2026-04-01');
        recordGame('佐藤 太郎', 4, 8, '2026-06-01');
        saveMergedPlayers('別チーム', { '佐藤　太郎': '佐藤 太郎' });

        expect(aggregatePlayerStats(MY_TEAM)).toHaveLength(2);
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run src/utils/playerStatsAnalysis.merge.test.ts`
Expected: FAIL — 1件目が `expected [ …(2) ] to have a length of 1 but got 2`

- [ ] **Step 3: import を足す**

`src/utils/playerStatsAnalysis.ts` の import 群（`import { isDisqualified } from './disqualification';` の直後）へ追加:

```ts
import { loadMergedPlayers, resolveMergedKey } from './mergedPlayers';
```

- [ ] **Step 4: 対応表の読み込みと代表用の追跡を足す**

`aggregatePlayerStats` 内、`const latestNumberTime = new Map<string, number>();`（現在487行付近）の直後へ追加:

```ts
    // 代表キーの記録だけを見る追跡。統合したカードの氏名・背番号は代表キーの
    // 記録から採る（まとめた相手の古い表記が出ないように）
    const latestCanonicalTime = new Map<string, number>();
    // 手動の統合。自動の名寄せの結果をさらに上書きする（詳細は mergedPlayers）
    const mergeMap = loadMergedPlayers(myTeam.id);
```

- [ ] **Step 5: キーの決定に統合を適用する**

`src/utils/playerStatsAnalysis.ts` の現在519行付近を置き換える。

置き換え前:
```ts
        for (const [playerIndex, player] of myTeamData.players.entries()) {
            const key = playerKeys[playerIndex];
```

置き換え後:
```ts
        for (const [playerIndex, player] of myTeamData.players.entries()) {
            // 利用者がカードで見たキー。手動の統合はこのキーに対して張られている
            const builtKey = playerKeys[playerIndex];
            // 手動が常に勝つ。自動判定は名簿からの推論にすぎず、人が「同じ人だ」と
            // 言ったらそれが正しい
            const key = resolveMergedKey(mergeMap, builtKey);
```

- [ ] **Step 6: 代表の氏名・背番号の決定を差し替える**

現在594〜601行付近を置き換える。

置き換え前:
```ts
            // 背番号はいちばん新しい試合のものを使う。
            //
            // 以前は push 済みの gameHistory[0]（＝最初に走査した試合）を基準にして
            // 「基準より新しければ上書き」としていた。基準より新しい試合が複数あると
            // 最大日付ではなく最後に走査したものが勝つ。履歴は保存順に並ぶので、
            // 過去の試合を後から入力すると日付順と食い違い、古い背番号が残っていた。
            const gameTime = new Date(record.date).getTime();
            const latest = latestNumberTime.get(key);
            if (latest === undefined || gameTime > latest) {
                latestNumberTime.set(key, gameTime);
                aggregated.number = player.number;
            }
```

置き換え後:
```ts
            // 氏名・背番号はいちばん新しい試合のものを使う。
            //
            // 以前は push 済みの gameHistory[0]（＝最初に走査した試合）を基準にして
            // 「基準より新しければ上書き」としていた。基準より新しい試合が複数あると
            // 最大日付ではなく最後に走査したものが勝つ。履歴は保存順に並ぶので、
            // 過去の試合を後から入力すると日付順と食い違い、古い背番号が残っていた。
            //
            // 統合したカードでは代表キーの記録を優先する。まとめた相手の表記
            // （全角スペース混じりの氏名やコートネーム）がカードに出ると、
            // どちらへ寄せたのか分からなくなる。代表キーの記録が1件も無い場合
            // （対応表だけが残っている）は、従来どおり組の中で新しいものを使う。
            const gameTime = new Date(record.date).getTime();
            const isCanonicalRecord = builtKey === key;
            const applyIdentity = () => {
                aggregated.number = player.number;
                aggregated.name = player.name;
                aggregated.licenseNo = player.licenseNo;
            };
            if (isCanonicalRecord) {
                const latest = latestCanonicalTime.get(key);
                if (latest === undefined || gameTime > latest) {
                    latestCanonicalTime.set(key, gameTime);
                    applyIdentity();
                }
            } else if (!latestCanonicalTime.has(key)) {
                const latest = latestNumberTime.get(key);
                if (latest === undefined || gameTime > latest) {
                    latestNumberTime.set(key, gameTime);
                    applyIdentity();
                }
            }
```

- [ ] **Step 7: テストが通ることを確認**

Run: `npx vitest run src/utils/playerStatsAnalysis`
Expected: PASS（既存の `playerStatsAnalysis.test.ts` / `.sameName` / `.rename` / `.multiTeam` も含めて全件）

- [ ] **Step 8: lint と型チェック**

Run: `npm run lint && npx tsc -b`
Expected: どちらも出力なし

- [ ] **Step 9: コミット**

```bash
git add src/utils/playerStatsAnalysis.ts src/utils/playerStatsAnalysis.merge.test.ts
git commit -m "feat: 手動で統合した選手を集計でも1人として扱う"
```

---

### Task 3: 候補の検知

**Files:**
- Create: `src/components/PlayerStatsAnalysis/mergeCandidates.ts`
- Test: `src/components/PlayerStatsAnalysis/mergeCandidates.test.ts`

**Interfaces:**
- Consumes: `normalizeNameForMerge` from Task 1、`AggregatedPlayerStats` from `src/utils/playerStatsAnalysis.ts`
- Produces:
  ```ts
  export function findMergeCandidates(
      players: readonly AggregatedPlayerStats[],
      rosterNames: readonly string[],
  ): AggregatedPlayerStats[][];
  ```

- [ ] **Step 1: 失敗するテストを書く**

Create `src/components/PlayerStatsAnalysis/mergeCandidates.test.ts`:

```ts
// 割れていそうなカードの検知。
//
// 割れているカードは利用者が気づかないと直しようがない。とくに
// 「佐藤 太郎」と「佐藤(全角スペース)太郎」（全角スペース）は一覧に並んでも見分けが付かない。
//
// 検知は提案までで、確認なしには統合しない。背番号の一致は条件に使わない
// —— ミニバスは6年生が抜けたあと下級生が番号を引き継ぐので、別人が同じ番号で
// 毎年候補に出てしまう。

import { describe, it, expect } from 'vitest';
import { makeAggregatedPlayer } from '../../test/statsFactories';
import { findMergeCandidates } from './mergeCandidates';

const card = (playerKey: string, name: string, number = 4) =>
    makeAggregatedPlayer({ playerKey, name, number });

describe('findMergeCandidates', () => {
    it('全角・半角スペースの違いだけの氏名を1組として拾う', () => {
        const groups = findMergeCandidates(
            [card('佐藤 太郎', '佐藤 太郎'), card('佐藤　太郎', '佐藤　太郎')],
            ['佐藤 太郎'],
        );

        expect(groups).toHaveLength(1);
        expect(groups[0].map(p => p.playerKey).sort()).toEqual(['佐藤 太郎', '佐藤　太郎']);
    });

    it('スペース無しの表記も同じ組に入る', () => {
        const groups = findMergeCandidates(
            [card('佐藤 太郎', '佐藤 太郎'), card('佐藤太郎', '佐藤太郎')],
            ['佐藤 太郎'],
        );

        expect(groups).toHaveLength(1);
    });

    // 名簿で別々のライセンスNo.を割り当てて区別している2人を
    // 「割れている」と誤って案内しない
    it('名簿に同じ氏名が2人いる組は候補にしない', () => {
        const groups = findMergeCandidates(
            [card('田中 花子_111', '田中 花子'), card('田中 花子_222', '田中 花子')],
            ['田中 花子', '田中 花子'],
        );

        expect(groups).toEqual([]);
    });

    it('1枚しかない氏名は候補にしない', () => {
        expect(findMergeCandidates([card('佐藤 太郎', '佐藤 太郎')], ['佐藤 太郎'])).toEqual([]);
    });

    it('氏名がまったく違う組は拾わない（手動で統合する）', () => {
        const groups = findMergeCandidates(
            [card('タロウ', 'タロウ'), card('佐藤 太郎', '佐藤 太郎')],
            ['佐藤 太郎'],
        );

        expect(groups).toEqual([]);
    });

    it('背番号が同じでも氏名が違えば候補にしない', () => {
        const groups = findMergeCandidates(
            [card('鈴木 一郎', '鈴木 一郎', 4), card('佐藤 太郎', '佐藤 太郎', 4)],
            ['鈴木 一郎', '佐藤 太郎'],
        );

        expect(groups).toEqual([]);
    });

    it('組が複数あればすべて返す', () => {
        const groups = findMergeCandidates(
            [
                card('佐藤 太郎', '佐藤 太郎'), card('佐藤　太郎', '佐藤　太郎'),
                card('鈴木 一郎', '鈴木 一郎'), card('鈴木　一郎', '鈴木　一郎'),
            ],
            ['佐藤 太郎', '鈴木 一郎'],
        );

        expect(groups).toHaveLength(2);
    });

    it('カードが無ければ空', () => {
        expect(findMergeCandidates([], [])).toEqual([]);
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run src/components/PlayerStatsAnalysis/mergeCandidates.test.ts`
Expected: FAIL — `Failed to resolve import "./mergeCandidates"`

- [ ] **Step 3: 実装を書く**

Create `src/components/PlayerStatsAnalysis/mergeCandidates.ts`:

```ts
// 割れていそうな選手カードの検知。
//
// 割れているカードは利用者が気づかないと直しようがない。「佐藤 太郎」と
// 「佐藤(全角スペース)太郎」（全角スペース）は一覧に並んでも見分けが付かないので、
// 気づく手掛かりを一覧の側から出す。
//
// 検知は提案までで、確認なしには統合しない（別人を混ぜると通算・平均・
// 成長グラフがまとめて狂う。自動で寄せてよいのは名簿から一意に決まるときだけ）。

import type { AggregatedPlayerStats } from '../../utils/playerStatsAnalysis';
import { normalizeNameForMerge } from '../../utils/mergedPlayers';

/**
 * 空白の違いだけで割れているカードの組を返す（組が無ければ空配列）。
 *
 * 束ねるのは空白を取り除いた氏名。背番号の一致は使わない —— ミニバスは
 * 6年生が抜けたあと下級生が番号を引き継ぐので、別人が同じ番号で毎年候補に
 * 出てしまい、提案が邪魔になる。
 *
 * @param rosterNames 現在の名簿の氏名。同じ氏名が2人以上いる場合、その氏名は
 *   名簿で意図的に分けている（別々のライセンスNo.を割り当てている等）とみなし、
 *   候補から外す。buildIdentityAliases が寄せない条件と同じ判断。
 */
export function findMergeCandidates(
    players: readonly AggregatedPlayerStats[],
    rosterNames: readonly string[],
): AggregatedPlayerStats[][] {
    const rosterCount = new Map<string, number>();
    for (const name of rosterNames) {
        const key = normalizeNameForMerge(name);
        rosterCount.set(key, (rosterCount.get(key) ?? 0) + 1);
    }

    const groups = new Map<string, AggregatedPlayerStats[]>();
    for (const player of players) {
        const key = normalizeNameForMerge(player.name);
        if (!key) continue;
        const group = groups.get(key) ?? [];
        group.push(player);
        groups.set(key, group);
    }

    const result: AggregatedPlayerStats[][] = [];
    for (const [key, group] of groups) {
        if (group.length < 2) continue;
        if ((rosterCount.get(key) ?? 0) >= 2) continue;
        result.push(group);
    }
    return result;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/components/PlayerStatsAnalysis/mergeCandidates.test.ts`
Expected: PASS（8件）

- [ ] **Step 5: lint と型チェック**

Run: `npm run lint && npx tsc -b`
Expected: どちらも出力なし

- [ ] **Step 6: コミット**

```bash
git add src/components/PlayerStatsAnalysis/mergeCandidates.ts src/components/PlayerStatsAnalysis/mergeCandidates.test.ts
git commit -m "feat: 割れていそうな選手カードを検知する"
```

---

### Task 4: バックアップの往復

**Files:**
- Modify: `src/utils/dataBackup.ts`
- Test: `src/utils/dataBackup.mergedPlayers.test.ts`

**Interfaces:**
- Consumes: `loadAllMergedPlayers` from Task 1
- Produces: `BackupData['data']['mergedPlayers']?: Record<string, Record<string, string>>`

- [ ] **Step 1: 失敗するテストを書く**

Create `src/utils/dataBackup.mergedPlayers.test.ts`:

```ts
// 統合設定は端末のlocalStorageにしかない。バックアップに含めないと、
// 機種変更や復元のたびに割れたカードが戻り、利用者が統合をやり直すことになる。

import { describe, it, expect, beforeEach } from 'vitest';
import { exportAllData, parseImportJSON, executeImport } from './dataBackup';
import { loadMergedPlayers, saveMergedPlayers } from './mergedPlayers';

beforeEach(() => localStorage.clear());

describe('統合設定のバックアップ往復', () => {
    it('エクスポート→全消去→インポートで復元できる', () => {
        saveMergedPlayers('t1', { '佐藤　太郎': '佐藤 太郎' });
        const backup = exportAllData();
        localStorage.clear();

        const parsed = parseImportJSON(JSON.stringify(backup));
        const result = executeImport(parsed);

        expect(result.success).toBe(true);
        expect(loadMergedPlayers('t1')).toEqual({ '佐藤　太郎': '佐藤 太郎' });
    });

    it('端末側の統合設定とバックアップ側がマージされる', () => {
        saveMergedPlayers('t1', { A: 'B' });
        const backup = exportAllData();
        localStorage.clear();
        saveMergedPlayers('t1', { C: 'D' });

        executeImport(parseImportJSON(JSON.stringify(backup)));

        expect(loadMergedPlayers('t1')).toEqual({ A: 'B', C: 'D' });
    });

    it('統合設定を持たない旧バックアップを取り込んでも壊れない', () => {
        const backup = exportAllData();
        delete backup.data.mergedPlayers;
        localStorage.clear();

        const result = executeImport(parseImportJSON(JSON.stringify(backup)));

        expect(result.success).toBe(true);
        expect(loadMergedPlayers('t1')).toEqual({});
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run src/utils/dataBackup.mergedPlayers.test.ts`
Expected: FAIL — 1件目が `expected {} to deeply equal { '佐藤　太郎': '佐藤 太郎' }`

- [ ] **Step 3: import と型を足す**

`src/utils/dataBackup.ts` の import 群へ追加:

```ts
import { loadAllMergedPlayers } from './mergedPlayers';
```

`executeImport` は `writes` 経由でまとめて書くため（途中失敗で部分適用させない既存の作り）、`saveMergedPlayers` は import しない。

`BackupData` の `data` に追加（`hiddenPlayers?: Record<string, string[]>;` の直後）:

```ts
        /** 手動で統合した選手の対応表（チームID → 記録上のキー: 代表キー） */
        mergedPlayers?: Record<string, Record<string, string>>;
```

- [ ] **Step 4: エクスポートに含める**

`exportAllData` を変更。

`const hiddenPlayers = getHiddenPlayersData();` の直後へ追加:
```ts
    const mergedPlayers = loadAllMergedPlayers();
```

`data` オブジェクトの `hiddenPlayers,` の直後へ追加:
```ts
            mergedPlayers,
```

- [ ] **Step 5: インポートに含める**

`executeImport` 内、非表示選手のインポート（`writes.push(['minibasket-hidden-players', ...]);` を含むブロック）の直後へ追加:

```ts
        // 統合設定のインポート（既存データとマージ）。
        // チームごとに項目単位で重ねる。同じキーがあればバックアップ側を採る
        if (data.data.mergedPlayers) {
            const existingMerged = loadAllMergedPlayers();
            const mergedAll: Record<string, Record<string, string>> = { ...existingMerged };
            for (const [teamId, map] of Object.entries(data.data.mergedPlayers)) {
                mergedAll[teamId] = { ...(mergedAll[teamId] ?? {}), ...map };
            }
            writes.push(['minibasket-merged-players', JSON.stringify(mergedAll)]);
        }
```

- [ ] **Step 6: テストが通ることを確認**

Run: `npx vitest run src/utils/dataBackup`
Expected: PASS（既存の `dataBackup.test.ts` ほかも含めて全件）

- [ ] **Step 7: lint と型チェック**

Run: `npm run lint && npx tsc -b`
Expected: どちらも出力なし

- [ ] **Step 8: コミット**

```bash
git add src/utils/dataBackup.ts src/utils/dataBackup.mergedPlayers.test.ts
git commit -m "feat: 統合設定をバックアップの往復対象に含める"
```

---

### Task 5: 一覧カードの選択モードと統合済みの印

**Files:**
- Modify: `src/components/PlayerStatsAnalysis/types.ts`（`PlayerCardListProps`）
- Modify: `src/components/PlayerStatsAnalysis/PlayerCardList.tsx`
- Modify: `src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.css`
- Test: `src/components/PlayerStatsAnalysis/PlayerCardList.merge.test.tsx`

**Interfaces:**
- Consumes: なし（表示のみ）
- Produces: `PlayerCardListProps` に以下を追加
  ```ts
  /** 選択モード中か。true のときカードのタップは選択の切り替えになる */
  selectionMode?: boolean;
  /** 選択中のキー */
  selectedKeys?: ReadonlySet<string>;
  /** 選択の切り替え（選択モード中のみ呼ばれる） */
  onToggleSelect?: (playerKey: string) => void;
  /** 統合済みの代表キー。カードに印を出す */
  mergedKeys?: ReadonlySet<string>;
  ```

- [ ] **Step 1: 失敗するテストを書く**

Create `src/components/PlayerStatsAnalysis/PlayerCardList.merge.test.tsx`:

```tsx
// 選択モードと統合済みの印。
//
// 選択モード中にカードを押すと詳細が開いてしまうと、統合の選択ができない。
// 統合済みの印が無いと、まとめたのかどうかを詳細を開いて確かめるしかない。
//
// カードの特定に getByRole の name は使えない。testing-library の既定の
// ノーマライザは \s+ を半角スペースへ畳み、全角スペース(U+3000)も \s に
// 含まれる。つまり「佐藤(全角スペース)太郎」と「佐藤 太郎」はアクセシブル名として同じに
// なり、多重一致で落ちる（この機能がまさに救おうとしている表記ゆれ）。
// 位置で引く。

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { makeAggregatedPlayer } from '../../test/statsFactories';
import { PlayerCardList } from './PlayerCardList';

afterEach(cleanup);

const players = [
    makeAggregatedPlayer({ playerKey: '佐藤 太郎', name: '佐藤 太郎', number: 4 }),
    makeAggregatedPlayer({ playerKey: '佐藤　太郎', name: '佐藤　太郎', number: 7 }),
];

const cardsOf = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLButtonElement>('.player-card')];

describe('PlayerCardList: 選択モード', () => {
    it('選択モードではカードを押すと選択が切り替わり、詳細は開かない', () => {
        const onPlayerClick = vi.fn();
        const onToggleSelect = vi.fn();
        const { container } = render(
            <PlayerCardList
                players={players}
                onPlayerClick={onPlayerClick}
                selectionMode
                selectedKeys={new Set()}
                onToggleSelect={onToggleSelect}
            />,
        );

        fireEvent.click(cardsOf(container)[0]);

        expect(onToggleSelect).toHaveBeenCalledWith('佐藤 太郎');
        expect(onPlayerClick).not.toHaveBeenCalled();
    });

    it('選択中のカードは押された状態として読み上げられる', () => {
        const { container } = render(
            <PlayerCardList
                players={players}
                onPlayerClick={vi.fn()}
                selectionMode
                selectedKeys={new Set(['佐藤 太郎'])}
                onToggleSelect={vi.fn()}
            />,
        );

        const [first, second] = cardsOf(container);
        expect(first.getAttribute('aria-pressed')).toBe('true');
        expect(second.getAttribute('aria-pressed')).toBe('false');
    });

    it('選択モードでなければ従来どおり詳細が開く', () => {
        const onPlayerClick = vi.fn();
        const { container } = render(<PlayerCardList players={players} onPlayerClick={onPlayerClick} />);

        fireEvent.click(cardsOf(container)[0]);

        expect(onPlayerClick).toHaveBeenCalledTimes(1);
        expect(cardsOf(container)[0].getAttribute('aria-pressed')).toBeNull();
    });
});

describe('PlayerCardList: 統合済みの印', () => {
    it('統合済みの代表キーには印が出る', () => {
        render(
            <PlayerCardList
                players={players}
                onPlayerClick={vi.fn()}
                mergedKeys={new Set(['佐藤 太郎'])}
            />,
        );

        expect(screen.getAllByText('統合済み')).toHaveLength(1);
    });

    it('統合していなければ印は出ない', () => {
        render(<PlayerCardList players={players} onPlayerClick={vi.fn()} />);

        expect(screen.queryByText('統合済み')).toBeNull();
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run src/components/PlayerStatsAnalysis/PlayerCardList.merge.test.tsx`
Expected: FAIL — 1件目で `onToggleSelect` が呼ばれず `onPlayerClick` が呼ばれる

- [ ] **Step 3: Props 型を足す**

`src/components/PlayerStatsAnalysis/types.ts` の `PlayerCardListProps` を置き換える。

置き換え前:
```ts
export interface PlayerCardListProps {
    players: AggregatedPlayerStats[];
    /** 非表示にしている選手のキー。全員表示のときにどれが非表示かを示すために使う */
    hiddenPlayerKeys?: ReadonlySet<string>;
    onPlayerClick: (player: AggregatedPlayerStats) => void;
}
```

置き換え後:
```ts
export interface PlayerCardListProps {
    players: AggregatedPlayerStats[];
    /** 非表示にしている選手のキー。全員表示のときにどれが非表示かを示すために使う */
    hiddenPlayerKeys?: ReadonlySet<string>;
    onPlayerClick: (player: AggregatedPlayerStats) => void;
    /** 選択モード中か。true のときカードのタップは選択の切り替えになる */
    selectionMode?: boolean;
    /** 選択中のキー */
    selectedKeys?: ReadonlySet<string>;
    /** 選択の切り替え（選択モード中のみ呼ばれる） */
    onToggleSelect?: (playerKey: string) => void;
    /** 統合済みの代表キー。まとめたことが一覧から分かるように印を出す */
    mergedKeys?: ReadonlySet<string>;
}
```

- [ ] **Step 4: PlayerCardList を変更する**

`src/components/PlayerStatsAnalysis/PlayerCardList.tsx` の関数シグネチャを置き換える。

置き換え前:
```tsx
export function PlayerCardList({ players, hiddenPlayerKeys, onPlayerClick }: PlayerCardListProps) {
```

置き換え後:
```tsx
export function PlayerCardList({
    players,
    hiddenPlayerKeys,
    onPlayerClick,
    selectionMode = false,
    selectedKeys,
    onToggleSelect,
    mergedKeys,
}: PlayerCardListProps) {
```

同ファイルの `return (` 直前（`const isPartialQuarters = ...` の直後）へ追加:
```tsx
                const isSelected = selectedKeys?.has(player.playerKey) ?? false;
                const isMerged = mergedKeys?.has(player.playerKey) ?? false;
```

`<button ... >` の属性を置き換える。

置き換え前:
```tsx
                    <button
                        type="button"
                        key={player.playerKey}
                        className={`player-card ${isHidden ? 'hidden-player' : ''}`}
                        onClick={() => onPlayerClick(player)}
                    >
```

置き換え後:
```tsx
                    <button
                        type="button"
                        key={player.playerKey}
                        className={`player-card ${isHidden ? 'hidden-player' : ''} ${selectionMode ? 'selecting' : ''} ${isSelected ? 'selected' : ''}`}
                        // 選択モード中に詳細が開くと統合する相手を選べない
                        onClick={() => selectionMode
                            ? onToggleSelect?.(player.playerKey)
                            : onPlayerClick(player)}
                        // 選択モード中は未選択も false として読み上げる（選べることが伝わる）
                        aria-pressed={selectionMode ? isSelected : undefined}
                    >
```

`{isHidden && <span className="player-hidden-badge">非表示</span>}` の直後へ追加:
```tsx
                            {/* 色や枠だけでは伝わらないので文字でも出す（非表示の印と同じ扱い） */}
                            {isMerged && <span className="player-merged-badge">統合済み</span>}
```

- [ ] **Step 5: CSS を足す**

`src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.css` の末尾へ追加:

```css
/* 統合済みの印。非表示の印（.player-hidden-badge）と同じ作りにそろえる */
.player-stats-container .player-merged-badge {
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--stats-success-bg);
    color: var(--text-primary);
    border: 1px solid var(--stats-success-pale-2);
    white-space: nowrap;
}

/* 選択モード中のカード。選択中は色・枠の2方向で示す */
.player-stats-container .player-card.selecting {
    border: 2px dashed var(--stats-text-dim);
}

.player-stats-container .player-card.selecting.selected {
    border: 2px solid var(--stats-success);
    background: var(--stats-success-bg);
}
```

- [ ] **Step 6: テストが通ることを確認**

Run: `npx vitest run src/components/PlayerStatsAnalysis`
Expected: PASS（既存の `PlayerCardList.test.tsx` も含めて全件）

- [ ] **Step 7: lint と型チェック**

Run: `npm run lint && npx tsc -b`
Expected: どちらも出力なし

- [ ] **Step 8: コミット**

```bash
git add src/components/PlayerStatsAnalysis/types.ts src/components/PlayerStatsAnalysis/PlayerCardList.tsx src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.css src/components/PlayerStatsAnalysis/PlayerCardList.merge.test.tsx
git commit -m "feat: 選手カードに選択モードと統合済みの印を足す"
```

---

### Task 6: 分析画面での統合の実行

**Files:**
- Modify: `src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.tsx`
- Test: `src/components/PlayerStatsAnalysis/mergeFlow.test.tsx`

**Interfaces:**
- Consumes: Task 1（`loadMergedPlayers` / `saveMergedPlayers` / `mergeKeys` / `mergedCanonicalKeys` / `chooseCanonicalKey` / `carryOverHidden`）、Task 3（`findMergeCandidates`）、Task 5（`PlayerCardList` の新 props）
- Produces: なし（画面の完成）

- [ ] **Step 1: 失敗するテストを書く**

Create `src/components/PlayerStatsAnalysis/mergeFlow.test.tsx`:

```tsx
// 一覧から統合するまでの流れ。
//
// 割れたカードは利用者が直せなければ意味がないので、
// 「気づく（候補の案内）」「選ぶ（選択モード）」「確かめる（確認）」まで通す。
//
// カードの特定に getByRole の name は使えない。testing-library の既定の
// ノーマライザは \s+ を半角スペースへ畳み、全角スペース(U+3000)も \s に
// 含まれる。つまり「佐藤(全角スペース)太郎」と「佐藤 太郎」はアクセシブル名として同じに
// なり、多重一致で落ちる（この機能がまさに救おうとしている表記ゆれ）。位置で引く。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PlayerStatsAnalysis } from './PlayerStatsAnalysis';
import { loadMergedPlayers } from '../../utils/mergedPlayers';
import { saveGameResult } from '../../utils/gameHistoryStorage';
import { createTeam, createPlayer } from '../../types/game';

const TEAM_ID = 't1';

function seedTeam() {
    localStorage.setItem('minibasket-my-teams', JSON.stringify([{
        id: TEAM_ID, name: 'チーム', coachName: 'C', assistantCoachName: '',
        players: [{ number: 4, uniformNumber: 4, name: '佐藤 太郎', isCaptain: false }],
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }]));
}

function recordGame(name: string, number: number, points: number, date: string) {
    const p = createPlayer('p', number, name);
    p.stats = { ...p.stats, points };
    p.quartersPlayed = ['starter', false, false, false];
    const mine = createTeam('teamA', 'チーム', 'C');
    mine.isMyTeam = true;
    mine.savedTeamId = TEAM_ID;
    mine.players = [p];
    const other = createTeam('teamB', '相手', 'C');
    other.players = [createPlayer('b', 9, '相手')];
    saveGameResult('試合', mine, other, [], [], [], new Date(date));
}

/** 割れている状態を作る。背番号を分けるのはテストからカードを見分けるため */
function seedSplitPlayer() {
    recordGame('佐藤　太郎', 7, 10, '2026-04-01'); // 全角スペース
    recordGame('佐藤 太郎', 4, 8, '2026-06-01');
}

const cards = () => [...document.querySelectorAll<HTMLButtonElement>('.player-card')];
const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
    localStorage.clear();
    seedTeam();
});
afterEach(cleanup);

describe('統合の流れ', () => {
    it('割れているカードがあると候補の案内が出る', () => {
        seedSplitPlayer();

        render(<PlayerStatsAnalysis onBack={() => { }} />);

        expect(screen.getByText(/同じ選手が分かれているかもしれません/)).toBeTruthy();
    });

    it('割れていなければ候補の案内は出ない', () => {
        recordGame('佐藤 太郎', 4, 8, '2026-06-01');

        render(<PlayerStatsAnalysis onBack={() => { }} />);

        expect(screen.queryByText(/同じ選手が分かれているかもしれません/)).toBeNull();
    });

    it('選択モードで2枚選んで統合すると1枚になる', () => {
        seedSplitPlayer();
        render(<PlayerStatsAnalysis onBack={() => { }} />);
        expect(cards()).toHaveLength(2);

        fireEvent.click(button('選手を統合'));
        cards().forEach(card => fireEvent.click(card));
        fireEvent.click(button('統合する'));
        fireEvent.click(button('この内容で統合'));

        // 名簿に載っている「佐藤 太郎」が代表になる
        expect(loadMergedPlayers(TEAM_ID)).toEqual({ '佐藤　太郎': '佐藤 太郎' });
        expect(cards()).toHaveLength(1);
        expect(screen.getAllByText('統合済み')).toHaveLength(1);
    });

    it('1枚しか選んでいないと統合へ進めない', () => {
        seedSplitPlayer();
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        fireEvent.click(button('選手を統合'));
        fireEvent.click(cards()[0]);

        expect((button('統合する') as HTMLButtonElement).disabled).toBe(true);
    });

    it('確認に代表の氏名と合算後の試合数が出る', () => {
        seedSplitPlayer();
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        fireEvent.click(button('選手を統合'));
        cards().forEach(card => fireEvent.click(card));
        fireEvent.click(button('統合する'));

        expect(screen.getByText(/#4 佐藤 太郎/)).toBeTruthy();
        expect(screen.getByText(/合計2試合/)).toBeTruthy();
    });

    // 統合すると2枚が1枚になる。1枚では相手が居ないので入口のボタンも消えるのが正しい。
    // 選択モードを抜けたことは、選択モード中だけ出る操作子が消えたことで確かめる
    it('統合したら選択モードを抜ける', () => {
        seedSplitPlayer();
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        fireEvent.click(button('選手を統合'));
        cards().forEach(card => fireEvent.click(card));
        fireEvent.click(button('統合する'));
        fireEvent.click(button('この内容で統合'));

        expect(screen.queryByRole('button', { name: '統合する' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'やめる' })).toBeNull();
        expect(cards()).toHaveLength(1);
    });

    it('「確認する」を押すと候補の組が選ばれた状態になる', () => {
        seedSplitPlayer();
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        fireEvent.click(button('確認する'));

        expect(cards().every(c => c.getAttribute('aria-pressed') === 'true')).toBe(true);
        expect((button('統合する') as HTMLButtonElement).disabled).toBe(false);
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run src/components/PlayerStatsAnalysis/mergeFlow.test.tsx`
Expected: FAIL — 1件目が `Unable to find an element with the text: /同じ選手が分かれているかもしれません/`

- [ ] **Step 3: import と state を足す**

既存の `from '../../utils/playerStatsAnalysis'` の import 文に `saveHiddenPlayers,` を足す（同じモジュールから2つ目の import 文を作らない）。`loadHiddenPlayers` は既に入っている。

そのうえで import 群へ追加:

```tsx
import {
    loadMergedPlayers,
    saveMergedPlayers,
    mergeKeys,
    mergedCanonicalKeys,
    chooseCanonicalKey,
    carryOverHidden,
} from '../../utils/mergedPlayers';
import { findMergeCandidates } from './mergeCandidates';
import { ConfirmModal } from '../Modal';
import { formatPlayerNumber } from '../../utils/playerNumber';
```

`const [hiddenToggleKey, setHiddenToggleKey] = useState(0);` の直後へ追加:

```tsx
    // 統合の変更を集計へ反映させるためのカウンタ（hiddenToggleKey と同じ役割）
    const [mergeToggleKey, setMergeToggleKey] = useState(0);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set());
    const [showMergeConfirm, setShowMergeConfirm] = useState(false);
```

- [ ] **Step 4: 集計の依存に統合を足す**

`playerStats` の `useMemo` を置き換える。

置き換え前:
```tsx
    const playerStats = useMemo(() => {
        if (!selectedTeam) return [];
        return aggregatePlayerStats(selectedTeam, startDate, endDate, { includeHidden: showHiddenPlayers });
        // hiddenToggleKey: 非表示選手の集合が変わった際に強制再計算するための意図的な依存
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTeam, startDate, endDate, showHiddenPlayers, hiddenToggleKey]);
```

置き換え後:
```tsx
    const playerStats = useMemo(() => {
        if (!selectedTeam) return [];
        return aggregatePlayerStats(selectedTeam, startDate, endDate, { includeHidden: showHiddenPlayers });
        // hiddenToggleKey / mergeToggleKey: 非表示選手・統合の設定が変わった際に
        // 強制再計算するための意図的な依存
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTeam, startDate, endDate, showHiddenPlayers, hiddenToggleKey, mergeToggleKey]);
```

- [ ] **Step 5: 統合の派生値と実行処理を足す**

`const sortedPlayers = useMemo(...)` の直後へ追加:

```tsx
    // 統合済みの代表キー（カードの印に使う）
    const mergedKeys = useMemo(() => {
        if (!selectedTeam) return new Set<string>();
        return mergedCanonicalKeys(loadMergedPlayers(selectedTeam.id));
        // mergeToggleKey: 統合の切り替えを取り込むための意図的な依存
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTeam, mergeToggleKey]);

    // 割れていそうな組。提案するだけで、確認なしには統合しない
    const mergeCandidates = useMemo(
        () => findMergeCandidates(playerStats, selectedTeam?.players.map(p => p.name) ?? []),
        [playerStats, selectedTeam],
    );

    const selectedCards = useMemo(
        () => playerStats.filter(p => selectedKeys.has(p.playerKey)),
        [playerStats, selectedKeys],
    );

    // 代表は名簿に載っている側。詳細は mergedPlayers の chooseCanonicalKey
    const canonicalKey = useMemo(
        () => chooseCanonicalKey(
            selectedCards.map(p => ({
                playerKey: p.playerKey,
                name: p.name,
                latestDate: p.gameHistory[0]?.date ?? '',
            })),
            selectedTeam?.players.map(p => p.name) ?? [],
        ),
        [selectedCards, selectedTeam],
    );

    const canonicalCard = selectedCards.find(p => p.playerKey === canonicalKey) ?? null;
    const mergedGames = selectedCards.reduce((sum, p) => sum + p.gamesPlayed, 0);

    const handleToggleSelect = useCallback((playerKey: string) => {
        setSelectedKeys(prev => {
            const next = new Set(prev);
            if (next.has(playerKey)) next.delete(playerKey);
            else next.add(playerKey);
            return next;
        });
    }, []);

    const exitSelection = useCallback(() => {
        setSelectionMode(false);
        setSelectedKeys(new Set());
        setShowMergeConfirm(false);
    }, []);

    const handleMerge = useCallback(() => {
        if (!selectedTeam || selectedCards.length < 2 || !canonicalKey) return;
        const keys = selectedCards.map(p => p.playerKey);
        saveMergedPlayers(selectedTeam.id, mergeKeys(loadMergedPlayers(selectedTeam.id), keys, canonicalKey));
        // 統合するとキーが変わる。引き継がないと、非表示にしていた選手が
        // 統合した瞬間に一覧へ復活したように見える
        saveHiddenPlayers(selectedTeam.id, carryOverHidden(loadHiddenPlayers(selectedTeam.id), keys, canonicalKey));
        setHiddenPlayerCount(loadHiddenPlayers(selectedTeam.id).length);
        setMergeToggleKey(prev => prev + 1);
        setHiddenToggleKey(prev => prev + 1);
        exitSelection();
    }, [selectedTeam, selectedCards, canonicalKey, exitSelection]);
```

- [ ] **Step 6: 操作子と案内を描画する**

`{viewMode === 'summary' && (` ブロック内、`<div className="controls-bar">` の**直前**へ追加:

```tsx
                    {/* 割れているカードは利用者が気づかないと直しようがない。
                        案内は提案だけで、確認なしには統合しない */}
                    {!selectionMode && mergeCandidates.length > 0 && (
                        <div className="merge-hint">
                            <span className="merge-hint-text">
                                同じ選手が分かれているかもしれません（{mergeCandidates.length}組）
                            </span>
                            <button
                                className="btn btn-secondary btn-small"
                                onClick={() => {
                                    setSelectionMode(true);
                                    setSelectedKeys(new Set(mergeCandidates[0].map(p => p.playerKey)));
                                }}
                            >
                                確認する
                            </button>
                        </div>
                    )}

                    <div className="merge-toolbar">
                        {selectionMode ? (
                            <>
                                <span className="merge-toolbar-text">
                                    同じ選手のカードを2枚以上選んでください（{selectedKeys.size}枚選択中）
                                </span>
                                <button
                                    className="btn btn-primary btn-small"
                                    disabled={selectedKeys.size < 2}
                                    onClick={() => setShowMergeConfirm(true)}
                                >
                                    統合する
                                </button>
                                <button className="btn btn-secondary btn-small" onClick={exitSelection}>
                                    やめる
                                </button>
                            </>
                        ) : (
                            playerStats.length >= 2 && (
                                <button
                                    className="btn btn-secondary btn-small"
                                    onClick={() => setSelectionMode(true)}
                                >
                                    選手を統合
                                </button>
                            )
                        )}
                    </div>
```

`<PlayerCardList ... />` を置き換える。

置き換え前:
```tsx
                        ? <PlayerCardList
                            players={sortedPlayers}
                            hiddenPlayerKeys={hiddenPlayerKeys}
                            onPlayerClick={handlePlayerClick}
                        />
```

置き換え後:
```tsx
                        ? <PlayerCardList
                            players={sortedPlayers}
                            hiddenPlayerKeys={hiddenPlayerKeys}
                            onPlayerClick={handlePlayerClick}
                            selectionMode={selectionMode}
                            selectedKeys={selectedKeys}
                            onToggleSelect={handleToggleSelect}
                            mergedKeys={mergedKeys}
                        />
```

`</main>` の直前へ確認モーダルを追加:

```tsx
            {showMergeConfirm && canonicalCard && (
                <ConfirmModal
                    title="選手を統合しますか？"
                    message={`${selectedCards.length}枚のカードを1人としてまとめます。まとめたあとは #${formatPlayerNumber(canonicalCard.number)} ${canonicalCard.name}（合計${mergedGames}試合）として表示されます。`}
                    note="試合の記録は変わりません。あとから解除できます。"
                    confirmLabel="この内容で統合"
                    cancelLabel="やめる"
                    onConfirm={handleMerge}
                    onCancel={() => setShowMergeConfirm(false)}
                />
            )}
```

- [ ] **Step 7: CSS を足す**

`src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.css` の末尾へ追加:

```css
/* 割れているカードの案内。一覧の先頭に置いて気づけるようにする */
.player-stats-container .merge-hint {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding: 10px 14px;
    margin-bottom: 12px;
    border-radius: 8px;
    background: var(--stats-success-bg);
    border: 1px solid var(--stats-success-pale-2);
}

.player-stats-container .merge-hint-text {
    font-size: 0.85rem;
    color: var(--text-primary);
}

.player-stats-container .merge-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 12px;
}

.player-stats-container .merge-toolbar-text {
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin-right: auto;
}
```

- [ ] **Step 8: テストが通ることを確認**

Run: `npx vitest run src/components/PlayerStatsAnalysis`
Expected: PASS（既存分も含めて全件）

- [ ] **Step 9: lint と型チェック**

Run: `npm run lint && npx tsc -b`
Expected: どちらも出力なし

- [ ] **Step 10: コミット**

```bash
git add src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.tsx src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.css src/components/PlayerStatsAnalysis/mergeFlow.test.tsx
git commit -m "feat: 一覧から選手カードを統合できるようにする"
```

---

### Task 7: 詳細画面からの統合の解除

**Files:**
- Modify: `src/components/PlayerStatsAnalysis/types.ts`（`DetailViewProps`）
- Modify: `src/components/PlayerStatsAnalysis/DetailView.tsx`
- Modify: `src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.tsx`
- Test: `src/components/PlayerStatsAnalysis/DetailView.unmerge.test.tsx`

**Interfaces:**
- Consumes: Task 1（`unmergeKey`）
- Produces: `DetailViewProps` に `isMerged: boolean` と `onUnmerge: () => void` を追加

- [ ] **Step 1: 失敗するテストを書く**

Create `src/components/PlayerStatsAnalysis/DetailView.unmerge.test.tsx`:

```tsx
// 統合の解除。
//
// 統合は集計時の名寄せで試合記録を書き換えないため、解除は対応表から項目を
// 消すだけで元の枚数に戻る。間違えて統合しても取り返しがつく、という前提を
// 画面にも出しておく。

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { makeAggregatedPlayer } from '../../test/statsFactories';
import { DetailView } from './DetailView';

vi.mock('../../utils/pdfExport', () => ({ exportElement: vi.fn() }));

afterEach(cleanup);

const player = makeAggregatedPlayer({ playerKey: '佐藤 太郎', name: '佐藤 太郎', gamesPlayed: 2 });

describe('DetailView: 統合の解除', () => {
    it('統合済みなら解除の操作子が出る', () => {
        render(
            <DetailView
                player={player} teamId="t1" isHidden={false} onToggleHidden={() => { }}
                isMerged onUnmerge={() => { }}
            />,
        );

        expect(screen.getByRole('button', { name: '統合を解除' })).toBeTruthy();
    });

    it('統合していなければ出ない', () => {
        render(
            <DetailView
                player={player} teamId="t1" isHidden={false} onToggleHidden={() => { }}
                isMerged={false} onUnmerge={() => { }}
            />,
        );

        expect(screen.queryByRole('button', { name: '統合を解除' })).toBeNull();
    });

    it('押すと解除が呼ばれる', () => {
        const onUnmerge = vi.fn();
        render(
            <DetailView
                player={player} teamId="t1" isHidden={false} onToggleHidden={() => { }}
                isMerged onUnmerge={onUnmerge}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '統合を解除' }));

        expect(onUnmerge).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run src/components/PlayerStatsAnalysis/DetailView.unmerge.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "統合を解除"`

- [ ] **Step 3: Props 型を足す**

`src/components/PlayerStatsAnalysis/types.ts` の `DetailViewProps` を置き換える。

置き換え前:
```ts
export interface DetailViewProps {
    player: AggregatedPlayerStats;
    teamId: string;
    isHidden: boolean;
    onToggleHidden: () => void;
}
```

置き換え後:
```ts
export interface DetailViewProps {
    player: AggregatedPlayerStats;
    teamId: string;
    isHidden: boolean;
    onToggleHidden: () => void;
    /** 他のカードをまとめた代表か（解除の操作子を出すかの判断） */
    isMerged?: boolean;
    /** 統合の解除 */
    onUnmerge?: () => void;
}
```

- [ ] **Step 4: DetailView を変更する**

`src/components/PlayerStatsAnalysis/DetailView.tsx` の関数シグネチャを置き換える。

置き換え前:
```tsx
export function DetailView({ player, isHidden, onToggleHidden }: DetailViewProps) {
```

置き換え後:
```tsx
export function DetailView({ player, isHidden, onToggleHidden, isMerged = false, onUnmerge }: DetailViewProps) {
```

`</label>` （`toggle-switch` の閉じタグ）の直後、`</div>`（`detail-toolbar` の閉じ）の直前へ追加:

```tsx
                {/* 統合は集計時の名寄せで記録を書き換えていないので、解除は
                    まとめる前のカードに戻すだけ。確認は挟まない */}
                {isMerged && (
                    <button className="btn btn-secondary btn-small" onClick={onUnmerge}>
                        統合を解除
                    </button>
                )}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npx vitest run src/components/PlayerStatsAnalysis/DetailView.unmerge.test.tsx`
Expected: PASS（3件）

- [ ] **Step 6: 分析画面から解除をつなぐ**

`src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.tsx` の import に `unmergeKey` を足す（Task 6 で追加した `mergedPlayers` からの import 群へ）:

```tsx
    unmergeKey,
```

`handleMerge` の直後へ追加:

```tsx
    const handleUnmerge = useCallback(() => {
        if (!selectedTeam || !selectedPlayer) return;
        saveMergedPlayers(
            selectedTeam.id,
            unmergeKey(loadMergedPlayers(selectedTeam.id), selectedPlayer.playerKey),
        );
        setMergeToggleKey(prev => prev + 1);
        // 解除すると元の枚数に戻る。開いていた詳細はもう同じ内容ではないので一覧へ
        handleBackToSummary();
    }, [selectedTeam, selectedPlayer, handleBackToSummary]);
```

`<DetailView ... />` を置き換える。

置き換え前:
```tsx
                <DetailView
                    player={selectedPlayer}
                    teamId={selectedTeam.id}
                    isHidden={isSelectedPlayerHidden}
                    onToggleHidden={handleTogglePlayerHidden}
                />
```

置き換え後:
```tsx
                <DetailView
                    player={selectedPlayer}
                    teamId={selectedTeam.id}
                    isHidden={isSelectedPlayerHidden}
                    onToggleHidden={handleTogglePlayerHidden}
                    isMerged={mergedKeys.has(selectedPlayer.playerKey)}
                    onUnmerge={handleUnmerge}
                />
```

- [ ] **Step 7: 解除の結合テストを足す**

`src/components/PlayerStatsAnalysis/mergeFlow.test.tsx` の末尾（最後の `});` の直前）へ追加:

```tsx
    it('詳細から解除すると元の枚数に戻る', () => {
        seedSplitPlayer();
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        fireEvent.click(button('選手を統合'));
        cards().forEach(card => fireEvent.click(card));
        fireEvent.click(button('統合する'));
        fireEvent.click(button('この内容で統合'));
        expect(cards()).toHaveLength(1);

        fireEvent.click(cards()[0]);
        fireEvent.click(button('統合を解除'));

        expect(loadMergedPlayers(TEAM_ID)).toEqual({});
        expect(cards()).toHaveLength(2);
        expect(screen.queryByText('統合済み')).toBeNull();
    });
```

- [ ] **Step 8: テストが通ることを確認**

Run: `npx vitest run src/components/PlayerStatsAnalysis`
Expected: PASS（全件）

- [ ] **Step 9: lint と型チェック**

Run: `npm run lint && npx tsc -b`
Expected: どちらも出力なし

- [ ] **Step 10: コミット**

```bash
git add src/components/PlayerStatsAnalysis/types.ts src/components/PlayerStatsAnalysis/DetailView.tsx src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.tsx src/components/PlayerStatsAnalysis/DetailView.unmerge.test.tsx src/components/PlayerStatsAnalysis/mergeFlow.test.tsx
git commit -m "feat: 詳細画面から統合を解除できるようにする"
```

---

### Task 8: 全体確認と実機での検証

**Files:**
- Modify: なし（不具合が見つかった場合のみ）

- [ ] **Step 1: 全テスト・lint・型チェック**

Run: `npm run lint && npx tsc -b && npm run typecheck:test && npm test`
Expected: すべて成功。テスト件数が Task 開始前より増えていること

- [ ] **Step 2: 本番ビルドで確認用データを用意**

```bash
npm run build
```

`preview` を起動し、ブラウザのコンソールで以下を実行して「氏名の表記ゆれで割れている」状態を作る:

```js
localStorage.setItem('minibasket-my-teams', JSON.stringify([{
  id:'t1', name:'ミニバスA', coachName:'', assistantCoachName:'',
  players:[{number:4,uniformNumber:4,name:'佐藤 太郎',isCaptain:true}],
  createdAt:'2026-01-01T00:00:00.000Z', updatedAt:'2026-08-19T00:00:00.000Z'}]));
const es=()=>({points:0,twoPointMade:0,twoPointAttempt:0,threePointMade:0,threePointAttempt:0,freeThrowMade:0,freeThrowAttempt:0,offensiveRebounds:0,defensiveRebounds:0,assists:0,steals:0,blocks:0,turnovers:0,turnoverDD:0,turnoverTR:0,turnoverPM:0,turnoverCM:0});
const mk=(date,name,pts)=>{const p={id:'teamA-player-0',number:4,name,isCaptain:true,fouls:[],stats:Object.assign(es(),{points:pts,twoPointMade:pts/2,twoPointAttempt:pts/2+1}),quartersPlayed:['starter','starter',false,false],isOnCourt:false};
 return {id:'g'+date,date:new Date(date).toISOString(),gameName:'試合',
  teamA:{id:'teamA',name:'ミニバスA',coachName:'',assistantCoachName:'',players:[p],timeouts:[],teamFouls:[0,0,0,0],coachFouls:[],assistantCoachFouls:[],benchFouls:[],isMyTeam:true,savedTeamId:'t1',color:'white'},
  teamB:{id:'teamB',name:'相手',coachName:'',assistantCoachName:'',players:[{id:'b0',number:4,name:'x',isCaptain:false,fouls:[],stats:Object.assign(es(),{points:pts-2}),quartersPlayed:[false,false,false,false],isOnCourt:false}],timeouts:[],teamFouls:[0,0,0,0],coachFouls:[],assistantCoachFouls:[],benchFouls:[],color:'blue'},
  finalScore:{teamA:pts,teamB:pts-2},scoreHistory:[],statHistory:[],foulHistory:[],createdAt:new Date(date).toISOString()};};
localStorage.setItem('minibasket-game-history', JSON.stringify([mk('2026-06-01','佐藤 太郎',8), mk('2026-04-01','佐藤　太郎',10)]));
location.reload();
```

- [ ] **Step 2b: 画面で確認**

選手スタッツ分析を開き、次を確かめる:

1. カードが2枚に割れており、「同じ選手が分かれているかもしれません（1組）」が出る
2. 「確認する」で2枚が選択された状態になる
3. 「統合する」の確認に `#4 佐藤 太郎` と `合計2試合` が出る
4. 統合すると1枚（2試合・通算18点）になり「統合済み」の印が付く
5. リロードしても統合が保たれている
6. 詳細を開いて「統合を解除」を押すと2枚に戻る

- [ ] **Step 3: 統合したまま出力しても崩れないことを確認**

統合した状態で選手詳細を開き、JPEG出力を実行する。出力後に成長グラフのスクロール位置が最新のまま（左端へ巻き戻らない）ことを確かめる。

- [ ] **Step 4: 検証データを消す**

ブラウザのコンソールで:

```js
for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && (k.startsWith('minibasket-') || k.startsWith('mbc_') || k.startsWith('mbc-'))) localStorage.removeItem(k); }
indexedDB.deleteDatabase('mbc-mirror-backup');
```

- [ ] **Step 5: 仕様書のステータスを更新してコミット**

`docs/superpowers/specs/2026-08-19-manual-player-merge-design.md` の3行目を置き換える。

置き換え前:
```markdown
- ステータス: 設計承認済み（実装計画待ち）
```

置き換え後:
```markdown
- ステータス: 実装済み
```

```bash
git add docs/superpowers/specs/2026-08-19-manual-player-merge-design.md
git commit -m "docs: 手動統合の設計を実装済みにする"
```
