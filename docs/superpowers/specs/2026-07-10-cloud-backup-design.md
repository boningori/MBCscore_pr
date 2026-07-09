# クラウドバックアップ（半自動・共有シート方式）設計

- 作成日: 2026-07-10
- 対象アプリ: MBCscore（React + Vite PWA / GitHub Pages 静的ホスティング / バックエンドなし）
- 関連方針: ローカル完結・信頼性優先・外部監視なし（2026-07-04 承認）

## 1. 背景と目的

全データはブラウザの localStorage に保存されており、クラウド同期は持たない。IndexedDB
ミラーバックアップ（`src/utils/mirrorBackup.ts`）と手動 JSON/CSV エクスポート
（`src/utils/dataBackup.ts`）で保護しているが、いずれも**同じブラウザのオリジン（同一端末）**
に存在するため、端末の紛失・故障・買い替え・サイトデータ削除では全データが同時に失われる。

この「端末ごと失う」ケースを防げるのは端末外へのバックアップ（＝手動エクスポート）だけだが、
現状はユーザーが自発的に思い出して実行する必要がある。

**目的**：ユーザー自身のクラウドストレージ（Google Drive / iCloud Drive / Dropbox 等）へ
**ワンタップ**でバックアップファイルを保存できるようにし、さらに**適切なタイミングで督促**する
ことで、端末外バックアップへの手間と忘却リスクを最小化する。

## 2. 方式の選定

主な利用端末はスマホ・タブレット中心（iOS Safari を含む）。バックエンドを持たない静的 PWA
という制約下で検討した結果、以下を採用する。

- **採用：共有シート方式（Web Share API）＋督促（半自動）**
  - `navigator.share({ files })` で OS の共有シートを開き、保存先クラウドアプリはユーザーが選ぶ。
  - OAuth・APIキー・サーバー・常時接続が不要で、「ローカル完結・外部監視なし」方針を維持できる。
  - スマホ・タブレットで動作する。
- 不採用：File System Access API（同期フォルダ書き出し）… Chromium 系デスクトップ専用で
  iOS Safari 非対応のため、主用途に合わない。
- 不採用（現時点）：Google Drive 等への OAuth 直結による完全自動同期 … OAuth 審査・トークン
  管理など実装が重く、外部依存が増える。将来の拡張余地として残す。

## 3. バックアップ範囲

### 3.1 現状のデータ一覧（localStorage キー）

| データ | キー | 現 `exportAllData` 対象 | 重要度 |
|---|---|---|---|
| 試合履歴（全試合・スタッツ） | `minibasket-game-history` | あり | 最重要 |
| マイチーム（選手名簿） | `minibasket-my-teams` | あり | 高 |
| 保存済み対戦チーム | `minibasket-saved-opponents` | あり | 高 |
| 最近の対戦相手 | `minibasket-opponent-teams` | **なし（漏れ）** | 中 |
| 非表示選手設定 | `minibasket-hidden-players` | あり | 中 |
| 進行中の試合（オートセーブ） | `minibasket-game-session` | **なし（漏れ）** | 中〜高 |
| アプリ設定 | `minibasket-app-settings` | あり | 中 |
| Gemini APIキー（OCR用） | `mbc_gemini` | なし（独立キー） | 機微・対象外 |
| エラーログ（デバッグ用） | `mbc_error` | なし | 対象外 |

### 3.2 採用アプローチ：構造化バックアップの拡張（全キー方式は不採用）

ミラーと同じ「生キー丸ごと方式」ではなく、既存の `BackupData` 構造に漏れていた 2 項目を
追加する方式を採用する。

理由：
1. **復元の安全性**：生キー方式の復元は「まるごと上書き」となり、別端末に復元したとき既存
   データを消してしまう危険がある。既存の `importFullBackup()` は ID 単位でマージするため、
   新端末でも既存データを保持したまま安全に取り込める。この挙動を維持する。
2. **機微情報の自然な除外**：APIキー（`mbc_gemini`）は独立キーであり、構造化方式では自然に
   対象外になる。共有ファイルにAPIキーが混入する事故を構造的に防げる。

### 3.3 具体的な変更

`exportAllData()`（`src/utils/dataBackup.ts`）と `importFullBackup()` に以下を追加する。

- `recentOpponents`（`minibasket-opponent-teams`）… ID 単位でマージ復元。
- `gameSession`（`minibasket-game-session`）… 単一の進行中セッション。復元は「現在進行中の
  セッションが存在しない場合のみ書き戻す」とし、進行中の試合を上書きしない。

