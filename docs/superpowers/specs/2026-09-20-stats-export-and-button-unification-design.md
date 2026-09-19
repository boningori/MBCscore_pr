# スタッツ表にJPEG/PDF出力を付け、出力ボタンのUIを統一する — 設計

- 日付: 2026-09-20
- ステータス: 設計承認済み（2026-09-20）
- 対象: 新規 `src/hooks/useElementExport.ts`, 新規 `src/components/ExportButtons/`, `src/components/History/History.tsx`, `src/components/StatsPanel/StatsPanel.css`, `src/components/RunningScoresheet/RunningScoresheet.tsx`, `src/components/PlayerStatsAnalysis/DetailView.tsx`, `src/components/TeamComparison/TeamComparison.tsx`

## 背景

試合履歴の詳細画面はタブが3つある（`History.tsx:176-196`）。

| タブ | 出力ボタン |
| --- | --- |
| チーム比較 | 🖼 JPEG / 📄 PDF（下部・小ボタン） |
| スタッツ（画面表示） | **無し** |
| スコアシート（保存/PDF） | PDF出力 / JPEG出力（上部・大きめ） |

紙で渡す用途はスコアシートに寄せる前提でタブ名を分けてあるが、公式様式のスコアシートは選手ごとの数字を読み取るのに向いていない。保護者やコーチに「この試合の各選手のスタッツ」を渡したい場面で、渡せるものが無い。

同時に、出力ボタンそのものが3箇所でばらばらに実装されている。

| | 選手詳細 | スコアシート | チーム比較 |
| --- | --- | --- | --- |
| ラベル | PDF出力 / JPEG出力 | PDF出力 / JPEG出力 | 📄 PDF / 🖼 JPEG |
| 並び順 | PDF → JPEG | PDF → JPEG | JPEG → PDF |
| クラス | btn-primary / btn-secondary | btn-primary / btn-secondary | btn-secondary btn-small ×2 |
| 「出力中…」の読み上げ領域 | あり | あり | **無し** |
| 位置 | 上部ツールバー | 上部ツールバー | 下部中央 |

ハンドラも3箇所に同じ形で写している（`DetailView.tsx:62-78`、`RunningScoresheet.tsx:93-106`、`TeamComparison.tsx:50-61`）。スタッツ表を4箇所目にすると、次に手を入れたときまたずれる。

## 決めたこと

**スタッツタブ全体を1枚として出力できるようにし、出力ボタンをフック1つとコンポーネント1つに集約する。**

### 出力の単位

スタッツタブに並ぶものをまとめて1ファイルにする。チームごとに分けない。

- 試合の記録として1ファイルで完結する。自チーム分だけを切り出したい要求は今のところ出ていない
- チームごとにすると `StatsPanel` の中にボタンを置くことになり、試合中の画面（`App.tsx:1443-1444`）にも同じUIが出る。出す・出さないの指定が余計に要る

### 見出し

出力物の先頭に「日付　試合名　会場」を1行入れる。チーム比較タブと同じ `buildComparisonCaption()` を使い回す。

現状のスタッツタブには「チームA 統計」「チームB 統計」しか無く、そのまま画像にすると**どの試合か分からない**。渡した相手が後から見分けられない画像を作ってはいけない。

見出しは画面にも出す。出力専用の隠し要素にはしない。画面に見えているものと出力物が食い違うと、出るまで結果が分からなくなる。

### 統一する形

**テキストラベルに揃える。** 全箇所で「PDF出力」（btn-primary）→「JPEG出力」（btn-secondary）の順、上部に配置、「出力中… そのままお待ちください」の読み上げ領域を持つ。

絵文字だけのラベル（📄 PDF）に寄せない理由は2つある。

- 読み上げ名が「PDF」より「PDF出力」のほうが何が起きるか明確で、既存2箇所はこの形になっている
- スコアシートは縦に長い。下部に置くと、出力するために最後までスクロールさせることになる

## 構成

### 新規 `src/hooks/useElementExport.ts`

```ts
export interface ElementExportOptions {
    filename: string;
    windowWidth?: number;
    scale?: number;
    title?: string;
}

export function useElementExport(
    targetRef: RefObject<HTMLElement | null>,
    options: ElementExportOptions,
): { isExporting: boolean; exportPdf: () => void; exportJpeg: () => void };
```

内部は既存の `useExportAction` + `exportElement` を呼ぶだけ。進行中フラグ・二重起動の抑止・成否の通知は今の `useExportAction` の責任のまま変えない。このフックが引き受けるのは「ref が空なら何もしない」「format ごとに通知ラベルを 'PDF' / 'JPEG' に振り分ける」という、4箇所で同じだった部分だけ。

`isExporting` を返すのは、呼ぶ側に出力中を一緒に伝える必要があるため（スコアシートは「試合情報編集」も同時に無効化している）。

### 新規 `src/components/ExportButtons/`

`ExportButtons.tsx` / `ExportButtons.css` / `index.ts`。

