# 3P非表示時のファウルフロー2P固定化 ＆ クォーター時間設定（6分/5分） — 設計

- 日付: 2026-07-21
- ステータス: 設計承認済み（実装計画待ち）

## 背景・目的

### 課題1: シュートファウル入力の3P選択肢

2026-07-13の「3Pボタンの試合ごと表示/非表示」対応では、得点入力のActionButtonsのみが`showThreePoint`フラグの対象で、ファウル入力フロー（FoulInputFlow）のシュート状況選択「2Pシュート中／3Pシュート中」はスコープ外だった。その結果、3P非表示の試合（ミニバス）でもシュートファウル時に「3Pシュート中」ボタンが表示される。

3P非表示の試合ではシュートファウルは常に2P扱いとし、**シュート状況選択ステップ自体をスキップ**して直接「シュートの結果」へ進める（タップ数も減る）。

### 課題2: クォーター時間

現状クォーター時間は6分固定（OTは3分）。実際にはJBAミニバス公式は6分だが、地方大会などで5分運用がある。クォーター時間を**試合ごとに6分/5分から選択**できるようにする。

現在クォーター長を参照しているのはタイムアウト入力モーダルの「残り時間」ドロップダウンのみ（アプリにゲームクロック機能はない）。

## スコープ

### やること
- `FoulInputFlow`に`showThreePoint` propを追加し、`false`時はシュート状況選択をスキップして2P固定
- `Game`状態に`quarterMinutes: 5 | 6`を追加（デフォルト6）
- GameSetupにクォーター時間（6分/5分）の選択UIを追加
- 試合中の設定画面に6分/5分の切り替えを追加（新アクション`SET_QUARTER_MINUTES`）
- `TimeoutInputModal`のハードコード`6`を`quarterMinutes` propに置き換え
- 既存の保存済み試合との後方互換（未定義→6分に補完）

### やらないこと（YAGNI・今回のスコープ外）
- 任意分数の自由入力（6分/5分の2択のみ）
- OTの時間変更（3分固定のまま）
- ゲームクロック（走るタイマー）機能の追加
- EditActionModal・統計パネル等の3P表示制御（2026-07-13設計のスコープ外方針を踏襲）

## 設計判断（ユーザー合意事項）

| 論点 | 決定 |
|---|---|
| ファウルフローの3P非表示時挙動 | シュート状況選択ステップをスキップ（2P自動選択） |
| クォーター時間の設定場所 | 試合ごと（GameSetup＋試合中の設定画面） |
| クォーター時間の選択肢 | 6分/5分の2択 |
| OT | 3分固定 |
| 既存試合の扱い | 6分として補完 |

## 変更1: FoulInputFlow の3P非表示対応

### props

`src/components/FoulInputFlow/FoulInputFlow.tsx`:

```ts
interface FoulInputFlowProps {
    // ...既存...
    showThreePoint?: boolean;  // 3P入力を使う試合か（未指定時true＝後方互換）
}
```

ActionButtonsと同じパターン（未指定時`true`）。

### フロー変更

- **Pファウル長押し**（`handlePFoulLongPress`）: `showThreePoint === false`なら`setShotSituation('2P')`して`shotSituation`ステップを飛ばし、直接`shotResult`ステップへ。`true`なら従来どおり`shotSituation`ステップへ。
- **戻るボタン**（`handleBack`）の整合:
  - `shotResult`から戻る: `showThreePoint === false`なら`foulType`へ（`foulType`と`shotSituation`をリセット）。従来は`shotSituation`へ。
  - `ftCount`から戻る（Pシュートファウル時）: `showThreePoint === false`なら`shotResult`へ。従来は`shotSituation`へ。
- 記録データは従来どおり`shotSituation: '2P'`として`onComplete`に渡す。リデューサー・FT本数推奨ロジック（`suggestFreeThrowCount`）の変更は不要。

### 呼び出し側（App.tsx）

`FoulInputFlow`の3箇所の呼び出しすべてに`showThreePoint={state.showThreePoint}`を渡す:
1. 通常のファウル入力
2. 保留アクション解決時
3. ベンチファウル（`shooter`ステップから始まりシュート状況選択を通らないため実質影響なしだが、一貫性のため渡す）

