# ダーク配色の一貫性回復とPWAの詰め 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** トークンを通っていない画面をトークン経由に揃え、クォーター色の2重定義を解消し、iOSの起動白画面とショートカットの多重起動を防ぐ。

**Architecture:** 変更の大半は CSS の色リテラルを既存トークンへ置換するもので、`src/index.css` の `:root` にあるトークンの**値そのものは一切変更しない**（それは後続の別設計）。DOM 構造やロジックに触れるのは、色バリアントクラスが欠けている「交代」ボタン1行と、Qバッジのクラス生成1箇所のみ。PWA 側は manifest への `launch_handler` 追加と、`sharp` による iOS スプラッシュ画像の生成スクリプト追加。

**Tech Stack:** React 19 / TypeScript 5.9 / Vite 7 / vite-plugin-pwa 1.2 / vitest 4 + @testing-library/react / sharp（devDependency・導入済み）

## Global Constraints

- **`src/index.css` の `:root` にあるトークンの値を変更してはならない。** `--text-secondary` などが明るい面の上で WCAG AA を満たさない問題は後続設計の担当。本計画は「トークン経由にする」ことだけを行い、見た目の改善は目的としない
- 新しいカラートークンを追加してはならない。既存トークンで表現できない色（hover の明暗差など）は `filter: brightness()` で表現する
- 追加する **16進の色リテラル**（`#rrggbb`）は禁止。次は対象外:
  - 既存の `rgba(255,255,255,…)` / `rgba(0,0,0,…)` の構造的オーバーレイと影（palette ではない）
  - ベタ塗りのボタン・バッジの上に載る `color: white`。`index.css` の `.btn-primary` / `.btn-danger` / `.btn-success` と `QuarterLineup` の `.quarter-badge.q-odd` が既にこの書き方であり、揃えるほうが一貫する
- タップ領域は最小 44px（WCAG 2.5.8）。既存箇所を下回らせない
- コミットメッセージは日本語、`種別(スコープ): 内容を〜する` 形式（例 `fix(ui): …を直す`）。末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を入れる
- 作業ブランチは `fix/dark-consistency-and-pwa-polish`（作成済み）
- 各タスクの最後に `npm run lint` と `npm test` が通ること
- **正規表現を含むスクリプトファイルは、シェルのヒアドキュメント（`cat > file <<'EOF'`）ではなくファイル書き込みツールで作ること。** この環境ではヒアドキュメント経由でバックスラッシュが失われ、`\s` が `s`、`\b` が `b` に化ける（検証済み）。置換が黙って何もしない状態になる。Task 5 の置換スクリプトが該当する
- **ブラウザ検証の制約**（過去ブランチで確認済み・`.superpowers/sdd/progress.md` 参照）: Browser ペインが非表示のため **screenshot は取得できない**。検証は `getComputedStyle` と a11y ツリーで行う。またペイン非合成のタブでは CSS transition が t=0 で停止するため、**状態変化後の値を読む場合は対象に `transition: none` を当ててから読むこと**（初期状態を読むだけなら不要）。ビューポートを変えたあとは必ずリロードする

---

### Task 1: フルモードの「交代」ボタンに色バリアントを与える

`src/components/TeamPanel/TeamPanel.tsx` の「交代」ボタンは `className="btn btn-small"` のみで色バリアントを持たない。`.btn` は `border: none` を指定するだけで背景色・文字色を持たないため、ブラウザ既定の `buttonface`（実測 `rgb(240,240,240)` / 黒文字）にフォールバックし、ダーク UI の中央にライトグレーの素ボタンが出ている。

**Files:**
- Modify: `src/components/TeamPanel/TeamPanel.tsx:126`
- Test: `src/components/TeamPanel/TeamPanel.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces: なし（DOM のクラス名のみ）

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TeamPanel/TeamPanel.test.tsx` の末尾に追記する。`renderPanel` はファイル先頭に既にあるものをそのまま使う（`gameMode="full"` が既定）。

```tsx
// .btn は border:none だけを指定し背景色を持たないため、色バリアントクラスが
// 無いとブラウザ既定の buttonface（ライトグレー・黒文字）で描画される。
// ダークUIの中に素のボタンが出る不具合の再発を検知する。
describe('TeamPanel: ベンチ操作ボタンの色バリアント', () => {
    it('交代ボタンは btn-secondary を持つ', () => {
        renderPanel();
        const sub = screen.getByRole('button', { name: '交代' });
        expect(sub.className).toContain('btn-secondary');
    });

    it('ベンチファウルボタンは btn-danger を持つ（破壊的操作として交代と色で区別する）', () => {
        renderPanel();
        const foul = screen.getByRole('button', { name: /ベンチ\s*ファウル/ });
        expect(foul.className).toContain('btn-danger');
    });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm test -- src/components/TeamPanel/TeamPanel.test.tsx`
Expected: 「交代ボタンは btn-secondary を持つ」が FAIL。`btn btn-small` に `btn-secondary` が含まれない旨のアサーションエラー。「ベンチファウル」のほうは既に `btn-danger` を持つため PASS。

- [ ] **Step 3: 最小限の実装を行う**

`src/components/TeamPanel/TeamPanel.tsx` の該当箇所を変更する。

変更前:
```tsx
          <button className="btn btn-small" onClick={onSubstitute}>
            交代
          </button>
```

変更後:
```tsx
          <button className="btn btn-small btn-secondary" onClick={onSubstitute}>
            交代
          </button>
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npm test -- src/components/TeamPanel/TeamPanel.test.tsx`
Expected: PASS（新規2件を含め全件）

- [ ] **Step 5: 全体テストと lint**

Run: `npm run lint && npm test`
Expected: どちらもエラーなし

- [ ] **Step 6: コミット**