```tsx
interface ExportButtonsProps {
    isExporting: boolean;
    onExportPdf: () => void;
    onExportJpeg: () => void;
}
```

**Fragment を返す。** ラッパの `div` を作らない。

各画面のツールバーには出力以外のものが同居しており、それぞれ狭い画面向けの調整を持っている。

- スコアシート … 「試合情報編集」「閉じる」。`flex-wrap` と 480px 以下の gap 詰め（`RunningScoresheet.css:67-95`）。実測で「閉／じ／る」と縦に割れた経緯がある
- 選手詳細 … 表示トグル。`margin-left: auto` を使わない折り返し規則（`PlayerStatsAnalysis.css:549-560, 593-600`）

ラッパを1枚挟むとこれらの flex 計算の前提が変わる。中のボタンだけ差し替えれば、既存の折り返しはそのまま効く。

「出力中…」の領域は `.export-status` に一本化し、`.detail-export-status` と `.scoresheet-export-status` は削除する。両者は `font-size-sm` / `font-weight: 600` / `--warning-light` で同じで、違いはスコアシート側の `white-space: nowrap` だけ。共通側に含める。

空のときに幅も高さも持たせない（`:not(:empty)` で当てる）現行の作法は保つ。出た瞬間にボタンが横へ押し出されるのを防いでいる。

### `History.tsx` — スタッツタブ

出力対象を包む要素を1つ足す。

```tsx
{viewMode === 'stats' && (
    <>
        <div className="stats-export-toolbar">
            <ExportButtons ... />
        </div>
        <div className="history-stats-export" ref={statsExportRef}>
            <p className="history-stats-caption">{caption}</p>
            {未割り当ての記録セクション}
            <div className="history-stats-view">
                <StatsPanel A /> <StatsPanel B />
            </div>
        </div>
    </>
)}
```

ツールバーは `ref` の外に置く。ボタン自身が画像に写らないので `no-export` は要らない（スコアシート・選手詳細と同じ作法）。

未割り当ての記録セクションは現状スタッツ表の上にあり、その位置のまま出力対象に含める。どの選手のスタッツにも入らない記録なので、表だけ切り出すとこの試合の記録が欠けたものになる。

ファイル名は `<試合名>_スタッツ`。試合名は `sanitizeFilename()` を通す（利用者の自由入力で `/ \ : * ? " < > |` が入りうる）。試合名が空なら `スタッツ`。チーム比較の `<試合名>_チーム比較` と同じ規則。

`exportElement` のオプションは既定のまま（`windowWidth: 1280`, `scale: 4`）。スタッツ表は `min-width: 795px` なので 1280 に収まる。

### `StatsPanel.css`

```css
.exporting .stats-panel { overflow-x: visible; }
```

`.stats-panel` は `overflow-x: auto`、中の `.stats-table` は `min-width: 795px`（`StatsPanel.css:1-20`）。狭い端末では横スクロールしており、この上書きが無いと出力物の右側の列が切れる。`.exporting` は出力対象のルートに付くので、この1行で両チーム分に効く。

### 既存3箇所

| 画面 | 変わること |
| --- | --- |
| スコアシート | フックとボタンを差し替え。**見た目は変わらない** |
| 選手詳細 | 同上。**見た目は変わらない** |
| チーム比較 | 下部の小ボタン → 上部のテキストラベル。「出力中…」の読み上げ領域が新たに付く |

チーム比較のボタンは `rootRef` の内側にあるため、`no-export` は位置を移しても維持する。試合中の画面（`App.tsx:1446`）は `exportable` を渡していないのでボタンが出ず、影響しない。

## テスト

新規

- `ExportButtons.test.tsx` … ラベルと並び順、`isExporting` で両方が無効になること、`role="status"` の文言、出力中でないときは status が空
- `History.statsExport.test.tsx` … スタッツタブに出力ボタンが出る／押すと `exportElement` が `history-stats-export` の要素と `<試合名>_スタッツ` で呼ばれる／見出しに日付と試合名が出る／未割り当ての記録が出力対象の中に入る

既存

- `TeamComparison.export.test.tsx` … 「出力中…」の読み上げ領域の確認を足す。ボタンは `/JPEG/` `/PDF/` の部分一致で引いているのでラベル変更では壊れない
- `RunningScoresheet.export.test.tsx` / `DetailView.export.test.tsx` … 同じく部分一致のため変更不要。回帰の確認として通す

## やらないこと

- 試合中の画面のスタッツ表に出力ボタンを付けること。今回の依頼は試合履歴のスタッツで、試合中に出す必要は確認できていない
- チームごとに分けた出力
- `detail-toolbar` / `scoresheet-toolbar` / `comparison-export` のCSSそのものの統合。3箇所それぞれに狭い画面向けの上書きが積んであり、まとめると回帰の範囲が各画面のレイアウト全体に広がる。ボタンの見た目が揃えば今回の目的は足りる
