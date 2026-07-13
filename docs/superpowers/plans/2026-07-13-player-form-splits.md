# 個人詳細の深掘り（直近フォーム＋勝敗別スプリット）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 選手詳細ビューに「直近フォーム（直近5試合 vs 通算平均）」と「勝敗別スプリット（勝ち/負けの平均比較）」の2セクションを追加する。

**Architecture:** 既存の `AggregatedPlayerStats.gameHistory`（`PlayerGameRecord[]`、日付降順）から派生統計を計算する純粋関数を新規モジュールに追加し、2つの新規プレゼンテーショナルコンポーネントが `DetailView` に差し込まれる。新規保存データなし。

**Tech Stack:** React 19 + TypeScript + Vite、テストは Vitest + @testing-library/react。

## Global Constraints

- 新規保存データは不要（既存の試合履歴 `gameHistory` から計算）。
- REBは全箇所で `offensiveRebounds + defensiveRebounds`。
- 直近フォーム: 直近5試合。5未満なら全試合で計算し `isPartial=true`。対象は 得点/REB/AST。比較対象は通算平均。
- 勝敗別: 勝ち/負けの2群のみ（`draw` は除外）。対象は 得点/REB/AST/STL/TO。片側0件は表示側で「—」。
- スコープは直近フォーム＋勝敗別のみ。Q別スタッツ・選手比較・効率指標は対象外。
- 新セクションは `DetailView` の `detailRef` 内に置く（既存のPDF/JPEG出力に自動的に含まれる）。
- テスト実行: 単一ファイルは `npx vitest run <path>`、全体は `npm test`。型チェックは `npx tsc -b`、lintは `npm run lint`。

---

### Task 1: データ層 playerFormStats.ts（純粋関数）

**Files:**
- Create: `src/utils/playerFormStats.ts`
- Test: `src/utils/playerFormStats.test.ts`

**Interfaces:**
- Consumes: `PlayerGameRecord`（`src/utils/playerStatsAnalysis.ts` からimport）、`PlayerStats` / `createInitialStats`（`src/types/game.ts`）
- Produces:
  - `interface FormStats { points: number; rebounds: number; assists: number; }`
  - `interface RecentForm { recentGames: number; recentAvg: FormStats; overallAvg: FormStats; deltas: FormStats; isPartial: boolean; }`
  - `interface SplitStats { points: number; rebounds: number; assists: number; steals: number; turnovers: number; }`
  - `interface WinLossSplit { win: { n: number; avg: SplitStats }; loss: { n: number; avg: SplitStats }; }`
  - `function getRecentForm(gameHistory: PlayerGameRecord[], recentN = 5): RecentForm`
  - `function getWinLossSplit(gameHistory: PlayerGameRecord[]): WinLossSplit`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/playerFormStats.test.ts` を新規作成:

```ts
import { describe, it, expect } from 'vitest';
import { getRecentForm, getWinLossSplit } from './playerFormStats';
import type { PlayerGameRecord } from './playerStatsAnalysis';
import type { PlayerStats } from '../types/game';
import { createInitialStats } from '../types/game';

// gameHistoryは日付降順（新しい順）で渡す
function rec(date: string, result: 'win' | 'loss' | 'draw', s: Partial<PlayerStats>): PlayerGameRecord {
    return {
        gameId: date,
        date,
        opponent: 'X',
        stats: { ...createInitialStats(), ...s },
        result,
        teamScore: 0,
        opponentScore: 0,
    };
}