```bash
git add src/components/TeamPanel/TeamPanel.tsx src/components/TeamPanel/TeamPanel.test.tsx
git commit -m "$(cat <<'EOF'
fix(ui): フルモードの交代ボタンが素のボタンで描画されるのを直す

.btn は border:none を指定するだけで背景色を持たないため、色バリアント
クラスが無い交代ボタンはブラウザ既定の buttonface（ライトグレー・黒文字）
で描画されていた。ダークUIの中央に、隣の赤いベンチファウルと並んで素の
ボタンが出ている状態だった。

シンプルモードの .simple-sub-btn は青系で塗られており、フルモードだけの
取りこぼし。破壊的操作であるベンチファウルの赤との対比を優先し、中立色の
btn-secondary（--bg-tertiary + --text-primary で 9.90:1）を与える。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: スコアボードのQバッジを赤/黒規約へ寄せる

赤=1Q/3Q はこのアプリの本物の規約である。`RunningScoresheet.css` が JBA 様式に沿って背番号・ピリオド得点・個人ファウル・斜線など15箇所以上で実装しており、`--quarter-1-3` / `--quarter-2-4` トークンと `QuarterLineup` もこれに従う。`Scoreboard` の緑グラデーションだけが食い違っており、最初の実装コミット（`ab6984c`）から変わっていない。

単純適用は成立しない。バッジが載る `.scoreboard-new` の背景は `--bg-secondary` #1e293b のベタ塗りで、`--quarter-2-4` #1f2937 はこれに対し **1.00:1**（輝度が完全に一致）。塗りは変えずに `--text-secondary` の枠線で輪郭を出す。

（当初この計画は背景を `linear-gradient(180deg, var(--bg-secondary), var(--bg-primary))` と記載していたが、実装後の実測で誤りと判明した。そのグラデーションは `index.css` の旧 `.scoreboard` のもので、この要素には効いていない。問題は「グラデーションの上端で」ではなく一律に起きる。）

**Files:**
- Modify: `src/components/Scoreboard/Scoreboard.tsx:21-23`（`quarterClass` の追加）, `src/components/Scoreboard/Scoreboard.tsx:123`
- Modify: `src/components/Scoreboard/Scoreboard.css:142-163`
- Test: `src/components/Scoreboard/Scoreboard.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces: `.quarter-badge-large` は `q-odd`（1Q/3Q）または `q-even`（2Q/4Q/OT）のいずれかのクラスを併せ持つ。`QuarterLineup.tsx:94` と同じ命名規則

- [ ] **Step 1: 失敗するテストを書く**

`src/components/Scoreboard/Scoreboard.test.tsx` の末尾に追記する。`renderScoreboard` はファイル先頭にあるものをそのまま使う。`END_QUARTER` → `START_GAME` の対で次のクォーターへ進む（既存テストの Q4 のケースと同じ手順）。

```tsx
// クォーター色はJBA様式の「赤=1Q/3Q・黒=2Q/4Q」に統一する。
// RunningScoresheet と QuarterLineup が既にこの規約に従っており、
// スコアボードだけが緑グラデーションで食い違っていた。
describe('Scoreboard: Qバッジのクォーター色クラス', () => {
    const badgeClass = () =>
        document.querySelector('.quarter-badge-large')!.className;

    const advance = (times: number) =>
        Array.from({ length: times }, () => [
            { type: 'END_QUARTER' } as const,
            { type: 'START_GAME' } as const,
        ]).flat();

    it('Q1は q-odd', () => {
        renderScoreboard();
        expect(badgeClass()).toContain('q-odd');
    });

    it('Q2は q-even', () => {
        renderScoreboard(advance(1));
        expect(badgeClass()).toContain('q-even');
    });

    it('Q3は q-odd', () => {
        renderScoreboard(advance(2));
        expect(badgeClass()).toContain('q-odd');
    });

    it('Q4は q-even', () => {
        renderScoreboard(advance(3));
        expect(badgeClass()).toContain('q-even');
    });

    it('OTは q-even（QuarterLineupと同じ扱い）', () => {
        renderScoreboard(advance(4));
        expect(badgeClass()).toContain('q-even');
    });

    it('旧クラス（q1〜q4 / ot）は残っていない', () => {
        renderScoreboard();
        const cls = badgeClass().split(/\s+/);
        expect(cls).not.toContain('q1');
        expect(cls).not.toContain('ot');
    });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm test -- src/components/Scoreboard/Scoreboard.test.tsx`
Expected: 新規6件のうち「Q1は q-odd」「Q2は q-even」…「旧クラスは残っていない」が FAIL。現状は `q1`〜`q4` / `ot` が付くため。

- [ ] **Step 3: TSX を実装する**

`src/components/Scoreboard/Scoreboard.tsx` の `quarterLabel` の直後（21-23行目の下）に `quarterClass` を追加する。

変更前:
```tsx
    const quarterLabel = currentQuarter <= 4
        ? `Q${currentQuarter}`
        : currentQuarter === 5 ? 'OT' : `OT${currentQuarter - 4}`;
```

変更後:
```tsx
    const quarterLabel = currentQuarter <= 4
        ? `Q${currentQuarter}`
        : currentQuarter === 5 ? 'OT' : `OT${currentQuarter - 4}`;

    // クォーター色（1Q/3Qは赤、2Q/4Q/OTは黒）。QuarterLineup.tsx と同じ規則。
    const quarterClass = currentQuarter > 4
        ? 'q-even'
        : (currentQuarter === 1 || currentQuarter === 3 ? 'q-odd' : 'q-even');
```

123行目の `<span>` を変更する。

変更前:
```tsx
                    <span className={`quarter-badge-large ${currentQuarter <= 4 ? `q${currentQuarter}` : 'ot'}`}>{quarterLabel}</span>
```

変更後:
```tsx
                    <span className={`quarter-badge-large ${quarterClass}`}>{quarterLabel}</span>
```

- [ ] **Step 4: CSS を実装する**

`src/components/Scoreboard/Scoreboard.css` の142-163行目にある4つの規則を削除し、2つに置き換える。

削除する規則（`.q1` / `.q2` / `.q3` / `.q4` の4ブロック全体）:
```css
:is(.scoreboard-new, .scoreboard-simple, .end-game-confirm-modal) .quarter-badge-large.q1 {
    background: #86efac;
    /* とても明るい緑 */
    color: #166534;
}

:is(.scoreboard-new, .scoreboard-simple, .end-game-confirm-modal) .quarter-badge-large.q2 {
    background: #4ade80;
    /* 明るい緑 */
    color: white;
}

:is(.scoreboard-new, .scoreboard-simple, .end-game-confirm-modal) .quarter-badge-large.q3 {
    background: #16a34a;
    /* 中間緑 */
    color: white;
}

:is(.scoreboard-new, .scoreboard-simple, .end-game-confirm-modal) .quarter-badge-large.q4 {
    background: #14532d;
    /* とても濃い緑 */
    color: white;
}
```

