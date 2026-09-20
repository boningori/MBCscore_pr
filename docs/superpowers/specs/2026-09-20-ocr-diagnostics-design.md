# 写真読込の生の応答を画面で見られるようにする — 設計

- 日付: 2026-09-20
- ステータス: 設計承認済み（2026-09-20）
- 対象: `src/utils/imageOCR.ts`, `src/utils/appSettings.ts`,
  `src/components/Settings/AppSettingsModal.tsx`,
  `src/components/OpponentManager/OpponentManager.tsx`,
  `src/components/OpponentSelect/OpponentSelect.tsx`

## 背景

同日にマージした「AI写真読込を様式に依存しないようにする」
（`docs/superpowers/specs/2026-09-20-ai-ocr-format-agnostic-design.md`）では、
プロンプトと受け側の検証を直した。だが**直ったかどうかを実測する手段が無い**。

テストが固定しているのは「プロンプトが正しい指示を含むこと」と「受け側の検証が効くこと」で、
Gemini が実際にその指示どおり読むかは実写でしか分からない。そして今、読み取りが
おかしかったときに何が返ってきたかを見る方法が無い。

### 生の応答は既に取ってあるが、誰も見られない

`ImageOCRResult.rawText`（`imageOCR.ts:23`）に生の応答が入っている。詰めている箇所は3つ
（`imageOCR.ts:184,193,496`）。**表示している箇所は無い。**
開発ビルドの `console.log` だけで、製品ビルドでは消える。

### さらに、いちばん見たい経路では消えている

| 状況 | `rawText` の中身 | 診断できるか |
|---|---|---|
| Geminiは「成功」したが列を取り違えた | Geminiの応答JSON | 表示すれば分かる |
| Geminiが失敗 → Tesseractへフォールバック | **Tesseractの文字列** | 分からない |

`recognizePlayerList` はフォールバック時に Tesseract の結果を返す（`imageOCR.ts:557-560`）ので、
Gemini が何を返したかは `fallbackReason` のエラー文言しか残らない。

### モデル名も残っていない

`FALLBACK_MODELS`（`geminiClient.ts:14`）は5モデルを順に試し、先頭は
`gemini-2.5-flash-lite`（最速・最軽量）。読み取りが甘いとき、**どのモデルが答えたのか**は
生JSONと同じくらい効く手掛かりだが、今は `usedEngine: 'Gemini'` としか残らない。

`flash-lite` が雑に読んだのか `pro` でも間違えたのかで、打つ手が正反対になる——
プロンプトを直すのか、軽量モデルを候補から外すのか。

## 決めたこと

- **設定でONにしたときだけ出す。** 普段の画面は変えない
- **生の応答 ＋ 応答したモデル名**を出す
- **フォールバックしても Gemini の応答を残す**

## 変更内容

### 1. 設定

`appSettings.ts` に足す（`aiOcrEnabled` と同じ形）。

```ts
// AppSettings
aiOcrDiagnosticsEnabled: boolean;

// DEFAULT_SETTINGS
aiOcrDiagnosticsEnabled: false,

// readStoredSettings のサニタイザ（appSettings.ts:67 の並び）
if (typeof raw.aiOcrDiagnosticsEnabled === 'boolean') {
    clean.aiOcrDiagnosticsEnabled = raw.aiOcrDiagnosticsEnabled;
}

export function isAiOcrDiagnosticsEnabled(): boolean {
    return loadAppSettings().aiOcrDiagnosticsEnabled;
}

export function setAiOcrDiagnosticsEnabled(enabled: boolean): void {
    saveAppSettings({ aiOcrDiagnosticsEnabled: enabled });
}
```

サニタイザに1行足すのは、保存データを読み込み時に矯正するというこのプロジェクトの約束による。
新しい設定も同じ約束で扱う。

### 2. 設定UI

`AppSettingsModal.tsx:448` の `SettingsSection id="ai"` の中、AI読み取りトグルの下に置く。
AI経路の診断なので、AI機能の節に属する。

説明文に**「応答には選手名がそのまま含まれます」**と明記する。既定OFFであることと合わせて、
第三者に見える場所で不用意に開かないようにするため。

### 3. 診断情報の型

`ImageOCRResult` に1フィールド足す。既存の `rawText` は触らない。

```ts
/** 診断用。設定がONのときだけ画面に出す */
export interface OcrDiagnostics {
    /** 応答した（＝最後に試した）Geminiモデル */
    geminiModel?: string;
    /** Geminiの生応答。Tesseractへフォールバックしても残す */
    geminiRawText?: string;
}

// ImageOCRResult
diagnostics?: OcrDiagnostics;
```

`rawText` を作り替えないのは、意味が違うため。`rawText` は「結果を出したエンジンの生出力」、
`diagnostics.geminiRawText` は「Gemini が何を返したか」。Gemini 成功時は同じ内容になるが、
フォールバック時に別物になる。

### 4. フォールバックを跨いで残す配線

`recognizeWithGemini` は失敗時に throw するので、その中で生応答が消える。

**例外に情報を積むのではなく、`recognizePlayerList` が `diagnostics` オブジェクトを持って渡し、
`recognizeWithGemini` がそれを埋める。**

```ts
async function recognizeWithGemini(
    imageFile: File,
    apiKey: string,
    diagnostics: OcrDiagnostics,   // 呼び出し側が持つ。ここは書き込むだけ
): Promise<ImageOCRResult>
```

- `diagnostics.geminiModel` はリクエストを送る直前に書く（失敗したモデルも記録に残る）
- `diagnostics.geminiRawText` は応答テキストを取り出した直後に書く（検証で例外を投げる前）

