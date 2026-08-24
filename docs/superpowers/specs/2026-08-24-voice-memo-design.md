# 音声メモ（口述による手入力補助） — 設計

- 日付: 2026-08-24
- ステータス: 設計承認待ち（実装計画前）

## 背景・目的

連続したシュートミスやリバウンドの応酬など、プレーが速く連鎖する場面では、記録者が手入力を追いきれない。その場で覚えておくのも難しく、記録が抜ける。

そこで、記録者が数秒で口述した内容（例:「青5シュートミス、青6リバウンド、青6アシスト、青4シュート成功」）を文字起こしして一覧に積み、**落ち着いてから読みながら手入力する**ための補助機能を追加する。

本機能はスタッツを自動更新しない。あくまで手入力の足場であり、記録の正解はスタッツ側にある。

### 休眠中の音声入力機能との関係

`VoiceInput.tsx` / `useVoiceInput.ts` / `voiceCommands.ts` / `types/speech.d.ts` は、Web Speech APIで音声を認識し「4番」等をコマンド解析して**スタッツへ直接反映する**構想の名残で、現在はApp.tsxで4箇所コメントアウトされた休眠状態にある。

本機能は Web Speech API を使わず、コマンド解析も行わないため、これらの流用先は無い。ただし**休眠コードは削除せず現状のまま残す**（2026-08-24にユーザーが再確認）。

## スコープ

### やること
- 記録画面に「押している間だけ録音」するボタンを追加
- 録音した音声をGemini APIで文字起こしし、発話順に一覧表示
- 一覧は必要なときだけ開く（常時表示しない）
- 設定に独立トグル（既定OFF）と初回同意
- Gemini共通処理を `imageOCR.ts` から `geminiClient.ts` へ抽出
- プライバシーポリシー・マニュアル等の記載更新

### やらないこと（YAGNI・今回のスコープ外）
- 文字起こし結果からスタッツへの自動反映・半自動入力
- 音声の永続保存、試合履歴への保存、バックアップ・エクスポートへの同梱
- オフライン時の録音キューイング（溜めて後で送る）
- 話者分離、要約、構造化（背番号やアクションの抽出）
- クォーター単位の連続録音、重要マーク、頭出し再生
- 休眠中のVoiceInput関連コードの削除・改修

## 設計判断（ユーザー合意事項）

| 論点 | 決定 | 理由 |
|---|---|---|
| 録音の単位 | ボタンを押している間だけの短い口述 | 止め忘れが原理的に起きない。連続録音は「探す」仕掛けが必要になり不釣り合い |
| 用途 | 手入力の補助のみ | スタッツ自動反映は誤認識がそのまま記録の誤りになる |
| 出力 | 文字で読む（音声の再生機能は持たない） | 読むほうが速く、次のプレーの記録を止めない |
| 動作条件 | オンライン＋Gemini APIキー設定時のみ | 付加的な便利機能という位置づけ。オフラインでは無効化 |
| 寿命 | 試合中のみ。試合終了で破棄 | 手入力できた分はスタッツに残る。二重に持つと正解が曖昧になる |
| 保存先 | sessionStorage | localStorageではないためバックアップ・エクスポートに乗らない。リロードには耐える |
| 既定 | OFF | 音声の外部送信は明示的な選択の上で行う |
| ボタン位置 | ヘッダー中央（第一候補） | 空き枠が既存。代替はファウルボタンの下（後述） |
| 対象モード | フルモードのみ | シンプルモードは入力項目が少なく、記録に迷う場面が少ない |

## 構成

### 追加するファイル

| ファイル | 役割 |
|---|---|
| `src/utils/geminiClient.ts` | APIキー・モデル一覧・共通リクエストの置き場（既存からの抽出） |
| `src/utils/audioTranscribe.ts` | 音声→テキスト。WAV正規化とGemini呼び出し |
| `src/hooks/useVoiceMemo.ts` | 録音・送信・一覧の状態管理 |
| `src/components/VoiceMemo/VoiceMemoButton.tsx` | 押下中録音のボタン |
| `src/components/VoiceMemo/VoiceMemoPanel.tsx` | メモ一覧パネル |
| `src/components/VoiceMemo/VoiceMemo.css` | 専用スタイル |
| `src/components/VoiceMemo/index.ts` | re-export |

### 変更するファイル

| ファイル | 変更内容 |
|---|---|
| `src/utils/imageOCR.ts` | Gemini共通部分を `geminiClient.ts` へ移し、再エクスポートまたは参照に置き換え |
| `src/components/OpponentManager/OpponentManager.tsx` | `getStoredApiKey` の import 元を変更 |
| `src/components/OpponentSelect/OpponentSelect.tsx` | 同上 |
| `src/App.tsx` | `header-center` にボタン、メモ一覧パネルの表示制御 |
| `src/components/Settings/AppSettingsModal.tsx` | 音声メモのトグルと初回同意。`testGeminiConnection` の import 元も変更 |
| `src/utils/appSettings.ts` | 音声メモON/OFFの設定項目 |
| `src/components/Legal/LegalModal.tsx` | 外部送信の記載を更新 |
| `public/manual.html` / `README.md` / `FLYER.md` | 記載の整合 |

### geminiClient.ts の抽出範囲

現在 `imageOCR.ts` にある以下はOCR固有ではなくアプリ共通のGemini設定であり、音声側から `imageOCR` を import するのは不適切なため切り出す。