追加する規則:
```css
/* クォーター色はJBA様式に合わせ 1Q/3Q=赤・2Q/4Q=黒 に統一する
   （RunningScoresheet・QuarterLineup と同じ規約）。
   ただし黒の --quarter-2-4 #1f2937 は、このバッジが載る .scoreboard-new の
   背景 --bg-secondary #1e293b に対して実測 1.00:1 ＝ 輝度が完全に一致する。
   塗りだけでは輪郭が一切出ず、バッジが消える。
   そこで枠線 --text-secondary #94a3b8 を入れる。背景に対し 5.71、黒塗りに
   対し 5.72 で、どちらの側からも輪郭が立つ（いずれも実測値）。
   赤は塗り単体でも背景に対し 3.03 あり WCAG 1.4.11 の 3:1 を満たすため枠は
   不要だが、片方だけ枠を付けると Q1 と Q2 が別部品に見えるため両方に付ける。 */
:is(.scoreboard-new, .scoreboard-simple, .end-game-confirm-modal) .quarter-badge-large.q-odd,
:is(.scoreboard-new, .scoreboard-simple, .end-game-confirm-modal) .quarter-badge-large.q-even {
    border: 2px solid var(--text-secondary);
    color: white;
}

:is(.scoreboard-new, .scoreboard-simple, .end-game-confirm-modal) .quarter-badge-large.q-odd {
    background: var(--quarter-1-3);
}

:is(.scoreboard-new, .scoreboard-simple, .end-game-confirm-modal) .quarter-badge-large.q-even {
    background: var(--quarter-2-4);
}
```

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `npm test -- src/components/Scoreboard/Scoreboard.test.tsx`
Expected: PASS（新規6件を含め全件）

- [ ] **Step 6: 緑リテラルが残っていないことを確認する**

Run: `grep -nE '#(86efac|4ade80|16a34a|14532d|166534)' src/components/Scoreboard/Scoreboard.css`
Expected: 一致なし（終了コード1・出力なし）

- [ ] **Step 7: 全体テストと lint**

Run: `npm run lint && npm test`
Expected: どちらもエラーなし

- [ ] **Step 8: コミット**