`BackupData.version` を `2.0` に上げる。旧 `1.0` ファイルも引き続きインポートできるよう、
新フィールドは任意項目として扱い後方互換を維持する（欠損時はスキップ）。

この拡張により、既存 JSON エクスポートの漏れ（recentOpponents / gameSession）も同時に解消される。

## 4. 機能設計

### 4.1 バックアップ共有アクション

- `shareBackup()`（新規、`dataBackup.ts`）：`exportAllData()` の結果を JSON 化し、
  `generateBackupFilename()` のファイル名で共有する。
  - Web Share 対応時：既存 `shareFile()` を利用して共有シートを開く。
  - 非対応時：既存 `downloadBlob()` によるファイルダウンロードへフォールバックする。
  - 戻り値で「共有/ダウンロードを実行できたか」を返す（キャンセルは失敗扱い）。

### 4.2 最終バックアップ時刻の記録

- 新キー `minibasket-last-backup`：`{ timestamp: number; gameCount: number }`。
- `shareBackup()` が**成功したときのみ**更新する。`shareFile()` はユーザーのキャンセル時に
  false を返すため、これを利用して「共有成功＝バックアップ済み」とみなす（実際の保存完了までは
  Web Share では取得できないための近似。実用上は十分とする）。
- 専用の小さなストレージモジュール（`createJsonStorage` を利用）で読み書きする。

### 4.3 督促要否ロジック

- `isBackupDue()`：現在の試合履歴件数が `minibasket-last-backup.gameCount` より多い場合に true。
  つまり**前回バックアップ後に試合が 1 件でも増えていれば督促対象**。増分がなければ督促しない。
- 初回（`minibasket-last-backup` 未設定）で試合が 1 件以上あれば督促対象とする。

### 4.4 督促 UI

- **(a) 試合保存直後**：試合を履歴へ保存する処理の後、`isBackupDue()` が true のときのみ
  トースト/小モーダルを表示：「バックアップしますか？」＋［今すぐ保存］［あとで］。
  - ［今すぐ保存］→ `shareBackup()`。
  - ［あとで］→ 何もしない（次に試合が増えたとき再度対象になる）。
- **(b) 設定画面の常設ボタン**：「今すぐクラウドに保存」。いつでも `shareBackup()` を実行可能。
  最終バックアップ日時を併記する。
- 起動時バナーは実装しない。

## 5. コンポーネントと責務

| 単位 | 責務 | 依存 |
|---|---|---|
| `dataBackup.ts`（拡張） | 収集範囲に recentOpponents / gameSession を追加。`shareBackup()` 追加 | teamStorage, gameSessionStorage, 既存 share/download |
| `lastBackupStorage.ts`（新規） | 最終バックアップ情報の読み書き、`isBackupDue()` 提供 | createStorage, gameHistoryStorage |
| 督促 UI コンポーネント（新規） | 試合保存直後の督促表示、共有アクション呼び出し | shareBackup, isBackupDue |
| 設定画面（拡張） | 「今すぐクラウドに保存」ボタンと最終バックアップ日時表示 | shareBackup, lastBackupStorage |

## 6. エラーハンドリング

- Web Share 非対応 → ダウンロードへフォールバック（例外にしない）。
- 共有キャンセル → 失敗扱い。`minibasket-last-backup` は更新しない。エラー表示もしない。
- ダウンロード/共有中の例外 → ユーザーに簡潔なエラー通知。既存の通知手段に合わせる。
- `gameSession` 復元は進行中セッションがある場合はスキップ（上書きしない）。

## 7. テスト

- 収集拡張：`exportAllData()` に recentOpponents / gameSession が含まれること、
  `importFullBackup()` で往復復元できること（マージ挙動含む）。
- 後方互換：`version: "1.0"` のバックアップが新フィールド欠損でも正常にインポートできること。
- `gameSession` 復元：進行中セッションがある場合はスキップされること。
- `isBackupDue()`：未設定時／試合増分あり／増分なしの各ケース。
- `shareBackup()`：Web Share 対応時は share 経路、非対応時はダウンロード経路に分岐すること。
- 督促表示：`isBackupDue()` が false のとき試合保存後に督促が出ないこと。

## 8. スコープ外（YAGNI / 将来拡張）

- Google Drive 等への OAuth 直結による完全自動同期。
- APIキー（`mbc_gemini`）をバックアップに含めるオプション。
- 起動時バナーによる督促。
- 複数世代のクラウド保管・バージョン管理（世代管理は IndexedDB ミラーが担う）。
