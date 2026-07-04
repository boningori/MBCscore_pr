# MBCscore 商用品質化 設計書

**作成日**: 2026-07-04
**ステータス**: 承認済み
**方針**: ローカル完結のまま信頼性・法務・セキュリティを商用水準に引き上げる。リファクタリングは最小限。

## 背景と目的

MBCscoreは機能面では完成度が高いが、商用提供には以下のギャップがある:

1. データがlocalStorageのみで、ブラウザのデータ消去・iOS Safariの7日自動削除（ITP）・容量超過で全データ消失のリスク
2. React Error Boundaryがなく、レンダリングエラー1件で試合記録中に白画面になる
3. テストがゼロ（スコア集計の正確性が製品価値そのもの）
4. Gemini APIキーをURLクエリパラメータで送信している
5. 利用規約・プライバシーポリシー・OSSライセンス表記がない（児童の個人情報を扱うアプリとして必須）

### 決定事項（ユーザー承認済み）

- **提供形態**: ローカル完結を維持。クラウド同期・アカウント機能はスコープ外（将来のフェーズ2）
- **改修の深さ**: 信頼性優先、リファクタリングは最小限。動いているコードは触らない
- **エラー監視**: 外部監視（Sentry等）は導入しない。ローカルエラーログ＋ユーザーによる手動送付
- **データ保全**: 案C「localStorage維持＋IndexedDBミラーバックアップ」を採用

## 1. データ保全 — ミラーバックアップ

### 新規モジュール `src/utils/mirrorBackup.ts`

- ライブラリ不使用（素のIndexedDB API）
- アプリの全localStorageデータ（`minibasket-*` / `mbc_*` プレフィックスのキー）を1スナップショットとしてIndexedDBに保存
- スナップショットは `{ timestamp, entries: Record<key, value> }` 形式。直近**10世代**を保持し、古い世代は自動削除
- IndexedDB失敗時（プライベートブラウズ等）は静かに無効化し、アプリ動作には影響させない

### トリガー

1. 試合セッション保存時 — App.tsxの既存500msデバウンス保存処理に相乗り（追加デバウンスとして、ミラーは最短30秒間隔に制限しI/O負荷を抑える）
2. アプリ起動時
3. 試合終了時（即時、間隔制限なし）

### 永続化要求

起動時に `navigator.storage.persist()` を1回要求。結果はローカルに記録し、拒否されても機能は継続。

### 消失検知と復元

起動時、localStorageにアプリデータがゼロなのにIndexedDBにスナップショットがある場合、「以前のデータが見つかりました。復元しますか？」モーダルを表示。復元はスナップショットの全キーをlocalStorageへ書き戻してリロード。

### 保存失敗の可視化

既存ストレージ関数（`gameSessionStorage.ts` / `gameHistoryStorage.ts` / `teamStorage.ts` / `appSettings.ts`）のcatch節に `window.dispatchEvent(new CustomEvent('mbc-storage-error', { detail }))` を1行追加。App側でリッスンしToast表示「⚠️ データの保存に失敗しました。バックアップをお勧めします」。既存の保存ロジック自体は変更しない。

## 2. クラッシュ耐性

### ErrorBoundary（新規 `src/components/ErrorBoundary/`）

- `main.tsx` でAppをラップ
- フォールバック画面: 「エラーが発生しました。記録データは端末に保存されています」＋再読み込みボタン＋エラー詳細のコピー（メール送付用）
- エラーはローカルエラーログにも記録

### ローカルエラーログ（新規 `src/utils/errorLog.ts`）

- `window.onerror` / `unhandledrejection` / ErrorBoundary捕捉分を記録
- localStorageのリングバッファ、最大50件（`{ timestamp, message, stack先頭数行, appVersion }`）
- 個人情報（選手名等）はログに含めない
- 設定画面（AppSettingsModal）に「エラーログ」セクションを追加: 件数表示・内容表示・クリップボードへコピー・クリア

## 3. テスト — Vitest導入

### 対象（純粋ロジックのみ、UIテストはスコープ外）

| 対象 | 内容 |
|---|---|
| GameContextレデューサー | 2P/3P/FT得点集計、シュートミス、チームファウル集計とボーナス、個人5ファウル、Q切替、オーバータイム、同点4Q終了 |
| `playerStatsAnalysis.ts` | スタッツ集計の正確性 |
| `playerNumber.ts` | 背番号パース・バリデーション |
| `dataBackup.ts` | エクスポート→インポートの往復整合性、不正JSONの拒否 |
| `mirrorBackup.ts` | スナップショット保存・世代ローテーション・復元（fake-indexeddb使用） |

### 追加パッケージ（devDependencies）

`vitest`, `fake-indexeddb`

### CI

`.github/workflows/ci.yml` — push/PR時に `npm ci` → `npm run lint` → `npm test` → `npm run build`

## 4. セキュリティ・本番ビルド衛生

### APIキーのヘッダー送信化

`src/utils/imageOCR.ts` の2箇所（`testGeminiConnection`, `recognizeWithGemini`）で、URLクエリ `?key=${apiKey}` をやめ、`x-goog-api-key` リクエストヘッダーに移行。

### console除去

`vite.config.ts` に esbuild設定を追加し、本番ビルドで `console.log` / `console.debug` / `console.info` を除去。`console.warn` / `console.error` は診断用に残す。

## 5. 法務・表記

### 情報画面（設定画面からアクセス）

AppSettingsModalに「アプリについて」セクションを追加し、以下のサブ画面（既存UIパターンに合わせたモーダル）を提供:

1. **利用規約** — 免責事項（データ消失・記録の正確性は保証しない、公式記録はJBA公式スコアシートが正）、禁止事項、準拠法
2. **プライバシーポリシー** — 全データ端末内保存の明記、外部送信はOCR使用時の画像のみ（ユーザー自身のGoogle APIキー経由）、児童の個人情報は保護者・チーム管理者の責任で入力、連絡先: mbcscore@gmail.com
3. **OSSライセンス** — React, React DOM, Tesseract.js, jsPDF, html2canvas 等のライセンス一覧
4. **バージョン情報** — package.jsonのversionを表示

### JBA非公認の明示

利用規約およびRunningScoresheet画面に「JBA公式スコアシートに準拠したレイアウトですが、JBA公認製品ではありません」を明記。

### 文書はTSX内に静的に埋め込む

法務文書はコンポーネント内の静的JSXとして実装（外部fetchなし、オフラインで必ず表示可能）。

## 6. 整合性クリーンアップ（最小限）

- `GameContext.tsx:684` の未実装 `UNDO_LAST_ACTION` ケース（どこからもdispatchされない死にコード）と `types/game.ts:198` の型定義を削除
- READMEの「アンドゥ/リドゥ」記載を実態（アクション履歴からの削除・修正）に合わせて修正

## スコープ外（やらないこと）

- クラウド同期、アカウント機能、課金機構
- Sentry等の外部エラー監視
- コード重複解消・GameContext分割・CSS統合（CODE_REVIEW_REPORT.mdの改善項目はテスト整備後の次フェーズ）
- UIデザイン変更、新機能追加

## 成功基準

1. `npm test` が全パス、CIがグリーン
2. localStorageを手動で全消去 → 再起動でIndexedDBからワンタップ復元できる
3. コンポーネントで例外を強制発生させても白画面にならず、復旧画面が出る
4. OCRリクエストのURLにAPIキーが含まれない（DevToolsで確認）
5. 本番ビルドの成果物に `console.log` が含まれない
6. 設定画面から利用規約・プライバシーポリシー・OSSライセンスが閲覧できる