- `GEMINI_API_BASE`
- `STORAGE_KEY_GEMINI_API` / `getStoredApiKey` / `saveApiKey`
- モデル候補一覧とフォールバック順
- `testGeminiConnection`

既存の外部利用箇所は `OpponentManager` と `OpponentSelect` の2ファイルのみ。`parseOcrText` など OCR 固有の処理は `imageOCR.ts` に残す。

## データ構造

```ts
export interface VoiceMemo {
  id: string;
  quarter: number;        // 記録時のクォーター
  createdAt: number;      // 録音開始時刻。発話順の並び替えキー
  status: 'sending' | 'done' | 'failed';
  text?: string;          // status === 'done' のとき
  error?: string;         // status === 'failed' のとき
}
```

- sessionStorage に配列で保持する。キー接頭辞は `APP_KEY_PREFIXES`（`minibasket-` / `mbc_` / `mbc-`）と衝突しないものにする。sessionStorage は `mirrorBackup.collectAppData()` の走査対象外（localStorage のみ走査）だが、将来の取り違えを防ぐため接頭辞でも区別する。
- 音声データは保持しない。文字起こしが返った時点で破棄する。`failed` の1件のみ再送用にメモリ上へ保持する。
- 試合終了時（および新規試合開始時）に全件破棄する。

## 動作

### 録音から表示まで

1. ボタンを押し下げ → `getUserMedia` でマイク取得、`MediaRecorder` 開始。`createdAt` を記録
2. 押している間、録音中であることを視覚表示（既存の `.voice-indicator` 系スタイルは休眠コードのものと混同しないよう新規に定義する）
3. 指を離す → 録音停止。0.5秒未満なら誤タップとして破棄
4. 音声を **WAV（16kHz モノラル）** へ正規化
5. `status: 'sending'` で一覧に追加し、Geminiへ送信
6. 応答が返り次第 `status: 'done'` とテキストを反映

### 順序の保証

連射されるため、**応答順ではなく `createdAt` の昇順で表示する**。並列送信して構わない（順序はキーが保証する）。ここが崩れるとプレーの前後が入れ替わり、メモとして使えなくなる。

### 音声形式

MediaRecorder の出力コンテナはブラウザで異なり（Chrome は WebM/Opus、Safari は MP4）、また Gemini の音声入力で公式に案内されている形式に WebM は含まれない。そのため送信前に WAV へ正規化する。

- `AudioContext.decodeAudioData` → 16kHz モノラルへリサンプル → WAVヘッダ付与
- 5秒で約160KB。inline data として送信可能な範囲
- 実装時に実機（Chrome / iOS Safari）で送信可否を確認する

### プロンプトとモデル

- プロンプト: 日本語音声をそのまま文字起こしする。要約・補完・整形はしない
- モデル: 既存のフォールバック連鎖を流用し、最速の `gemini-2.5-flash-lite` から順に試す

### 一覧の表示

- 常時表示しない。ボタンまたは件数バッジから開く
- 新しいものが下（`createdAt` 昇順）
- `sending` は進行中表示、`failed` は再送ボタン付き
- 個別削除ができる（読んで入力し終わったものを消せる）

## 配置

第一候補は **ヘッダー中央**。`App.tsx` の `header-center` は休眠したVoiceInputを外した後、中身が空のまま残っており、そのまま使える。

代替案は **ファウルボタンの下**（`ActionButtons.tsx` のファウル群がコンテナ最後の要素なので、その下に `action-group` を追加する）。押しっぱなしにするボタンは親指の届く下端のほうが握りやすい一方、真上にスワイプ入力（ターンオーバー）があるため、長押しとスワイプの取り違えに注意が必要。

実機で握って窮屈であれば代替案へ移す。

## 異常系

| 状況 | 挙動 |
|---|---|
| オフライン | ボタンを無効化し「オンラインで使えます」と示す。録音して溜め込まない |
| APIキー未設定 / 機能OFF | ボタンを表示しない |
| シンプルモード | ボタン・一覧とも表示しない。メモは保持され、フルモードへ戻すと再び読める |
| マイク権限拒否 | 一度だけ案内し、以後は無効 |
| 送信失敗 | その1件を `failed` 表示。再送ボタンを出す |
| 0.5秒未満の押下 | 誤タップとして破棄 |
| 録音中に画面が落ちる | 録音を破棄。既存の `useWakeLock` が記録中のスリープを抑止している |

## プライバシー

- 設定に音声メモの独立トグルを持ち、**既定はOFF**
- 初回ONのときのみ確認を出す:「吹き込んだ音声がGoogleのサーバーに送信されます。無料枠のAPIキーでは送信データがモデル改善に利用される可能性があるため、有料プランを推奨します」
- `LegalModal.tsx` の「3. 外部への送信」は現在「送信するのはOCR機能の撮影画像のみ」と明記しているため、音声メモで吹き込んだ音声を加える形に更新する
- `public/manual.html` / `README.md` / `FLYER.md` の記載も整合させる

## テスト

- 応答が前後して返っても `createdAt` 昇順で並ぶこと
- WAV変換が正しいヘッダとサンプリングレートを生成すること
- オフライン時・APIキー未設定時・機能OFF時にボタンが無効/非表示になること
- シンプルモードでボタン・一覧が表示されないこと
- 試合終了時に全件破棄されること
- sessionStorage に保存され、`mirrorBackup.collectAppData()` の結果に現れないこと
- 0.5秒未満の押下が破棄されること
- Gemini呼び出しはモックする

既存の vitest 構成（`*.test.ts` をソース隣に置く）に合わせる。
