# チームスタッツ比較画面 設計書

作成日: 2026-08-23
ブランチ: `claude/team-stats-comparison-20260823`

## 1. 背景と目的

このアプリはチーム同士のスタッツを見比べる手段が弱い。いまは選手別の表（`StatsPanel`）を
両チーム分そのまま縦に並べているだけで、「どちらがどれだけ上回ったか」を読み取るには
利用者が目で数字を突き合わせるしかない。

B.LEAGUE公式アプリのチームスタッツ画面に相当する、左右対比のチーム比較画面を追加する。

**記録項目は増やさない。** 速攻得点・2ndチャンス得点・ポテンシャルアシスト・ライブTOの
ような新しい入力は今回のスコープ外とする。既に記録しているデータだけで作れるものに限る。
結果として、型定義も保存形式も変更しないので、**過去に保存した全試合にそのまま効く**
（データ移行は発生しない）。

## 2. スコープ

### やること

- チーム比較コンポーネント `TeamComparison` の新規作成
- 試合中の「📊統計」画面と、履歴の試合詳細の両方への設置
- クォーター絞り込み（全体 / 1Q / 2Q / 3Q / 4Q / OT）
- バーの伸長アニメーション
- JPEG / PDF 出力

### やらないこと

- 新しい記録項目の追加（速攻得点、2ndチャンス得点、ポテンシャルAST、ライブTO）
- Four Factors のレーダーチャート（PPP・TO%・FTR・ORB%・DRB%）。計算自体は既存データで
  可能だが、ポゼッション数が推定式（`FGA - ORB + TO + 0.44 * FTA`）に頼り、この 0.44 は
  NBA由来の係数でミニバスにそのまま当てるのは近似になる。必要になった時点で別途検討する
- 既存 `StatsPanel` の作り替え。比較画面はその隣に足すものであって、置き換えではない

## 3. 画面設計

`TeamComparison` は上から次の順に積む。

### 3.1 スコアヘッダー

- 日付・大会名・会場
- 両チーム名と現在（または最終）スコア
- クォーター別得点表（1Q〜4Q、記録があれば OT、および計）

チーム名の下に、そのチームを表す色の帯を出す。以降のバー・折れ線・ドーナツはすべて
この色で統一し、凡例を兼ねる。

### 3.2 クォーター切替

`全体 / 1Q / 2Q / 3Q / 4Q` のセグメント。OT の記録がある試合だけ `OT` を足す。
既定は「全体」。この切替は 3.3〜3.5 のすべてに効く。

### 3.3 比較表（本体）

1行あたり `左チームの値 ｜ ラベル ｜ 右チームの値` を並べ、中央のラベルから左右へ
バーを伸ばす。B.LEAGUE の画面は両端にバーを置いているが、スマホ幅では中央から
外向きの方が対比が読めるためこちらを採る。

行の並び:

| ラベル | 内容 |
|---|---|
| PTS | 得点 |
| FGM-FGA | (2PM+3PM) - (2PA+3PA) |
| FG% | 上記の成功率 |
| 2FG | 2PM - 2PA |
| 2FG% | |
| 3FG | 3PM - 3PA |
| 3FG% | |
| FT | FTM - FTA |
| FT% | |
| REB | OR + DR |
| OR | オフェンスリバウンド |
| DR | ディフェンスリバウンド |
| AST | アシスト |
| TO | ターンオーバー |
| ST | スティール |
| BS | ブロック |
| F | 選手のファウル数（コーチ・ベンチは含めない。`StatsPanel` の合計と同じ扱い） |

**バーの長さ:**

- 割合の行（FG% / 2FG% / 3FG% / FT%）は 0〜100% の絶対スケール。48.4% と 44.8% が
  ほぼ同じ長さで出るのが正しい
- それ以外の実数の行は、その行の左右の値のうち大きい方を100%とした相対スケール
- 左右とも0の行はバーを描かない

**優劣の強調:**