こうすると、どの経路で返っても中身が残り、例外の形をいじらずに済む。
`recognizePlayerList` は成功・フォールバック・失敗のどのリターンにも同じ `diagnostics` を付ける。

Gemini を試していないとき（設定OFF・APIキー無し・画像が大きすぎて送らなかったとき）は、
`diagnostics` は空のまま。空なら画面にも出さない。

### 5. 先に直す: `OpponentSelect` は成功経路で通知を描画していない

**この機能を載せる前に、載せる場所が壊れていることが分かった。**

`OpponentSelect` は読み取りに成功すると `setIsCreating(true)` し、render が
`<OpponentEditor>` を返して**早期リターンする**（`OpponentSelect.tsx:131-141`）。
`ocrError` を描画するのはその手前を抜けた先の `OpponentSelect.tsx:193` で、
`OpponentEditor` は `ocrError` を props に持たない（`OpponentSelect.tsx:266`）。

結果、成功経路でセットされた通知が誰にも見えない。

| メッセージ | セット | 表示 |
|---|---|---|
| `${dropped}人は取り込みませんでした`（上限超過・既存） | される | **されない** |
| `${invalidNumberCount}人は背番号を読み取れなかった`（直前の作業で追加） | される | **されない** |

失敗経路（`setIsCreating` を呼ばない）では表示される。出ないのは成功経路だけ。

直前の作業の最終レビューは「この分岐にテストが無い」を Minor として挙げ、
「`OpponentManager` の逐語コピーだから低リスク」として通した。コピー元と
**描画される条件が違う**ことを誰も確かめなかった。

#### なぜこの設計に含めるか

生の応答を見たいのは「読めたけれど中身が違う」＝**成功経路**である。
同じ場所に折りたたみを置けば、同じ理由で見えない。
**置き場所を直さないと、この機能自体が成立しない。**

#### 直し方

`OpponentEditor` に2つの props を足し、成功経路でも描画されるようにする。

```ts
interface OpponentEditorProps {
    // ...既存
    /** 読み取り結果の通知（上限超過・背番号を読めなかった件数）。無ければ描画しない */
    ocrError?: string | null;
    /** 診断の折りたたみに出す情報。無ければ折りたたみ自体を描画しない */
    diagnostics?: OcrDiagnostics;
}
```

`OpponentSelect` は既に `ocrError` を state に持っているので、そのまま渡す。
`diagnostics` は直近の読み取り結果から取って state に持たせる。

既存の上限超過メッセージも、これで初めて表示されるようになる。
`OpponentManager` 側は既に描画されているので、経路の変更は要らない。

### 6. 表示

`OpponentManager` と `OpponentSelect` の**両方**に出す。`recognizePlayerList` の呼び出し元は
この2つで、前者だけに手を入れて後者を落とすのは直前の作業で実際にやった失敗。

読み取り結果の下に折りたたみ。既定は閉じている。

- 開閉するボタンだけが角丸の面。中身は素の文字（`押せるものだけが箱` の作法）
- 中身: 使ったエンジン / モデル名 / Gemini の生応答 / Tesseract が使われたときはその `rawText`
- 設定OFF、または `diagnostics` が空のときは、折りたたみ自体を出さない

**収集と表示を分ける。** `diagnostics` の収集は設定に関係なく常に行い、設定は**表示だけ**を制御する。
収集はメモリ上で完結するので費用が無く、分岐を増やすほうが穴を作る。

### 7. 扱い

- **保存しない。** 直近1回ぶんをメモリに持つだけで、次の読み取りで消える
- バックアップにも入らない（`dataBackup.ts` は触らない）
- 既定 OFF

## テスト

- `appSettings`
  - 既定が `false`
  - `setAiOcrDiagnosticsEnabled(true)` → `isAiOcrDiagnosticsEnabled()` が `true`
  - 保存値が boolean でなければ既定に戻る（サニタイザ）
- `imageOCR`
  - 応答したモデル名が `diagnostics.geminiModel` に入る
  - **Tesseractへフォールバックしても `diagnostics.geminiRawText` が残る**
  - Gemini を試していないとき（設定OFF／画像が大きすぎ）は `diagnostics` が空
  - 複数チーム検出で返し切るとき（`ImageFormatError`）も `diagnostics` が付く
- `OpponentSelect` の表示経路（§5）
  - **成功経路（`isCreating` が true）で上限超過の通知が描画される** — 現在は描画されない
  - **成功経路で `invalidNumberCount` の通知が描画される** — 現在は描画されない
  - 失敗経路の通知が従来どおり描画される（回帰）
  - この3件は `OpponentSelect` の既存テスト（`playerChipRemove.test.tsx` しか無い）を増やす形で書く
- UI
  - 設定OFFなら折りたたみが出ない
  - 設定ONかつ `diagnostics` があれば出る
  - **`OpponentSelect` の成功経路にも出る**（§5 を直して初めて可能になる）

## やらないこと

- **保存・エクスポート** — 選手名を含むものを永続化しない。診断は直近1回で足りる
- **応答の整形・色付け** — 生のまま出す。整形すると「モデルが本当に返した文字列」でなくなる
- **リクエスト本文の表示** — プロンプトはソースを読めば分かる。画像は送信物なので出さない
- **Tesseract経路の変更**

## この設計で分からないこと

- モデルごとの傾向は、1回の読み取りでは分からない。同じ写真を複数モデルで読み比べる仕組みは作らない
- 生の応答が正しいのに登録結果が違う場合（＝受け側の検証の問題）は、この画面では切り分けられない。
  そのときは `invalidNumberCount` と突き合わせる
