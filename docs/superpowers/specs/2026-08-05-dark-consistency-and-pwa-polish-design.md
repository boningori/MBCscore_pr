# ダーク配色の一貫性回復とPWAの詰め — 設計

- 日付: 2026-08-05
- ステータス: 設計承認済み（実装計画待ち）

## 背景・目的

PWA としての完成度を実測で調査した結果、配管部分（manifest・SW更新戦略・オフライン・インストール導線・セーフエリア・タップ領域）は既に商用水準にある一方、**配色に構造的な破れ**が見つかった。

破れは大きく2種類ある。

1. **トークンを通っていない画面がある。** `TimeoutInputModal` は Bootstrap 既定色のライトテーマのまま、`PendingActionPanel` / `PendingActionResolver` は slate 系ではない Chakra 系グレーで書かれている。
2. **同じ意味に2つの色体系がある。** クォーターの色分けが、`RunningScoresheet`・`QuarterLineup` の「赤=1Q/3Q・黒=2Q/4Q」（JBA様式準拠）と、`Scoreboard` の緑グラデーションに割れている。

本設計は、このうち**トークンの値そのものを変えずに直せるもの**を対象とする。トークンの値の再設計（`--text-secondary` などが明るい面の上で AA を満たさない問題）は範囲が全画面に及ぶため、別設計として後続で扱う。

### 実測データ（本設計の根拠）

dev サーバ上の実 DOM から `getComputedStyle` で算出した値。

トークンの面別コントラスト（アプリは 画面 → カード → コントロール → hover と背景が段階的に明るくなる）:

| 文字色 \ 背景 | `--bg-primary` #0f172a | `--bg-secondary` #1e293b | `--bg-tertiary` #334155 | `--border-light` #475569 |
|---|---|---|---|---|
| `--text-primary` #f8fafc | 17.06 | 13.98 | 9.90 | 7.24 |
| `--text-secondary` #94a3b8 | 6.96 | 5.71 | **4.04** | **2.96** |
| `--text-muted` #7d8da5 | 5.29 | **4.34** | **3.07** | **2.25** |
| `--primary-light` #3b82f6 | 4.85 | **3.98** | **2.82** | **2.06** |
| `--primary` #1e40af | **2.05** | **1.68** | **1.19** | **1.15** |

白文字を載せたときのボタン塗り:

| クラス | 塗り | 比 |
|---|---|---|
| `.btn-primary` | `--primary` #1e40af | 8.72 |
| `.btn-danger` | `--danger` #dc2626 | 4.83 |
| `.btn-success` | `--secondary` #059669 | **3.77** |
| ベンチファウル | #e74c3c（トークン外） | **3.82** |
| タイムアウト確定 | #007bff（トークン外） | **3.98** |

太字は WCAG 2.1 AA（通常文字 4.5:1）未達。**この表の是正は後続設計の担当であり、本設計では扱わない。**

## スコープ

### やること

1. `TimeoutInputModal` をダーク配色へ統一する（CSS のみ）
2. フルモードの「交代」ボタンがブラウザ既定色で描画される不具合を直す
3. `:root` に `color-scheme: dark` を置き、ネイティブ部品をダークに揃える
4. `Scoreboard` のQバッジを赤/黒規約へ寄せ、黒の視認性を確保する
5. `PendingActionPanel` / `PendingActionResolver` の色をトークン経由にする
6. iOS スプラッシュ画像を追加し、manifest に `launch_handler` を足す

### やらないこと（YAGNI・スコープ外）