describe('getRecentForm', () => {
    it('6試合ではrecentN=5で直近5試合の平均、isPartial=false', () => {
        // 新しい順: 直近5試合の得点 = 10,10,10,10,10 → 平均10。最古の1試合(0点)は直近から除外
        const gh = [
            rec('2026-06-06', 'win', { points: 10 }),
            rec('2026-06-05', 'win', { points: 10 }),
            rec('2026-06-04', 'win', { points: 10 }),
            rec('2026-06-03', 'win', { points: 10 }),
            rec('2026-06-02', 'win', { points: 10 }),
            rec('2026-06-01', 'win', { points: 0 }),
        ];
        const form = getRecentForm(gh);
        expect(form.recentGames).toBe(5);
        expect(form.isPartial).toBe(false);
        expect(form.recentAvg.points).toBe(10);
        // 通算平均 = 50/6 ≈ 8.33、deltaは正
        expect(form.deltas.points).toBeGreaterThan(0);
    });

    it('3試合ではisPartial=true、直近平均=通算平均、delta=0', () => {
        const gh = [
            rec('2026-06-03', 'win', { points: 8 }),
            rec('2026-06-02', 'win', { points: 4 }),
            rec('2026-06-01', 'win', { points: 6 }),
        ];
        const form = getRecentForm(gh);
        expect(form.recentGames).toBe(3);
        expect(form.isPartial).toBe(true);
        expect(form.recentAvg.points).toBe(6);
        expect(form.overallAvg.points).toBe(6);
        expect(form.deltas.points).toBe(0);
    });

    it('REBはOR+DRで計算される', () => {
        const gh = [rec('2026-06-01', 'win', { offensiveRebounds: 2, defensiveRebounds: 3 })];
        expect(getRecentForm(gh).recentAvg.rebounds).toBe(5);
    });

    it('空配列ではrecentGames=0・全0・isPartial=true', () => {
        const form = getRecentForm([]);
        expect(form.recentGames).toBe(0);
        expect(form.recentAvg.points).toBe(0);
        expect(form.isPartial).toBe(true);
    });

    it('直近が低いとdeltaは負', () => {
        const gh = [
            rec('2026-06-06', 'loss', { points: 2 }),
            rec('2026-06-05', 'loss', { points: 2 }),
            rec('2026-06-04', 'loss', { points: 2 }),
            rec('2026-06-03', 'loss', { points: 2 }),
            rec('2026-06-02', 'loss', { points: 2 }),
            rec('2026-06-01', 'win', { points: 20 }),
        ];
        expect(getRecentForm(gh).deltas.points).toBeLessThan(0);
    });
});