- 値が大きい側のバーを濃色、小さい側を淡色にする
- 同値のときは両方とも淡色
- **TO と F だけは反転**する（少ない方が濃色）。多い方を強調すると意味が逆に読める

### 3.4 シュート成功率ドーナツ

2P / 3P / FT の3つ。1つの円に自チームを外周リング、相手を内周リングとして二重に描く
（添付参考画像と同じ形）。中央に成功率の数字を出す。

DOM としては、外側から
`外周リング(conic-gradient) > 隙間(背景色) > 内周リング(conic-gradient) > 中央の穴`
の入れ子にする。conic-gradient を持つ2つの要素それぞれに `data-pie-percent` を付ける
（出力時の描き直しに使う。7章参照）。

### 3.5 得点推移

階段状の折れ線。X軸は得点イベントの通し番号、Y軸は累計得点。Q境界に縦の区切り線と
`1Q / 2Q / ...` のラベルを置く。

試合時計は記録していないため、時間軸にはできない。X軸は「何本目の得点か」であって
経過時間ではない、と分かるラベルにする。

`ScoreEntry.runningScoreA / runningScoreB` をそのまま読むので追加計算は不要。

クォーター絞り込み時は、**累計のまま該当区間を切り出す**。Y軸の下端はそのクォーター
開始時点の累計、上端は終了時点の累計になる。0から描き直す（そのクォーター内の増分に
する）ことはしない。試合の流れの中のどこを見ているかが分からなくなるため。

インライン SVG で描く（`polyline`、`stroke-linejoin: round`）。

### 3.6 出力ボタン

JPEG / PDF。既存の `useExportAction` を使い、進捗表示・多重実行の抑止・成否通知は
そのまま流用する。

## 4. データ設計

### 4.1 集計の2経路

| 対象 | 計算元 | 理由 |
|---|---|---|
| 「全体」 | 選手スタッツの合計 ＋「選手不明」で記録した分 | 隣のタブ（`StatsPanel`）の合計と必ず一致させる必要がある |
| クォーター別 | `scoreHistory` / `statHistory` / `foulHistory` から再集計 | 選手スタッツは累計値しか持たないため |

「選手不明」分の扱いは `StatsPanel.sumUnknownStats` と同じ（`playerId === 'unknown'` の
`StatEntry` をチーム分だけ集計して合計に足す）。

ファウルだけは `PlayerStats` に無いので例外になる。「全体」の F は
`players.reduce((n, p) => n + p.fouls.length, 0)`、つまり選手のファウル履歴の長さの合計で
求める（`StatsPanel` の合計行と同じ式）。コーチ・ベンチのファウルは含めない。

### 4.2 履歴からの再集計の仕様

- **成功数** … `ScoreEntry` を `teamId` と `quarter` で絞り、`scoreType` 別に数える
- **試投数** … 成功数 ＋ `StatEntry` の `2PA` / `3PA` / `FTA` の件数
  - 成功したシュートは `ScoreEntry` だけを作り `StatEntry` を作らない
    （[scoreHandlers.ts:17](../../../src/context/reducers/scoreHandlers.ts)）
  - 外したシュートは `StatEntry` だけを作る
    （[statHandlers.ts:28](../../../src/context/reducers/statHandlers.ts)）
  - したがって「成功＋外し」で試投数になる
- **OR / DR / AST / ST / BS / TO** … `StatEntry` の `statType` を数える
- **F** … `FoulEntry` のうち `isCoachOrBench === false` のものを数える
- **オウンゴール** … 得点には数え、シュート成功・試投からは外す。選手スタッツ側の扱い
  （`isOwnGoal` のとき made/attempt を触らない）と揃える。`ScoreEntry.teamId` は
  得点が入る側のチームなので、チーム得点の集計はフラグを見ずに `teamId` で足してよい

### 4.3 純関数への切り出し

