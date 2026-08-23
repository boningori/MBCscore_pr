# チームスタッツ比較画面 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既に記録しているデータだけを使い、2チームのスタッツを左右対比で見せる画面を追加する。

**Architecture:** 集計は React に依存しない純関数（`teamTotals.ts` / `quarterScores.ts`）に閉じ込め、表示コンポーネントは受け取った数値を描くだけにする。「全体」は選手スタッツの合計、クォーター別は履歴（`scoreHistory` / `statHistory` / `foulHistory`）からの再集計、という2経路を持つ。新しい記録項目は追加せず、型定義も保存形式も変更しない。

**Tech Stack:** React 19 / TypeScript / Vite / Vitest + @testing-library/react / html2canvas + jsPDF（既存）

設計書: [docs/superpowers/specs/2026-08-23-team-stats-comparison-design.md](../specs/2026-08-23-team-stats-comparison-design.md)

## Global Constraints

- **記録項目を増やさない。** `PlayerStats` / `ScoreEntry` / `StatEntry` / `FoulEntry` / `GameRecord` の型は一切変更しない
- **依存パッケージを増やさない。** チャートライブラリは入れない。棒グラフは div + CSS、円は conic-gradient、折れ線はインライン SVG で描く
- コメントは日本語。既存ファイルに倣い、「なぜそうしたか」を書く（何をしているかの説明は書かない）
- インデントは4スペース（`src/` 全体の既定）
- テストは `src/**/*.test.{ts,tsx}` に置く。実行は `npm test`
- **SVG の見た目を CSS クラスで与えない。** 色・線幅は要素の属性か `style` に直接書く。html2canvas は SVG を単体へ切り出してから描くため、ページの CSS で当てた `stroke` は出力画像で消える（既存のスコアシートの斜線がこれで消え、座標を測って手描きし直す回避策が入っている）
- `prefers-reduced-motion: reduce` のときはアニメーションを行わない
- 変更してよい既存ファイルは `src/App.tsx` / `src/components/History/History.tsx` / `src/components/StatsPanel/StatsPanel.tsx` / `src/utils/pdfExport.ts` の4つだけ

---

### Task 1: 出力スパイク — インライン SVG が html2canvas で描けるか確かめる

コードは書かない。実装方針の前提を実ブラウザで確認するだけのタスク。

設計書 7.2 の懸念は「html2canvas がインライン SVG を描けない」だが、既存の
スコアシートの斜線は `<line>` の `stroke` を CSS クラスで当てている。html2canvas は
SVG を単体に切り出してから画像化するのでページの CSS が効かず、線が消えたと考えられる。
**属性に直接色を書けば描ける**、という仮説をここで検証する。結果次第で Task 12 の
`ScoreEvolutionChart` の書き方が決まる。

**Files:**
- 変更なし（検証のみ）

**Interfaces:**
- Consumes: なし
- Produces: なし（結論を Task 12 の実装方針として使う）

- [ ] **Step 1: `.claude/launch.json` を用意する**

無ければ次の内容で作る。既にあれば `mbcscore` エントリがあるか確認し、無ければ足す。

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "mbcscore",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 5173
    }
  ]
}
```

- [ ] **Step 2: 開発サーバを起動する**

preview_start に `{name: "mbcscore"}` を渡す。Bash で `npm run dev` を叩かないこと。

- [ ] **Step 3: 2通りの SVG を注入して html2canvas に描かせる**

javascript_tool で次を実行する。CSS クラスで色を当てた SVG と、属性で色を書いた SVG を
並べ、それぞれを html2canvas に通して、赤い画素が残るかを数える。

```js
(async () => {
  const style = document.createElement('style');
  style.textContent = '.spike-css line { stroke: #ff0000; stroke-width: 4px; }';
  document.head.appendChild(style);

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;background:#ffffff;width:200px;z-index:99999';
  host.innerHTML = `
    <div id="spike-a" style="width:200px;height:60px;background:#ffffff">
      <svg class="spike-css" width="200" height="60"><line x1="0" y1="0" x2="200" y2="60" /></svg>
    </div>
    <div id="spike-b" style="width:200px;height:60px;background:#ffffff">
      <svg width="200" height="60"><line x1="0" y1="0" x2="200" y2="60" stroke="#ff0000" stroke-width="4" /></svg>
    </div>`;
  document.body.appendChild(host);

  const { default: html2canvas } = await import('/node_modules/html2canvas/dist/html2canvas.esm.js');

  const countRed = async (id) => {
    const canvas = await html2canvas(document.getElementById(id), { backgroundColor: '#ffffff', scale: 1 });
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 180 && data[i + 1] < 90 && data[i + 2] < 90) n++;
    }
    return n;
  };

  const result = { cssClass: await countRed('spike-a'), attribute: await countRed('spike-b') };
  host.remove();
  style.remove();
  return result;
})()
```

- [ ] **Step 4: 結果を読む**

期待: `attribute` が 100 以上（線が描かれている）。`cssClass` は 0 に近いはず。

- `attribute > 100` → 仮説どおり。Task 12 は属性に色を書く方式で進める
- `attribute` も 0 に近い → html2canvas が SVG 自体を描けない。**Task 12 を
  `<canvas>` 描画に切り替える**。この場合、計画のこの箇所に「canvas方式へ変更」と
  追記してから先へ進むこと（html2canvas は canvas 要素の中身をそのままコピーできる）

- [ ] **Step 5: 結論を計画に書き残す**

この Task の下に結論を1行追記してコミットする。実装中に迷ったとき、ここを見れば
なぜその方式なのかが分かるようにする。

```bash
git add docs/superpowers/plans/2026-08-23-team-stats-comparison.md
git commit -m "docs(plan): 出力スパイクの結論を記録"
```

**結論（Step 5 でここに記入する）:** _未実施_

---

### Task 2: 「選手不明」集計を共有ユーティリティに切り出す

`StatsPanel` の中にある `sumUnknownStats` を、比較画面からも使えるように独立させる。
中身は変えない。動きが変わらないことは既存の `StatsPanel` のテストが保証する。

**Files:**
- Create: `src/utils/unknownStats.ts`
- Create: `src/utils/unknownStats.test.ts`
- Modify: `src/components/StatsPanel/StatsPanel.tsx`（ローカル関数を削除して import に置き換え）

**Interfaces:**
- Consumes: `PlayerStats`, `StatEntry`, `createInitialStats`（`src/types/game`）
- Produces: `sumUnknownStats(statHistory: StatEntry[], teamId: string): PlayerStats | null`
  — 対象が0件なら `null` を返す

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/unknownStats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sumUnknownStats } from './unknownStats';
import type { StatEntry, StatType } from '../types/game';

function entry(statType: StatType, teamId = 'teamA', playerId = 'unknown'): StatEntry {
    return { id: `${statType}-${Math.random()}`, teamId, playerId, playerNumber: -1, statType, quarter: 1, timestamp: 0 };
}

describe('sumUnknownStats', () => {
    it('対象が無ければ null を返す', () => {
        expect(sumUnknownStats([], 'teamA')).toBeNull();
    });

    it('選手が決まっている記録は数えない', () => {
        expect(sumUnknownStats([entry('AST', 'teamA', 'p1')], 'teamA')).toBeNull();
    });

    it('相手チームの記録は数えない', () => {
        expect(sumUnknownStats([entry('AST', 'teamB')], 'teamA')).toBeNull();
    });

    it('種別ごとに数える', () => {
        const stats = sumUnknownStats([entry('OREB'), entry('DREB'), entry('AST'), entry('2PA')], 'teamA');
        expect(stats?.offensiveRebounds).toBe(1);
        expect(stats?.defensiveRebounds).toBe(1);
        expect(stats?.assists).toBe(1);
        expect(stats?.twoPointAttempt).toBe(1);
    });

    it('TOの内訳は合計にも足す', () => {
        const stats = sumUnknownStats([entry('TO:DD'), entry('TO:PM')], 'teamA');
        expect(stats?.turnovers).toBe(2);
        expect(stats?.turnoverDD).toBe(1);
        expect(stats?.turnoverPM).toBe(1);
    });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
npm test -- src/utils/unknownStats.test.ts
```

期待: `Failed to resolve import "./unknownStats"` で失敗する。

- [ ] **Step 3: `src/utils/unknownStats.ts` を作る**

`StatsPanel.tsx` の `sumUnknownStats` をそのまま移す。

```ts
// 「選手不明」で記録した分の集計。
//
// 保留アクションを不明で解決すると playerId が 'unknown' の StatEntry になり、
// どの選手のスタッツにも入らない。チーム合計は選手スタッツの総和で作るので、
// これを足さないと「チーム統計に記録」したはずの分がどの数字にも現れない。
//
// 統計パネルとチーム比較の両方が同じ足し方をする必要があるため、ここに置く。

import type { PlayerStats, StatEntry } from '../types/game';
import { createInitialStats } from '../types/game';

/** 'unknown' に割り当てられた記録をチーム分だけ集計する（無ければ null） */
export function sumUnknownStats(statHistory: StatEntry[], teamId: string): PlayerStats | null {
    const entries = statHistory.filter(s => s.playerId === 'unknown' && s.teamId === teamId);
    if (entries.length === 0) return null;

    const stats = createInitialStats();
    for (const { statType } of entries) {
        switch (statType) {
            case 'OREB': stats.offensiveRebounds++; break;
            case 'DREB': stats.defensiveRebounds++; break;
            case 'AST': stats.assists++; break;
            case 'STL': stats.steals++; break;
            case 'BLK': stats.blocks++; break;
            case 'TO': stats.turnovers++; break;
            case 'TO:DD': stats.turnovers++; stats.turnoverDD++; break;
            case 'TO:TR': stats.turnovers++; stats.turnoverTR++; break;
            case 'TO:PM': stats.turnovers++; stats.turnoverPM++; break;
            case 'TO:CM': stats.turnovers++; stats.turnoverCM++; break;
            case '2PA': stats.twoPointAttempt++; break;
            case '3PA': stats.threePointAttempt++; break;
            case 'FTA': stats.freeThrowAttempt++; break;
        }
    }
    return stats;
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npm test -- src/utils/unknownStats.test.ts
```

期待: 5件すべて PASS。

- [ ] **Step 5: `StatsPanel.tsx` を import に置き換える**

`StatsPanel.tsx` から関数定義とその上のコメントブロックを消し、import を足す。
`createInitialStats` と `PlayerStats` の import が他で使われていなければ整理する
（`PlayerStats` は `total` の型注釈で使っているので残す）。

```tsx
import { sumUnknownStats } from '../../utils/unknownStats';
```

- [ ] **Step 6: 既存テストが壊れていないことを確認する**

```bash
npm test -- src/components/StatsPanel
```

期待: すべて PASS。

- [ ] **Step 7: コミット**

```bash
git add src/utils/unknownStats.ts src/utils/unknownStats.test.ts src/components/StatsPanel/StatsPanel.tsx
git commit -m "refactor(stats): 選手不明の集計を共有ユーティリティへ切り出す"
```

---

### Task 3: `teamTotals.ts` — 「全体」の集計

**Files:**
- Create: `src/components/TeamComparison/teamTotals.ts`
- Create: `src/components/TeamComparison/teamTotals.all.test.ts`

**Interfaces:**
- Consumes: `sumUnknownStats`（Task 2）、`Team` / `ScoreEntry` / `StatEntry` / `FoulEntry`（`src/types/game`）
- Produces:
  - `type QuarterFilter = 'all' | number`
  - `interface TeamTotals`（下記の実装コードのとおり。全フィールド `number`）
  - `interface TeamTotalsInput { team: Team; teamId: string; scoreHistory: ScoreEntry[]; statHistory: StatEntry[]; foulHistory: FoulEntry[] }`
  - `computeTeamTotals(input: TeamTotalsInput, filter: QuarterFilter): TeamTotals`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TeamComparison/teamTotals.all.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeTeamTotals, type TeamTotalsInput } from './teamTotals';
import { createPlayer, createTeam } from '../../types/game';
import type { FoulRecord, StatEntry, StatType, Team } from '../../types/game';

function teamWith(players: ReturnType<typeof createPlayer>[]): Team {
    const team = createTeam('teamA', '白チーム', '');
    team.players = players;
    return team;
}

function input(team: Team, statHistory: StatEntry[] = []): TeamTotalsInput {
    return { team, teamId: 'teamA', scoreHistory: [], statHistory, foulHistory: [] };
}

function unknownEntry(statType: StatType): StatEntry {
    return { id: `u-${statType}`, teamId: 'teamA', playerId: 'unknown', playerNumber: -1, statType, quarter: 1, timestamp: 0 };
}

const P = (): FoulRecord => ({ type: 'P', freeThrows: 0 });

