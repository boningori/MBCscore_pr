# 個人詳細の深掘り（直近フォーム＋勝敗別スプリット）— 設計

- 日付: 2026-07-13
- ステータス: 設計承認済み（実装計画待ち）
- 位置づけ: 「スタッツ分析の拡充」サブプロジェクト **A**（後続: B チーム分析 / C 選手比較）

## 背景・目的

選手スタッツ分析の個人詳細ビュー（`DetailView`）は既に充実している（試合平均±標準偏差、シュート成功率、リバウンド比率、パフォーマンス表、累計、試合別テーブル、スタッツ推移グラフ）。ここに、コーチが「調子」と「勝敗との関係」を把握できる2つの視点を追加する。

- **直近フォーム**: 直近N試合の平均を通算平均と比較し、上り調子/下り調子を可視化。
- **勝敗別スプリット**: 勝ち試合と負け試合での平均スタッツを並べ、勝敗に効く要素を把握。

## スコープ

### やること
- 既存の `AggregatedPlayerStats.gameHistory`（`PlayerGameRecord[]`）から2つの派生統計を計算する純粋関数を追加。
- `DetailView` に「直近フォーム」「勝敗別スプリット」の2セクションを追加（新規サブコンポーネント）。
- 新規保存データは不要（既存の試合履歴から計算）。

### やらないこと（YAGNI・スコープ外）
- Q別スタッツ（scoreHistory/statHistoryのQ別集計）→ サブプロジェクトB（チーム分析）で共通ロジックを整備してから。
- 選手比較（C）。
- eFG%等の高度効率指標。

## 設計判断（ユーザー合意事項）

| 論点 | 決定 |
|---|---|
| Aに含める機能 | 直近フォーム＋勝敗別スプリット（Q別は今回除外） |
| 直近フォームの試合数 | 直近5試合。5未満なら全試合で計算し「データ不足」注記 |
| 直近フォームの比較対象 | 通算平均（↑↓と差分を表示） |
| 直近フォームの対象スタッツ | 得点・REB・AST（既存の試合平均ハイライトと統一） |
| 勝敗別のレイアウト | 2列（勝ち n / 負け n） |
| 勝敗別の対象スタッツ | 得点・REB・AST・STL・TO |
| 引き分けの扱い | 除外（注記） |
| 勝ち/負けが0試合の側 | 「—」表示＋「比較には両方の試合が必要」注記 |

## データ層（新規ファイル）

`src/utils/playerFormStats.ts` — 純粋関数。入力は `PlayerGameRecord[]`（`playerStatsAnalysis.ts` からimport）。`gameHistory` は `aggregatePlayerStats` により日付降順（新しい順）でソート済み。

REBは全箇所で `offensiveRebounds + defensiveRebounds` として扱う。

### 型

```ts
// 直近フォームの主要3スタッツ（試合平均ハイライトと統一）
export interface FormStats {
    points: number;
    rebounds: number;   // OR + DR
    assists: number;
}

export interface RecentForm {
    recentGames: number;   // 実際に集計した試合数（min(recentN, 全試合数)）
    recentAvg: FormStats;  // 直近recentGames試合の平均
    overallAvg: FormStats; // 全試合の平均
    deltas: FormStats;     // recentAvg - overallAvg（符号付き）
    isPartial: boolean;    // recentGames < recentN のとき true
}

// 勝敗別の対象5スタッツ
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
```

### 関数

```ts
export function getRecentForm(gameHistory: PlayerGameRecord[], recentN = 5): RecentForm;
export function getWinLossSplit(gameHistory: PlayerGameRecord[]): WinLossSplit;
```

- `getRecentForm`:
  - `recentGames = Math.min(recentN, gameHistory.length)`
  - `recentAvg` = 先頭 `recentGames` 件（＝直近）の平均、`overallAvg` = 全件の平均。
  - `gameHistory` が空なら全て0・`isPartial=true`。
  - 各スタッツ: `points`, `rebounds = OR+DR`, `assists`。
- `getWinLossSplit`:
  - `result === 'win'` の試合群、`result === 'loss'` の試合群それぞれで平均を計算。`draw` は両群に含めない。
  - 該当0件の側は `n: 0, avg: {全て0}`（表示側で「—」判定に使う）。

### テスト `src/utils/playerFormStats.test.ts`

- getRecentForm:
  - 6試合で recentN=5 → recentGames=5、直近5件の平均を返す。
  - 3試合で recentN=5 → recentGames=3、isPartial=true、recentAvg==overallAvg。
  - 空配列 → 全0・isPartial=true。
  - deltas の符号: 直近が高い→正、低い→負。
- getWinLossSplit:
  - 勝ち2・負け2・引分1 → win.n=2, loss.n=2、drawは平均に含まれない。
  - 勝ちのみ → loss.n=0。
  - 負けのみ → win.n=0。
  - 空 → win.n=0, loss.n=0。

## 表示層（新規コンポーネント）

`DetailView.tsx`（現282行）を肥大化させないため2ファイルに分離。styleは既存の `PlayerStatsAnalysis.css` に追記（既存のDetailViewサブUIと同じ配置方針）。

### `src/components/PlayerStatsAnalysis/RecentForm.tsx`

- Props: `{ gameHistory: PlayerGameRecord[] }`
- 内部で `getRecentForm(gameHistory)` を呼ぶ。
- 得点/REB/AST の3カード。各カード: 直近平均値（大）、通算比の差分（`↑ +0.8` 緑 / `↓ -0.3` 赤 / `± 0` 中立）。
- `isPartial` 時はセクション見出し脇に「直近{recentGames}試合（データ不足）」の注記。差分がちょうど0は中立表示。

### `src/components/PlayerStatsAnalysis/WinLossSplit.tsx`

- Props: `{ gameHistory: PlayerGameRecord[] }`
- 内部で `getWinLossSplit(gameHistory)` を呼ぶ。
- 2列テーブル: 見出し「勝ち (n=X)」「負け (n=Y)」、行は 得点/REB/AST/STL/TO。値は平均を小数1桁。
- 片側 `n===0` の列は各値「—」。両方またはどちらかが0のとき「比較には勝ち・負け両方の試合が必要です」の注記を表示。

### `DetailView.tsx` への組み込み

`detailRef` 内（PDF/JPEG出力対象）に以下の順で挿入:

```
試合平均（既存 highlight-section）
  → <RecentForm gameHistory={player.gameHistory} />      // 新
stats-cards（既存: シューティング/リバウンド/パフォーマンス/累計）
  → <WinLossSplit gameHistory={player.gameHistory} />    // 新
試合別詳細（既存 game-history-section）
<GrowthComparison ... />（既存）
```

## リスク・留意点

- 試合数が少ない選手（1〜2試合）でも破綻しないこと（直近フォームは全試合＝通算と一致し差分0、勝敗別は片側「—」）。0除算を避ける。
- 新セクションは `detailRef` 内に置くため既存のPDF/JPEG出力に自動で含まれる（縦に伸びるだけ、レイアウト崩れに注意）。
- 純粋関数・localStorage不要のため、方針（ローカル完結・信頼性優先）に整合。
