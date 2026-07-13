# 3Pボタンの試合ごと表示/非表示 — 設計

- 日付: 2026-07-13
- ステータス: 設計承認済み（実装計画待ち）

## 背景・目的

JBAミニバスケットボール（U12）のコートには3ポイントラインが無く、成功シュートはすべて2点である。しかし現状のMBCscoreは3Pの入力ボタン・スタッツ・得点処理を無条件で備えており、純粋なミニバス記録としては非準拠になり得る。

一方で、U15や一般・練習試合への流用ニーズもあるため、3Pを一律に廃止するのではなく、**試合ごとに3P入力ボタンの表示/非表示を切り替えられる**ようにする。

## スコープ

### やること
- `Game`状態に3P表示フラグを1つ持たせる
- GameSetupの確認ステップにOn/Offトグルを追加（新規試合の初期値はOFF＝非表示）
- ActionButtonsの3P入力ボタン（成功=上スワイプ / ミス3PA=下スワイプ）をフラグで出し分け
- 既存の保存済み試合との後方互換

### やらないこと（YAGNI・今回のスコープ外）
- 統計パネル・ランニングスコアシート・PlayerStatsAnalysisの3P列/表示（データがあれば表示は継続）
- EditActionModalの種別変更における3P選択肢
- 音声入力「3点」コマンド
- アプリ全体設定への「デフォルト初期値」保持（初期値は一律OFF固定）

将来「純ミニバス表示」に統一したくなった場合は別タスクで拡張する。

## 設計判断（ユーザー合意事項）

| 論点 | 決定 |
|---|---|
| 適用範囲 | 入力ボタンのみ（表示全般には及ばない） |
| 設定の置き場所 | 試合ごと（アプリ全体設定ではない） |
| 新規試合の初期値 | OFF（3P非表示） |

## データモデル

`src/types/game.ts` の `Game` インターフェースに追加:

```ts
export interface Game {
    // ...既存フィールド...
    showThreePoint: boolean;  // 3P入力ボタンを表示するか（試合ごと）
}
```

- `createInitialGame()` は `showThreePoint: false` を設定する（新規試合はデフォルト非表示）。
- 試合ごとの状態としてGameに保持されるため、`gameSessionStorage`/`gameHistoryStorage`による永続化は追加対応不要（Gameをまるごと保存しているため自動的に含まれる）。

## UI

`src/components/GameSetup/GameSetup.tsx` の `confirm` ステップ、「マイチームの使用番号」の近くにトグルを1つ追加する。

- ラベル: 「3Pシュートを使う」
- ヒント文: 「ミニバスは通常OFF。U15/一般で使う場合はON」
- 初期状態: `false`（OFF）
- 既存のトグル/ラジオUI（`number-type-option`等）の見た目を踏襲する。
- `GameSetupProps.onComplete` のsetupData型に `showThreePoint: boolean` を追加する。

## データフロー

```
GameSetup(トグル state) 
  → onComplete({ ..., showThreePoint })
  → App.handleGameSetupComplete
  → dispatch SET_TEAMS { teamA, teamB, showThreePoint }
  → handleSetTeams が state.showThreePoint に反映
  → App が game.showThreePoint を <ActionButtons showThreePoint={...}/> に渡す
  → ActionButtons が 3P の SwipeableScoreButton を条件レンダリング
```

### 変更点の詳細

1. **`src/components/GameSetup/GameSetup.tsx`**
   - `showThreePoint` の `useState<boolean>(false)` を追加
   - confirmステップにトグルUIを追加
   - `handleConfirm` の `onComplete(...)` に `showThreePoint` を含める
   - `GameSetupProps` の `onComplete` シグネチャに `showThreePoint: boolean` を追加

2. **`src/App.tsx`（`handleGameSetupComplete`）**
   - `setupData` 型に `showThreePoint: boolean` を追加
   - `dispatch({ type: 'SET_TEAMS', payload: { teamA, teamB, showThreePoint } })` に含める
   - 試合画面の `<ActionButtons>` に `showThreePoint={game.showThreePoint}` を渡す

3. **`src/context/reducers/gameFlowHandlers.ts`（`handleSetTeams`）**
   - payloadから `showThreePoint` を受け取り、返すstateに設定する
   - payloadに含まれない場合（既存の他呼び出し経路がある場合）は現在のstate値を維持する

4. **`src/components/ActionButtons/ActionButtons.tsx`**
   - props に `showThreePoint?: boolean` を追加（**未指定時のデフォルトは `true`**＝後方互換）
   - 3Pの `SwipeableScoreButton` を `{showThreePoint && (...)}` で出し分け

## 後方互換・マイグレーション

既存の保存済み試合（セッション/履歴）には `showThreePoint` フィールドが存在しない。

- `src/context/reducers/gameFlowHandlers.ts` の `handleRestoreGame` で、`game.showThreePoint === undefined` の場合は **`true`（表示）** に補完する。
  - 理由: 過去の試合は「3P常時表示」の挙動下で記録されたため、再開・再表示時も従来どおり3P入力できる状態を保つ。
- 新規試合のみ「初期OFF」が適用される（`createInitialGame()` の既定値）。
- `ActionButtons` 側もprop未指定時 `true` とし、二重に後方互換を担保する。

## テスト

`src/context/gameReducer.test.ts`（reducer）:
- `SET_TEAMS` のpayloadに `showThreePoint: false` を渡すと `state.showThreePoint === false` になる
- `SET_TEAMS` のpayloadに `showThreePoint: true` を渡すと `state.showThreePoint === true` になる
- `RESTORE_GAME` で `showThreePoint` が無いGameを復元すると `showThreePoint === true` に補完される

`ActionButtons` コンポーネントテスト（新規 `ActionButtons.test.tsx`）:
- `showThreePoint={false}` のとき 3Pボタンが描画されない（2P/FTは描画される）
- `showThreePoint={true}` のとき 3Pボタンが描画される
- prop未指定のとき 3Pボタンが描画される（後方互換）

## リスク・留意点

- スコープ外の3P列（スタッツ/スコアシート）は非表示にしないため、「ボタンは無いのに集計表示に3P欄がある」状態は仕様として許容する（純ミニバス表示への統一は将来タスク）。
- 既存試合の途中再開では3Pが表示され続ける（マイグレーション既定 `true`）。これは意図的挙動。