describe('computeTeamTotals（全体）', () => {
    it('選手が居なければ全項目0', () => {
        const totals = computeTeamTotals(input(teamWith([])), 'all');
        expect(totals.points).toBe(0);
        expect(totals.twoAttempt).toBe(0);
        expect(totals.fouls).toBe(0);
    });

    it('選手スタッツを合計する', () => {
        const a = createPlayer('p1', 4, '一郎');
        a.stats.points = 10;
        a.stats.twoPointMade = 3;
        a.stats.twoPointAttempt = 7;
        a.stats.offensiveRebounds = 2;
        const b = createPlayer('p2', 5, '二郎');
        b.stats.points = 5;
        b.stats.twoPointMade = 1;
        b.stats.twoPointAttempt = 4;
        b.stats.defensiveRebounds = 6;

        const totals = computeTeamTotals(input(teamWith([a, b])), 'all');
        expect(totals.points).toBe(15);
        expect(totals.twoMade).toBe(4);
        expect(totals.twoAttempt).toBe(11);
        expect(totals.offensiveRebounds).toBe(2);
        expect(totals.defensiveRebounds).toBe(6);
    });

    it('選手不明で記録した分も足す', () => {
        const a = createPlayer('p1', 4, '一郎');
        a.stats.assists = 2;

        const totals = computeTeamTotals(input(teamWith([a]), [unknownEntry('AST'), unknownEntry('AST')]), 'all');
        expect(totals.assists).toBe(4);
    });

    it('ファウルは選手のファウル履歴の長さを合計する', () => {
        const a = createPlayer('p1', 4, '一郎');
        a.fouls = [P(), P(), P()];
        const b = createPlayer('p2', 5, '二郎');
        b.fouls = [P()];

        expect(computeTeamTotals(input(teamWith([a, b])), 'all').fouls).toBe(4);
    });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
npm test -- src/components/TeamComparison/teamTotals.all.test.ts
```

期待: `Failed to resolve import "./teamTotals"` で失敗する。

- [ ] **Step 3: `teamTotals.ts` を書く（全体の経路のみ）**

```ts
// チーム単位のスタッツ集計。
//
// 「全体」と「クォーター別」で計算元が違う。
//
//   全体       … 選手スタッツの合計＋「選手不明」分。隣に並ぶ StatsPanel の
//                 合計行と必ず一致させる必要があるため、同じ足し方をする
//   クォーター別 … 履歴からの再集計。選手スタッツは累計値しか持たないため、
//                 Q別はこちらでしか出せない
//
// 両者が食い違うのは、どこかの reducer が選手スタッツを動かしたのに履歴を
// 書いていないということ。teamTotals.consistency.test.ts でそこを見張っている。

import type { FoulEntry, ScoreEntry, StatEntry, Team } from '../../types/game';
import { sumUnknownStats } from '../../utils/unknownStats';

/** 'all' は試合全体。数値はそのクォーター（5以降は延長） */
export type QuarterFilter = 'all' | number;

export interface TeamTotals {
    points: number;
    twoMade: number;
    twoAttempt: number;
    threeMade: number;
    threeAttempt: number;
    ftMade: number;
    ftAttempt: number;
    offensiveRebounds: number;
    defensiveRebounds: number;
    assists: number;
    steals: number;
    blocks: number;
    turnovers: number;
    /** 選手のファウルのみ。コーチ・ベンチは含めない（StatsPanel の合計行と同じ） */
    fouls: number;
}

export interface TeamTotalsInput {
    team: Team;
    teamId: string;
    scoreHistory: ScoreEntry[];
    statHistory: StatEntry[];
    foulHistory: FoulEntry[];
}

function emptyTotals(): TeamTotals {
    return {
        points: 0,
        twoMade: 0, twoAttempt: 0,
        threeMade: 0, threeAttempt: 0,
        ftMade: 0, ftAttempt: 0,
        offensiveRebounds: 0, defensiveRebounds: 0,
        assists: 0, steals: 0, blocks: 0, turnovers: 0,
        fouls: 0,
    };
}

export function computeTeamTotals(input: TeamTotalsInput, filter: QuarterFilter): TeamTotals {
    return filter === 'all' ? totalsFromPlayers(input) : emptyTotals();
}

function totalsFromPlayers({ team, teamId, statHistory }: TeamTotalsInput): TeamTotals {
    const totals = emptyTotals();

    for (const p of team.players) {
        totals.points += p.stats.points;
        totals.twoMade += p.stats.twoPointMade;
        totals.twoAttempt += p.stats.twoPointAttempt;
        totals.threeMade += p.stats.threePointMade;
        totals.threeAttempt += p.stats.threePointAttempt;
        totals.ftMade += p.stats.freeThrowMade;
        totals.ftAttempt += p.stats.freeThrowAttempt;
        totals.offensiveRebounds += p.stats.offensiveRebounds;
        totals.defensiveRebounds += p.stats.defensiveRebounds;
        totals.assists += p.stats.assists;
        totals.steals += p.stats.steals;
        totals.blocks += p.stats.blocks;
        totals.turnovers += p.stats.turnovers;
        // ファウルは PlayerStats に無く、履歴の配列長がそのまま本数になる
        totals.fouls += p.fouls.length;
    }

    const unknown = sumUnknownStats(statHistory, teamId);
    if (unknown) {
        totals.points += unknown.points;
        totals.twoMade += unknown.twoPointMade;
        totals.twoAttempt += unknown.twoPointAttempt;
        totals.threeMade += unknown.threePointMade;
        totals.threeAttempt += unknown.threePointAttempt;
        totals.ftMade += unknown.freeThrowMade;
        totals.ftAttempt += unknown.freeThrowAttempt;
        totals.offensiveRebounds += unknown.offensiveRebounds;
        totals.defensiveRebounds += unknown.defensiveRebounds;
        totals.assists += unknown.assists;
        totals.steals += unknown.steals;
        totals.blocks += unknown.blocks;
        totals.turnovers += unknown.turnovers;
        // 不明では記録できないので、ファウルは足すものが無い
    }

    return totals;
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npm test -- src/components/TeamComparison/teamTotals.all.test.ts
```

期待: 4件すべて PASS。

- [ ] **Step 5: コミット**

```bash
git add src/components/TeamComparison/teamTotals.ts src/components/TeamComparison/teamTotals.all.test.ts
git commit -m "feat(comparison): チーム合計の集計（全体）"
```

---

### Task 4: `teamTotals.ts` — クォーター別の集計

**Files:**
- Modify: `src/components/TeamComparison/teamTotals.ts`
- Create: `src/components/TeamComparison/teamTotals.quarter.test.ts`

**Interfaces:**
- Consumes: Task 3 の `TeamTotalsInput` / `TeamTotals` / `QuarterFilter`
- Produces: `computeTeamTotals(input, 3)` のようにクォーター番号を渡すと、そのクォーターだけの集計を返す

集計の根拠:
- 成功したシュートは `ScoreEntry` だけを作り `StatEntry` を作らない（[scoreHandlers.ts:17](../../../src/context/reducers/scoreHandlers.ts)）
- 外したシュートは `StatEntry`（`2PA` / `3PA` / `FTA`）だけを作る（[statHandlers.ts:28](../../../src/context/reducers/statHandlers.ts)）
- したがって **試投数 = 成功数 + 対応する StatEntry の件数**
- オウンゴールは得点に数えるがシュート成績には数えない（選手スタッツ側と同じ）
- ファウルは `FoulEntry` のうち `isCoachOrBench === false` のもの

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TeamComparison/teamTotals.quarter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeTeamTotals, type TeamTotalsInput } from './teamTotals';
import { createTeam } from '../../types/game';
import type { FoulEntry, ScoreEntry, StatEntry, StatType } from '../../types/game';

function score(scoreType: ScoreEntry['scoreType'], quarter: number, extra: Partial<ScoreEntry> = {}): ScoreEntry {
    const points = scoreType === '3P' ? 3 : scoreType === '2P' ? 2 : 1;
    return {
        id: `s-${Math.random()}`, teamId: 'teamA', playerId: 'p1', playerNumber: 4,
        scoreType, points, quarter, timestamp: 0, runningScoreA: 0, runningScoreB: 0,
        ...extra,
    };
}

function stat(statType: StatType, quarter: number, teamId = 'teamA'): StatEntry {
    return { id: `t-${Math.random()}`, teamId, playerId: 'p1', playerNumber: 4, statType, quarter, timestamp: 0 };
}

function foul(quarter: number, isCoachOrBench = false): FoulEntry {
    return {
        id: `f-${Math.random()}`, teamId: 'teamA', playerId: isCoachOrBench ? null : 'p1',
        playerNumber: isCoachOrBench ? -1 : 4, foulType: 'P', quarter, timestamp: 0, isCoachOrBench,
    };
}

function input(over: Partial<TeamTotalsInput> = {}): TeamTotalsInput {
    return {
        team: createTeam('teamA', '白チーム', ''),
        teamId: 'teamA',
        scoreHistory: [], statHistory: [], foulHistory: [],
        ...over,
    };
}

describe('computeTeamTotals（クォーター別）', () => {
    it('指定したクォーターの得点だけ数える', () => {
        const totals = computeTeamTotals(input({ scoreHistory: [score('2P', 1), score('2P', 2), score('3P', 2)] }), 2);
        expect(totals.points).toBe(5);
    });

    it('相手チームの記録は数えない', () => {
        const other = score('2P', 1, { teamId: 'teamB' });
        expect(computeTeamTotals(input({ scoreHistory: [score('2P', 1), other] }), 1).points).toBe(2);
    });

    it('試投数は成功と外しの合計になる', () => {
        const totals = computeTeamTotals(
            input({ scoreHistory: [score('2P', 1), score('2P', 1)], statHistory: [stat('2PA', 1), stat('2PA', 1), stat('2PA', 1)] }),
            1,
        );
        expect(totals.twoMade).toBe(2);
        expect(totals.twoAttempt).toBe(5);
    });

    it('3PとFTも同じように数える', () => {
        const totals = computeTeamTotals(
            input({ scoreHistory: [score('3P', 1), score('FT', 1)], statHistory: [stat('3PA', 1), stat('FTA', 1)] }),
            1,
        );
        expect(totals.threeMade).toBe(1);
        expect(totals.threeAttempt).toBe(2);
        expect(totals.ftMade).toBe(1);
        expect(totals.ftAttempt).toBe(2);
    });

    it('オウンゴールは得点に数えるがシュート成績には数えない', () => {
        const totals = computeTeamTotals(input({ scoreHistory: [score('2P', 1, { isOwnGoal: true })] }), 1);
        expect(totals.points).toBe(2);
        expect(totals.twoMade).toBe(0);
        expect(totals.twoAttempt).toBe(0);
    });

    it('リバウンド・AST・ST・BS・TOを数える', () => {
        const totals = computeTeamTotals(
            input({ statHistory: [stat('OREB', 1), stat('DREB', 1), stat('AST', 1), stat('STL', 1), stat('BLK', 1), stat('TO:DD', 1)] }),
            1,
        );
        expect(totals.offensiveRebounds).toBe(1);
        expect(totals.defensiveRebounds).toBe(1);
        expect(totals.assists).toBe(1);
        expect(totals.steals).toBe(1);
        expect(totals.blocks).toBe(1);
        expect(totals.turnovers).toBe(1);
    });

    it('選手不明の記録もクォーター別に数える', () => {
        const unknown: StatEntry = { id: 'u1', teamId: 'teamA', playerId: 'unknown', playerNumber: -1, statType: 'AST', quarter: 3, timestamp: 0 };
        expect(computeTeamTotals(input({ statHistory: [unknown] }), 3).assists).toBe(1);
    });

    it('コーチ・ベンチのファウルは数えない', () => {
        const totals = computeTeamTotals(input({ foulHistory: [foul(1), foul(1), foul(1, true)] }), 1);
        expect(totals.fouls).toBe(2);
    });

    it('延長のクォーターも数えられる', () => {
        expect(computeTeamTotals(input({ scoreHistory: [score('2P', 5)] }), 5).points).toBe(2);
    });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
npm test -- src/components/TeamComparison/teamTotals.quarter.test.ts
```

期待: すべて失敗（`emptyTotals()` を返しているため 0 が返る）。

- [ ] **Step 3: `teamTotals.ts` にクォーター別の経路を足す**

`computeTeamTotals` の分岐を差し替え、`totalsFromHistory` を追加する。

```ts
export function computeTeamTotals(input: TeamTotalsInput, filter: QuarterFilter): TeamTotals {
    return filter === 'all' ? totalsFromPlayers(input) : totalsFromHistory(input, filter);
}

function totalsFromHistory(
    { teamId, scoreHistory, statHistory, foulHistory }: TeamTotalsInput,
    quarter: number,
): TeamTotals {
    const totals = emptyTotals();

    for (const entry of scoreHistory) {
        if (entry.teamId !== teamId || entry.quarter !== quarter) continue;
        totals.points += entry.points;
        // OGは得点だけ。シュートを打った選手の成績にはしない（選手スタッツ側と同じ）
        if (entry.isOwnGoal) continue;
        if (entry.scoreType === '2P') totals.twoMade++;
        else if (entry.scoreType === '3P') totals.threeMade++;
        else totals.ftMade++;
    }

    for (const entry of statHistory) {
        if (entry.teamId !== teamId || entry.quarter !== quarter) continue;
        switch (entry.statType) {
            case 'OREB': totals.offensiveRebounds++; break;
            case 'DREB': totals.defensiveRebounds++; break;
            case 'AST': totals.assists++; break;
            case 'STL': totals.steals++; break;
            case 'BLK': totals.blocks++; break;
            case 'TO':
            case 'TO:DD':
            case 'TO:TR':
            case 'TO:PM':
            case 'TO:CM': totals.turnovers++; break;
            // 外したシュート。成功分は ScoreEntry 側で数えているので、
            // ここに足すと試投数になる
            case '2PA': totals.twoAttempt++; break;
            case '3PA': totals.threeAttempt++; break;
            case 'FTA': totals.ftAttempt++; break;
        }
    }

    totals.twoAttempt += totals.twoMade;
    totals.threeAttempt += totals.threeMade;
    totals.ftAttempt += totals.ftMade;

    for (const entry of foulHistory) {
        if (entry.teamId !== teamId || entry.quarter !== quarter) continue;
        if (entry.isCoachOrBench) continue;
        totals.fouls++;
    }

    return totals;
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npm test -- src/components/TeamComparison/teamTotals
```

期待: Task 3 の4件と合わせてすべて PASS。

- [ ] **Step 5: コミット**

```bash
git add src/components/TeamComparison/teamTotals.ts src/components/TeamComparison/teamTotals.quarter.test.ts
git commit -m "feat(comparison): チーム合計の集計（クォーター別）"
```

---

### Task 5: 集計2経路の整合性テスト

「履歴から計算した全クォーターの和」と「選手スタッツの合計」が一致することを固定する。
比較画面のためだけでなく、記録系の回帰検知として置く。

**Files:**
- Create: `src/components/TeamComparison/teamTotals.consistency.test.ts`

**Interfaces:**
- Consumes: `computeTeamTotals`（Task 3・4）、`gameReducer`（`src/context/GameContext` の reducer）
- Produces: なし（テストのみ）

- [ ] **Step 1: reducer の公開名を確認する**

```bash
grep -n "export" src/context/GameContext.tsx | head -20
```

reducer が外へ出ていない場合は、代わりに `src/context/reducers/index.ts` の
ディスパッチ表を使う。テストのコード中の import 名は、ここで確認した実際の名前に
合わせること。

- [ ] **Step 2: テストを書く**

`src/components/TeamComparison/teamTotals.consistency.test.ts`。
`gameReducer` の import 元と名前は Step 1 の結果に合わせる。

```ts
import { describe, it, expect } from 'vitest';
import { computeTeamTotals, type TeamTotalsInput, type TeamTotals } from './teamTotals';
import { gameReducer } from '../../context/GameContext';
import { createInitialGame, createPlayer, MAX_QUARTERS } from '../../types/game';
import type { Game } from '../../types/game';

/** 記録操作を一通り流した試合を作る */
function playedGame(): Game {
    let game = createInitialGame();
    game = {
        ...game,
        phase: 'playing',
        teamA: { ...game.teamA, name: '白', players: [createPlayer('a1', 4, '一郎'), createPlayer('a2', 5, '二郎')] },
        teamB: { ...game.teamB, name: '青', players: [createPlayer('b1', 7, '三郎')] },
        showThreePoint: true,
    };

    const actions = [
        { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' } },
        { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'a2', scoreType: '3P' } },
        { type: 'ADD_SCORE', payload: { teamId: 'teamB', playerId: 'b1', scoreType: '2P' } },
        { type: 'ADD_STAT', payload: { teamId: 'teamA', playerId: 'a1', statType: '2PA' } },
        { type: 'ADD_STAT', payload: { teamId: 'teamA', playerId: 'a1', statType: 'OREB' } },
        { type: 'ADD_STAT', payload: { teamId: 'teamA', playerId: 'a2', statType: 'DREB' } },
        { type: 'ADD_STAT', payload: { teamId: 'teamA', playerId: 'a2', statType: 'AST' } },
        { type: 'ADD_STAT', payload: { teamId: 'teamB', playerId: 'b1', statType: 'TO:PM' } },
        { type: 'NEXT_QUARTER', payload: {} },
        { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'a1', scoreType: 'FT' } },
        { type: 'ADD_STAT', payload: { teamId: 'teamA', playerId: 'a1', statType: 'FTA' } },
        { type: 'ADD_STAT', payload: { teamId: 'teamB', playerId: 'b1', statType: 'STL' } },
    ];

    // ディスパッチ表に無いアクション名で静かに素通りすると、比べる対象が
    // 空の試合になってテストが無意味に通る。状態が動いたことを確かめる
    for (const action of actions) {
        const next = gameReducer(game, action as never);
        expect(next).not.toBe(game);
        game = next;
    }
    return game;
}

function inputFor(game: Game, teamId: 'teamA' | 'teamB'): TeamTotalsInput {
    return {
        team: game[teamId],
        teamId,
        scoreHistory: game.scoreHistory,
        statHistory: game.statHistory,
        foulHistory: game.foulHistory,
    };
}

/** 全クォーターぶんを足し合わせる（延長も含める） */
function sumOfQuarters(input: TeamTotalsInput): TeamTotals {
    const quarters = new Set<number>([
        ...input.scoreHistory.map(s => s.quarter),
        ...input.statHistory.map(s => s.quarter),
        ...input.foulHistory.map(f => f.quarter),
    ]);
    for (let q = 1; q <= MAX_QUARTERS; q++) quarters.add(q);

    // 0 は存在しないクォーターなので、全項目0の器が返る
    const acc = computeTeamTotals(input, 0);
    for (const q of quarters) {
        const totals = computeTeamTotals(input, q);
        for (const key of Object.keys(acc) as (keyof TeamTotals)[]) acc[key] += totals[key];
    }
    return acc;
}

describe('集計2経路の整合性', () => {
    it('履歴から計算したクォーターの和が、選手スタッツの合計と一致する', () => {
        const game = playedGame();

        for (const teamId of ['teamA', 'teamB'] as const) {
            const input = inputFor(game, teamId);
            expect(sumOfQuarters(input)).toEqual(computeTeamTotals(input, 'all'));
        }
    });
});
```

- [ ] **Step 3: テストを実行する**

```bash
npm test -- src/components/TeamComparison/teamTotals.consistency.test.ts
```

期待: PASS。

**落ちた場合は集計側を疑う前に差分を読むこと。** どのフィールドがずれたかを
`expect(...).toEqual(...)` の出力で確認し、

- 集計の取りこぼし（例: `TO` の内訳を合計に足し忘れ）なら `teamTotals.ts` を直す
- 履歴に無い経路で選手スタッツが動いていたなら、それは**このアプリの記録側のバグ**。
  勝手に直さず、どのアクションでずれたかを添えて報告する

- [ ] **Step 4: コミット**

```bash
git add src/components/TeamComparison/teamTotals.consistency.test.ts
git commit -m "test(comparison): 集計2経路が一致することを固定する"
```

---

### Task 6: `quarterScores.ts` — クォーター別得点と記録のあるクォーター

**Files:**
- Create: `src/components/TeamComparison/quarterScores.ts`
- Create: `src/components/TeamComparison/quarterScores.test.ts`

**Interfaces:**
- Consumes: `ScoreEntry`（`src/types/game`）、`MAX_QUARTERS`
- Produces:
  - `interface QuarterScore { quarter: number; teamA: number; teamB: number }`
  - `computeQuarterScores(scoreHistory: ScoreEntry[]): QuarterScore[]` — Q1〜Q4 は
    得点が無くても必ず含む。延長は記録があるときだけ含む。クォーター昇順
  - `recordedQuarters(scoreHistory: ScoreEntry[]): number[]` — 上と同じ集合の番号だけ

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TeamComparison/quarterScores.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeQuarterScores, recordedQuarters } from './quarterScores';
import type { ScoreEntry } from '../../types/game';

function score(teamId: string, quarter: number, points: number): ScoreEntry {
    return {
        id: `s-${Math.random()}`, teamId, playerId: 'p1', playerNumber: 4,
        scoreType: points === 3 ? '3P' : points === 2 ? '2P' : 'FT',
        points, quarter, timestamp: 0, runningScoreA: 0, runningScoreB: 0,
    };
}

describe('computeQuarterScores', () => {
    it('記録が無くてもQ1〜Q4を返す', () => {
        expect(computeQuarterScores([])).toEqual([
            { quarter: 1, teamA: 0, teamB: 0 },
            { quarter: 2, teamA: 0, teamB: 0 },
            { quarter: 3, teamA: 0, teamB: 0 },
            { quarter: 4, teamA: 0, teamB: 0 },
        ]);
    });

    it('クォーターごとにチーム別で足す', () => {
        const rows = computeQuarterScores([score('teamA', 1, 2), score('teamA', 1, 3), score('teamB', 1, 2), score('teamA', 3, 1)]);
        expect(rows[0]).toEqual({ quarter: 1, teamA: 5, teamB: 2 });
        expect(rows[2]).toEqual({ quarter: 3, teamA: 1, teamB: 0 });
    });

    it('オウンゴールも得点として数える', () => {
        const og: ScoreEntry = { ...score('teamA', 1, 2), isOwnGoal: true };
        expect(computeQuarterScores([og])[0].teamA).toBe(2);
    });

    it('延長は記録があるときだけ足す', () => {
        expect(computeQuarterScores([]).length).toBe(4);
        const rows = computeQuarterScores([score('teamA', 5, 2)]);
        expect(rows.length).toBe(5);
        expect(rows[4]).toEqual({ quarter: 5, teamA: 2, teamB: 0 });
    });

    it('延長が飛んでいても昇順で返す', () => {
        const rows = computeQuarterScores([score('teamA', 6, 2), score('teamA', 5, 2)]);
        expect(rows.map(r => r.quarter)).toEqual([1, 2, 3, 4, 5, 6]);
    });
});

describe('recordedQuarters', () => {
    it('記録が無ければQ1〜Q4', () => {
        expect(recordedQuarters([])).toEqual([1, 2, 3, 4]);
    });

    it('延長があれば足す', () => {
        expect(recordedQuarters([score('teamA', 5, 2)])).toEqual([1, 2, 3, 4, 5]);
    });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
npm test -- src/components/TeamComparison/quarterScores.test.ts
```

期待: `Failed to resolve import "./quarterScores"` で失敗する。

- [ ] **Step 3: `quarterScores.ts` を書く**

```ts
// クォーター別得点。スコアヘッダーの表と、クォーター切替の選択肢の両方が使う。
//
// Q1〜Q4 は無得点でも列を出す（公式様式と同じで、空欄も情報になる）。
// 延長は「あった試合にだけ」出す。常に出すと、ほぼすべての試合で空の
// OT列が並ぶことになる。

import type { ScoreEntry } from '../../types/game';
import { MAX_QUARTERS } from '../../types/game';

export interface QuarterScore {
    quarter: number;
    teamA: number;
    teamB: number;
}

/** 記録のあるクォーターの番号（Q1〜Q4は常に含む）。昇順 */
export function recordedQuarters(scoreHistory: ScoreEntry[]): number[] {
    const quarters = new Set<number>();
    for (let q = 1; q <= MAX_QUARTERS; q++) quarters.add(q);
    for (const entry of scoreHistory) quarters.add(entry.quarter);
    return [...quarters].sort((a, b) => a - b);
}

export function computeQuarterScores(scoreHistory: ScoreEntry[]): QuarterScore[] {
    const rows = new Map<number, QuarterScore>();
    for (const quarter of recordedQuarters(scoreHistory)) {
        rows.set(quarter, { quarter, teamA: 0, teamB: 0 });
    }

    for (const entry of scoreHistory) {
        const row = rows.get(entry.quarter);
        if (!row) continue;
        // teamId は得点が入る側。オウンゴールもここに含まれる
        if (entry.teamId === 'teamA') row.teamA += entry.points;
        else if (entry.teamId === 'teamB') row.teamB += entry.points;
    }

    return [...rows.values()];
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npm test -- src/components/TeamComparison/quarterScores.test.ts
```

期待: 7件すべて PASS。

- [ ] **Step 5: コミット**

```bash
git add src/components/TeamComparison/quarterScores.ts src/components/TeamComparison/quarterScores.test.ts
git commit -m "feat(comparison): クォーター別得点の集計"
```

---

### Task 7: `comparisonRows.ts` — 比較表の行データを組み立てる

表示と計算を分ける。ここは「どの行を、どんな値とバー幅で出すか」だけを決める純関数。

**Files:**
- Create: `src/components/TeamComparison/comparisonRows.ts`
- Create: `src/components/TeamComparison/comparisonRows.test.ts`

**Interfaces:**
- Consumes: `TeamTotals`（Task 3）
- Produces:
  - `interface ComparisonRow { key: string; label: string; leftText: string; rightText: string; leftRatio: number; rightRatio: number; leader: 'left' | 'right' | 'none'; unavailable: boolean }`
    - `leftRatio` / `rightRatio` は 0〜1
    - `leader` は濃色にする側。`unavailable` が true の行はバーを描かない
  - `buildComparisonRows(left: TeamTotals, right: TeamTotals, options: { threePointUnused: boolean }): ComparisonRow[]`

ルール:
- 割合の行（`FG%` / `2FG%` / `3FG%` / `FT%`）は 0〜100% の絶対スケール（`ratio = percent / 100`）
- 実数の行は、その行の左右のうち大きい方を 1 とした相対スケール。両方0なら両方0
- `leader` は値が大きい側。ただし **`TO` と `F` は少ない方**（多い方を強調すると意味が逆に読める）
- 同値なら `'none'`
- `threePointUnused` が true のとき、`3FG` と `3FG%` の行は `leftText`/`rightText` が
  `'—'`、`ratio` が 0、`leader` が `'none'`、`unavailable` が true になる

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TeamComparison/comparisonRows.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildComparisonRows, type ComparisonRow } from './comparisonRows';
import type { TeamTotals } from './teamTotals';

function totals(over: Partial<TeamTotals> = {}): TeamTotals {
    return {
        points: 0, twoMade: 0, twoAttempt: 0, threeMade: 0, threeAttempt: 0,
        ftMade: 0, ftAttempt: 0, offensiveRebounds: 0, defensiveRebounds: 0,
        assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0,
        ...over,
    };
}

function rowOf(rows: ComparisonRow[], key: string): ComparisonRow {
    const row = rows.find(r => r.key === key);
    if (!row) throw new Error(`行が無い: ${key}`);
    return row;
}

const opts = { threePointUnused: false };

describe('buildComparisonRows', () => {
    it('実数の行は大きい方を1とした比率になる', () => {
        const rows = buildComparisonRows(totals({ points: 85 }), totals({ points: 42 }), opts);
        const pts = rowOf(rows, 'points');
        expect(pts.leftRatio).toBe(1);
        expect(pts.rightRatio).toBeCloseTo(42 / 85);
        expect(pts.leader).toBe('left');
    });

    it('左右とも0なら比率は両方0で、優劣も付けない', () => {
        const pts = rowOf(buildComparisonRows(totals(), totals(), opts), 'points');
        expect(pts.leftRatio).toBe(0);
        expect(pts.rightRatio).toBe(0);
        expect(pts.leader).toBe('none');
    });

    it('割合の行は0〜100%の絶対スケールになる', () => {
        const rows = buildComparisonRows(
            totals({ twoMade: 15, twoAttempt: 30 }),
            totals({ twoMade: 5, twoAttempt: 20 }),
            opts,
        );
        const pct = rowOf(rows, 'twoPercent');
        expect(pct.leftText).toBe('50.0%');
        expect(pct.leftRatio).toBeCloseTo(0.5);
        expect(pct.rightRatio).toBeCloseTo(0.25);
    });

    it('試投0の割合は「-」にして比率0にする', () => {
        const pct = rowOf(buildComparisonRows(totals(), totals(), opts), 'twoPercent');
        expect(pct.leftText).toBe('-');
        expect(pct.leftRatio).toBe(0);
    });

    it('FGは2Pと3Pの合計で出す', () => {
        const rows = buildComparisonRows(
            totals({ twoMade: 3, twoAttempt: 6, threeMade: 1, threeAttempt: 4 }),
            totals(),
            opts,
        );
        expect(rowOf(rows, 'fieldGoal').leftText).toBe('4/10');
    });

    it('REBはOR+DRで出す', () => {
        const rows = buildComparisonRows(totals({ offensiveRebounds: 15, defensiveRebounds: 27 }), totals(), opts);
        expect(rowOf(rows, 'rebounds').leftText).toBe('42');
    });

    it('TOは少ない方を強調する', () => {
        const to = rowOf(buildComparisonRows(totals({ turnovers: 9 }), totals({ turnovers: 20 }), opts), 'turnovers');
        expect(to.leader).toBe('left');
        // バーの長さは値そのものなので、多い側が長い
        expect(to.rightRatio).toBe(1);
    });

    it('ファウルも少ない方を強調する', () => {
        const f = rowOf(buildComparisonRows(totals({ fouls: 12 }), totals({ fouls: 4 }), opts), 'fouls');
        expect(f.leader).toBe('right');
    });

    it('3P未使用なら3Pの行は「—」でバーを描かない', () => {
        const rows = buildComparisonRows(totals(), totals(), { threePointUnused: true });
        for (const key of ['threePoint', 'threePercent']) {
            const row = rowOf(rows, key);
            expect(row.leftText).toBe('—');
            expect(row.rightText).toBe('—');
            expect(row.leftRatio).toBe(0);
            expect(row.rightRatio).toBe(0);
            expect(row.leader).toBe('none');
            expect(row.unavailable).toBe(true);
        }
    });

    it('3P未使用でも行そのものは消さない', () => {
        const rows = buildComparisonRows(totals(), totals(), { threePointUnused: true });
        expect(rows.map(r => r.key)).toContain('threePoint');
    });

    it('3P未使用のときFGは2Pだけで出す', () => {
        const rows = buildComparisonRows(totals({ twoMade: 3, twoAttempt: 6 }), totals(), { threePointUnused: true });
        expect(rowOf(rows, 'fieldGoal').leftText).toBe('3/6');
    });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
npm test -- src/components/TeamComparison/comparisonRows.test.ts
```

期待: `Failed to resolve import "./comparisonRows"` で失敗する。

- [ ] **Step 3: `comparisonRows.ts` を書く**

```ts
// 比較表の行データ。表示コンポーネントは、ここで決まった文字列と比率を描くだけにする。
//
// バーの長さの決め方が2種類あるのは意図的。
//   割合の行 … 0〜100%の絶対スケール。48.4%と44.8%がほぼ同じ長さで出るのが正しく、
//              左右の最大値で割ると僅差が大差に見える
//   実数の行 … その行の左右の大きい方を1とした相対スケール
//
// 濃色にする側（leader）は基本的に値が大きい方だが、TOとファウルだけは
// 少ない方にする。多い方を強調すると意味が逆に読める。

import type { TeamTotals } from './teamTotals';

export interface ComparisonRow {
    key: string;
    label: string;
    leftText: string;
    rightText: string;
    /** 0〜1。バーの長さ */
    leftRatio: number;
    rightRatio: number;
    /** 濃色にする側 */
    leader: 'left' | 'right' | 'none';
    /** この試合では記録し得ない行（3P未使用）。バーを描かない */
    unavailable: boolean;
}

export interface BuildOptions {
    /** 3Pを使わない試合か（設定OFFかつ記録0件のときだけ true） */
    threePointUnused: boolean;
}

/** 試投0のときは割合を出さない。0.0% と「打っていない」は違う */
function percentText(made: number, attempt: number): string {
    if (attempt === 0) return '-';
    return `${((made / attempt) * 100).toFixed(1)}%`;
}

function percentRatio(made: number, attempt: number): number {
    return attempt === 0 ? 0 : made / attempt;
}

function shotText(made: number, attempt: number): string {
    return `${made}/${attempt}`;
}

type Direction = 'higher' | 'lower';

function ratios(left: number, right: number): { leftRatio: number; rightRatio: number } {
    const max = Math.max(left, right);
    if (max <= 0) return { leftRatio: 0, rightRatio: 0 };
    return { leftRatio: left / max, rightRatio: right / max };
}

function leaderOf(left: number, right: number, direction: Direction): ComparisonRow['leader'] {
    if (left === right) return 'none';
    const leftWins = direction === 'higher' ? left > right : left < right;
    return leftWins ? 'left' : 'right';
}

function countRow(key: string, label: string, left: number, right: number, direction: Direction = 'higher'): ComparisonRow {
    return {
        key, label,
        leftText: String(left),
        rightText: String(right),
        ...ratios(left, right),
        leader: leaderOf(left, right, direction),
        unavailable: false,
    };
}

function shotRow(key: string, label: string, left: [number, number], right: [number, number]): ComparisonRow {
    return {
        key, label,
        leftText: shotText(left[0], left[1]),
        rightText: shotText(right[0], right[1]),
        ...ratios(left[0], right[0]),
        leader: leaderOf(left[0], right[0], 'higher'),
        unavailable: false,
    };
}

function percentRow(key: string, label: string, left: [number, number], right: [number, number]): ComparisonRow {
    const leftRatio = percentRatio(left[0], left[1]);
    const rightRatio = percentRatio(right[0], right[1]);
    return {
        key, label,
        leftText: percentText(left[0], left[1]),
        rightText: percentText(right[0], right[1]),
        // 割合は絶対スケール。相対にすると僅差が大差に見える
        leftRatio, rightRatio,
        leader: leaderOf(leftRatio, rightRatio, 'higher'),
        unavailable: false,
    };
}

/** 3Pを使わない試合の行。行そのものは残し、値の代わりに長音記号を出す */
function unavailableRow(key: string, label: string): ComparisonRow {
    return { key, label, leftText: '—', rightText: '—', leftRatio: 0, rightRatio: 0, leader: 'none', unavailable: true };
}

export function buildComparisonRows(left: TeamTotals, right: TeamTotals, options: BuildOptions): ComparisonRow[] {
    // 3Pを使わない試合では、FGは2Pだけで出す。0本の3Pを分母に混ぜても
    // 値は変わらないが、「3Pを含む指標」に見えるのを避ける
    const fg = (t: TeamTotals): [number, number] => options.threePointUnused
        ? [t.twoMade, t.twoAttempt]
        : [t.twoMade + t.threeMade, t.twoAttempt + t.threeAttempt];

    return [
        countRow('points', 'PTS', left.points, right.points),
        shotRow('fieldGoal', 'FGM-FGA', fg(left), fg(right)),
        percentRow('fieldGoalPercent', 'FG%', fg(left), fg(right)),
        shotRow('twoPoint', '2FG', [left.twoMade, left.twoAttempt], [right.twoMade, right.twoAttempt]),
        percentRow('twoPercent', '2FG%', [left.twoMade, left.twoAttempt], [right.twoMade, right.twoAttempt]),
        options.threePointUnused
            ? unavailableRow('threePoint', '3FG')
            : shotRow('threePoint', '3FG', [left.threeMade, left.threeAttempt], [right.threeMade, right.threeAttempt]),
        options.threePointUnused
            ? unavailableRow('threePercent', '3FG%')
            : percentRow('threePercent', '3FG%', [left.threeMade, left.threeAttempt], [right.threeMade, right.threeAttempt]),
        shotRow('freeThrow', 'FT', [left.ftMade, left.ftAttempt], [right.ftMade, right.ftAttempt]),
        percentRow('freeThrowPercent', 'FT%', [left.ftMade, left.ftAttempt], [right.ftMade, right.ftAttempt]),
        countRow('rebounds', 'REB', left.offensiveRebounds + left.defensiveRebounds, right.offensiveRebounds + right.defensiveRebounds),
        countRow('offensiveRebounds', 'OR', left.offensiveRebounds, right.offensiveRebounds),
        countRow('defensiveRebounds', 'DR', left.defensiveRebounds, right.defensiveRebounds),
        countRow('assists', 'AST', left.assists, right.assists),
        countRow('turnovers', 'TO', left.turnovers, right.turnovers, 'lower'),
        countRow('steals', 'ST', left.steals, right.steals),
        countRow('blocks', 'BS', left.blocks, right.blocks),
        countRow('fouls', 'F', left.fouls, right.fouls, 'lower'),
    ];
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npm test -- src/components/TeamComparison/comparisonRows.test.ts
```

期待: 11件すべて PASS。

- [ ] **Step 5: コミット**

```bash
git add src/components/TeamComparison/comparisonRows.ts src/components/TeamComparison/comparisonRows.test.ts
git commit -m "feat(comparison): 比較表の行データ組み立て"
```

---

### Task 8: `threePointUsage.ts` — 3Pを使わない試合の判定

**Files:**
- Create: `src/components/TeamComparison/threePointUsage.ts`
- Create: `src/components/TeamComparison/threePointUsage.test.ts`

**Interfaces:**
- Consumes: `ScoreEntry` / `StatEntry`
- Produces: `isThreePointUnused(showThreePoint: boolean | undefined, scoreHistory: ScoreEntry[], statHistory: StatEntry[]): boolean`

判定:

| `showThreePoint` | 3Pの記録 | 戻り値 |
|---|---|---|
| `false` | 0件 | `true`（未使用） |
| `false` | あり | `false`（途中で設定を変えた試合。記録があるのに未使用と出すのは事実に反する） |
| `true` | 問わず | `false` |
| `undefined`（古い記録） | 問わず | `false`（使用扱い。記録が無いのか使っていないのか判別できない） |

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TeamComparison/threePointUsage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isThreePointUnused } from './threePointUsage';
import type { ScoreEntry, StatEntry } from '../../types/game';

const threeMade: ScoreEntry = {
    id: 's1', teamId: 'teamA', playerId: 'p1', playerNumber: 4,
    scoreType: '3P', points: 3, quarter: 1, timestamp: 0, runningScoreA: 3, runningScoreB: 0,
};

const threeMissed: StatEntry = {
    id: 't1', teamId: 'teamA', playerId: 'p1', playerNumber: 4, statType: '3PA', quarter: 1, timestamp: 0,
};

describe('isThreePointUnused', () => {
    it('設定OFFで記録も無ければ未使用', () => {
        expect(isThreePointUnused(false, [], [])).toBe(true);
    });

    it('設定OFFでも成功の記録があれば未使用にしない', () => {
        expect(isThreePointUnused(false, [threeMade], [])).toBe(false);
    });

    it('設定OFFでも外した記録があれば未使用にしない', () => {
        expect(isThreePointUnused(false, [], [threeMissed])).toBe(false);
    });

    it('設定ONなら未使用にしない', () => {
        expect(isThreePointUnused(true, [], [])).toBe(false);
    });

    it('設定が保存されていない古い記録は使用扱い', () => {
        expect(isThreePointUnused(undefined, [], [])).toBe(false);
    });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
npm test -- src/components/TeamComparison/threePointUsage.test.ts
```

期待: `Failed to resolve import "./threePointUsage"` で失敗する。

- [ ] **Step 3: `threePointUsage.ts` を書く**

```ts
// 「この試合は3Pを使っていない」と言い切ってよいかの判定。
//
// showThreePoint は試合オプションから途中で変えられる。設定を見るだけだと、
// 前半だけ3Pを使って後半OFFにした試合で「未使用」と出てしまう。記録が
// 1つでもあれば、設定がどうであれ未使用とは言わない。
//
// 古い記録は showThreePoint 自体が保存されていない（optional）。この場合は
// 「使っていない」のか「そもそも分からない」のかを区別できないので、
// 使用扱いにして通常の 0/0 表示（formatShot と同じ「-」）に落とす。

import type { ScoreEntry, StatEntry } from '../../types/game';

export function isThreePointUnused(
    showThreePoint: boolean | undefined,
    scoreHistory: ScoreEntry[],
    statHistory: StatEntry[],
): boolean {
    if (showThreePoint !== false) return false;
    if (scoreHistory.some(s => s.scoreType === '3P')) return false;
    if (statHistory.some(s => s.statType === '3PA')) return false;
    return true;
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npm test -- src/components/TeamComparison/threePointUsage.test.ts
```

期待: 5件すべて PASS。

- [ ] **Step 5: コミット**

```bash
git add src/components/TeamComparison/threePointUsage.ts src/components/TeamComparison/threePointUsage.test.ts
git commit -m "feat(comparison): 3P未使用の判定"
```

---

### Task 9: `teamColors.ts` — チーム色を実際の色値に解決する

SVG と canvas は CSS 変数のまま描けない（出力時に単体へ切り出されて変数の定義を失う）。
描画に使う色は、ここで実際の色値に解決してから渡す。

**Files:**
- Create: `src/components/TeamComparison/teamColors.ts`
- Create: `src/components/TeamComparison/teamColors.test.ts`

**Interfaces:**
- Consumes: `Team['color']`（`'white' | 'blue'`）
- Produces:
  - `TEAM_COLOR_FALLBACK: Record<'white' | 'blue', string>`
  - `resolveTeamColor(color: 'white' | 'blue', element?: Element | null): string` —
    実際の色値（`#rrggbb` 等）を返す。`var(...)` は絶対に返さない

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TeamComparison/teamColors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveTeamColor, TEAM_COLOR_FALLBACK } from './teamColors';

describe('resolveTeamColor', () => {
    it('CSS変数が読めない環境では既定値を返す', () => {
        expect(resolveTeamColor('blue')).toBe(TEAM_COLOR_FALLBACK.blue);
        expect(resolveTeamColor('white')).toBe(TEAM_COLOR_FALLBACK.white);
    });

    it('var() をそのまま返さない', () => {
        expect(resolveTeamColor('blue')).not.toContain('var(');
    });

    it('CSS変数が読めればその値を返す', () => {
        const el = document.createElement('div');
        el.style.setProperty('--team-blue', '#123456');
        document.body.appendChild(el);

        expect(resolveTeamColor('blue', el)).toBe('#123456');

        el.remove();
    });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
npm test -- src/components/TeamComparison/teamColors.test.ts
```

期待: `Failed to resolve import "./teamColors"` で失敗する。

- [ ] **Step 3: `teamColors.ts` を書く**

```ts
// チーム色を「実際の色値」に解決する。
//
// 折れ線とドーナツは出力時に単体へ切り出されて描かれる（html2canvas はSVGを
// 別画像として、conic-gradient はPNGとして描き直す）。そのときページのCSSは
// 効かないので、var(--team-blue) のまま渡すと出力画像で色が消える。
// 描画に使う色は、ここで実値にしてから渡すこと。
//
// 既定値は index.css の --team-white / --team-blue と同じ値。実行時は
// CSS側を正とし、読めない環境（テストのjsdom）でだけこちらへ落ちる。

import type { Team } from '../../types/game';

export const TEAM_COLOR_FALLBACK: Record<Team['color'], string> = {
    white: '#e2e8f0',
    blue: '#3b82f6',
};

const CSS_VARIABLE: Record<Team['color'], string> = {
    white: '--team-white',
    blue: '--team-blue',
};

export function resolveTeamColor(color: Team['color'], element?: Element | null): string {
    const target = element ?? (typeof document === 'undefined' ? null : document.documentElement);
    if (!target) return TEAM_COLOR_FALLBACK[color];

    const value = getComputedStyle(target).getPropertyValue(CSS_VARIABLE[color]).trim();
    return value || TEAM_COLOR_FALLBACK[color];
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npm test -- src/components/TeamComparison/teamColors.test.ts
```

期待: 3件すべて PASS。3件目が落ちる場合、jsdom の `getComputedStyle` が
インラインのカスタムプロパティを返していない。その場合はテストを
`el.style.setProperty` ではなく `document.documentElement.style.setProperty` に
変えて、`resolveTeamColor('blue')` で確認する形に直す。

- [ ] **Step 5: コミット**

```bash
git add src/components/TeamComparison/teamColors.ts src/components/TeamComparison/teamColors.test.ts
git commit -m "feat(comparison): チーム色を実際の色値へ解決する"
```

---

### Task 10: `ComparisonTable` — 比較表とバー

**Files:**
- Create: `src/components/TeamComparison/ComparisonTable.tsx`
- Create: `src/components/TeamComparison/ComparisonTable.test.tsx`
- Create: `src/components/TeamComparison/TeamComparison.css`

**Interfaces:**
- Consumes: `ComparisonRow`（Task 7）
- Produces: `<ComparisonTable rows={rows} leftColor={string} rightColor={string} animate={boolean} threePointUnused={boolean} />`
  - ルート要素は `.comparison-table`
  - 各行は `.comparison-row`、`data-row-key` に `ComparisonRow.key` を持つ
  - バーは `.comparison-bar.left` / `.comparison-bar.right`。幅は `style.width` の `%`。
    **幅は常に最終値**で、`animate` はルートの `.is-animating` を付け外しするだけ。
    伸長は `transform: scaleX()` のキーフレームで見せる（width を動かすと、DOM上の
    幅が一時的に実際の値と食い違い、テストと出力の両方が伸びかけの値を見る）
  - 濃色側に `.is-leader` が付く
  - `unavailable` の行に `.is-unavailable` が付く
  - `threePointUnused` が true のとき、表の下に「この試合は3Pを使用していません」を1つ出す

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TeamComparison/ComparisonTable.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ComparisonTable } from './ComparisonTable';
import { buildComparisonRows } from './comparisonRows';
import type { TeamTotals } from './teamTotals';

afterEach(cleanup);

function totals(over: Partial<TeamTotals> = {}): TeamTotals {
    return {
        points: 0, twoMade: 0, twoAttempt: 0, threeMade: 0, threeAttempt: 0,
        ftMade: 0, ftAttempt: 0, offensiveRebounds: 0, defensiveRebounds: 0,
        assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0,
        ...over,
    };
}

function renderTable(left: TeamTotals, right: TeamTotals, threePointUnused = false) {
    const rows = buildComparisonRows(left, right, { threePointUnused });
    return render(
        <ComparisonTable rows={rows} leftColor="#3b82f6" rightColor="#e2e8f0" animate={false} threePointUnused={threePointUnused} />,
    );
}

function rowEl(key: string): HTMLElement {
    return document.querySelector(`[data-row-key="${key}"]`) as HTMLElement;
}

describe('ComparisonTable', () => {
    it('行のラベルと左右の値を出す', () => {
        renderTable(totals({ points: 85 }), totals({ points: 42 }));

        const row = rowEl('points');
        expect(row.textContent).toContain('PTS');
        expect(row.textContent).toContain('85');
        expect(row.textContent).toContain('42');
    });

    it('バーの幅を比率どおりに出す', () => {
        renderTable(totals({ points: 50 }), totals({ points: 25 }));

        const row = rowEl('points');
        expect((row.querySelector('.comparison-bar.left') as HTMLElement).style.width).toBe('100%');
        expect((row.querySelector('.comparison-bar.right') as HTMLElement).style.width).toBe('50%');
    });

    it('優勢な側に is-leader が付く', () => {
        renderTable(totals({ points: 50 }), totals({ points: 25 }));

        const row = rowEl('points');
        expect(row.querySelector('.comparison-bar.left')?.classList.contains('is-leader')).toBe(true);
        expect(row.querySelector('.comparison-bar.right')?.classList.contains('is-leader')).toBe(false);
    });

    it('TOは少ない側に is-leader が付く', () => {
        renderTable(totals({ turnovers: 9 }), totals({ turnovers: 20 }));

        const row = rowEl('turnovers');
        expect(row.querySelector('.comparison-bar.left')?.classList.contains('is-leader')).toBe(true);
    });

    it('3P未使用の行は「—」でバーを描かない', () => {
        renderTable(totals(), totals(), true);

        const row = rowEl('threePoint');
        expect(row.classList.contains('is-unavailable')).toBe(true);
        expect(row.textContent).toContain('—');
        expect(row.querySelector('.comparison-bar')).toBeNull();
    });

    it('3P未使用のとき注記を1回だけ出す', () => {
        renderTable(totals(), totals(), true);

        expect(screen.getAllByText('この試合は3Pを使用していません').length).toBe(1);
    });

    it('3Pを使う試合では注記を出さない', () => {
        renderTable(totals(), totals(), false);

        expect(screen.queryByText('この試合は3Pを使用していません')).toBeNull();
    });

    it('animate が false なら初期幅から最終幅で描く', () => {
        renderTable(totals({ points: 50 }), totals({ points: 25 }));

        expect(document.querySelector('.comparison-table')?.classList.contains('is-animating')).toBe(false);
    });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
npm test -- src/components/TeamComparison/ComparisonTable.test.tsx
```

期待: `Failed to resolve import "./ComparisonTable"` で失敗する。

- [ ] **Step 3: `ComparisonTable.tsx` を書く**

```tsx
// 比較表。値の決定は comparisonRows.ts が済ませているので、ここは描くだけにする。
//
// バーの色は CSS 変数ではなく実値を prop で受け取る。出力時に色が消えるのを
// 避けるためで、理由は teamColors.ts のコメントに書いてある。

import type { ComparisonRow } from './comparisonRows';

interface ComparisonTableProps {
    rows: ComparisonRow[];
    /** 左チームの色（実値。var() は不可） */
    leftColor: string;
    rightColor: string;
    /** 幅0から伸ばすか。画面に入ったタイミングで true にする */
    animate: boolean;
    threePointUnused: boolean;
}

/** 劣勢側は淡くする。同値のときは両方この扱いになる */
const PALE_OPACITY = 0.45;

function Bar({ side, ratio, color, isLeader }: {
    side: 'left' | 'right';
    ratio: number;
    color: string;
    isLeader: boolean;
}) {
    return (
        <div
            className={`comparison-bar ${side} ${isLeader ? 'is-leader' : ''}`}
            style={{
                width: `${ratio * 100}%`,
                backgroundColor: color,
                opacity: isLeader ? 1 : PALE_OPACITY,
            }}
        />
    );
}

export function ComparisonTable({ rows, leftColor, rightColor, animate, threePointUnused }: ComparisonTableProps) {
    return (
        <div className={`comparison-table ${animate ? 'is-animating' : ''}`}>
            {rows.map(row => (
                <div
                    key={row.key}
                    data-row-key={row.key}
                    className={`comparison-row ${row.unavailable ? 'is-unavailable' : ''}`}
                >
                    <span className="comparison-value left">{row.leftText}</span>
                    <div className="comparison-bar-area left">
                        {!row.unavailable && (
                            <Bar side="left" ratio={row.leftRatio} color={leftColor} isLeader={row.leader === 'left'} />
                        )}
                    </div>
                    <span className="comparison-label">{row.label}</span>
                    <div className="comparison-bar-area right">
                        {!row.unavailable && (
                            <Bar side="right" ratio={row.rightRatio} color={rightColor} isLeader={row.leader === 'right'} />
                        )}
                    </div>
                    <span className="comparison-value right">{row.rightText}</span>
                </div>
            ))}

            {threePointUnused && (
                <p className="comparison-note">この試合は3Pを使用していません</p>
            )}
        </div>
    );
}
```

- [ ] **Step 4: `TeamComparison.css` を書く**

`Bar` の `width` は React が毎回セットするので、伸長は CSS の transition が担う。
`is-animating` が付いていないときは transition を切って、いきなり最終幅で描く。

```css
/* チーム比較。バーは中央のラベルから左右へ伸びる。
   B.LEAGUE の画面は両端にバーを置くが、スマホ幅では中央から外向きの方が
   左右の対比を追いやすい */

.comparison-table {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    padding: var(--spacing-sm) 0;
}

.comparison-row {
    display: grid;
    /* 値 | バー | ラベル | バー | 値。ラベル幅は最長の FGM-FGA に合わせる */
    grid-template-columns: 4.5em 1fr 5.5em 1fr 4.5em;
    align-items: center;
    gap: var(--spacing-xs);
    min-height: 28px;
}

.comparison-value {
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
}

.comparison-value.left { text-align: left; }
.comparison-value.right { text-align: right; }

.comparison-label {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    text-align: center;
    white-space: nowrap;
}

.comparison-bar-area {
    display: flex;
    height: 12px;
}

.comparison-bar-area.left { justify-content: flex-end; }
.comparison-bar-area.right { justify-content: flex-start; }

.comparison-bar {
    height: 100%;
    border-radius: var(--radius-xs);
}

/* 伸長は transform で行う。width を 0 から動かすと、DOM上の幅が一時的に
   実際の値と食い違い、テストと出力の両方が「伸びかけの値」を見ることになる。
   width は常に最終値のまま、見た目だけを中央側から伸ばす */
@keyframes comparison-bar-grow {
    from { transform: scaleX(0); }
    to { transform: scaleX(1); }
}

.comparison-table.is-animating .comparison-bar {
    animation: comparison-bar-grow 400ms ease-out;
}

/* 左のバーは中央（右端）から左へ、右のバーは中央（左端）から右へ伸びる */
.comparison-bar.left { transform-origin: right center; }
.comparison-bar.right { transform-origin: left center; }

.comparison-row.is-unavailable .comparison-value {
    color: var(--text-muted);
}

.comparison-note {
    margin: var(--spacing-sm) 0 0;
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    text-align: center;
}

/* 出力時はアニメーションを止める。伸びかけの棒が画像に写るのを防ぐ */
.exporting .comparison-bar {
    animation: none !important;
}

@media (prefers-reduced-motion: reduce) {
    .comparison-table.is-animating .comparison-bar {
        animation: none;
    }
}
```

`ComparisonTable.tsx` の先頭に import を足す。

```tsx
import './TeamComparison.css';
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
npm test -- src/components/TeamComparison/ComparisonTable.test.tsx
```

期待: 8件すべて PASS。

- [ ] **Step 6: コミット**

```bash
git add src/components/TeamComparison/ComparisonTable.tsx src/components/TeamComparison/ComparisonTable.test.tsx src/components/TeamComparison/TeamComparison.css
git commit -m "feat(comparison): 比較表とバーの描画"
```

---

### Task 11: `ScoreHeader` — スコアとクォーター別得点表

**Files:**
- Create: `src/components/TeamComparison/ScoreHeader.tsx`
- Create: `src/components/TeamComparison/ScoreHeader.test.tsx`
- Modify: `src/components/TeamComparison/TeamComparison.css`

**Interfaces:**
- Consumes: `computeQuarterScores` / `QuarterScore`（Task 6）、`quarterLabel`（`src/utils/quarterLabel`）
- Produces: `<ScoreHeader leftName leftColor rightName rightColor quarterScores={QuarterScore[]} caption={string} />`
  - 合計スコアは `quarterScores` から自分で足す。別 prop で受け取ると、
    2つの数字が食い違う余地ができる
  - `caption` は日付・大会名・会場を組み立てた1行（呼び出し側で作る）
  - ルートは `.comparison-score-header`
  - クォーター表は `.quarter-score-table`、合計列の見出しは `T`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TeamComparison/ScoreHeader.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { ScoreHeader } from './ScoreHeader';
import { computeQuarterScores } from './quarterScores';
import type { ScoreEntry } from '../../types/game';

afterEach(cleanup);

function score(teamId: string, quarter: number, points: number): ScoreEntry {
    return {
        id: `s-${Math.random()}`, teamId, playerId: 'p1', playerNumber: 4,
        scoreType: points === 3 ? '3P' : points === 2 ? '2P' : 'FT',
        points, quarter, timestamp: 0, runningScoreA: 0, runningScoreB: 0,
    };
}

function renderHeader(history: ScoreEntry[], caption = '2026-08-23 県大会 市民体育館') {
    return render(
        <ScoreHeader
            leftName="福岡第一" leftColor="#3b82f6"
            rightName="中部大第一" rightColor="#e2e8f0"
            quarterScores={computeQuarterScores(history)}
            caption={caption}
        />,
    );
}

describe('ScoreHeader', () => {
    it('チーム名と合計スコアを出す', () => {
        renderHeader([score('teamA', 1, 2), score('teamB', 1, 3)]);

        expect(screen.getByText('福岡第一')).toBeTruthy();
        expect(screen.getByText('中部大第一')).toBeTruthy();
        const header = document.querySelector('.comparison-score-header') as HTMLElement;
        expect(header.textContent).toContain('2');
        expect(header.textContent).toContain('3');
    });

    it('見出しの説明文を出す', () => {
        renderHeader([], '2026-08-23 県大会 市民体育館');

        expect(screen.getByText('2026-08-23 県大会 市民体育館')).toBeTruthy();
    });

    it('クォーター表の見出しを Q1〜Q4 と T で出す', () => {
        renderHeader([]);

        const table = document.querySelector('.quarter-score-table') as HTMLElement;
        for (const label of ['Q1', 'Q2', 'Q3', 'Q4', 'T']) {
            expect(within(table).getByText(label)).toBeTruthy();
        }
    });

    it('延長があれば OT の列を足す', () => {
        renderHeader([score('teamA', 5, 2)]);

        const table = document.querySelector('.quarter-score-table') as HTMLElement;
        expect(within(table).getByText('OT')).toBeTruthy();
    });

    it('延長が無ければ OT の列は出さない', () => {
        renderHeader([]);

        const table = document.querySelector('.quarter-score-table') as HTMLElement;
        expect(within(table).queryByText('OT')).toBeNull();
    });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
npm test -- src/components/TeamComparison/ScoreHeader.test.tsx
```

期待: `Failed to resolve import "./ScoreHeader"` で失敗する。

- [ ] **Step 3: `ScoreHeader.tsx` を書く**

```tsx
// 比較画面の見出し。スコアとクォーター別得点表を出す。
//
// チーム名の下の色帯は凡例を兼ねる。以降のバー・ドーナツ・折れ線が
// すべてこの色で描かれるので、どちらの数字かをここで一度示せば足りる。

import { quarterLabel } from '../../utils/quarterLabel';
import type { QuarterScore } from './quarterScores';
import './TeamComparison.css';

interface ScoreHeaderProps {
    leftName: string;
    leftColor: string;
    rightName: string;
    rightColor: string;
    quarterScores: QuarterScore[];
    /** 日付・大会名・会場を1行にまとめたもの */
    caption: string;
}

export function ScoreHeader({
    leftName, leftColor,
    rightName, rightColor,
    quarterScores, caption,
}: ScoreHeaderProps) {
    const leftTotal = quarterScores.reduce((n, r) => n + r.teamA, 0);
    const rightTotal = quarterScores.reduce((n, r) => n + r.teamB, 0);

    return (
        <div className="comparison-score-header">
            {caption && <p className="comparison-caption">{caption}</p>}

            <div className="comparison-scoreline">
                <div className="comparison-team left">
                    <span className="comparison-team-name">{leftName}</span>
                    <span className="comparison-team-bar" style={{ backgroundColor: leftColor }} />
                </div>
                <span className="comparison-score left">{leftTotal}</span>
                <span className="comparison-score-dash">-</span>
                <span className="comparison-score right">{rightTotal}</span>
                <div className="comparison-team right">
                    <span className="comparison-team-name">{rightName}</span>
                    <span className="comparison-team-bar" style={{ backgroundColor: rightColor }} />
                </div>
            </div>

            <table className="quarter-score-table">
                <thead>
                    <tr>
                        <th />
                        {quarterScores.map(row => <th key={row.quarter}>{quarterLabel(row.quarter)}</th>)}
                        <th>T</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <th scope="row">{leftName}</th>
                        {quarterScores.map(row => <td key={row.quarter}>{row.teamA}</td>)}
                        <td className="quarter-score-total">{leftTotal}</td>
                    </tr>
                    <tr>
                        <th scope="row">{rightName}</th>
                        {quarterScores.map(row => <td key={row.quarter}>{row.teamB}</td>)}
                        <td className="quarter-score-total">{rightTotal}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
```

- [ ] **Step 4: CSS を足す**

`TeamComparison.css` の末尾に足す。

```css
.comparison-score-header {
    padding: var(--spacing-sm) 0;
}

.comparison-caption {
    margin: 0 0 var(--spacing-xs);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    text-align: center;
}

.comparison-scoreline {
    display: grid;
    grid-template-columns: 1fr auto auto auto 1fr;
    align-items: center;
    gap: var(--spacing-xs);
}

.comparison-team {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}

.comparison-team.right { align-items: flex-end; }

.comparison-team-name {
    font-size: var(--font-size-md);
    color: var(--text-primary);
    overflow-wrap: anywhere;
}

.comparison-team-bar {
    display: block;
    width: 100%;
    max-width: 96px;
    height: 5px;
    border-radius: var(--radius-xs);
}

.comparison-score {
    font-family: var(--font-score);
    font-size: var(--font-size-2xl);
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
}

.comparison-score-dash {
    color: var(--text-muted);
    padding: 0 var(--spacing-xs);
}

.quarter-score-table {
    margin: var(--spacing-sm) auto 0;
    border-collapse: collapse;
    font-size: var(--font-size-xs);
    font-variant-numeric: tabular-nums;
}

.quarter-score-table th,
.quarter-score-table td {
    padding: 2px var(--spacing-sm);
    text-align: center;
    color: var(--text-secondary);
    font-weight: normal;
}

.quarter-score-table tbody th {
    text-align: right;
    color: var(--text-primary);
    white-space: nowrap;
}

.quarter-score-total {
    color: var(--text-primary);
    border-left: 1px solid var(--border);
}
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
npm test -- src/components/TeamComparison/ScoreHeader.test.tsx
```

期待: 5件すべて PASS。

- [ ] **Step 6: コミット**

```bash
git add src/components/TeamComparison/ScoreHeader.tsx src/components/TeamComparison/ScoreHeader.test.tsx src/components/TeamComparison/TeamComparison.css
git commit -m "feat(comparison): スコアとクォーター別得点の見出し"
```

---

### Task 12: `ShootingDonuts` — 2P / 3P / FT の二重リング

**Files:**
- Create: `src/components/TeamComparison/ShootingDonuts.tsx`
- Create: `src/components/TeamComparison/ShootingDonuts.test.tsx`
- Modify: `src/components/TeamComparison/TeamComparison.css`

**Interfaces:**
- Consumes: `TeamTotals`（Task 3）
- Produces: `<ShootingDonuts left={TeamTotals} right={TeamTotals} leftColor rightColor threePointUnused={boolean} />`
  - 円は `.shooting-donut`、`data-shot="2P" | "3P" | "FT"`
  - 外周（左チーム）は `.donut-ring.outer`、内周（右チーム）は `.donut-ring.inner`
  - 各リングは `data-pie-percent` を持つ（出力時に PNG へ描き直すために必要。Task 15）
  - 未使用の 3P は `.is-unavailable` を持ち、中央に「未使用」を出す

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TeamComparison/ShootingDonuts.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, within } from '@testing-library/react';
import { ShootingDonuts } from './ShootingDonuts';
import type { TeamTotals } from './teamTotals';

afterEach(cleanup);

function totals(over: Partial<TeamTotals> = {}): TeamTotals {
    return {
        points: 0, twoMade: 0, twoAttempt: 0, threeMade: 0, threeAttempt: 0,
        ftMade: 0, ftAttempt: 0, offensiveRebounds: 0, defensiveRebounds: 0,
        assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0,
        ...over,
    };
}

function donut(shot: string): HTMLElement {
    return document.querySelector(`[data-shot="${shot}"]`) as HTMLElement;
}

describe('ShootingDonuts', () => {
    it('2P・3P・FTの3つを出す', () => {
        render(<ShootingDonuts left={totals()} right={totals()} leftColor="#3b82f6" rightColor="#e2e8f0" threePointUnused={false} />);

        for (const shot of ['2P', '3P', 'FT']) expect(donut(shot)).toBeTruthy();
    });

    it('外周に左チーム、内周に右チームの成功率を持たせる', () => {
        render(
            <ShootingDonuts
                left={totals({ twoMade: 15, twoAttempt: 30 })}
                right={totals({ twoMade: 5, twoAttempt: 20 })}
                leftColor="#3b82f6" rightColor="#e2e8f0" threePointUnused={false}
            />,
        );

        const el = donut('2P');
        expect((el.querySelector('.donut-ring.outer') as HTMLElement).dataset.piePercent).toBe('50');
        expect((el.querySelector('.donut-ring.inner') as HTMLElement).dataset.piePercent).toBe('25');
    });

    it('中央に左右の成功率を出す', () => {
        render(
            <ShootingDonuts
                left={totals({ ftMade: 11, ftAttempt: 13 })}
                right={totals({ ftMade: 5, ftAttempt: 7 })}
                leftColor="#3b82f6" rightColor="#e2e8f0" threePointUnused={false}
            />,
        );

        const el = donut('FT');
        expect(within(el).getByText('84.6%')).toBeTruthy();
        expect(within(el).getByText('71.4%')).toBeTruthy();
    });

    it('試投0なら「-」を出して比率0にする', () => {
        render(<ShootingDonuts left={totals()} right={totals()} leftColor="#3b82f6" rightColor="#e2e8f0" threePointUnused={false} />);

        const el = donut('2P');
        expect((el.querySelector('.donut-ring.outer') as HTMLElement).dataset.piePercent).toBe('0');
        expect(within(el).getAllByText('-').length).toBe(2);
    });

    it('3P未使用なら円を描かず「未使用」と出す', () => {
        render(<ShootingDonuts left={totals()} right={totals()} leftColor="#3b82f6" rightColor="#e2e8f0" threePointUnused />);

        const el = donut('3P');
        expect(el.classList.contains('is-unavailable')).toBe(true);
        expect(within(el).getByText('未使用')).toBeTruthy();
        expect(el.querySelector('[data-pie-percent]')).toBeNull();
    });

    it('3P未使用でも2PとFTは通常どおり描く', () => {
        render(<ShootingDonuts left={totals({ twoMade: 1, twoAttempt: 2 })} right={totals()} leftColor="#3b82f6" rightColor="#e2e8f0" threePointUnused />);

        expect(donut('2P').querySelector('[data-pie-percent]')).toBeTruthy();
    });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
npm test -- src/components/TeamComparison/ShootingDonuts.test.tsx
```

期待: `Failed to resolve import "./ShootingDonuts"` で失敗する。

- [ ] **Step 3: `ShootingDonuts.tsx` を書く**

```tsx
// シュート成功率の二重リング。外周が左チーム、内周が右チーム。
//
// conic-gradient で塗り、中央を背景色の円で抜いてリングにする。html2canvas は
// conic-gradient を描けないので、割合を data-pie-percent に持たせて出力時に
// PNGへ描き直す（pdfExport.ts の repaintPieCharts）。色も CSS 変数のままでは
// 出力側から読めないため、--pie-main / --pie-rest に実値で載せる。

import type { CSSProperties, ReactNode } from 'react';
import type { TeamTotals } from './teamTotals';
import './TeamComparison.css';

interface ShootingDonutsProps {
    left: TeamTotals;
    right: TeamTotals;
    leftColor: string;
    rightColor: string;
    threePointUnused: boolean;
}

type Shot = '2P' | '3P' | 'FT';

/** 未達分の色。塗り分けの土台になる中立色 */
const REST_COLOR = 'rgba(148, 163, 184, 0.35)';

function madeAttempt(totals: TeamTotals, shot: Shot): [number, number] {
    if (shot === '2P') return [totals.twoMade, totals.twoAttempt];
    if (shot === '3P') return [totals.threeMade, totals.threeAttempt];
    return [totals.ftMade, totals.ftAttempt];
}

function percentOf(totals: TeamTotals, shot: Shot): number {
    const [made, attempt] = madeAttempt(totals, shot);
    return attempt === 0 ? 0 : (made / attempt) * 100;
}

/** 試投0のときは割合を出さない。0.0% と「打っていない」は違う */
function percentText(totals: TeamTotals, shot: Shot): string {
    const [, attempt] = madeAttempt(totals, shot);
    return attempt === 0 ? '-' : `${percentOf(totals, shot).toFixed(1)}%`;
}

function Ring({ position, percent, color, children }: {
    position: 'outer' | 'inner';
    percent: number;
    color: string;
    children?: ReactNode;
}) {
    // カスタムプロパティは CSSProperties の型に無いので、ここで一度だけ通す。
    // --pie-main / --pie-rest は出力時に読む色で、実値でなければ描き直しに使えない
    const style = {
        '--pie-main': color,
        '--pie-rest': REST_COLOR,
        background: `conic-gradient(${color} 0% ${percent}%, ${REST_COLOR} ${percent}% 100%)`,
    } as CSSProperties;

    return (
        <div
            className={`donut-ring ${position}`}
            data-pie-percent={percent}
            style={style}
        >
            {children}
        </div>
    );
}

export function ShootingDonuts({ left, right, leftColor, rightColor, threePointUnused }: ShootingDonutsProps) {
    const shots: Shot[] = ['2P', '3P', 'FT'];

    return (
        <div className="shooting-donuts">
            {shots.map(shot => {
                const unavailable = shot === '3P' && threePointUnused;
                return (
                    <div key={shot} data-shot={shot} className={`shooting-donut ${unavailable ? 'is-unavailable' : ''}`}>
                        {unavailable ? (
                            <div className="donut-ring outer is-empty">
                                <div className="donut-center"><span className="donut-unavailable">未使用</span></div>
                            </div>
                        ) : (
                            <Ring position="outer" percent={Math.round(percentOf(left, shot))} color={leftColor}>
                                <div className="donut-gap">
                                    <Ring position="inner" percent={Math.round(percentOf(right, shot))} color={rightColor}>
                                        <div className="donut-center">
                                            <span className="donut-percent left">{percentText(left, shot)}</span>
                                            <span className="donut-percent right">{percentText(right, shot)}</span>
                                        </div>
                                    </Ring>
                                </div>
                            </Ring>
                        )}
                        <span className="donut-label">{shot}</span>
                    </div>
                );
            })}
        </div>
    );
}
```

- [ ] **Step 4: CSS を足す**

`TeamComparison.css` の末尾に足す。

```css
.shooting-donuts {
    display: flex;
    justify-content: center;
    gap: var(--spacing-lg);
    flex-wrap: wrap;
    padding: var(--spacing-md) 0;
}

.shooting-donut {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-xs);
}

.donut-ring {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
}

.donut-ring.outer { width: 108px; height: 108px; }
.donut-ring.inner { width: 100%; height: 100%; }

.donut-ring.is-empty { background: rgba(148, 163, 184, 0.2); }

/* 外周と内周の間の隙間。背景色で抜いて2本のリングに見せる */
.donut-gap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 84px;
    height: 84px;
    border-radius: 50%;
    background: var(--bg-card);
}

.donut-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: var(--bg-card);
}

.donut-percent {
    font-size: var(--font-size-xs);
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
}

.donut-unavailable {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
}

.donut-label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
}
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
npm test -- src/components/TeamComparison/ShootingDonuts.test.tsx
```

期待: 6件すべて PASS。

- [ ] **Step 6: コミット**

```bash
git add src/components/TeamComparison/ShootingDonuts.tsx src/components/TeamComparison/ShootingDonuts.test.tsx src/components/TeamComparison/TeamComparison.css
git commit -m "feat(comparison): シュート成功率の二重リング"
```

---

### Task 13: `ScoreEvolutionChart` — 得点推移

**Task 1 の結論を先に読むこと。** `attribute` が 0 に近かった場合は、この Task を
`<canvas>` 描画に置き換える（`<svg>` の代わりに `<canvas ref>` を置き、`useEffect` で
`ctx.moveTo` / `ctx.lineTo` で同じ折れ線を描く。座標計算とテスト対象の純関数は
そのまま使える）。

**Files:**
- Create: `src/components/TeamComparison/scoreEvolution.ts`
- Create: `src/components/TeamComparison/scoreEvolution.test.ts`
- Create: `src/components/TeamComparison/ScoreEvolutionChart.tsx`
- Create: `src/components/TeamComparison/ScoreEvolutionChart.test.tsx`
- Modify: `src/components/TeamComparison/TeamComparison.css`

**Interfaces:**
- Consumes: `ScoreEntry`、`QuarterFilter`（Task 3）、`quarterLabel`
- Produces:
  - `interface EvolutionPoint { index: number; teamA: number; teamB: number }`
  - `interface EvolutionData { points: EvolutionPoint[]; boundaries: { index: number; quarter: number }[]; maxScore: number }`
  - `buildEvolutionData(scoreHistory: ScoreEntry[], filter: QuarterFilter): EvolutionData`
    - `points[0]` は必ず開始時点（絞り込み時はそのクォーター開始時の累計）
    - `boundaries` は各クォーターの最初の得点の位置
    - `maxScore` は Y軸の上端（両チームの最大累計。0のときは 1 を返してゼロ除算を避ける）
  - `<ScoreEvolutionChart data={EvolutionData} leftColor rightColor />` — `.score-evolution` を持つ

- [ ] **Step 1: 集計の失敗するテストを書く**

`src/components/TeamComparison/scoreEvolution.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildEvolutionData } from './scoreEvolution';
import type { ScoreEntry } from '../../types/game';

function entry(quarter: number, runningScoreA: number, runningScoreB: number): ScoreEntry {
    return {
        id: `s-${runningScoreA}-${runningScoreB}-${Math.random()}`,
        teamId: 'teamA', playerId: 'p1', playerNumber: 4,
        scoreType: '2P', points: 2, quarter, timestamp: 0, runningScoreA, runningScoreB,
    };
}

describe('buildEvolutionData', () => {
    it('記録が無ければ原点だけを返す', () => {
        const data = buildEvolutionData([], 'all');
        expect(data.points).toEqual([{ index: 0, teamA: 0, teamB: 0 }]);
        expect(data.maxScore).toBe(1);
    });

    it('累計得点をそのまま点にする', () => {
        const data = buildEvolutionData([entry(1, 2, 0), entry(1, 2, 3), entry(1, 5, 3)], 'all');
        expect(data.points).toEqual([
            { index: 0, teamA: 0, teamB: 0 },
            { index: 1, teamA: 2, teamB: 0 },
            { index: 2, teamA: 2, teamB: 3 },
            { index: 3, teamA: 5, teamB: 3 },
        ]);
        expect(data.maxScore).toBe(5);
    });

    it('クォーターの変わり目を記録する', () => {
        const data = buildEvolutionData([entry(1, 2, 0), entry(2, 4, 0), entry(3, 6, 0)], 'all');
        expect(data.boundaries).toEqual([
            { index: 1, quarter: 1 },
            { index: 2, quarter: 2 },
            { index: 3, quarter: 3 },
        ]);
    });

    it('クォーターを絞ると、その区間だけを累計のまま切り出す', () => {
        const data = buildEvolutionData([entry(1, 2, 0), entry(1, 4, 0), entry(2, 6, 3), entry(2, 8, 3)], 2);
        // 起点は 2Q が始まる直前の累計（1Q終了時点）
        expect(data.points[0]).toEqual({ index: 0, teamA: 4, teamB: 0 });
        expect(data.points[data.points.length - 1]).toEqual({ index: 2, teamA: 8, teamB: 3 });
    });

    it('絞ったクォーターに記録が無ければ、その直前の累計だけを返す', () => {
        const data = buildEvolutionData([entry(1, 2, 0)], 3);
        expect(data.points).toEqual([{ index: 0, teamA: 2, teamB: 0 }]);
    });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
npm test -- src/components/TeamComparison/scoreEvolution.test.ts
```

期待: `Failed to resolve import "./scoreEvolution"` で失敗する。

- [ ] **Step 3: `scoreEvolution.ts` を書く**

```ts
// 得点推移の点列。
//
// X軸は「何本目の得点か」であって経過時間ではない。試合時計を記録していないため
// 時間軸は作れない。ラベルでもそう示すこと。
//
// クォーターを絞ったときは累計のまま該当区間を切り出す。0から描き直すと
// 試合全体のどこを見ているのか分からなくなる。起点はその区間が始まる直前の累計。

import type { ScoreEntry } from '../../types/game';
import type { QuarterFilter } from './teamTotals';

export interface EvolutionPoint {
    index: number;
    teamA: number;
    teamB: number;
}

export interface EvolutionData {
    points: EvolutionPoint[];
    /** クォーターの最初の得点の位置。区切り線とラベルに使う */
    boundaries: { index: number; quarter: number }[];
    /** Y軸の上端。0だとゼロ除算になるので最低1を返す */
    maxScore: number;
}

export function buildEvolutionData(scoreHistory: ScoreEntry[], filter: QuarterFilter): EvolutionData {
    const inRange = filter === 'all' ? scoreHistory : scoreHistory.filter(s => s.quarter === filter);

    // 区間の起点。絞り込み時は、その区間の1つ前のエントリの累計から始める
    const startIndex = filter === 'all' ? -1 : scoreHistory.indexOf(inRange[0]) - 1;
    const before = startIndex >= 0 ? scoreHistory[startIndex] : undefined;
    const origin: EvolutionPoint = {
        index: 0,
        teamA: before?.runningScoreA ?? 0,
        teamB: before?.runningScoreB ?? 0,
    };

    // 絞ったクォーターに記録が無いとき、起点はその時点までの最後の累計になる
    if (inRange.length === 0 && filter !== 'all') {
        const last = scoreHistory.filter(s => s.quarter < filter).at(-1);
        return {
            points: [{ index: 0, teamA: last?.runningScoreA ?? 0, teamB: last?.runningScoreB ?? 0 }],
            boundaries: [],
            maxScore: Math.max(1, last?.runningScoreA ?? 0, last?.runningScoreB ?? 0),
        };
    }

    const points: EvolutionPoint[] = [origin];
    const boundaries: { index: number; quarter: number }[] = [];
    let previousQuarter = filter === 'all' ? 0 : filter;

    inRange.forEach((entry, i) => {
        points.push({ index: i + 1, teamA: entry.runningScoreA, teamB: entry.runningScoreB });
        if (entry.quarter !== previousQuarter) {
            boundaries.push({ index: i + 1, quarter: entry.quarter });
            previousQuarter = entry.quarter;
        }
    });

    const maxScore = Math.max(1, ...points.map(p => Math.max(p.teamA, p.teamB)));
    return { points, boundaries, maxScore };
}
```

- [ ] **Step 4: 集計テストが通ることを確認する**

```bash
npm test -- src/components/TeamComparison/scoreEvolution.test.ts
```

期待: 5件すべて PASS。

- [ ] **Step 5: 描画の失敗するテストを書く**

`src/components/TeamComparison/ScoreEvolutionChart.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ScoreEvolutionChart } from './ScoreEvolutionChart';
import { buildEvolutionData } from './scoreEvolution';
import type { ScoreEntry } from '../../types/game';

afterEach(cleanup);

function entry(quarter: number, a: number, b: number): ScoreEntry {
    return {
        id: `s-${a}-${b}-${Math.random()}`, teamId: 'teamA', playerId: 'p1', playerNumber: 4,
        scoreType: '2P', points: 2, quarter, timestamp: 0, runningScoreA: a, runningScoreB: b,
    };
}

function renderChart(history: ScoreEntry[]) {
    return render(
        <ScoreEvolutionChart data={buildEvolutionData(history, 'all')} leftColor="#3b82f6" rightColor="#e2e8f0" />,
    );
}

describe('ScoreEvolutionChart', () => {
    it('両チームの折れ線を描く', () => {
        renderChart([entry(1, 2, 0), entry(1, 2, 3)]);

        expect(document.querySelectorAll('.score-evolution polyline').length).toBe(2);
    });

    it('線の色を属性に直接書く（出力で色が消えないため）', () => {
        renderChart([entry(1, 2, 0)]);

        const line = document.querySelector('.score-evolution polyline') as SVGElement;
        expect(line.getAttribute('stroke')).toBe('#3b82f6');
        expect(line.getAttribute('stroke')).not.toContain('var(');
        expect(line.getAttribute('fill')).toBe('none');
    });

    it('クォーターの区切り線とラベルを出す', () => {
        renderChart([entry(1, 2, 0), entry(2, 4, 0)]);

        expect(document.querySelectorAll('.score-evolution .quarter-boundary').length).toBe(2);
        const labels = [...document.querySelectorAll('.score-evolution text')].map(t => t.textContent);
        expect(labels).toContain('Q1');
        expect(labels).toContain('Q2');
    });

    it('記録が無くても落ちない', () => {
        renderChart([]);

        expect(document.querySelector('.score-evolution')).toBeTruthy();
    });

    it('X軸が時間ではないと分かる説明を出す', () => {
        const { getByText } = renderChart([entry(1, 2, 0)]);

        expect(getByText('横軸は得点の順番（試合時計ではありません）')).toBeTruthy();
    });
});
```

- [ ] **Step 6: 失敗を確認する**

```bash
npm test -- src/components/TeamComparison/ScoreEvolutionChart.test.tsx
```

期待: `Failed to resolve import "./ScoreEvolutionChart"` で失敗する。

- [ ] **Step 7: `ScoreEvolutionChart.tsx` を書く**

```tsx
// 得点推移の折れ線。
//
// 色・線幅は必ず属性に直接書く。CSSクラスで当ててはいけない。html2canvas は
// SVGをページから切り離して画像化するため、ページのCSSで当てたstrokeは
// 出力画像で消える（スコアシートの斜線がこれで消え、座標を測って手描きし直す
// 回避策が入っている。src/utils/pdfExport.ts 参照）。

import { quarterLabel } from '../../utils/quarterLabel';
import type { EvolutionData, EvolutionPoint } from './scoreEvolution';
import './TeamComparison.css';

interface ScoreEvolutionChartProps {
    data: EvolutionData;
    leftColor: string;
    rightColor: string;
}

// viewBox の座標系。実寸は CSS の width で伸縮させる
const WIDTH = 320;
const HEIGHT = 140;
const PADDING_TOP = 8;
const PADDING_BOTTOM = 18;

export function ScoreEvolutionChart({ data, leftColor, rightColor }: ScoreEvolutionChartProps) {
    const lastIndex = Math.max(1, data.points.length - 1);
    const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

    const x = (index: number) => (index / lastIndex) * WIDTH;
    const y = (score: number) => PADDING_TOP + plotHeight - (score / data.maxScore) * plotHeight;

    const line = (pick: (p: EvolutionPoint) => number) =>
        data.points.map(p => `${x(p.index).toFixed(2)},${y(pick(p)).toFixed(2)}`).join(' ');

    return (
        <div className="score-evolution">
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} role="img" aria-label="得点推移">
                {data.boundaries.map(b => (
                    <g key={`${b.quarter}-${b.index}`}>
                        <line
                            className="quarter-boundary"
                            x1={x(b.index)} y1={PADDING_TOP}
                            x2={x(b.index)} y2={HEIGHT - PADDING_BOTTOM}
                            stroke="#64748b" strokeWidth="1" strokeDasharray="2 3"
                        />
                        <text
                            x={x(b.index)} y={HEIGHT - 4}
                            fill="#94a3b8" fontSize="10" textAnchor="middle"
                        >
                            {quarterLabel(b.quarter)}
                        </text>
                    </g>
                ))}

                <polyline points={line(p => p.teamB)} fill="none" stroke={rightColor} strokeWidth="2" strokeLinejoin="round" />
                <polyline points={line(p => p.teamA)} fill="none" stroke={leftColor} strokeWidth="2" strokeLinejoin="round" />
            </svg>

            <p className="score-evolution-note">横軸は得点の順番（試合時計ではありません）</p>
        </div>
    );
}
```

- [ ] **Step 8: CSS を足す**

`TeamComparison.css` の末尾に足す。SVG の中身には色を当てないこと。

```css
.score-evolution {
    padding: var(--spacing-md) 0;
}

.score-evolution svg {
    display: block;
    width: 100%;
}

.score-evolution-note {
    margin: var(--spacing-xs) 0 0;
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    text-align: center;
}
```

- [ ] **Step 9: テストが通ることを確認する**

```bash
npm test -- src/components/TeamComparison/ScoreEvolutionChart.test.tsx src/components/TeamComparison/scoreEvolution.test.ts
```

期待: 10件すべて PASS。

- [ ] **Step 10: コミット**

```bash
git add src/components/TeamComparison/scoreEvolution.ts src/components/TeamComparison/scoreEvolution.test.ts src/components/TeamComparison/ScoreEvolutionChart.tsx src/components/TeamComparison/ScoreEvolutionChart.test.tsx src/components/TeamComparison/TeamComparison.css
git commit -m "feat(comparison): 得点推移の折れ線"
```

---

### Task 14: `TeamComparison` — 全体の組み立てとクォーター切替

**Files:**
- Create: `src/components/TeamComparison/TeamComparison.tsx`
- Create: `src/components/TeamComparison/index.ts`
- Create: `src/components/TeamComparison/TeamComparison.test.tsx`
- Modify: `src/components/TeamComparison/TeamComparison.css`

**Interfaces:**
- Consumes: これまでの全モジュール
- Produces:
  ```ts
  interface TeamComparisonProps {
      teamA: Team;
      teamB: Team;
      scoreHistory: ScoreEntry[];
      statHistory: StatEntry[];
      foulHistory: FoulEntry[];
      showThreePoint?: boolean;
      /** 日付・大会名・会場を1行にまとめたもの。無ければ空文字 */
      caption?: string;
      /** 出力ボタンを出すか。試合中は false */
      exportable?: boolean;
      /** 出力に使うファイル名の元（試合名など） */
      exportName?: string;
  }
  export function TeamComparison(props: TeamComparisonProps): JSX.Element;
  ```
  - ルートは `.team-comparison`
  - クォーター切替のボタンは `.quarter-filter button`、選択中に `.active`
  - 既定は「全体」

出力ボタンは Task 16 で足す。この Task では `exportable` を受け取るが、まだ描かない。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TeamComparison/TeamComparison.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TeamComparison } from './TeamComparison';
import { createPlayer, createTeam } from '../../types/game';
import type { ScoreEntry, StatEntry, Team } from '../../types/game';

afterEach(cleanup);

function team(id: 'teamA' | 'teamB', name: string, color: Team['color'], points: number): Team {
    const t = createTeam(id, name, '');
    t.color = color;
    const p = createPlayer(`${id}-1`, 4, '一郎');
    p.stats.points = points;
    p.stats.twoPointMade = points / 2;
    p.stats.twoPointAttempt = points;
    t.players = [p];
    return t;
}

function score(teamId: string, quarter: number, a: number, b: number): ScoreEntry {
    return {
        id: `s-${Math.random()}`, teamId, playerId: `${teamId}-1`, playerNumber: 4,
        scoreType: '2P', points: 2, quarter, timestamp: 0, runningScoreA: a, runningScoreB: b,
    };
}

function renderComparison(over: { showThreePoint?: boolean; statHistory?: StatEntry[] } = {}) {
    return render(
        <TeamComparison
            teamA={team('teamA', '白チーム', 'white', 10)}
            teamB={team('teamB', '青チーム', 'blue', 6)}
            scoreHistory={[score('teamA', 1, 2, 0), score('teamB', 2, 2, 2)]}
            statHistory={over.statHistory ?? []}
            foulHistory={[]}
            showThreePoint={over.showThreePoint ?? true}
            caption="2026-08-23 県大会"
        />,
    );
}

describe('TeamComparison', () => {
    it('見出し・比較表・ドーナツ・折れ線をすべて出す', () => {
        renderComparison();

        expect(document.querySelector('.comparison-score-header')).toBeTruthy();
        expect(document.querySelector('.comparison-table')).toBeTruthy();
        expect(document.querySelector('.shooting-donuts')).toBeTruthy();
        expect(document.querySelector('.score-evolution')).toBeTruthy();
    });

    it('既定は「全体」が選ばれている', () => {
        renderComparison();

        expect(screen.getByRole('button', { name: '全体' }).classList.contains('active')).toBe(true);
    });

    it('全体では選手スタッツの合計を出す', () => {
        renderComparison();

        const row = document.querySelector('[data-row-key="points"]') as HTMLElement;
        expect(row.textContent).toContain('10');
        expect(row.textContent).toContain('6');
    });

    it('クォーターを選ぶとその範囲だけを出す', () => {
        renderComparison();

        fireEvent.click(screen.getByRole('button', { name: 'Q1' }));

        const row = document.querySelector('[data-row-key="points"]') as HTMLElement;
        // Q1 は teamA の 2点だけ
        expect(row.querySelector('.comparison-value.left')?.textContent).toBe('2');
        expect(row.querySelector('.comparison-value.right')?.textContent).toBe('0');
    });

    it('延長の記録が無ければ OT のボタンを出さない', () => {
        renderComparison();

        expect(screen.queryByRole('button', { name: 'OT' })).toBeNull();
    });

    it('3P未使用の試合では注記を出す', () => {
        renderComparison({ showThreePoint: false });

        expect(screen.getByText('この試合は3Pを使用していません')).toBeTruthy();
    });

    it('3P設定OFFでも記録があれば注記を出さない', () => {
        const threeMissed: StatEntry = {
            id: 't1', teamId: 'teamA', playerId: 'teamA-1', playerNumber: 4, statType: '3PA', quarter: 1, timestamp: 0,
        };
        renderComparison({ showThreePoint: false, statHistory: [threeMissed] });

        expect(screen.queryByText('この試合は3Pを使用していません')).toBeNull();
    });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
npm test -- src/components/TeamComparison/TeamComparison.test.tsx
```

期待: `Failed to resolve import "./TeamComparison"` で失敗する。

- [ ] **Step 3: `TeamComparison.tsx` を書く**

```tsx
// チームスタッツ比較。試合中の統計画面と履歴の詳細が同じものを使う。
//
// 集計は teamTotals / quarterScores / scoreEvolution が済ませているので、
// ここはクォーターの選択状態を持ち、各部品へ数値を配るだけにする。
//
// バーは画面に入ったタイミングで伸ばす。マウント直後に伸ばすと、
// スクロールして辿り着く頃には動き終わっている。

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FoulEntry, ScoreEntry, StatEntry, Team } from '../../types/game';
import { quarterLabel } from '../../utils/quarterLabel';
import { computeTeamTotals, type QuarterFilter } from './teamTotals';
import { computeQuarterScores, recordedQuarters } from './quarterScores';
import { buildComparisonRows } from './comparisonRows';
import { isThreePointUnused } from './threePointUsage';
import { resolveTeamColor } from './teamColors';
import { buildEvolutionData } from './scoreEvolution';
import { ScoreHeader } from './ScoreHeader';
import { ComparisonTable } from './ComparisonTable';
import { ShootingDonuts } from './ShootingDonuts';
import { ScoreEvolutionChart } from './ScoreEvolutionChart';
import './TeamComparison.css';

export interface TeamComparisonProps {
    teamA: Team;
    teamB: Team;
    scoreHistory: ScoreEntry[];
    statHistory: StatEntry[];
    foulHistory: FoulEntry[];
    showThreePoint?: boolean;
    /** 日付・大会名・会場を1行にまとめたもの */
    caption?: string;
    exportable?: boolean;
    exportName?: string;
}

export function TeamComparison({
    teamA, teamB, scoreHistory, statHistory, foulHistory,
    showThreePoint, caption = '',
}: TeamComparisonProps) {
    const [filter, setFilter] = useState<QuarterFilter>('all');
    const [animate, setAnimate] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    // 画面に入ったら伸ばす。IntersectionObserver が無い環境（jsdom）では
    // すぐ最終幅にする。動かないだけで、数字は同じものが出る
    useEffect(() => {
        const root = rootRef.current;
        if (!root || typeof IntersectionObserver !== 'function') return;

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setAnimate(true);
                observer.disconnect();
            }
        }, { threshold: 0.1 });

        observer.observe(root);
        return () => observer.disconnect();
    }, []);

    const threePointUnused = useMemo(
        () => isThreePointUnused(showThreePoint, scoreHistory, statHistory),
        [showThreePoint, scoreHistory, statHistory],
    );

    // 引数を省くと :root から読む。初回レンダーでは rootRef がまだ null なので、
    // ここで要素を渡しても意味が無い
    const leftColor = resolveTeamColor(teamA.color);
    const rightColor = resolveTeamColor(teamB.color);

    const quarterScores = useMemo(() => computeQuarterScores(scoreHistory), [scoreHistory]);
    const quarters = useMemo(() => recordedQuarters(scoreHistory), [scoreHistory]);

    const totalsA = computeTeamTotals({ team: teamA, teamId: 'teamA', scoreHistory, statHistory, foulHistory }, filter);
    const totalsB = computeTeamTotals({ team: teamB, teamId: 'teamB', scoreHistory, statHistory, foulHistory }, filter);

    const rows = buildComparisonRows(totalsA, totalsB, { threePointUnused });
    const evolution = buildEvolutionData(scoreHistory, filter);

    return (
        <div className="team-comparison" ref={rootRef}>
            <ScoreHeader
                leftName={teamA.name} leftColor={leftColor}
                rightName={teamB.name} rightColor={rightColor}
                quarterScores={quarterScores}
                caption={caption}
            />

            <div className="quarter-filter" role="group" aria-label="表示するクォーター">
                <button
                    type="button"
                    className={filter === 'all' ? 'active' : ''}
                    onClick={() => setFilter('all')}
                >
                    全体
                </button>
                {quarters.map(q => (
                    <button
                        key={q}
                        type="button"
                        className={filter === q ? 'active' : ''}
                        onClick={() => setFilter(q)}
                    >
                        {quarterLabel(q)}
                    </button>
                ))}
            </div>

            <ComparisonTable
                rows={rows}
                leftColor={leftColor}
                rightColor={rightColor}
                animate={animate}
                threePointUnused={threePointUnused}
            />

            <ShootingDonuts
                left={totalsA} right={totalsB}
                leftColor={leftColor} rightColor={rightColor}
                threePointUnused={threePointUnused}
            />

            <ScoreEvolutionChart data={evolution} leftColor={leftColor} rightColor={rightColor} />
        </div>
    );
}
```

- [ ] **Step 4: `index.ts` を書く**

```ts
export { TeamComparison } from './TeamComparison';
export type { TeamComparisonProps } from './TeamComparison';
```

- [ ] **Step 5: CSS を足す**

```css
.team-comparison {
    padding: var(--spacing-md);
    background: var(--bg-card);
    border-radius: var(--radius-md);
}

.quarter-filter {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
    padding: var(--spacing-sm) 0;
}

.quarter-filter button {
    min-height: var(--touch-target);
    min-width: 56px;
    padding: 0 var(--spacing-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
}

.quarter-filter button.active {
    background: var(--primary);
    border-color: var(--primary-light);
    color: var(--text-primary);
}
```

- [ ] **Step 6: テストが通ることを確認する**

```bash
npm test -- src/components/TeamComparison
```

期待: この Task の7件を含め、TeamComparison 配下がすべて PASS。

- [ ] **Step 7: 型チェックを通す**

```bash
npm run lint && npx tsc -b --noEmit
```

期待: エラー0。

- [ ] **Step 8: コミット**

```bash
git add src/components/TeamComparison/
git commit -m "feat(comparison): チーム比較画面の組み立てとクォーター切替"
```

---

### Task 15: `pdfExport` — 円グラフの色を要素ごとに決められるようにする

`repaintPieCharts` は `--stats-success` / `--stats-success-pale` 固定で塗る。
比較画面のドーナツはチーム色で塗るので、要素側が指定した色を先に見るようにする。

**Files:**
- Modify: `src/utils/pdfExport.ts:146-157`（`readPieSegments`）
- Create: `src/utils/pdfExport.pieColor.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `readPieSegments` の色の決め方が変わる。
  `--pie-main` / `--pie-rest` があればそれを使い、無ければ従来どおり
  `--stats-success` / `--stats-success-pale` に落ちる（既存の選手詳細は影響を受けない）

- [ ] **Step 1: 既存のテストを確認する**

```bash
npm test -- src/utils/pdfExport.pie.test.ts
```

期待: 現状すべて PASS。ここを壊さないことが今回の条件になる。

- [ ] **Step 2: 失敗するテストを書く**

`src/utils/pdfExport.pieColor.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { readPieSegments } from './pdfExport';

afterEach(() => { document.body.innerHTML = ''; });

function pie(styles: Record<string, string>, percent = 50): HTMLElement {
    const el = document.createElement('div');
    el.dataset.piePercent = String(percent);
    for (const [key, value] of Object.entries(styles)) el.style.setProperty(key, value);
    document.body.appendChild(el);
    return el;
}

describe('readPieSegments の色', () => {
    it('--pie-main / --pie-rest があればそれを使う', () => {
        const el = pie({ '--pie-main': '#3b82f6', '--pie-rest': '#111111' });

        expect(readPieSegments(el)).toEqual({ percent: 50, mainColor: '#3b82f6', restColor: '#111111' });
    });

    it('--pie-main が無ければ --stats-success に落ちる', () => {
        const el = pie({ '--stats-success': '#22c55e', '--stats-success-pale': '#dcfce7' });

        expect(readPieSegments(el)).toEqual({ percent: 50, mainColor: '#22c55e', restColor: '#dcfce7' });
    });

    it('どちらも無ければ null', () => {
        expect(readPieSegments(pie({}))).toBeNull();
    });

    it('割合が数値でなければ null', () => {
        const el = pie({ '--pie-main': '#3b82f6', '--pie-rest': '#111111' });
        el.dataset.piePercent = 'なし';

        expect(readPieSegments(el)).toBeNull();
    });
});
```

- [ ] **Step 3: 失敗を確認する**

```bash
npm test -- src/utils/pdfExport.pieColor.test.ts
```

期待: 1件目が失敗する（`--pie-main` を見ていないため）。

- [ ] **Step 4: `readPieSegments` を書き換える**

`src/utils/pdfExport.ts` の該当箇所を差し替える。

```ts
export function readPieSegments(pie: HTMLElement): PieSegments | null {
    const percent = Number(pie.dataset.piePercent);
    if (!Number.isFinite(percent)) return null;

    // 色はテーマで変わるため、複製DOM上で解決済みの値を読む（凡例ドットと必ず揃う）
    //
    // チーム比較のドーナツはチーム色で塗るので、要素が --pie-main / --pie-rest を
    // 持っていればそちらを先に見る。持っていない既存の円グラフ（選手詳細の
    // リバウンド内訳）は従来どおり --stats-success 系に落ちる。
    const style = pie.ownerDocument.defaultView?.getComputedStyle(pie);
    const read = (name: string) => style?.getPropertyValue(name).trim() ?? '';

    const mainColor = read('--pie-main') || read('--stats-success');
    const restColor = read('--pie-rest') || read('--stats-success-pale');
    if (!mainColor || !restColor) return null;

    return { percent: Math.min(100, Math.max(0, percent)), mainColor, restColor };
}
```

- [ ] **Step 5: 新旧のテストが両方通ることを確認する**

```bash
npm test -- src/utils/pdfExport
```

期待: `pdfExport.pieColor.test.ts` の4件と、既存の `pdfExport.pie.test.ts` を含め
すべて PASS。

- [ ] **Step 6: コミット**

```bash
git add src/utils/pdfExport.ts src/utils/pdfExport.pieColor.test.ts
git commit -m "feat(export): 円グラフの色を要素ごとに指定できるようにする"
```

---

### Task 16: 比較画面の JPEG / PDF 出力

**Files:**
- Modify: `src/components/TeamComparison/TeamComparison.tsx`
- Create: `src/components/TeamComparison/TeamComparison.export.test.tsx`
- Modify: `src/components/TeamComparison/TeamComparison.css`

**Interfaces:**
- Consumes: `useExportAction`（`src/hooks/useExportAction`）、`exportElement`（`src/utils/pdfExport`）
- Produces: `exportable` が true のとき、`.comparison-export` に JPEG / PDF のボタンを出す

- [ ] **Step 1: 出力の呼び出し方を確認する**

既存の呼び出し例を読む。ファイル名の作り方と `exportElement` のオプションの渡し方を
そこに合わせる。

```bash
grep -rn "exportElement" src --include="*.tsx" | grep -v "\.test\."
```

- [ ] **Step 2: 失敗するテストを書く**

`src/components/TeamComparison/TeamComparison.export.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { TeamComparison } from './TeamComparison';
import { createPlayer, createTeam } from '../../types/game';

const exportElement = vi.fn().mockResolvedValue(undefined);
vi.mock('../../utils/pdfExport', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../utils/pdfExport')>()),
    exportElement: (...args: unknown[]) => exportElement(...args),
}));

afterEach(() => { cleanup(); exportElement.mockClear(); });

function renderExportable(exportable = true) {
    const teamA = createTeam('teamA', '白チーム', '');
    teamA.players = [createPlayer('a1', 4, '一郎')];
    const teamB = createTeam('teamB', '青チーム', '');
    teamB.color = 'blue';
    teamB.players = [createPlayer('b1', 7, '三郎')];

    return render(
        <TeamComparison
            teamA={teamA} teamB={teamB}
            scoreHistory={[]} statHistory={[]} foulHistory={[]}
            showThreePoint
            caption=""
            exportable={exportable}
            exportName="県大会"
        />,
    );
}

describe('比較画面の出力', () => {
    it('exportable が false ならボタンを出さない', () => {
        renderExportable(false);

        expect(screen.queryByRole('button', { name: /JPEG/ })).toBeNull();
    });

    it('JPEGボタンで出力を呼ぶ', async () => {
        renderExportable();

        fireEvent.click(screen.getByRole('button', { name: /JPEG/ }));

        await waitFor(() => expect(exportElement).toHaveBeenCalledTimes(1));
        expect(exportElement.mock.calls[0][1].format).toBe('jpeg');
    });

    it('PDFボタンで出力を呼ぶ', async () => {
        renderExportable();

        fireEvent.click(screen.getByRole('button', { name: /PDF/ }));

        await waitFor(() => expect(exportElement).toHaveBeenCalledTimes(1));
        expect(exportElement.mock.calls[0][1].format).toBe('pdf');
    });

    it('出力対象は比較画面のルート要素', async () => {
        renderExportable();

        fireEvent.click(screen.getByRole('button', { name: /JPEG/ }));

        await waitFor(() => expect(exportElement).toHaveBeenCalled());
        expect((exportElement.mock.calls[0][0] as HTMLElement).classList.contains('team-comparison')).toBe(true);
    });

    it('出力ボタン自体は画像に含めない', () => {
        renderExportable();

        expect(document.querySelector('.comparison-export')?.classList.contains('no-export')).toBe(true);
    });
});
```

- [ ] **Step 3: 失敗を確認する**

```bash
npm test -- src/components/TeamComparison/TeamComparison.export.test.tsx
```

期待: ボタンが無いため2件目以降が失敗する。

- [ ] **Step 4: `TeamComparison.tsx` に出力ボタンを足す**

import を足す。

```tsx
import { useExportAction } from '../../hooks/useExportAction';
import { exportElement } from '../../utils/pdfExport';
```

props の分割代入に `exportable = false, exportName = ''` を足し、コンポーネントの
本体に次を足す。

```tsx
    const { isExporting, runExport } = useExportAction();

    const handleExport = (format: 'jpeg' | 'pdf') => {
        const root = rootRef.current;
        if (!root) return;
        const name = exportName ? `${exportName}_チーム比較` : 'チーム比較';
        void runExport(
            () => exportElement(root, { filename: `${name}.${format === 'jpeg' ? 'jpg' : 'pdf'}`, format }),
            format === 'jpeg' ? 'JPEG' : 'PDF',
        );
    };
```

JSX の末尾（`ScoreEvolutionChart` の下）に足す。

```tsx
            {exportable && (
                <div className="comparison-export no-export">
                    <button type="button" className="btn btn-secondary btn-small" disabled={isExporting} onClick={() => handleExport('jpeg')}>
                        🖼 JPEG
                    </button>
                    <button type="button" className="btn btn-secondary btn-small" disabled={isExporting} onClick={() => handleExport('pdf')}>
                        📄 PDF
                    </button>
                </div>
            )}
```

- [ ] **Step 5: CSS を足す**

```css
.comparison-export {
    display: flex;
    justify-content: center;
    gap: var(--spacing-sm);
    padding-top: var(--spacing-md);
}

/* 出力ボタン自体は画像に写さない */
.exporting .no-export {
    display: none !important;
}
```

- [ ] **Step 6: テストが通ることを確認する**

```bash
npm test -- src/components/TeamComparison
```

期待: すべて PASS。

- [ ] **Step 7: コミット**

```bash
git add src/components/TeamComparison/
git commit -m "feat(comparison): 比較画面のJPEG/PDF出力"
```

---

### Task 17: 試合中の統計画面へ設置する

**Files:**
- Modify: `src/App.tsx:1159-1166`（`showStats` のブロック）
- Create: `src/App.teamComparison.test.tsx`

**Interfaces:**
- Consumes: `TeamComparison`（Task 14・16）
- Produces: 統計画面の先頭に比較、その下に既存の `StatsPanel` 2枚

試合中は出力ボタンを出さない（`exportable` を渡さない）。記録中に重い処理を
始められる導線を増やさないため。

- [ ] **Step 1: 失敗するテストを書く**

`src/App.teamComparison.test.tsx`。セットアップは `src/App.settingsAccess.test.tsx`
と同じ形（中断セッションを仕込んで「試合を再開」から入る）。

統計ボタンは `gameMode === 'full'` のときだけ出る。jsdom には `window.matchMedia`
が無く、`getViewportGameMode` はその場合 `'full'` を返すので、このテストでは
必ず出る（`src/utils/appSettings.ts` の該当関数を参照）。

```tsx
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { createInitialGame, createTeam, createPlayer } from './types/game';

const myTeam = {
    id: 'team-1',
    name: 'テストチーム',
    coachName: 'コーチ',
    assistantCoachName: '',
    players: [{ number: 4, name: '選手4', isCaptain: true }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

/** 記録中の中断セッションを仕込む */
function seedPlayingSession() {
    const game = createInitialGame();
    game.phase = 'playing';
    game.teamA = {
        ...createTeam('teamA', 'テストチーム', 'コーチ'),
        players: [{ ...createPlayer('teamA-player-0', 4, '選手4'), isOnCourt: true }],
    };
    game.teamB = {
        ...createTeam('teamB', '相手チーム', '相手コーチ'),
        color: 'blue',
        players: [{ ...createPlayer('teamB-player-0', 5, '選手5'), isOnCourt: true }],
    };
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game, gameName: '練習試合', date: '2026-08-23', savedAt: new Date().toISOString(),
    }));
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    window.history.replaceState(null, '');
    seedPlayingSession();
});

afterEach(cleanup);

describe('試合中の統計画面', () => {
    async function openStats() {
        render(<App />);
        fireEvent.click(await screen.findByText('試合を再開'));
        fireEvent.click(await screen.findByLabelText('チーム統計'));
    }

    it('比較を上、選手別スタッツを下に出す', async () => {
        await openStats();

        const view = document.querySelector('.stats-view') as HTMLElement;
        const comparison = view.querySelector('.team-comparison') as HTMLElement;
        const panel = view.querySelector('.stats-panel') as HTMLElement;

        expect(comparison).toBeTruthy();
        expect(panel).toBeTruthy();
        // 比較のほうが先に来る（DOCUMENT_POSITION_FOLLOWING = panel が後ろにある）
        expect(comparison.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('両チームの選手別スタッツは残したまま', async () => {
        await openStats();

        expect(document.querySelectorAll('.stats-view .stats-panel').length).toBe(2);
    });

    it('試合中は出力ボタンを出さない', async () => {
        await openStats();

        expect(document.querySelector('.comparison-export')).toBeNull();
    });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
npm test -- src/App.teamComparison.test.tsx
```

期待: `.team-comparison` が無く失敗する。

- [ ] **Step 3: `App.tsx` を変更する**

import を足す。

```tsx
import { TeamComparison } from './components/TeamComparison';
```

`showStats` のブロックを差し替える。

```tsx
        {showStats ? (
          <div className="stats-view">
            {/* チーム同士の対比。選手別の内訳はこの下の StatsPanel で見る */}
            <TeamComparison
              teamA={state.teamA}
              teamB={state.teamB}
              scoreHistory={state.scoreHistory}
              statHistory={state.statHistory}
              foulHistory={state.foulHistory}
              showThreePoint={state.showThreePoint}
            />

            {/* statHistory は「不明で記録」した分を合計に含めるために渡す */}
            <StatsPanel players={state.teamA.players} teamName={state.teamA.name} teamId="teamA" statHistory={state.statHistory} />
            <StatsPanel players={state.teamB.players} teamName={state.teamB.name} teamId="teamB" statHistory={state.statHistory} />
          </div>
        ) : (
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npm test -- src/App
```

期待: 新しい2件と、既存の App テストがすべて PASS。

- [ ] **Step 5: コミット**

```bash
git add src/App.tsx src/App.teamComparison.test.tsx
git commit -m "feat(comparison): 試合中の統計画面にチーム比較を置く"
```

---

### Task 18: 履歴の試合詳細を3タブにする

**Files:**
- Modify: `src/components/History/History.tsx:33`（`viewMode`）、`:49-53`（戻る操作）、`:150-170`（タブ）、`:198-215`（統計ビュー）
- Create: `src/components/History/History.tabs.test.tsx`

**Interfaces:**
- Consumes: `TeamComparison`（Task 14・16）、`migrateTeam`（既存 import）
- Produces: `viewMode` が `'comparison' | 'stats' | 'scoresheet'`。既定は `'comparison'`

戻る操作の段数は現状と同じにする。様式を開いていたら様式だけ閉じ、それ以外は
詳細ごと閉じる。閉じた先が `'stats'` から `'comparison'` に変わるだけ。

履歴では出力ボタンを出す（`exportable`）。`caption` は日付・大会名・会場を
つないだ1行にする。

- [ ] **Step 1: 既存のタブのラベルを確認する**

```bash
sed -n '153,166p' src/components/History/History.tsx
```

既存の2つは「スタッツ（画面表示）」「スコアシート（保存/PDF）」。**このラベルは
変えない。** 変えると既存テストが参照している名前が消えるうえ、今回の目的
（比較の追加）とは関係のない画面文言の変更になる。足すのは「チーム比較」だけ。

- [ ] **Step 2: 失敗するテストを書く**

`src/components/History/History.tabs.test.tsx`。セットアップは
`src/components/History/History.keyboard.test.tsx`（履歴を localStorage に仕込んで
カードを開く）と `src/App.backSubView.test.tsx`（選手スタッツ入りの記録の作り方）を
合わせた形。

```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { History } from './History';

vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

const gameRecord = {
    id: 'g1',
    date: new Date(Date.UTC(2026, 5, 5)).toISOString(),
    gameName: '第1節',
    location: '市民体育館',
    teamA: {
        id: 't-red', name: 'レッドミニバス', color: 'white', coachName: 'C',
        assistantCoachName: '', timeouts: [], teamFouls: [0, 0, 0, 0],
        coachFouls: [], assistantCoachFouls: [], benchFouls: [],
        players: [{
            id: 'a1', number: 4, name: '一郎', isCaptain: true, isOnCourt: false,
            fouls: [], quartersPlayed: ['starter', false, false, false],
            stats: {
                points: 10, twoPointMade: 5, twoPointAttempt: 9, threePointMade: 0, threePointAttempt: 0,
                freeThrowMade: 0, freeThrowAttempt: 0, offensiveRebounds: 2, defensiveRebounds: 3,
                assists: 2, steals: 1, blocks: 0, turnovers: 1,
                turnoverDD: 0, turnoverTR: 0, turnoverPM: 0, turnoverCM: 0,
            },
        }],
    },
    teamB: {
        id: 't-blue', name: 'ブルーミニバス', color: 'blue', coachName: 'C',
        assistantCoachName: '', timeouts: [], teamFouls: [0, 0, 0, 0],
        coachFouls: [], assistantCoachFouls: [], benchFouls: [],
        players: [{
            id: 'b1', number: 7, name: '三郎', isCaptain: true, isOnCourt: false,
            fouls: [], quartersPlayed: ['starter', false, false, false],
            stats: {
                points: 4, twoPointMade: 2, twoPointAttempt: 8, threePointMade: 0, threePointAttempt: 0,
                freeThrowMade: 0, freeThrowAttempt: 0, offensiveRebounds: 1, defensiveRebounds: 1,
                assists: 0, steals: 0, blocks: 0, turnovers: 3,
                turnoverDD: 0, turnoverTR: 0, turnoverPM: 0, turnoverCM: 0,
            },
        }],
    },
    finalScore: { teamA: 10, teamB: 4 },
    scoreHistory: [], statHistory: [], foulHistory: [],
    showThreePoint: false,
    createdAt: new Date().toISOString(),
};

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('minibasket-game-history', JSON.stringify([gameRecord]));
});

afterEach(cleanup);

/** 一覧から試合詳細を開く */
function openDetail() {
    render(<History onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /第1節/ }));
}

describe('履歴詳細のタブ', () => {
    it('開いた直後はチーム比較が見えている', () => {
        openDetail();

        expect(document.querySelector('.team-comparison')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'チーム比較' }).classList.contains('active')).toBe(true);
    });

    it('スタッツに切り替えると選手別の表が出る', () => {
        openDetail();

        fireEvent.click(screen.getByRole('button', { name: 'スタッツ（画面表示）' }));

        expect(document.querySelectorAll('.stats-panel').length).toBe(2);
        expect(document.querySelector('.team-comparison')).toBeNull();
    });

    it('チーム比較に戻れる', () => {
        openDetail();

        fireEvent.click(screen.getByRole('button', { name: 'スタッツ（画面表示）' }));
        fireEvent.click(screen.getByRole('button', { name: 'チーム比較' }));

        expect(document.querySelector('.team-comparison')).toBeTruthy();
    });

    it('履歴では出力ボタンを出す', () => {
        openDetail();

        expect(document.querySelector('.comparison-export')).toBeTruthy();
    });

    it('日付・大会名・会場を見出しに出す', () => {
        openDetail();

        const caption = document.querySelector('.comparison-caption') as HTMLElement;
        expect(caption.textContent).toContain('第1節');
        expect(caption.textContent).toContain('市民体育館');
    });

    it('3P設定OFFの記録では未使用と示す', () => {
        openDetail();

        expect(screen.getByText('この試合は3Pを使用していません')).toBeTruthy();
    });
});
```

- [ ] **Step 3: 失敗を確認する**

```bash
npm test -- src/components/History/History.tabs.test.tsx
```

期待: 「チーム比較」のボタンが無く失敗する。

- [ ] **Step 4: `History.tsx` を変更する**

import を足す。

```tsx
import { TeamComparison } from '../TeamComparison';
```

`viewMode` の型と既定値を変える。

```tsx
    const [viewMode, setViewMode] = useState<'comparison' | 'stats' | 'scoresheet'>('comparison');
```

戻る操作の戻り先を変える（`:49-53`）。

```tsx
    useBackHandler(selectedRecord !== null, () => {
        if (viewMode === 'scoresheet') {
            setViewMode('comparison');
            return;
        }
        setSelectedRecord(null);
    });
```

タブのボタン（`:150-170` 付近）に「チーム比較」を先頭で足し、既存の2つの
ラベルはそのままにする。既存のボタンの書き方（`className={viewMode === ... ? 'active' : ''}`）に
合わせること。

```tsx
                    <button
                        className={viewMode === 'comparison' ? 'active' : ''}
                        onClick={() => setViewMode('comparison')}
                    >
                        チーム比較
                    </button>
```

統計ビューの手前に比較ビューを足す（`:198` の直前）。

```tsx
                {viewMode === 'comparison' && (
                    <div className="history-comparison-view">
                        <TeamComparison
                            teamA={migrateTeam(selectedRecord.teamA)}
                            teamB={migrateTeam(selectedRecord.teamB)}
                            scoreHistory={selectedRecord.scoreHistory}
                            statHistory={selectedRecord.statHistory}
                            foulHistory={selectedRecord.foulHistory}
                            showThreePoint={selectedRecord.showThreePoint}
                            caption={[
                                formatRecordDate(selectedRecord.date),
                                selectedRecord.gameName,
                                selectedRecord.location,
                            ].filter(Boolean).join('　')}
                            exportable
                            exportName={selectedRecord.gameName}
                        />
                    </div>
                )}
```

**スコアシートの「閉じる」の戻り先も変える。** `RunningScoresheet` に渡している
`onClose={() => setViewMode('stats')}` を `'comparison'` にする。ここを直さないと、
端末の戻る操作は比較へ、画面上の「閉じる」はスタッツへ、と行き先が食い違う。

```bash
grep -n "onClose={() => setViewMode('stats')}" src/components/History/History.tsx
```

- [ ] **Step 5: 既存のタブ関連テストが壊れていないか確認する**

```bash
npm test -- src/components/History
```

既定タブが変わったことで、詳細を開いた直後に選手別スタッツがある前提の
既存テストが落ちる可能性がある。落ちた場合は、そのテストに
「スタッツ（画面表示）」タブを押す1行を足して直す。**アサーション自体は
変えないこと**（変えると、そのテストが守っていた振る舞いが消える）。

- [ ] **Step 6: 全テストを通す**

```bash
npm test
```

期待: すべて PASS。

- [ ] **Step 7: コミット**

```bash
git add src/components/History/
git commit -m "feat(comparison): 履歴の試合詳細を3タブにする"
```

---

### Task 19: 実ブラウザでの確認

自動テストでは分からないところ（レイアウトの崩れ、アニメーションの見え方、
実際の出力画像）を確認する。

**Files:**
- 必要に応じて `src/components/TeamComparison/TeamComparison.css`

**Interfaces:**
- Consumes: これまでの全実装
- Produces: なし（確認と、見つかった崩れの修正）

- [ ] **Step 1: 型とlintを通す**

```bash
npm run lint && npx tsc -b --noEmit && npm test
```

期待: すべてエラー0・PASS。

- [ ] **Step 2: 開発サーバを開く**

preview_start に `{name: "mbcscore"}` を渡す。

- [ ] **Step 3: 試合を記録して統計画面を開く**

新規試合を作り、両チームに得点・リバウンド・AST・TO・ファウルを何件か入れ、
2Q まで進めてから「📊統計」を開く。

- [ ] **Step 4: コンソールとレイアウトを確認する**

- read_console_messages でエラーが出ていないこと
- read_page で比較表の行がすべて出ていること
- バーが伸びること（スクロールして画面に入れたときに動く）

- [ ] **Step 5: スマホ幅で崩れないことを確認する**

resize_window で `{preset: "mobile"}`（375x812）にしたあと、**必ずページを
リロードする**（リサイズだけでは読み込み時の判定が再実行されない）。

確認すること:
- 比較表の行が折り返さず、値が切れていないこと
- ドーナツ3つが並ぶか、破綻せず折り返すこと
- 横スクロールバーが出ていないこと

崩れていたら `TeamComparison.css` を直し、リロードして再確認する。

- [ ] **Step 6: 履歴のタブと戻る操作を確かめる**

履歴から試合を開き、次を確認する。単体テストで組みにくかった経路をここで潰す。

- 開いた直後にチーム比較が出ること
- 「スコアシート（保存/PDF）」を開いてから画面上の「閉じる」を押すと、
  チーム比較に戻ること（スタッツではないこと）
- 同じ状態でブラウザの戻るを押しても、同じくチーム比較に戻ること

- [ ] **Step 7: クォーター切替を試す**

computer で「Q1」を押し、read_page で比較表の値が変わることと、
得点推移がその区間だけになることを確認する。

- [ ] **Step 8: 履歴から出力を試す**

試合を保存して履歴を開き、チーム比較タブから JPEG を出力する。
**出力された画像を実際に開いて**、次を目視で確認する:

- 折れ線が写っていること（Task 1 の結論どおりか）
- ドーナツの色が付いていること（灰色一色になっていないか）
- バーが最終幅で写っていること（伸びかけでないこと）
- 出力ボタンが画像に写っていないこと

いずれかが駄目なら、対応する Task（13 / 15 / 16）に戻って直す。

- [ ] **Step 9: スクリーンショットを撮って報告する**

computer の screenshot で、デスクトップ幅とモバイル幅の2枚を撮る。
出力した JPEG と合わせて、確認結果として報告する。

- [ ] **Step 10: 崩れを直していた場合はコミット**

```bash
git add src/components/TeamComparison/TeamComparison.css
git commit -m "fix(comparison): 狭い画面でのレイアウトを整える"
```

---

### Task 20: 説明書とプロジェクトマップを更新する

**Files:**
- Modify: `PROJECT_MAP.md`
- Modify: `README.md`（説明書に画面の一覧がある場合）

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: 更新が要る箇所を洗い出す**

```bash
grep -n "StatsPanel\|チーム統計パネル\|統計" PROJECT_MAP.md README.md | head -20
```

- [ ] **Step 2: `PROJECT_MAP.md` のコンポーネント一覧に足す**

`components/` の一覧の、`SubstitutionModal/` の前（アルファベット順の位置）に足す。

```
│   ├── TeamComparison/        # チームスタッツ比較（左右対比・Q切替・出力）
```

- [ ] **Step 3: `README.md` に画面の説明を足す**

Step 1 で見つかった統計まわりの説明に、比較画面の記述を1〜2文足す。
「記録済みのデータから作っているので、過去の試合もそのまま見られる」ことと、
「3Pを使わない試合ではその行が未使用と表示される」ことを書く。

- [ ] **Step 4: コミット**

```bash
git add PROJECT_MAP.md README.md
git commit -m "docs: チーム比較画面を説明書とプロジェクトマップに追加"
```

---

## 完了条件

- [ ] `npm test` がすべて PASS
- [ ] `npm run lint` がエラー0
- [ ] `npx tsc -b --noEmit` がエラー0
- [ ] Task 19 の実ブラウザ確認をすべて実施し、出力画像を目視で確認済み
- [ ] `git log --oneline` に Task ごとのコミットが並んでいる