- **カラートークンの値そのものの再設計**（上表の是正）。後続の別設計で扱う。本設計の 5 は、その修正が自動的に波及する状態を先に作ることが目的であり、見た目の改善は伴わない
- Tesseract（5.76MB）のプリキャッシュからの分離。「完全オフラインOCR」は 2026-07-06 に承認済みの方針で、インストール完了＝OCR即利用可能を優先する判断を維持する
- precache マニフェスト上のアイコン3枚の重複エントリの解消。検証の結果、2組は url・revision が完全一致しており Workbox の `PrecacheController` が install 時に集約するため、実転送量は増えていない。削っても得られる帯域はゼロ
- `display_override` の追加。`window-controls-overlay` 等を使う予定がなく、追加しても挙動が変わらない
- `RunningScoresheet` / `OfficialScoresheet` の白地配色。JBA 用紙のファクシミリとして意図的であり、375px 幅でも body の横スクロールは発生していない
- `.btn-timeout-chip` の白背景。コメント付きの意図的な選択

## 設計判断（ユーザー合意事項）

| 論点 | 決定 |
|---|---|
| Qバッジの緑グラデーション | 赤/黒規約（`--quarter-1-3` / `--quarter-2-4`）に寄せる。黒は背景と同化するため視認調整を加える |
| Tesseract 5.76MB | 現状維持。プリキャッシュから外さない |
| フルモード「交代」ボタンの色 | `btn-secondary`（中立色）。隣の破壊的操作「ベンチファウル」の赤との対比を優先し、シンプルモードの青には揃えない |
| 黒バッジの視認調整方法 | 塗りは変えず、両バリアントに `--text-secondary` の枠線を付ける |

## 変更内容

### 1. TimeoutInputModal をダークへ

`TimeoutInputModal.tsx` は既に `Modal`（`role="dialog"` / フォーカストラップ / Esc）を使っているため、**変更は `TimeoutInputModal.css` のみ**。TSX は触らない。

現状はアプリ唯一の全面ライトテーマで、暗い体育館の試合中に画面中央へ白いモーダルが出る。

| 対象 | 現状 | 変更後 |
|---|---|---|
| `.timeout-modal-content` | `background: #fff` | `var(--bg-secondary)` |
| `.timeout-modal-header` | `#333` / `#fff` | `var(--bg-tertiary)` / `var(--text-primary)` |
| `.timeout-input-label` | `color: #333` | `var(--text-primary)` |
| `.timeout-time-separator`, `.timeout-result-label`, `.timeout-result-arrow` | `#666` | `var(--text-secondary)` |
| `.timeout-result-section` | `background: #f5f5f5` | `var(--bg-tertiary)` |
| `.timeout-result-value` | `#007bff` | `var(--primary-light)` |
| `.timeout-select` | `#fff` 地 / `#ddd` 枠 | `var(--bg-tertiary)` / `var(--border)`、フォーカス枠 `var(--primary-light)` |
| `.timeout-btn-confirm` | `#007bff`（白文字 3.98） | `var(--primary)`（白文字 **8.72**） |
| `.timeout-btn-cancel` | `#f5f5f5` / `#666` | `var(--bg-tertiary)` / `var(--text-primary)` |
| `.timeout-modal-actions` | `border-top: 1px solid #eee` | `var(--border)` |
| `.timeout-modal-team.white` / `.blue` | `#eee` / `#6af` | `var(--team-white)` / `var(--team-blue-light)` |
| 文字サイズ | `12/14/16/18/20/32px` 直書き | `--font-size-xs` 〜 `--font-size-2xl` |
| 角丸 | `8px` 直書き | `--radius-md` |

あわせて `.timeout-select` に `min-height: 44px` を与える。現状 42px で、アプリ全体が守っている 44px 下限（WCAG 2.5.8）を唯一下回っている。

`.timeout-modal-overlay` は `.modal-overlay` と同じ `rgba(0,0,0,0.7)` / `z-index: 1000` に揃える（現状 0.5 / 1000）。

### 2. フルモードの「交代」ボタン

`src/components/TeamPanel/TeamPanel.tsx` の該当箇所は色バリアントクラスを持たない。

```tsx
<button className="btn btn-small" onClick={onSubstitute}>
```