```ts
// teamTotals.ts
export type QuarterFilter = 'all' | number;

export interface TeamTotals {
    points: number;
    twoMade: number; twoAttempt: number;
    threeMade: number; threeAttempt: number;
    ftMade: number; ftAttempt: number;
    offensiveRebounds: number; defensiveRebounds: number;
    assists: number; steals: number; blocks: number; turnovers: number;
    fouls: number;
}

export function computeTeamTotals(
    team: Team,
    teamId: string,
    scoreHistory: ScoreEntry[],
    statHistory: StatEntry[],
    foulHistory: FoulEntry[],
    filter: QuarterFilter,
): TeamTotals;
```

```ts
// quarterScores.ts
export interface QuarterScore { quarter: number; teamA: number; teamB: number; }
export function computeQuarterScores(scoreHistory: ScoreEntry[]): QuarterScore[];
export function recordedQuarters(scoreHistory: ScoreEntry[]): number[];
```

集計ロジックは React に依存させず、この2ファイルに閉じ込めて単体テストする。

### 4.4 整合性テスト

**「履歴から計算した全体」と「選手スタッツの合計」が一致する**ことをテストで固定する。
ここが一致しなくなったら、どこかの reducer が選手スタッツを動かしたのに履歴を書いて
いない、というサインになる。比較画面のためだけでなく、記録系全体の回帰検知として置く。

## 5. 3ポイントを使わない試合の表示

`showThreePoint` は[試合オプションから途中変更できる](../../../src/App.tsx)ため、
「設定はOFFだが3Pの記録は存在する」試合が起こりうる。判定を2段にする。

| 状態 | 表示 |
|---|---|
| 設定OFF かつ 3Pの記録が0件 | 3FG / 3FG% の行は残し、値を「—」、バーを描かず、行全体を淡色にする。表の下に「この試合は3Pを使用していません」と一度だけ注記。3Pのドーナツは空のグレーリングにして中央に「未使用」と出す |
| 設定OFF だが3Pの記録がある | 実際の数字をそのまま出す。記録があるのに「未使用」と表示するのは事実に反する |
| `showThreePoint` が未保存の古い記録（optional） | 使用扱いで通常表示。0本なら既存の `formatShot` と同じく「-」になる |

行を隠さないのは、「3Pの行が無い」と「3Pが0本」と「3Pを使っていない」を利用者が
区別できるようにするため。

## 6. アニメーション

- バーは幅0から実値へ CSS transition（400ms、ease-out）
- `IntersectionObserver` で画面に入ったタイミングで発火する。画面外で伸び終わって
  しまうと、スクロールして着いた頃には何も動かない
- クォーターを切り替えたら再生する
- `prefers-reduced-motion: reduce` のときは transition を無効にし、即座に最終値にする
- 出力時は必ず最終値で固定する（7章）

## 7. 画像・PDF出力

既存の `exportElement` に乗せる。3つの手当てが要る。

### 7.1 conic-gradient（ドーナツ）

html2canvas は conic-gradient を描けない。`repaintPieCharts` が既にこれを解決している
（割合から PNG を描き直して背景画像に差し替える）が、色が `--stats-success` /
`--stats-success-pale` 固定になっている。

`readPieSegments` を、まず `--pie-main` / `--pie-rest` を見て、無ければ従来の
`--stats-success` 系に落ちる形に広げる。既存の選手詳細のリバウンド円グラフは
`--pie-main` を持たないので、挙動は変わらない。

### 7.2 インライン SVG（得点推移）

[pdfExport.ts](../../../src/utils/pdfExport.ts) のコメントにあるとおり、html2canvas は
インライン SVG をそのまま描けない（スコアシートの斜線は座標を測って手描きし直している）。

出力用クローンの中で、`data-export-inline` を持つ `<svg>` を `XMLSerializer` で
data URL 化し、同じ寸法の `<img>` に差し替える処理を `prepareExportClone` に足す。