describe('getWinLossSplit', () => {
    it('勝ち2・負け2・引分1: drawは平均に含まれない', () => {
        const gh = [
            rec('2026-06-05', 'win', { points: 10 }),
            rec('2026-06-04', 'win', { points: 20 }),
            rec('2026-06-03', 'loss', { points: 4 }),
            rec('2026-06-02', 'loss', { points: 6 }),
            rec('2026-06-01', 'draw', { points: 100 }),
        ];
        const split = getWinLossSplit(gh);
        expect(split.win.n).toBe(2);
        expect(split.loss.n).toBe(2);
        expect(split.win.avg.points).toBe(15);
        expect(split.loss.avg.points).toBe(5);
    });

    it('勝ちのみ: loss.n=0', () => {
        const gh = [rec('2026-06-01', 'win', { points: 10 })];
        const split = getWinLossSplit(gh);
        expect(split.win.n).toBe(1);
        expect(split.loss.n).toBe(0);
        expect(split.loss.avg.points).toBe(0);
    });

    it('負けのみ: win.n=0', () => {
        const gh = [rec('2026-06-01', 'loss', { points: 10 })];
        const split = getWinLossSplit(gh);
        expect(split.win.n).toBe(0);
        expect(split.loss.n).toBe(1);
    });

    it('空配列: 両方n=0', () => {
        const split = getWinLossSplit([]);
        expect(split.win.n).toBe(0);
        expect(split.loss.n).toBe(0);
    });

    it('STL/TO/REBも勝敗別に集計される', () => {
        const gh = [
            rec('2026-06-02', 'win', { steals: 3, turnovers: 1, offensiveRebounds: 1, defensiveRebounds: 1 }),
            rec('2026-06-01', 'loss', { steals: 1, turnovers: 5 }),
        ];
        const split = getWinLossSplit(gh);
        expect(split.win.avg.steals).toBe(3);
        expect(split.win.avg.rebounds).toBe(2);
        expect(split.loss.avg.turnovers).toBe(5);
    });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/utils/playerFormStats.test.ts`
Expected: FAIL（`playerFormStats` モジュールが存在しない）

- [ ] **Step 3: playerFormStats.ts を実装**

`src/utils/playerFormStats.ts` を新規作成:

```ts
// 選手詳細の派生統計: 直近フォーム・勝敗別スプリット（純粋関数）

import type { PlayerGameRecord } from './playerStatsAnalysis';

export interface FormStats {
    points: number;
    rebounds: number;   // OR + DR
    assists: number;
}

export interface RecentForm {
    recentGames: number;   // 実際に集計した試合数 = min(recentN, 全試合数)
    recentAvg: FormStats;
    overallAvg: FormStats;
    deltas: FormStats;     // recentAvg - overallAvg
    isPartial: boolean;    // recentGames < recentN
}

export interface SplitStats {
    points: number;
    rebounds: number;   // OR + DR
    assists: number;
    steals: number;
    turnovers: number;
}

export interface WinLossSplit {
    win: { n: number; avg: SplitStats };
    loss: { n: number; avg: SplitStats };
}

const reb = (r: PlayerGameRecord) => r.stats.offensiveRebounds + r.stats.defensiveRebounds;

function avgForm(games: PlayerGameRecord[]): FormStats {
    const n = games.length;
    if (n === 0) return { points: 0, rebounds: 0, assists: 0 };
    const sum = games.reduce(
        (a, g) => ({
            points: a.points + g.stats.points,
            rebounds: a.rebounds + reb(g),
            assists: a.assists + g.stats.assists,
        }),
        { points: 0, rebounds: 0, assists: 0 },
    );
    return { points: sum.points / n, rebounds: sum.rebounds / n, assists: sum.assists / n };
}

export function getRecentForm(gameHistory: PlayerGameRecord[], recentN = 5): RecentForm {
    const recentGames = Math.min(recentN, gameHistory.length);
    const recentAvg = avgForm(gameHistory.slice(0, recentGames));
    const overallAvg = avgForm(gameHistory);
    return {
        recentGames,
        recentAvg,
        overallAvg,
        deltas: {
            points: recentAvg.points - overallAvg.points,
            rebounds: recentAvg.rebounds - overallAvg.rebounds,
            assists: recentAvg.assists - overallAvg.assists,
        },
        isPartial: recentGames < recentN,
    };
}

function avgSplit(games: PlayerGameRecord[]): SplitStats {
    const n = games.length;
    if (n === 0) return { points: 0, rebounds: 0, assists: 0, steals: 0, turnovers: 0 };
    const sum = games.reduce(
        (a, g) => ({
            points: a.points + g.stats.points,
            rebounds: a.rebounds + reb(g),
            assists: a.assists + g.stats.assists,
            steals: a.steals + g.stats.steals,
            turnovers: a.turnovers + g.stats.turnovers,
        }),
        { points: 0, rebounds: 0, assists: 0, steals: 0, turnovers: 0 },
    );
    return {
        points: sum.points / n,
        rebounds: sum.rebounds / n,
        assists: sum.assists / n,
        steals: sum.steals / n,
        turnovers: sum.turnovers / n,
    };
}

export function getWinLossSplit(gameHistory: PlayerGameRecord[]): WinLossSplit {
    const wins = gameHistory.filter(g => g.result === 'win');
    const losses = gameHistory.filter(g => g.result === 'loss');
    return {
        win: { n: wins.length, avg: avgSplit(wins) },
        loss: { n: losses.length, avg: avgSplit(losses) },
    };
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run src/utils/playerFormStats.test.ts`
Expected: PASS（getRecentForm 5件 + getWinLossSplit 5件）

- [ ] **Step 5: 型チェック**

Run: `npx tsc -b`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/utils/playerFormStats.ts src/utils/playerFormStats.test.ts
git commit -m "feat: 直近フォーム・勝敗別スプリットの集計関数を追加"
```

---

### Task 2: RecentForm コンポーネント + DetailView組み込み

**Files:**
- Create: `src/components/PlayerStatsAnalysis/RecentForm.tsx`
- Modify: `src/components/PlayerStatsAnalysis/DetailView.tsx`（import追加、`<div className="stats-cards">` の直前に挿入）
- Modify: `src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.css`（末尾にスタイル追記）
- Test: `src/components/PlayerStatsAnalysis/RecentForm.test.tsx`

**Interfaces:**
- Consumes: `getRecentForm`（Task 1）、`PlayerGameRecord`（`playerStatsAnalysis.ts`）
- Produces: `function RecentForm({ gameHistory }: { gameHistory: PlayerGameRecord[] }): JSX.Element | null`（`recentGames === 0` のとき `null`）

- [ ] **Step 1: 失敗するテストを書く**

`src/components/PlayerStatsAnalysis/RecentForm.test.tsx` を新規作成:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RecentForm } from './RecentForm';
import type { PlayerGameRecord } from '../../utils/playerStatsAnalysis';
import type { PlayerStats } from '../../types/game';
import { createInitialStats } from '../../types/game';

afterEach(cleanup);

function rec(date: string, s: Partial<PlayerStats>): PlayerGameRecord {
    return { gameId: date, date, opponent: 'X', stats: { ...createInitialStats(), ...s }, result: 'win', teamScore: 0, opponentScore: 0 };
}

describe('RecentForm', () => {
    it('試合が0件ならnullを返し何も描画しない', () => {
        const { container } = render(<RecentForm gameHistory={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it('見出しと得点/REB/ASTのラベルを描画する', () => {
        render(<RecentForm gameHistory={[rec('2026-06-01', { points: 10 })]} />);
        expect(screen.getByText('🔥 直近フォーム')).toBeTruthy();
        expect(screen.getByText('得点')).toBeTruthy();
        expect(screen.getByText('REB')).toBeTruthy();
        expect(screen.getByText('AST')).toBeTruthy();
    });

    it('5試合未満はデータ不足の注記を出す', () => {
        render(<RecentForm gameHistory={[rec('2026-06-01', { points: 10 })]} />);
        expect(screen.getByText(/データ不足/)).toBeTruthy();
    });

    it('直近が通算より高い得点はupクラス（↑）で表示される', () => {
        const gh = [
            rec('2026-06-06', { points: 10 }), rec('2026-06-05', { points: 10 }),
            rec('2026-06-04', { points: 10 }), rec('2026-06-03', { points: 10 }),
            rec('2026-06-02', { points: 10 }), rec('2026-06-01', { points: 0 }),
        ];
        const { container } = render(<RecentForm gameHistory={gh} />);
        expect(container.querySelector('.recent-form-card.up')).toBeTruthy();
    });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/components/PlayerStatsAnalysis/RecentForm.test.tsx`
Expected: FAIL（`RecentForm` が存在しない）

- [ ] **Step 3: RecentForm.tsx を実装**

`src/components/PlayerStatsAnalysis/RecentForm.tsx` を新規作成:

```tsx
// 直近フォーム: 直近5試合平均 vs 通算平均

import { getRecentForm } from '../../utils/playerFormStats';
import type { PlayerGameRecord } from '../../utils/playerStatsAnalysis';

interface RecentFormProps {
    gameHistory: PlayerGameRecord[];
}

const CARDS: { key: 'points' | 'rebounds' | 'assists'; label: string }[] = [
    { key: 'points', label: '得点' },
    { key: 'rebounds', label: 'REB' },
    { key: 'assists', label: 'AST' },
];

export function RecentForm({ gameHistory }: RecentFormProps) {
    const form = getRecentForm(gameHistory);
    if (form.recentGames === 0) return null;

    return (
        <div className="recent-form-section">
            <div className="section-title">
                <span className="title-text">🔥 直近フォーム</span>
                <span className="title-note">
                    {form.isPartial
                        ? `直近${form.recentGames}試合（データ不足）`
                        : `直近${form.recentGames}試合 vs 通算平均`}
                </span>
            </div>
            <div className="recent-form-cards">
                {CARDS.map(({ key, label }) => {
                    const delta = form.deltas[key];
                    const dir = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
                    const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '±';
                    const sign = delta > 0 ? '+' : '';
                    return (
                        <div className={`recent-form-card ${dir}`} key={key}>
                            <span className="rf-value">{form.recentAvg[key].toFixed(1)}</span>
                            <span className={`rf-delta ${dir}`}>{arrow} {sign}{delta.toFixed(1)}</span>
                            <span className="rf-label">{label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run src/components/PlayerStatsAnalysis/RecentForm.test.tsx`
Expected: PASS（4テスト）

- [ ] **Step 5: DetailViewに組み込む**

`src/components/PlayerStatsAnalysis/DetailView.tsx` の import群（`import { GrowthComparison } from './GrowthComparison';` の下）に追加:

```ts
import { GrowthComparison } from './GrowthComparison';
import { RecentForm } from './RecentForm';
```

同ファイル内の `<div className="stats-cards">` の**直前**に `RecentForm` を挿入。該当箇所は「試合平均」の `highlight-section` を閉じる `</div>` の直後:

```tsx
                </div>

                <RecentForm gameHistory={player.gameHistory} />

                <div className="stats-cards">
```

- [ ] **Step 6: CSSを追記**

`src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.css` の末尾に追加:

```css
/* 直近フォーム */
.recent-form-section {
    margin: 16px 0;
}

.recent-form-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-top: 10px;
}

.recent-form-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 8px;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    box-shadow: var(--stats-card-shadow);
}

.recent-form-card .rf-value {
    font-size: 1.6rem;
    font-weight: 700;
    color: #1e293b;
}

.recent-form-card .rf-delta {
    font-size: 0.85rem;
    font-weight: 600;
}

.recent-form-card .rf-delta.up {
    color: var(--stats-success);
}

.recent-form-card .rf-delta.down {
    color: var(--stats-danger);
}

.recent-form-card .rf-delta.flat {
    color: #94a3b8;
}

.recent-form-card .rf-label {
    font-size: 0.8rem;
    color: #64748b;
}
```

- [ ] **Step 7: 型チェック・lint**

Run: `npx tsc -b`
Expected: エラーなし

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/components/PlayerStatsAnalysis/RecentForm.tsx src/components/PlayerStatsAnalysis/RecentForm.test.tsx src/components/PlayerStatsAnalysis/DetailView.tsx src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.css
git commit -m "feat: 選手詳細に直近フォームセクションを追加"
```

---

### Task 3: WinLossSplit コンポーネント + DetailView組み込み

**Files:**
- Create: `src/components/PlayerStatsAnalysis/WinLossSplit.tsx`
- Modify: `src/components/PlayerStatsAnalysis/DetailView.tsx`（import追加、`<div className="game-history-section">` の直前に挿入）
- Modify: `src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.css`（末尾にスタイル追記）
- Test: `src/components/PlayerStatsAnalysis/WinLossSplit.test.tsx`

**Interfaces:**
- Consumes: `getWinLossSplit`（Task 1）、`PlayerGameRecord`（`playerStatsAnalysis.ts`）
- Produces: `function WinLossSplit({ gameHistory }: { gameHistory: PlayerGameRecord[] }): JSX.Element`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/PlayerStatsAnalysis/WinLossSplit.test.tsx` を新規作成:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { WinLossSplit } from './WinLossSplit';
import type { PlayerGameRecord } from '../../utils/playerStatsAnalysis';
import type { PlayerStats } from '../../types/game';
import { createInitialStats } from '../../types/game';

afterEach(cleanup);

function rec(date: string, result: 'win' | 'loss' | 'draw', s: Partial<PlayerStats>): PlayerGameRecord {
    return { gameId: date, date, opponent: 'X', stats: { ...createInitialStats(), ...s }, result, teamScore: 0, opponentScore: 0 };
}

describe('WinLossSplit', () => {
    it('見出しと5行のラベルを描画する', () => {
        render(<WinLossSplit gameHistory={[rec('2026-06-01', 'win', { points: 10 })]} />);
        expect(screen.getByText('⚖️ 勝敗別スプリット')).toBeTruthy();
        expect(screen.getByText('得点')).toBeTruthy();
        expect(screen.getByText('STL')).toBeTruthy();
        expect(screen.getByText('TO')).toBeTruthy();
    });

    it('勝ち・負けの試合数を見出しに表示する', () => {
        const gh = [
            rec('2026-06-02', 'win', { points: 10 }),
            rec('2026-06-01', 'loss', { points: 4 }),
        ];
        render(<WinLossSplit gameHistory={gh} />);
        expect(screen.getByText(/勝ち \(n=1\)/)).toBeTruthy();
        expect(screen.getByText(/負け \(n=1\)/)).toBeTruthy();
    });

    it('勝ちのみの場合、負け列は「—」で注記を出す', () => {
        render(<WinLossSplit gameHistory={[rec('2026-06-01', 'win', { points: 10 })]} />);
        expect(screen.getAllByText('—').length).toBeGreaterThan(0);
        expect(screen.getByText(/両方の試合が必要/)).toBeTruthy();
    });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/components/PlayerStatsAnalysis/WinLossSplit.test.tsx`
Expected: FAIL（`WinLossSplit` が存在しない）

- [ ] **Step 3: WinLossSplit.tsx を実装**

`src/components/PlayerStatsAnalysis/WinLossSplit.tsx` を新規作成:

```tsx
// 勝敗別スプリット: 勝ち試合 vs 負け試合の平均スタッツ

import { getWinLossSplit, type SplitStats } from '../../utils/playerFormStats';
import type { PlayerGameRecord } from '../../utils/playerStatsAnalysis';

interface WinLossSplitProps {
    gameHistory: PlayerGameRecord[];
}

const ROWS: { key: keyof SplitStats; label: string }[] = [
    { key: 'points', label: '得点' },
    { key: 'rebounds', label: 'REB' },
    { key: 'assists', label: 'AST' },
    { key: 'steals', label: 'STL' },
    { key: 'turnovers', label: 'TO' },
];

export function WinLossSplit({ gameHistory }: WinLossSplitProps) {
    const split = getWinLossSplit(gameHistory);
    const cell = (side: { n: number; avg: SplitStats }, key: keyof SplitStats) =>
        side.n === 0 ? '—' : side.avg[key].toFixed(1);
    const incomplete = split.win.n === 0 || split.loss.n === 0;

    return (
        <div className="win-loss-split-section">
            <div className="section-title">
                <span className="title-text">⚖️ 勝敗別スプリット</span>
            </div>
            <table className="win-loss-table">
                <thead>
                    <tr>
                        <th></th>
                        <th className="win-col">勝ち (n={split.win.n})</th>
                        <th className="loss-col">負け (n={split.loss.n})</th>
                    </tr>
                </thead>
                <tbody>
                    {ROWS.map(({ key, label }) => (
                        <tr key={key}>
                            <td className="wl-label">{label}</td>
                            <td className="win-col">{cell(split.win, key)}</td>
                            <td className="loss-col">{cell(split.loss, key)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {incomplete && (
                <p className="wl-note">比較には勝ち・負け両方の試合が必要です</p>
            )}
        </div>
    );
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run src/components/PlayerStatsAnalysis/WinLossSplit.test.tsx`
Expected: PASS（3テスト）

- [ ] **Step 5: DetailViewに組み込む**

`src/components/PlayerStatsAnalysis/DetailView.tsx` の import群（`import { RecentForm } from './RecentForm';` の下）に追加:

```ts
import { RecentForm } from './RecentForm';
import { WinLossSplit } from './WinLossSplit';
```

同ファイル内の `<div className="game-history-section">` の**直前**に挿入（`stats-cards` を閉じる `</div>` の直後）:

```tsx
                </div>

                <WinLossSplit gameHistory={player.gameHistory} />

                <div className="game-history-section">
```

- [ ] **Step 6: CSSを追記**

`src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.css` の末尾に追加:

```css
/* 勝敗別スプリット */
.win-loss-split-section {
    margin: 16px 0;
}

.win-loss-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
    background: #fff;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: var(--stats-card-shadow);
}

.win-loss-table th,
.win-loss-table td {
    padding: 8px 10px;
    text-align: center;
    font-size: 0.9rem;
    border-bottom: 1px solid #f1f5f9;
}

.win-loss-table th {
    font-weight: 700;
    background: #f8fafc;
}

.win-loss-table th.win-col {
    color: var(--stats-success);
}

.win-loss-table th.loss-col {
    color: var(--stats-danger);
}

.win-loss-table .wl-label {
    text-align: left;
    font-weight: 600;
    color: #475569;
}

.wl-note {
    margin-top: 8px;
    font-size: 0.8rem;
    color: #94a3b8;
    text-align: center;
}
```

- [ ] **Step 7: 型チェック・lint**

Run: `npx tsc -b`
Expected: エラーなし

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/components/PlayerStatsAnalysis/WinLossSplit.tsx src/components/PlayerStatsAnalysis/WinLossSplit.test.tsx src/components/PlayerStatsAnalysis/DetailView.tsx src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.css
git commit -m "feat: 選手詳細に勝敗別スプリットセクションを追加"
```

---

## Self-Review 結果

- **Spec coverage:** データ層(Task1)、直近フォーム表示(Task2)、勝敗別表示(Task3)、DetailView組み込み＝detailRef内でPDF/JPEG出力対象(Task2/3)、エッジケース（空・部分・片側0）はTask1テスト＋Task2/3コンポーネントで担保。Q別/比較/効率指標はスコープ外で全タスク非対象。すべてカバー。
- **Placeholder scan:** プレースホルダなし。全ステップに実コード/実コマンドあり。
- **Type consistency:** `FormStats`/`SplitStats`/`RecentForm`/`WinLossSplit`、`getRecentForm`/`getWinLossSplit` をTask1で定義しTask2/3で同名consume。`PlayerGameRecord` は `playerStatsAnalysis.ts` からimport一貫。REBは全箇所 `OR+DR`。挿入アンカー（`<div className="stats-cards">` / `<div className="game-history-section">`）は既存DetailViewに実在。