```bash
git add src/components/Scoreboard/Scoreboard.tsx src/components/Scoreboard/Scoreboard.css src/components/Scoreboard/Scoreboard.test.tsx
git commit -m "$(cat <<'EOF'
fix(ui): スコアボードのQ色をJBA様式の赤/黒に統一する

クォーターの色分けが2系統に割れていた。RunningScoresheet はJBA様式に
沿って赤=1Q/3Q・黒=2Q/4Q を15箇所以上で実装し、--quarter-1-3 /
--quarter-2-4 トークンと QuarterLineup もこれに従う。一方 Scoreboard
だけが緑グラデーションで、最初の実装コミットから変わっていなかった。

ただし --quarter-2-4 #1f2937 は、バッジが載る .scoreboard-new の背景
(--bg-secondary #1e293b) に対し 1.00:1 で輝度が完全に一致する。塗りは
変えず（白文字の 4.83 / 14.68 を保持）、両バリアントに --text-secondary
の枠線を付けて輪郭を出す。赤側は塗り単体で足りるが、片方だけ枠を付けると
Q1とQ2が別部品に見えるため揃える。

クラス名も QuarterLineup と同じ q-odd / q-even に合わせた。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `color-scheme: dark` でネイティブ部品を揃える

`getComputedStyle(document.documentElement).colorScheme` は現状 `normal`。このため試合設定の `<input type="date">` のピッカー、`<select>` のドロップダウン、スクロールバーが OS のライト UI で描画される。

白地の `RunningScoresheet` / `OfficialScoresheet` には `<input>` `<select>` `<textarea>` が1つも無いため、ネイティブ部品がダーク化して紙面が崩れることはない（確認済み）。

**Files:**
- Modify: `src/index.css:3-4`
- Modify: `src/components/GameInfoModal/GameInfoModal.css:89-93`

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: `:root` に `color-scheme` を追加する**

`src/index.css` の先頭を変更する。

変更前:
```css
:root {
  /* カラーパレット */
  --primary: #1e40af;
```

変更後:
```css
:root {
  /* ネイティブ部品（selectのドロップダウン、date/timeのピッカー、
     スクロールバー、フォーム自動補完）をダーク側で描画させる。
     指定しないと --bg-primary の暗い画面の上にOS既定のライトUIが出る。
     白地の RunningScoresheet / OfficialScoresheet には input/select/textarea が
     無いため、紙面の見た目には影響しない。 */
  color-scheme: dark;

  /* カラーパレット */
  --primary: #1e40af;
```

- [ ] **Step 2: 冗長になったローカル指定を削除する**

`src/components/GameInfoModal/GameInfoModal.css` から次のブロックを丸ごと削除する（前後の空行も1つに整える）。

```css
/* 暗背景では既定（ライト）の時計アイコンが黒で潰れるため、
   このモーダル内のtime入力だけダークUIに切り替える */
.game-info-modal .form-group input[type="time"] {
    color-scheme: dark;
}
```

`:root` のグローバル指定が同じ効果を持つため。

- [ ] **Step 3: 重複指定が残っていないことを確認する**

Run: `grep -rn "color-scheme" src/`
Expected: `src/index.css` の1件のみが出力される（`PlayerStatsAnalysis.css` にある `prefers-color-scheme` への言及コメントは別物なので、`color-scheme:` のプロパティ指定として現れるのが1件であればよい）

- [ ] **Step 4: 実機で効いていることを確認する**

dev サーバを起動し（`.claude/launch.json` の `dev` 設定）、ブラウザのコンソールで次を実行する。

```js
getComputedStyle(document.documentElement).colorScheme
```

Expected: `"dark"`

続けて「新規試合開始」→「試合情報」まで進み、日付欄のカレンダーピッカーを開いてダーク表示になっていることを目視する。

- [ ] **Step 5: 全体テストと lint**

Run: `npm run lint && npm test`
Expected: どちらもエラーなし

- [ ] **Step 6: コミット**

```bash
git add src/index.css src/components/GameInfoModal/GameInfoModal.css
git commit -m "$(cat <<'EOF'
fix(ui): ネイティブ部品をダーク側で描画させる

documentElement の colorScheme が normal のままで、select のドロップ
ダウン、date/time のピッカー、スクロールバーがOS既定のライトUIで
描画されていた。暗い画面の上に白い部品が出る。

:root に color-scheme: dark を置く。白地の RunningScoresheet /
OfficialScoresheet には input/select/textarea が無いため紙面には影響
しない。GameInfoModal の input[type=time] 向けローカル指定は冗長に
なるので削除する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: TimeoutInputModal をダーク配色へ

アプリ唯一の全面ライトテーマで、暗い体育館の試合中に画面中央へ白いモーダル（実測 `rgb(255,255,255)`）が出る。`TimeoutInputModal.tsx` は既に `Modal`（`role="dialog"` / フォーカストラップ / Esc）を使っているため **TSX は触らない**。

**Files:**
- Modify: `src/components/TimeoutInputModal/TimeoutInputModal.css`（全面差し替え）
- Test: `src/components/TimeoutInputModal/TimeoutInputModal.test.tsx`（既存の非回帰のみ・追加なし）

**Interfaces:**
- Consumes: `src/index.css` の `:root` トークン（`--bg-secondary` / `--bg-tertiary` / `--text-primary` / `--text-secondary` / `--primary` / `--primary-light` / `--border` / `--team-white` / `--team-blue-light` / `--font-size-*` / `--radius-md` / `--spacing-*`）
- Produces: なし（クラス名は不変）

- [ ] **Step 1: CSS を全面的に差し替える**

`src/components/TimeoutInputModal/TimeoutInputModal.css` の内容を次で置き換える。

```css
/* タイムアウト入力モーダル。
   もともとBootstrap既定色のライトテーマで書かれており、ダーク一色のアプリの
   中でここだけ白背景だった。暗い体育館の試合中に画面中央が白く光るため、
   本体と同じトークン（--bg-secondary / --bg-tertiary）に統一している。 */

.timeout-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    /* 他のモーダル（.modal-overlay）と同じ濃さに揃える */
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.timeout-modal-content {
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    width: 90%;
    max-width: 320px;
    box-shadow: var(--shadow-lg);
    overflow: hidden;
}

.timeout-modal-content .timeout-modal-header {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    padding: var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
}

.timeout-modal-content .timeout-modal-title {
    font-size: var(--font-size-lg);
    font-weight: 700;
}

.timeout-modal-content .timeout-modal-team {
    font-size: var(--font-size-sm);
}

.timeout-modal-content .timeout-modal-team.white {
    color: var(--team-white);
}

.timeout-modal-content .timeout-modal-team.blue {
    color: var(--team-blue-light);
}

.timeout-modal-content .timeout-modal-quarter {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
}

.timeout-modal-content .timeout-modal-body {
    padding: var(--spacing-lg);
}

.timeout-modal-content .timeout-input-section {
    margin-bottom: var(--spacing-lg);
}

.timeout-modal-content .timeout-input-label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 600;
    margin-bottom: var(--spacing-sm);
    color: var(--text-primary);
}

.timeout-modal-content .timeout-time-inputs {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    justify-content: center;
}

.timeout-modal-content .timeout-select {
    font-size: var(--font-size-lg);
    padding: var(--spacing-sm) var(--spacing-md);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-tertiary);
    color: var(--text-primary);
    /* アプリ全体が守っている44px下限に合わせる（変更前は42pxだった） */
    min-height: 44px;
    min-width: 70px;
    text-align: center;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
}

.timeout-modal-content .timeout-select:focus {
    border-color: var(--primary-light);
    outline: none;
}

.timeout-modal-content .timeout-time-separator {
    font-size: var(--font-size-md);
    color: var(--text-secondary);
}

.timeout-modal-content .timeout-result-section {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
}

.timeout-modal-content .timeout-result-arrow {
    font-size: var(--font-size-lg);
    color: var(--text-secondary);
}

.timeout-modal-content .timeout-result-label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
}

.timeout-modal-content .timeout-result-value {
    font-size: var(--font-size-2xl);
    font-weight: 700;
    color: var(--primary-light);
    min-width: 40px;
    text-align: center;
}

.timeout-modal-content .timeout-modal-actions {
    display: flex;
    border-top: 1px solid var(--border);
}

.timeout-modal-content .timeout-btn {
    flex: 1;
    padding: var(--spacing-md);
    font-size: var(--font-size-md);
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: background-color var(--transition-fast);
}

.timeout-modal-content .timeout-btn-cancel {
    background: var(--bg-tertiary);
    color: var(--text-primary);
}

@media (hover: hover) and (pointer: fine) {
  .timeout-modal-content .timeout-btn-cancel:hover {
      background: var(--bg-hover);
  }
}

/* 変更前は #007bff（白文字 3.98:1）。--primary は白文字で 8.72:1 */
.timeout-modal-content .timeout-btn-confirm {
    background: var(--primary);
    color: white;
}

@media (hover: hover) and (pointer: fine) {
  .timeout-modal-content .timeout-btn-confirm:hover {
      background: var(--primary-light);
  }
}
```

- [ ] **Step 2: 色リテラルが残っていないことを確認する**

Run: `grep -nE '#[0-9a-fA-F]{3,8}' src/components/TimeoutInputModal/TimeoutInputModal.css`
Expected: 一致なし（終了コード1・出力なし）

- [ ] **Step 3: 既存テストが通ることを確認する**

Run: `npm test -- src/components/TimeoutInputModal/TimeoutInputModal.test.tsx`
Expected: PASS（CSS のみの変更なので既存テストは影響を受けない）

- [ ] **Step 4: 実機で配色とタップ領域を確認する**

dev サーバでホーム →「新規試合開始」から試合を開始し、チームヘッダーのタイムアウトチップを押してモーダルを開く。ブラウザのコンソールで次を実行する。

```js
(() => {
  const m = document.querySelector('.timeout-modal-content');
  const sel = m.querySelector('.timeout-select');
  return {
    modalBg: getComputedStyle(m).backgroundColor,
    selectH: sel.getBoundingClientRect().height,
    confirmBg: getComputedStyle(m.querySelector('.timeout-btn-confirm')).backgroundColor,
  };
})()
```

Expected:
- `modalBg` が `"rgb(30, 41, 59)"`（`--bg-secondary`）
- `selectH` が `44` 以上
- `confirmBg` が `"rgb(30, 64, 175)"`（`--primary`）

- [ ] **Step 5: 全体テストと lint**

Run: `npm run lint && npm test`
Expected: どちらもエラーなし

- [ ] **Step 6: コミット**

```bash
git add src/components/TimeoutInputModal/TimeoutInputModal.css
git commit -m "$(cat <<'EOF'
fix(ui): タイムアウトモーダルをダーク前提の配色に統一する

Bootstrap既定色のライトテーマで書かれており、ダーク一色のアプリの中で
ここだけ背景が白だった。暗い体育館の試合中に画面中央が白く光る。

本体と同じトークンに統一し、直書きの 12/14/16/18/20/32px と 8px 角丸も
--font-size-* / --radius-md に寄せる。確定ボタンは #007bff（白文字
3.98:1）から --primary（8.72:1）へ。select はアプリ全体が守っている
44px下限を唯一下回って42pxだったので合わせる。オーバーレイの濃さも
他のモーダル（.modal-overlay）と同じ 0.7 に揃えた。

TimeoutInputModal.tsx は既に Modal を使っているためCSSのみの変更。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: PendingActionPanel / Resolver の色をトークン経由にする

両ファイルは slate 系ではない Chakra 系グレー（`#2d3748` / `#1a202c` / `#a0aec0` / `#4a5568` / `#3182ce` / `#38a169`）で書かれており、トークン色と「近いが一致しない」ため並べると濁って見える。

**この作業は意図的に「見た目の改善」ではなく「トークン経由にすること」だけを行う。** 例えば `--text-secondary` は `--bg-tertiary` 上で 4.04 とまだ AA に届かないが、それは後続設計で `--text-secondary` の値そのものを直すべき問題である。先にトークンへ寄せておけば、後続設計の1箇所の修正がこの画面にも自動的に効く。

置換表（両ファイル共通）:

| 現状 | 置換先 | 備考 |
|---|---|---|
| `linear-gradient(135deg, #2d3748 0%, #1a202c 100%)` | `linear-gradient(135deg, var(--bg-tertiary) 0%, var(--bg-primary) 100%)` | |
| `#fbbf24` | `var(--warning-light)` | |
| `#f59e0b` | `var(--warning)` | |
| `#a0aec0` | `var(--text-secondary)` | (160,174,192)→(148,163,184) でほぼ同一 |
| `#4a5568` | `var(--border-light)` | (74,85,104)→(71,85,105) でほぼ同一 |
| `#e2e8f0` | `var(--text-primary)` | |
| `#fff` | `var(--text-primary)` | |
| `#1a202c`（文字色として） | `var(--bg-primary)` | 琥珀色地の上の暗い文字 |
| `#3182ce` | `var(--primary-light)` | |
| `#2c5282` | `var(--primary)` | |
| `#38a169` | `var(--secondary)` | |
| `#63b3ed` | `var(--team-blue-light)` | (99,179,237)→(96,165,250) で近い |
| `#bee3f8` | `var(--text-primary)` | |
| `#5a6878`（hover・base より明るい） | `filter: brightness(1.15)` | 既存トークンに `--border-light` より明るい面色が無いため |
| `#d97706`（hover・base より暗い） | `filter: brightness(0.9)` | 同上 |

`rgba(255,255,255,…)` / `rgba(0,0,0,…)` のオーバーレイと影は palette ではなく構造的な指定なのでそのまま残す。

**Files:**
- Modify: `src/components/PendingActionPanel/PendingActionPanel.css`
- Modify: `src/components/PendingActionResolver/PendingActionResolver.css`
- Test: `src/components/PendingActionPanel/PendingActionPanel.test.tsx`（既存の非回帰のみ・追加なし）

**Interfaces:**
- Consumes: `src/index.css` の `:root` トークン
- Produces: なし（クラス名は不変）

- [ ] **Step 1: 両ファイルのリテラルを機械的に置換する**

行番号は編集のたびにずれるため、置換はスクリプトで一括して行う。**グラデーション全体を先に置換してから個別色を置換する**（`#1a202c` はグラデーション内と文字色の両方に現れ、意味が異なるため）。

次を `/c/Users/bonin/AppData/Local/Temp/claude/C--MBCscore-pr/2bac88e7-7933-4291-9d79-f0142b07ab37/scratchpad/tokenize.mjs` に保存して実行する。**ファイル書き込みツールで作ること**（ヒアドキュメントでは `\b` が `b` に化けて置換が空振りする。Global Constraints 参照）。

```js
import fs from 'fs';

const files = [
    'src/components/PendingActionPanel/PendingActionPanel.css',
    'src/components/PendingActionResolver/PendingActionResolver.css',
];

// 順序が重要。グラデーション全体を先に潰してから個別色を置換する
const rules = [
    [/linear-gradient\(135deg, #2d3748 0%, #1a202c 100%\)/g,
     'linear-gradient(135deg, var(--bg-tertiary) 0%, var(--bg-primary) 100%)'],
    [/#fbbf24\b/g, 'var(--warning-light)'],
    [/#f59e0b\b/g, 'var(--warning)'],
    [/#a0aec0\b/g, 'var(--text-secondary)'],
    [/#4a5568\b/g, 'var(--border-light)'],
    [/#e2e8f0\b/g, 'var(--text-primary)'],
    [/#bee3f8\b/g, 'var(--text-primary)'],
    [/#63b3ed\b/g, 'var(--team-blue-light)'],
    [/#3182ce\b/g, 'var(--primary-light)'],
    [/#2c5282\b/g, 'var(--primary)'],
    [/#38a169\b/g, 'var(--secondary)'],
    // グラデーション置換後に残る #1a202c はすべて文字色
    [/#1a202c\b/g, 'var(--bg-primary)'],
    [/#fff\b/g, 'var(--text-primary)'],
];

for (const file of files) {
    let s = fs.readFileSync(file, 'utf8');
    for (const [re, to] of rules) s = s.replace(re, to);
    fs.writeFileSync(file, s);
    console.log('置換:', file);
}
```

Run: `node /c/Users/bonin/AppData/Local/Temp/claude/C--MBCscore-pr/2bac88e7-7933-4291-9d79-f0142b07ab37/scratchpad/tokenize.mjs`
Expected: 2ファイル分の「置換:」行

この時点で残るリテラルは hover 用の `#5a6878` と `#d97706` の2つだけ。次のステップで扱う。

- [ ] **Step 1b: PendingActionPanel の hover を filter に置き換える**

`src/components/PendingActionPanel/PendingActionPanel.css` の `.candidate-player-btn.selected:hover` を変更する。

変更前（**Step 1 のスクリプト実行後の状態**。`border-color` は既に `var(--warning)` に置換済みで、`#d97706` だけが残っている）:
```css
@media (hover: hover) and (pointer: fine) {
  :is(.pending-badge, .pending-action-panel) .candidate-player-btn.selected:hover {
      background: #d97706;
      border-color: var(--warning);
  }
}
```

変更後:
```css
/* --warning より暗い面色のトークンが無いため、hoverの暗さは filter で出す。
   トークンの値が変わっても関係が保たれる */
@media (hover: hover) and (pointer: fine) {
  :is(.pending-badge, .pending-action-panel) .candidate-player-btn.selected:hover {
      filter: brightness(0.9);
  }
}
```

- [ ] **Step 2: PendingActionResolver の hover を filter に置き換える**

`src/components/PendingActionResolver/PendingActionResolver.css` の `.resolver-player-btn:hover` を変更する。

変更前:
```css
@media (hover: hover) and (pointer: fine) {
  .pending-resolver-modal .resolver-player-btn:hover {
      background: #5a6878;
      transform: translateY(-2px);
  }
}
```

変更後:
```css
/* --border-light より明るい面色のトークンが無いため、hoverの明るさは
   filter で出す。トークンの値が変わっても関係が保たれる */
@media (hover: hover) and (pointer: fine) {
  .pending-resolver-modal .resolver-player-btn:hover {
      filter: brightness(1.15);
      transform: translateY(-2px);
  }
}
```

`.resolver-player-btn.selected` の `box-shadow: 0 4px 12px rgba(49, 130, 206, 0.4);` は影の色味なのでそのまま残す。

- [ ] **Step 3: 色リテラルが残っていないことを確認する**

Run:
```bash
grep -nE '#[0-9a-fA-F]{3,8}' src/components/PendingActionPanel/PendingActionPanel.css src/components/PendingActionResolver/PendingActionResolver.css
```
Expected: 一致なし（終了コード1・出力なし）

- [ ] **Step 4: 既存テストが通ることを確認する**

Run: `npm test -- src/components/PendingActionPanel/PendingActionPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: 全体テストと lint**

Run: `npm run lint && npm test`
Expected: どちらもエラーなし

- [ ] **Step 6: コミット**

```bash
git add src/components/PendingActionPanel/PendingActionPanel.css src/components/PendingActionResolver/PendingActionResolver.css
git commit -m "$(cat <<'EOF'
refactor(ui): 保留アクションの色をトークンに集約する

PendingActionPanel と PendingActionResolver だけが slate 系ではない
Chakra 系グレー（#2d3748 / #1a202c / #a0aec0 / #4a5568 / #3182ce /
#38a169）で書かれていた。トークン色と「近いが一致しない」ため、他の
画面と並べると濁って見える。

見た目の改善ではなくトークン経由にすることだけを行う。--text-secondary
などが明るい面の上でAAに届かない件は、トークンの値そのものの問題として
別途扱う。先にトークンへ寄せておくことで、その修正がこの画面にも自動的に
効くようにする。

--border-light より明るい／--warning より暗い面色のトークンが無いため、
hover の明暗差だけは filter: brightness() で表現した。トークンの値が
変わっても関係が保たれる。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: iOS スプラッシュと `launch_handler`

iOS は manifest の `background_color`（`#0f172a`）を読まないため、ホーム画面から起動すると白画面を挟む。消すには `apple-touch-startup-image` を端末解像度ごとに用意する以外の方法がない。あわせて manifest に `launch_handler` を足し、試合中にアイコン長押しのショートカットを押しても新しいインスタンスが開かないようにする。

**Files:**
- Create: `scripts/generate-splash-screens.mjs`
- Create: `public/splash/*.png`（生成物・git にコミットする）
- Modify: `index.html`（`<link rel="apple-touch-startup-image">` の追加）
- Modify: `vite.config.ts:57`（`launch_handler` の追加）, `vite.config.ts:134`（`globIgnores` に `splash/**`）

**Interfaces:**
- Consumes: `public/icon-512.png`
- Produces: `scripts/generate-splash-screens.mjs` が `export const SPLASH_TARGETS` を持つ。各要素は `{ w, h, dpr }`（`w`/`h` は CSS ポイント、`dpr` はデバイスピクセル比）。`index.html` の `<link>` はこの配列と1対1で対応する

- [ ] **Step 1: 生成スクリプトを作る**

`scripts/generate-splash-screens.mjs` を新規作成する。`scripts/generate-maskable-icon.mjs` と同じ流儀（手動実行・生成物をコミット）。

```js
// iOS用の起動画像（スプラッシュ）を生成する。
//
// iOSは manifest の background_color を読まないため、ホーム画面から起動すると
// 起動時に白画面を挟む。暗い配色のアプリでは目立つ。
// これを消すには apple-touch-startup-image を端末解像度ごとに用意するしかない。
//
// 実行: node scripts/generate-splash-screens.mjs
// 生成物は public/splash/ に出力し、gitにコミットする（ビルド時には生成しない）。

import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const outDir = path.join(publicDir, 'splash');

// manifestのbackground_color / --bg-primary と一致させる
const BACKGROUND = { r: 15, g: 23, b: 42, alpha: 1 };
// 絵柄は短辺の40%に収める。どの縦横比でも見切れない上限。
const ARTWORK_RATIO = 0.4;

// 対象端末。w/hはCSSポイント、dprはデバイスピクセル比。
// index.html の <link media="..."> はこの配列と1対1で対応する。
export const SPLASH_TARGETS = [
    { w: 375, h: 667, dpr: 2 },   // iPhone SE(2nd/3rd) / 8 / 7 / 6s
    { w: 414, h: 736, dpr: 3 },   // iPhone 8 Plus
    { w: 375, h: 812, dpr: 3 },   // iPhone X / XS / 11 Pro / 12 mini / 13 mini
    { w: 414, h: 896, dpr: 2 },   // iPhone XR / 11
    { w: 414, h: 896, dpr: 3 },   // iPhone XS Max / 11 Pro Max
    { w: 390, h: 844, dpr: 3 },   // iPhone 12 / 12 Pro / 13 / 13 Pro / 14
    { w: 428, h: 926, dpr: 3 },   // iPhone 12 Pro Max / 13 Pro Max / 14 Plus
    { w: 393, h: 852, dpr: 3 },   // iPhone 14 Pro / 15 / 15 Pro / 16
    { w: 430, h: 932, dpr: 3 },   // iPhone 14 Pro Max / 15 Plus / 15 Pro Max
    { w: 768, h: 1024, dpr: 2 },  // iPad 9.7" / mini
    { w: 810, h: 1080, dpr: 2 },  // iPad 10.2"
    { w: 834, h: 1112, dpr: 2 },  // iPad Air 10.5"
    { w: 834, h: 1194, dpr: 2 },  // iPad Pro 11"
    { w: 1024, h: 1366, dpr: 2 }, // iPad Pro 12.9"
];

/** 1枚生成する。orientation は 'portrait' | 'landscape' */
async function generate(source, { w, h, dpr }, orientation) {
    const width = (orientation === 'portrait' ? w : h) * dpr;
    const height = (orientation === 'portrait' ? h : w) * dpr;
    const artworkSize = Math.round(Math.min(width, height) * ARTWORK_RATIO);

    const artwork = await sharp(source)
        .resize(artworkSize, artworkSize, { fit: 'contain', background: BACKGROUND })
        .toBuffer();

    const output = path.join(outDir, `splash-${width}x${height}.png`);
    await sharp({
        create: { width, height, channels: 4, background: BACKGROUND },
    })
        .composite([{ input: artwork, gravity: 'center' }])
        .png({ compressionLevel: 9, palette: true, colors: 256 })
        .toFile(output);

    return path.basename(output);
}

async function main() {
    const source = path.join(publicDir, 'icon-512.png');
    await fs.mkdir(outDir, { recursive: true });

    const made = [];
    for (const target of SPLASH_TARGETS) {
        made.push(await generate(source, target, 'portrait'));
        made.push(await generate(source, target, 'landscape'));
    }

    console.log(`✅ public/splash/ に ${made.length} 枚生成しました`);
    for (const name of made) console.log(`   ${name}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
```

- [ ] **Step 2: 生成して枚数を確認する**

Run: `node scripts/generate-splash-screens.mjs`
Expected: 「✅ public/splash/ に 28 枚生成しました」と、28行のファイル名

Run: `ls public/splash | wc -l`
Expected: `28`

- [ ] **Step 3: 生成物の合計サイズを確認する**

Run: `du -sh public/splash`
Expected: 数百KB程度。**5MB を超える場合は先に進まず報告する**（`globIgnores` で precache からは外すが、リポジトリに載るサイズとして過大なため）

- [ ] **Step 4: `index.html` に link を追加する**

`index.html` の `<title>` の直前に、28本の `<link>` を追加する。`media` は `SPLASH_TARGETS` の各要素と1対1で対応する。

```html
    <!--
      iOS用の起動画像。iOSは manifest の background_color を読まないため、
      これが無いとホーム画面からの起動時に白画面を挟む。
      画像は scripts/generate-splash-screens.mjs が生成する。
      media の値は同スクリプトの SPLASH_TARGETS と1対1で対応させること。
    -->
    <link rel="apple-touch-startup-image" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash/splash-750x1334.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" href="/splash/splash-1334x750.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/splash-1242x2208.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" href="/splash/splash-2208x1242.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/splash-1125x2436.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" href="/splash/splash-2436x1125.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash/splash-828x1792.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" href="/splash/splash-1792x828.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/splash-1242x2688.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" href="/splash/splash-2688x1242.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/splash-1170x2532.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" href="/splash/splash-2532x1170.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/splash-1284x2778.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" href="/splash/splash-2778x1284.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/splash-1179x2556.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" href="/splash/splash-2556x1179.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/splash-1290x2796.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" href="/splash/splash-2796x1290.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash/splash-1536x2048.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" href="/splash/splash-2048x1536.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash/splash-1620x2160.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" href="/splash/splash-2160x1620.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash/splash-1668x2224.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" href="/splash/splash-2224x1668.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash/splash-1668x2388.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" href="/splash/splash-2388x1668.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash/splash-2048x2732.png" />
    <link rel="apple-touch-startup-image" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" href="/splash/splash-2732x2048.png" />
```

- [ ] **Step 5: link と生成物の対応が取れていることを確認する**

Run:
```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const refs=[...html.matchAll(/href=\"\/splash\/([^\"]+)\"/g)].map(m=>m[1]);
const files=fs.readdirSync('public/splash');
const missing=refs.filter(r=>!files.includes(r));
const unused=files.filter(f=>!refs.includes(f));
console.log('link数',refs.length,'/ ファイル数',files.length);
console.log('参照先が無いlink:',missing);
console.log('参照されていないファイル:',unused);
"
```
Expected: `link数 28 / ファイル数 28`、どちらの配列も空

- [ ] **Step 6: `vite.config.ts` に `launch_handler` を追加する**

`start_url` の直後（57行目の下）に追加する。

変更前:
```ts
        orientation: 'any',
        start_url: '/MBCscore_pr/',
        icons: [
```

変更後:
```ts
        orientation: 'any',
        start_url: '/MBCscore_pr/',
        // アイコン長押しのショートカットを試合中に押しても、新しいインスタンスを
        // 開かず既存のウィンドウにフォーカスを戻す。記録中の画面から離れさせない
        launch_handler: {
          client_mode: 'focus-existing'
        },
        icons: [
```

- [ ] **Step 7: `globIgnores` に `splash/**` を追加する**

134行目を変更する。

変更前:
```ts
        globIgnores: ['FLYER.html', 'SNS_CARDS.html', 'vite.svg', 'screenshots/**'],
```

変更後:
```ts
        // 起動画像(splash/)もオフラインキャッシュから外す。iOSが起動時に読むもので、
        // アプリの動作には要らない（screenshots/と同じ理由）
        globIgnores: ['FLYER.html', 'SNS_CARDS.html', 'vite.svg', 'screenshots/**', 'splash/**'],
```

- [ ] **Step 8: ビルドして precache が増えていないことを確認する**

Run: `npm run build`
Expected: `precache 20 entries` のまま。KiB は Task 4・5 の CSS 変更でわずかに前後する（変更前は 7970.65 KiB）が、**エントリ数が 20 を超えていたら `globIgnores` が効いておらず起動画像がプリキャッシュに入っている**ので Step 7 を見直す。28枚が入れば数百KB〜MB単位で増えるため、KiB の桁が変わっていないことも併せて見る

- [ ] **Step 9: manifest と index.html の出力を確認する**

`.webmanifest` は `require` では読めないため `readFileSync` + `JSON.parse` を使う。

```bash
node -e "
const fs=require('fs');
const m=JSON.parse(fs.readFileSync('dist/manifest.webmanifest','utf8'));
console.log('launch_handler:',JSON.stringify(m.launch_handler));
" && grep -c 'apple-touch-startup-image' dist/index.html
```
Expected: `launch_handler: {"client_mode":"focus-existing"}` と `28`

Run: `grep -o 'href="[^"]*splash-750x1334[^"]*"' dist/index.html`
Expected: `href="/MBCscore_pr/splash/splash-750x1334.png"`（Vite が base を付けてリライトしていること）

- [ ] **Step 10: 全体テストと lint**

Run: `npm run lint && npm test`
Expected: どちらもエラーなし

- [ ] **Step 11: コミット**

```bash
git add scripts/generate-splash-screens.mjs public/splash index.html vite.config.ts
git commit -m "$(cat <<'EOF'
feat(pwa): iOSの起動白画面を消し、ショートカットの多重起動を防ぐ

iOSは manifest の background_color を読まないため、ホーム画面から起動
すると白画面を挟んでいた。暗い配色のアプリでは目立つ。消すには
apple-touch-startup-image を端末解像度ごとに用意するしかないので、
generate-maskable-icon.mjs と同じ流儀で生成スクリプトを足し、生成物を
コミットする。対象端末の定義はスクリプト内の SPLASH_TARGETS が唯一の
定義元で、index.html の link とは1対1で対応させる。

起動画像はiOSが起動時に読むものでアプリの動作には要らないため、
screenshots/ と同じ理由で globIgnores に入れてprecacheからは外す。

あわせて launch_handler: focus-existing を追加する。アイコン長押しの
ショートカット（新規試合/履歴/スタッツ）を試合中に押したときに、新しい
インスタンスが開いて記録中の画面から離れるのを防ぐ。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 全体の実機確認と最終検証

個々のタスクは通っていても、まとめて見たときに配色が揃っているかは別途確認する必要がある。

**Files:** なし（検証のみ）

**Interfaces:**
- Consumes: Task 1〜6 の全成果
- Produces: なし

- [ ] **Step 1: ビルドとテストを通す**

Run: `npm run lint && npm test && npm run build`
Expected: 3つともエラーなし。precache は `20 entries`（KiB は CSS 変更でわずかに前後してよい。変更前は 7970.65 KiB）

- [ ] **Step 2: dev サーバで記録画面の明色ブロックを数える**

dev サーバを起動し、マイチームと対戦チームを登録して試合を開始する。記録画面（フルモード）でコンソールに次を実行する。

```js
(() => {
  const light = [];
  document.querySelectorAll('*').forEach(el => {
    const s = getComputedStyle(el);
    if (!el.offsetParent && s.position !== 'fixed') return;
    const m = s.backgroundColor.match(/rgba?\((\d+), (\d+), (\d+)/);
    if (!m) return;
    const [r, g, b] = m.slice(1).map(Number);
    // 明度が高い＝ダークUIの中で浮く面
    if (0.2126 * r + 0.7152 * g + 0.0722 * b > 180) {
      light.push({ cls: String(el.className).slice(0, 40), bg: s.backgroundColor });
    }
  });
  return light;
})()
```

Expected: `.btn-timeout-chip`（意図的な白）のみ。**`.btn.btn-small`（交代）や `.quarter-badge-large`（Q1の淡緑）が出てきたら Task 1 / Task 2 が効いていない**

- [ ] **Step 3: Qバッジが背景から浮いていることを確認する**

同じ画面でコンソールに次を実行する。

```js
(() => {
  const b = document.querySelector('.quarter-badge-large');
  const cs = getComputedStyle(b);
  return { cls: b.className, bg: cs.backgroundColor, border: cs.borderTopColor, width: cs.borderTopWidth };
})()
```

Expected: `cls` に `q-odd`、`bg` が `"rgb(220, 38, 38)"`（`--quarter-1-3`）、`border` が `"rgb(148, 163, 184)"`（`--text-secondary`）、`width` が `"2px"`

Q2 でも同じ確認をする（「Q1終了」→「Q2へ」と進める）。`bg` が `"rgb(31, 41, 55)"`（`--quarter-2-4`）で、枠線が同じであること。

- [ ] **Step 4: 変更したCSSに色リテラルが残っていないことを確認する**

Run:
```bash
grep -nE '#[0-9a-fA-F]{3,8}' \
  src/components/TimeoutInputModal/TimeoutInputModal.css \
  src/components/PendingActionPanel/PendingActionPanel.css \
  src/components/PendingActionResolver/PendingActionResolver.css \
  src/components/Scoreboard/Scoreboard.css
```
Expected: `Scoreboard.css` に元からある無関係なリテラルのみ（Task 2 で消した緑5色 `#86efac` / `#4ade80` / `#16a34a` / `#14532d` / `#166534` が**出てこないこと**を確認する）。他の3ファイルは一致なし

- [ ] **Step 5: トークンの値が変わっていないことを確認する**

本計画は `:root` のトークンの**値**を変更しない。`color-scheme` の1行追加以外の差分が無いことを確認する。

Run: `git diff main -- src/index.css`
Expected: `color-scheme: dark;` とそのコメントの追加のみ。`--primary` などの値の行に差分が無いこと

- [ ] **Step 6: ブランチ全体の差分を確認する**

Run: `git diff main --stat`
Expected: 変更ファイルが次と一致すること（`public/splash/` の28ファイルを除く）

```
docs/superpowers/plans/2026-08-05-dark-consistency-and-pwa-polish.md
docs/superpowers/specs/2026-08-05-dark-consistency-and-pwa-polish-design.md
index.html
scripts/generate-splash-screens.mjs
src/components/GameInfoModal/GameInfoModal.css
src/components/PendingActionPanel/PendingActionPanel.css
src/components/PendingActionResolver/PendingActionResolver.css
src/components/Scoreboard/Scoreboard.css
src/components/Scoreboard/Scoreboard.test.tsx
src/components/Scoreboard/Scoreboard.tsx
src/components/TeamPanel/TeamPanel.test.tsx
src/components/TeamPanel/TeamPanel.tsx
src/components/TimeoutInputModal/TimeoutInputModal.css
src/index.css
vite.config.ts
```

---

## 後続作業（本計画のスコープ外）

カラートークンの**値そのもの**の再設計。次が未解決のまま残る。

| 文字色 | `--bg-tertiary` #334155 上 | `--border-light` #475569 上 |
|---|---|---|
| `--text-secondary` #94a3b8 | 4.04 | 2.96 |
| `--text-muted` #7d8da5 | 3.07 | 2.25 |
| `--primary-light` #3b82f6 | 2.82 | 2.06 |

加えて `.btn-success`（`--secondary` #059669・白文字 3.77）が主要CTAに使われている点、`.action-hint`（記録ボタン上の「↑成功 ↓ミス」が 1.51〜1.54）、`.player-pts`（2.82）、`.item-count`（2.25）、ウィザードの `.step-label`（2.05）。

Task 5 でトークン化を済ませてあるため、この再設計は `PendingActionPanel` 系にも自動的に波及する。

**ただし、トークンの値を直すだけでは届かない箇所が残る。後続のスコープには「残存リテラルの掃除」も明示的に含めること。** 代表例は `src/App.css` のベンチファウルボタンの `linear-gradient(135deg, #e74c3c 0%, #ec7063 100%)` で、**トークンを経由しない直書き**（白文字 3.82、`--danger` #dc2626 とは別の第2の赤）。トークンではないため値を直しても波及しない。同種の直書きが他に無いか、後続の冒頭で棚卸しすること。