`.btn` は `border: none` を指定するだけで背景色・文字色を持たないため、ブラウザ既定の `buttonface`（実測 `rgb(240,240,240)` / 黒文字）にフォールバックしている。結果として、ダーク UI の中央に、赤い「ベンチファウル」と並んで素のライトグレーのボタンが出ている。シンプルモード側の `.simple-sub-btn` は青系で塗られており、フルモードだけの取りこぼし。

```tsx
<button className="btn btn-small btn-secondary" onClick={onSubstitute}>
```

`.btn-secondary` は `--bg-tertiary` 地 + `--text-primary` で **9.90:1**。

### 3. `color-scheme: dark`

`getComputedStyle(document.documentElement).colorScheme` は現状 `normal`。このため試合設定の `<input type="date">` のピッカー、`<select>` のドロップダウン、スクロールバーが OS のライト UI で描画される。

`src/index.css` の `:root` に追加する。

```css
:root {
  color-scheme: dark;
  /* 既存のトークン定義 */
}
```

**安全性の確認済み**: 白地の `RunningScoresheet` / `OfficialScoresheet` には `<input>` `<select>` `<textarea>` が1つも無いため、ネイティブ部品がダーク化して紙面が崩れることはない。

あわせて `src/components/GameInfoModal/GameInfoModal.css:92` のローカル指定を削除する。

```css
/* 暗背景では既定（ライト）の時計アイコンが黒で潰れるため、
   このモーダル内のtime入力だけダークUIに切り替える */
.game-info-modal .form-group input[type="time"] {
    color-scheme: dark;
}
```

グローバル指定が同じ効果を持つため冗長になる。

### 4. Qバッジを赤/黒規約へ

赤=1Q/3Q はこのアプリの本物の規約である。`RunningScoresheet.css` が JBA 様式に沿って背番号・ピリオド得点・個人ファウル・斜線など15箇所以上で赤/黒を実装しており、`--quarter-1-3` / `--quarter-2-4` トークンと `QuarterLineup` もこれに従う。食い違っているのは `Scoreboard` の緑グラデーションだけで、これは最初の実装コミット（`ab6984c`）から変わっていない。

ただし単純適用は成立しない。バッジが載る `.scoreboard-new` の背景は `--bg-secondary` #1e293b のベタ塗りで（実装後に実測して確認。当初この設計は `linear-gradient(180deg, var(--bg-secondary), var(--bg-primary))` と記載していたが、そのグラデーションは `index.css` の旧 `.scoreboard` のもので、この要素には効いていない）:

| 塗り | vs 背景 `--bg-secondary` #1e293b |
|---|---|
| `--quarter-1-3` #dc2626 | 3.03 |
| `--quarter-2-4` #1f2937 | **1.00** |

**黒バッジは背景と輝度が完全に一致する（1.00:1）。** グラデーションの一端だけの問題ではなく、一律に消える。

そこで塗りは変えず（赤/黒の意味と、白文字の 4.83 / 14.68 を保持）、**両バリアントに `border: 2px solid var(--text-secondary)`（#94a3b8）を付ける**。枠は背景に対し 5.71、黒塗りに対し 5.72 で、どちらの側からも輪郭が立つ（いずれも実測値）。

赤側は塗り単体で背景に対し 3.03 あり WCAG 1.4.11（非文字コントラスト 3:1）を満たすため枠は不要だが、**片方だけ枠を付けると Q1 と Q2 が別部品に見える**ため両方に付ける。

クラス構成も `QuarterLineup` に合わせる。

- `src/components/Scoreboard/Scoreboard.tsx:123`: `q${currentQuarter}` / `ot` の生成を `q-odd` / `q-even` に変更する。OT は `QuarterLineup.tsx:94` と同じく `q-even` 扱いにする
- `src/components/Scoreboard/Scoreboard.css`: `.quarter-badge-large.q1` 〜 `.q4` の4規則（`#86efac` / `#4ade80` / `#16a34a` / `#14532d`）を削除し、`.q-odd` / `.q-even` の2規則に置き換える