## 変更2: クォーター時間設定

### データモデル

`src/types/game.ts`:

```ts
export interface Game {
    // ...既存...
    quarterMinutes: 5 | 6;  // クォーター時間（分）。試合ごと・デフォルト6
}
```

- `createInitialGame()`は`quarterMinutes: 6`を設定。
- 未使用の`QUARTER_DURATION_SECONDS`定数は`DEFAULT_QUARTER_MINUTES = 6`に置き換え、`createInitialGame`から参照する。
- Gameをまるごと保存する既存の永続化（セッション/履歴/バックアップ）に自動的に含まれるため、保存側の追加対応は不要。

### UI

1. **GameSetup**（`confirm`ステップ、3Pトグルの近く）:
   - ラベル: 「クォーター時間」、選択肢「6分（公式）」「5分」
   - 初期値: 6分
   - 既存の選択UIパターンを踏襲
   - `onComplete`のsetupData型に`quarterMinutes: 5 | 6`を追加

2. **試合中の設定画面**（App.tsx内、3P切り替えと同じ場所）:
   - 6分/5分の2ボタン切り替え（3Pの「使う/使わない」と同じ見た目）
   - `dispatch({ type: 'SET_QUARTER_MINUTES', payload: { quarterMinutes } })`

### リデューサー

- `SET_TEAMS`のpayloadに`quarterMinutes?: 5 | 6`を追加。`handleSetTeams`は`quarterMinutes ?? state.quarterMinutes`で反映（showThreePointと同型）。
- 新アクション`SET_QUARTER_MINUTES`: `state.quarterMinutes`を更新するだけ（`src/context/reducers/index.ts`に追加）。

### 参照側（TimeoutInputModal）

`src/components/TimeoutInputModal/TimeoutInputModal.tsx`:

```ts
// 変更前
const quarterDuration = currentQuarter > 4 ? 3 : 6;
// 変更後（quarterMinutes propを追加）
const quarterDuration = currentQuarter > 4 ? 3 : quarterMinutes;
```

- props に `quarterMinutes?: 5 | 6`（未指定時6＝後方互換）を追加。
- App.tsxの呼び出しに`quarterMinutes={state.quarterMinutes}`を渡す。
- 残り時間ドロップダウンの分の範囲（`quarterDuration + 1`個）・経過分数計算は既存ロジックのまま自動追従する。

## 後方互換・マイグレーション

`quarterMinutes`が存在しない既存データはすべて**6分**に補完する（過去の試合は6分固定時代の記録のため）:

- `handleRestoreGame`（gameFlowHandlers.ts）: `game.quarterMinutes ?? 6`
- `History.tsx`の履歴復元: `quarterMinutes ?? 6`（showThreePointの既存補完と同じ場所）
- `TimeoutInputModal`のprop未指定時デフォルト6で二重に担保

`FoulInputFlow`はprop未指定時`true`（従来挙動）で後方互換。

## テスト

リデューサー（`gameReducer.test.ts`または新規ファイル、既存showThreePointテストと同型）:
- `createInitialGame().quarterMinutes === 6`
- `SET_TEAMS`で`quarterMinutes: 5`を渡すと反映される
- `SET_TEAMS`で未指定なら現在値を維持する
- `SET_QUARTER_MINUTES`で切り替えられる
- `RESTORE_GAME`で`quarterMinutes`が無い試合は6に補完される

FoulInputFlowコンポーネントテスト（新規）:
- `showThreePoint={false}`: Pファウル長押しでシュート状況選択が表示されず、直接「シュートの結果」が表示される
- `showThreePoint={false}`: シュート結果画面から戻るとファウル種類選択に戻る
- `showThreePoint={true}`（および未指定）: 従来どおり「2Pシュート中／3Pシュート中」の選択が表示される

## リスク・留意点

- 試合途中でクォーター時間を変更した場合、過去に記録済みのタイムアウトの経過分数は再計算しない（記録時点の設定で確定）。運用上は試合開始前に設定する想定。
- 3P表示の試合で記録した`shotSituation: '3P'`のファウルは、途中で3P非表示に切り替えても記録としてはそのまま残る（許容）。
- `public/manual.html`にクォーター時間・ファウルフローの記述があれば実装時に追随更新する。