**これは未検証。実装の最初にスパイクで潰す**（10章）。data URL 化でも駄目なら、
折れ線だけ `<canvas>` 描画に切り替える。html2canvas は canvas 要素の中身を
そのままコピーできるため、その経路なら確実に通る。

### 7.3 アニメーションの固定

出力中に付く `exporting` クラスで、バーの transition を無効化し最終幅に固定する。
これが無いと、伸びかけの棒がそのまま画像に写る。

## 8. ファイル構成

### 新規

```
src/components/TeamComparison/
    TeamComparison.tsx          画面の組み立て・クォーター状態・出力ボタン
    ScoreHeader.tsx             スコア＋クォーター別得点表
    ComparisonTable.tsx         比較表（行とバー）
    ComparisonRow.tsx           1行ぶんの左右の値とバー
    ShootingDonuts.tsx          2P/3P/FT の二重リング
    ScoreEvolutionChart.tsx     得点推移
    teamTotals.ts               集計（純関数）
    quarterScores.ts            クォーター別得点（純関数）
    TeamComparison.css
    index.ts
```

各ファイルは1つの役割に絞る。比較表を `ComparisonTable` と `ComparisonRow` に割るのは、
行ごとのバー幅・優劣判定・3P未使用の分岐がすべて行の中で完結するため。

### 変更する既存ファイル

| ファイル | 変更内容 |
|---|---|
| `src/App.tsx` | 統計画面（`showStats`）の先頭に `TeamComparison` を差し込む。既存の `StatsPanel` 2枚はその下にそのまま残す |
| `src/components/History/History.tsx` | `viewMode` を `'comparison' \| 'stats' \| 'scoresheet'` の3値にする。既定は `'comparison'`。端末の戻る操作（`useBackHandler`）の戻り先も `'comparison'` に合わせる |
| `src/utils/pdfExport.ts` | 7.1 の色の一般化と 7.2 の SVG 差し替えを足す |

## 9. テスト計画

- **teamTotals.test.ts** — 全体とクォーター別、選手不明の加算、オウンゴール、
  フリースロー、OT、空データ、コーチ・ベンチファウルの除外
- **teamTotals.consistency.test.ts** — 4.4 の整合性テスト
- **quarterScores.test.ts** — OT を含むクォーター列挙、得点0のクォーター
- **ComparisonRow.test.tsx** — バー幅の比率、左右とも0、割合行の絶対スケール、
  優劣の強調、TO と F の反転
- **ComparisonTable.threePoint.test.tsx** — 5章の3パターン
- **ScoreEvolutionChart.test.tsx** — クォーター区切りの位置、得点が無い試合
- **TeamComparison.export.test.tsx** — `exporting` クラスで transition が消えること、
  SVG が画像に差し替わること
- **History.tabs.test.tsx** — 3タブの切替と、端末の戻る操作の戻り先

## 10. 段取りとリスク

**最初に 7.2 のスパイクをやる。** 得点推移の SVG だけを置いた画面を作って JPEG 出力し、
折れ線が実際に画像に写るかを確かめる。ここが通らないと出力方式が変わり、
`ScoreEvolutionChart` の実装ごと差し替えになるため、他を積む前に確かめる。

その後の順:

1. `teamTotals.ts` / `quarterScores.ts`（純関数とテスト）
2. `ComparisonTable` / `ComparisonRow`（比較表とバー、3P未使用の分岐）
3. `ScoreHeader`
4. `ShootingDonuts`
5. `ScoreEvolutionChart`
6. `TeamComparison` の組み立てとクォーター切替
7. `App.tsx` / `History.tsx` への設置
8. 出力対応（`pdfExport.ts` の2点＋`exporting` クラス）

その他のリスク:

- **タブレット横向きでの表示幅** … 比較表は左右対称なので狭い画面ほど厳しい。
  スマホ縦（375px）で崩れないことを実機幅で確認する
- **得点が0点の試合・記録が空の試合** … ゼロ除算とバー幅0の扱いをテストで固定する