Q1 の淡緑 `#86efac` はダーク UI の中で唯一の明色ブロックでもあったため、この変更で記録画面の明色は `.btn-timeout-chip`（意図的）のみになる。

### 5. PendingActionPanel / Resolver のトークン化

両ファイルは slate 系ではない Chakra 系グレーで書かれており、トークン色と「近いが一致しない」ため並べると濁って見える。

| 現状 | 置換先 |
|---|---|
| `linear-gradient(135deg, #2d3748 0%, #1a202c 100%)` | `linear-gradient(135deg, var(--bg-tertiary) 0%, var(--bg-primary) 100%)` |
| `#a0aec0` | `var(--text-secondary)` |
| `#4a5568` | `var(--border-light)` |
| `#3182ce` | `var(--primary-light)` |
| `#2c5282` | `var(--primary)` |
| `#38a169` | `var(--secondary)` |
| `#fbbf24` | `var(--warning-light)` |
| `#f59e0b` | `var(--warning)` |

**この作業は意図的に「見た目の改善」ではなく「トークン経由にすること」だけを行う。** 例えば `--text-secondary` は `--bg-tertiary` 上で 4.04 とまだ AA に届かないが、それは後続設計で `--text-secondary` の値そのものを直すべき問題である。先にトークンへ寄せておけば、後続設計の1箇所の修正がこの画面にも自動的に効く。

`--text-secondary` は元の `#a0aec0`(160,174,192) に対し `#94a3b8`(148,163,184)、`--border-light` は `#4a5568`(74,85,104) に対し `#475569`(71,85,105) と、いずれも視覚的にはほぼ同一であり、この置換自体による見た目の変化は小さい。

### 6. iOS スプラッシュと `launch_handler`

#### iOS スプラッシュ

iOS は manifest の `background_color`（`#0f172a`）を読まないため、ホーム画面から起動すると起動時に白画面を挟む。これを消すには `apple-touch-startup-image` を端末解像度ごとに用意する以外の方法がない。

既存の `scripts/generate-maskable-icon.mjs` と同じ流儀（`sharp` は devDependency に導入済み）で `scripts/generate-splash-screens.mjs` を追加する。

- 入力: `public/icon-512.png`
- 出力: `public/splash/` 配下の PNG
- 背景: `#0f172a`（manifest の `background_color` と一致させる）
- 絵柄: 中央配置。サイズは短辺の 40% を上限とし、どの縦横比でも見切れないようにする
- 実行方法: `generate-maskable-icon.mjs` と同じく**手動実行**（`node scripts/generate-splash-screens.mjs`）し、**生成物を git にコミットする**。ビルドパイプラインには組み込まない

対象解像度は、iOS の `apple-touch-startup-image` が要求する「デバイスのポイント寸法 × DPR」の組で定義する。現行 iOS でサポート対象の主要機種を、重複するピクセル寸法をまとめたうえで縦横それぞれ生成する。実装時に確定する一覧を `scripts/generate-splash-screens.mjs` 内の定数配列に持たせ、そこを唯一の定義元とする（`index.html` の `<link>` はその配列と1対1で対応させる）。

`index.html` に `media` クエリ付きの `<link rel="apple-touch-startup-image">` を解像度ぶん並べる。`media` は `(device-width: Xpx) and (device-height: Ypx) and (-webkit-device-pixel-ratio: N) and (orientation: portrait|landscape)` の形を取る。

生成物を `public/` に置くため、`vite.config.ts` の `globPatterns`（`**/*.{js,css,html,ico,png,svg,woff,woff2,gz}`）に自動的に拾われてプリキャッシュ対象になる。スプラッシュはブラウザ／OS が起動時に読むもので、アプリの動作には不要なため、`screenshots/**` と同じ理由で `globIgnores` に `splash/**` を追加する。

#### `launch_handler`

`vite.config.ts` の `manifest` に追加する。

