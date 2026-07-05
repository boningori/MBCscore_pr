# MBCscore フェーズ2 設計書: コード重複解消・lint解消リファクタリング

**作成日**: 2026-07-05
**ステータス**: 承認済み
**前提**: フェーズ1（商用品質化）完了済み。32テスト・CI（test+build）が安全網として存在する。

## 目的

CODE_REVIEW_REPORT.mdが指摘したコード重複（全体の30〜40%）とlintエラー55件を解消し、保守コストを下げる。**挙動は一切変えない。**

## 大原則: 挙動不変

- UI・操作フロー・保存データ形式・localStorageキーを変更しない
- 各作業グループの完了ごとに「npm test 全パス＋npm run build 成功＋lintエラー数の単調減少」を確認して小さくコミット
- 公開関数のシグネチャを維持し、呼び出し側の変更を最小化する

## 承認済みの選択

- **スコープ**: 全部入り（ストレージ共通化・useSwipe・チーム管理共通化・CSS統合・GameContext機械的分割・lint解消→CI追加）
- **チーム管理の方式**: 案A「共通フック＋共通部品の抽出」。3コンポーネント（MyTeamManager/OpponentManager/TeamManager）は残し、重複ロジックのみ抽出。1つへの統合（案B）はリスク過大のため不採用

## 作業グループ（実施順）

### A. ストレージ共通化

- 新設 `src/utils/createStorage.ts`: `createJsonStorage<T>(key: string, fallback: T)` が `{ load(): T; save(value: T): void; clear(): void }` を返す
- save失敗時は既存の `notifyStorageError` を呼ぶ（フェーズ1の通知経路を維持）
- `teamStorage.ts` / `gameHistoryStorage.ts` / `gameSessionStorage.ts` / `appSettings.ts` / `playerStatsAnalysis.ts`（hiddenPlayers部分）の内部実装を置き換える
- **公開関数（saveMyTeam等）のシグネチャ・localStorageキー・JSON形式は不変**
- テスト: createStorageの単体テスト新設＋既存の往復テストがそのままパスすること

### B. useSwipe抽出

- 新設 `src/hooks/useSwipe.ts`: SwipeableScoreButton / SwipeableReboundButton / SwipeableTurnoverButton の重複タッチロジックを統合
- 現行の閾値・判定ロジック値を維持（上フリック=成功、下フリック=ミス、タップ=ポップアップ）
- devDependency追加: `@testing-library/react`（フックテスト用。runtime依存は追加しない）
- テスト: useSwipeの単体テスト新設

### C. チーム管理共通化（案A）

- 新設 `src/components/TeamShared/`:
  - `useTeamImportExport.ts` — インポート/エクスポート/JSONバリデーション（500msデバウンス）の共通フック。ストレージ関数はパラメータ注入
  - `ImportConfirmPanel.tsx` / `TextImportPanel.tsx` / `DeleteConfirmModal.tsx` — 共通UI部品
- MyTeamManager / OpponentManager / TeamManager が上記を利用。各画面固有の差分（マイチーム/対戦チームの別、番号タイプ等）は各画面に残す
- 削減目標: 約1,000行
- 検証: 既存テスト＋プレビューでの手動スモーク（チーム登録・編集・インポート・エクスポート・削除）

### D. CSS統合

- 新設 `src/styles/common-components.css`: `.modal-overlay` / `.modal-content` / `.spinner` / `@keyframes spin` 等の重複定義を集約
- 重複元6ファイル（MyTeamManager.css / OpponentManager.css / TeamManager.css / SwipeableScoreButton.css / SwipeableReboundButton.css / History.css）から該当定義を削除
- 検証: プレビューで対象画面の見た目が同一であること

### E. GameContext機械的分割

- 新設 `src/context/reducers/`: ケース群を機能別ハンドラ関数として抽出
  - `scoreHandlers.ts`（ADD_SCORE / REMOVE_SCORE / EDIT_SCORE / CONVERT_* / TOGGLE_OWN_GOAL）
  - `statHandlers.ts`（ADD_STAT / REMOVE_STAT / EDIT_STAT）
  - `foulHandlers.ts`（ADD_FOUL / ADD_FOUL_WITH_FREE_THROWS / REMOVE_FOUL）
  - `pendingHandlers.ts`（ADD/RESOLVE/REMOVE/UPDATE系のPENDING_ACTION）
  - `gameFlowHandlers.ts`（SET_TEAMS / START_GAME / END_QUARTER / END_GAME / SUBSTITUTE_PLAYER / ADD_PLAYER_TO_TEAM / ADD_TIMEOUT / RESTORE_GAME / RESET_GAME ほか）
- 各ハンドラは `(state: Game, payload: ...) => Game` の純関数。コード本体はコピー移動のみで**セマンティクス変更ゼロ**
- `GameContext.tsx` の gameReducer は委譲するだけの薄いswitchに（目標300行以下）
- 合格条件: 既存のgameReducerテストが**無変更で**パスすること

### F. lint 55件解消 → CIにlint追加

- C/Eで消えるコードを先に直さないため、**最後に実施**
- 種別ごとの方針:
  - `@typescript-eslint/no-explicit-any`（14件）: 実際の型を定義（GameActionのpayload等）
  - `no-case-declarations`（7件）: case節をブレースで囲む
  - `react-hooks/set-state-in-effect`（10件+）: レンダー中調整またはイベントハンドラへの移動（実質的な潜在バグ修正。1件ずつ挙動確認）
  - `no-var` / `prefer-const` / `no-unused-vars` / `no-useless-escape`: 機械的修正
  - `react-refresh/only-export-components`（2件）: 非コンポーネントexportを別ファイルへ移動
- 完了後 `.github/workflows/ci.yml` に `npm run lint` ステップを追加
- warningの`react-hooks/exhaustive-deps`（4件）は挙動変更リスクがあるため**無理に消さない**（個別判断し、消せないものはコメントで理由を明記）

## 成功基準

1. `npm run lint` が**エラー0件**
2. `npm test` 全パス（既存32件＋新規のcreateStorage/useSwipeテスト）、CIグリーン（lintステップ込み）
3. 重複削減 合計約2,000行、GameContext.tsxが300行以下
4. プレビューでの手動スモーク（試合記録フロー・チーム管理CRUD・スコアシート表示）で挙動同一

## スコープ外（やらないこと）

- 新機能・UI/文言変更
- App.tsxの状態管理分割（ModalContext等） — フェーズ3候補
- eslint 10 / vite 8 / TypeScript 6 へのメジャー更新
- 本番デプロイ（別途実施。フェーズ1の改善が未デプロイである点に注意）