```ts
launch_handler: {
  client_mode: 'focus-existing'
},
```

manifest には既にアイコン長押し用の `shortcuts`（新規試合／履歴／スタッツ）がある。`launch_handler` が無いと、試合中にショートカットをタップした際に新しいインスタンスが開き、記録中の画面から離れる可能性がある。`focus-existing` は既存のウィンドウにフォーカスを戻す。

## テスト方針

CSS の色の置換が中心であり、既存のテスト構成（vitest + @testing-library/react）は DOM 構造とロジックを対象としている。本設計では次を担保する。

- **`npm run lint` / `npm test` / `npm run build` が通ること**（既存テストの非回帰）
- **2 の「交代」ボタン**: `TeamPanel` のレンダリング結果で、交代ボタンが `btn-secondary` クラスを持つことを検証するテストを追加する。色バリアントクラスの欠落という不具合の再発を検知できる
- **4 のQバッジ**: `Scoreboard` のレンダリング結果で、Q1/Q3 が `q-odd`、Q2/Q4/OT が `q-even` になることを検証するテストを追加する
- **1 / 3 / 5 / 6**: 自動テストは追加しない。CSS 値・manifest・生成画像であり、DOM テストでは実効値を検証できない。代わりに dev サーバ上で `getComputedStyle` による実測を行い、次を確認する
  - タイムアウトモーダルの背景が `--bg-secondary` になっていること、`<select>` が 44px 以上あること
  - `documentElement` の `colorScheme` が `dark` になっていること
  - 記録画面に残る明色ブロックが `.btn-timeout-chip` のみであること

## 影響範囲

| ファイル | 変更 |
|---|---|
| `src/components/TimeoutInputModal/TimeoutInputModal.css` | 全面的な配色差し替え |
| `src/components/TeamPanel/TeamPanel.tsx` | `btn-secondary` 追加（1行） |
| `src/index.css` | `color-scheme: dark` 追加（1行） |
| `src/components/GameInfoModal/GameInfoModal.css` | 冗長になったローカル指定を削除 |
| `src/components/Scoreboard/Scoreboard.tsx` | クラス生成を `q-odd` / `q-even` へ |
| `src/components/Scoreboard/Scoreboard.css` | Qバッジ4規則 → 2規則、枠線追加 |
| `src/components/PendingActionPanel/PendingActionPanel.css` | 色をトークンへ |
| `src/components/PendingActionResolver/PendingActionResolver.css` | 色をトークンへ |
| `scripts/generate-splash-screens.mjs` | 新規 |
| `public/splash/*.png` | 新規（生成物） |
| `index.html` | `apple-touch-startup-image` 追加 |
| `vite.config.ts` | `launch_handler` 追加、`globIgnores` に `splash/**` |

## 後続作業

本設計の完了後、カラートークンの値そのものの再設計に着手する。上表のとおり `--text-secondary` / `--text-muted` / `--primary-light` は `--bg-primary` の上でしか AA を満たしておらず、`--bg-tertiary` 以降で破綻する。また `.btn-success`（`--secondary`）は主要 CTA に使われながら白文字で 3.77 しかない。面別トークンの導入か、既存トークンの値の引き上げかを含め、別途設計する。

本設計の 5（トークン化）は、その修正が `PendingActionPanel` 系にも自動的に波及する状態を先に作っておくための布石である。

**ただし、トークンの値を直すだけでは届かない箇所が残る。後続設計のスコープには「残存リテラルの掃除」も明示的に含めること。** 代表例は `src/App.css` のベンチファウルボタンで、`linear-gradient(135deg, #e74c3c 0%, #ec7063 100%)` という**トークンを経由しない直書き**である（白文字で 3.82、`--danger` #dc2626 とは別の第2の赤）。ここはトークンではないため、値をいくら直しても波及しない。同種の直書きが他にも無いか、後続設計の冒頭で棚卸しする必要がある。
