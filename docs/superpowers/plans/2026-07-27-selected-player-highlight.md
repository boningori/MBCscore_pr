# アクション記録画面の選手選択表示を強調 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** アクション記録画面で選択中の選手が一目で分かるよう、緑の細枠だけだった表現をピンクの枠＋背景＋外側リング＋左端の太いバー＋✓バッジに強化する。

**Architecture:** 変更は `src/App.css` のスタイルと `src/components/TeamPanel/TeamPanel.tsx` の✓バッジ追加のみ。状態管理・データモデルには一切触れない。選択状態は既存の `selectedPlayerId === player.id` 判定をそのまま使う。枠を太くするとレイアウトが動くため、枠は 2px のまま外側 `box-shadow` リングで太さを出し、左バーは非選択時も透明で幅を確保する。

**Tech Stack:** React 19 + TypeScript + Vite / Vitest + @testing-library/react / 素の CSS（CSS変数ベース、ダークテーマ固定）

**設計ドキュメント:** `docs/superpowers/specs/2026-07-27-selected-player-highlight-design.md`

## Global Constraints

- 既存の CSS 変数を使う。新しい色リテラルを `:root` に増やさない（`--active-highlight` #ec4899 / `--active-highlight-light` #f472b6 / `--active-highlight-bg` rgba(236,72,153,0.2) が既にある）
- 選択・非選択の切り替えでレイアウトシフトを起こさない。カードの `width` / `height` / 内容の位置が動いてはいけない
- 本アプリはダークテーマ固定（`--bg-primary` #0f172a）。文字色は暗背景で 4.5:1 を満たすこと
- コメントは日本語。既存コードのコメント密度に合わせる
- コミットメッセージは Conventional Commits の型 + 日本語本文（例: `feat(ui): ...`）。既存履歴に合わせる
- 変更対象は `mini-player-card`（アクション記録画面）のみ。`QuarterLineup` / `PlayerCard` / `SubstitutionModal` の選択表示には触れない
- 各タスクの最後に `npm run test` と `npm run lint` が通ること

---

### Task 1: 選択中カードの✓バッジ

**Files:**
- Modify: `src/components/TeamPanel/TeamPanel.tsx:88-108`
- Test: `src/components/TeamPanel/TeamPanel.test.tsx`（末尾に describe を追加）

**Interfaces:**
- Consumes: 既存の `TeamPanel` props（`players: Player[]`, `selectedPlayerId: string | null`）。変更なし
- Produces: 選択中の選手カード内に `<span class="player-check" aria-hidden="true">✓</span>` が1つ存在する。Task 2 の CSS がこのクラス名を参照する

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TeamPanel/TeamPanel.test.tsx` の末尾（既存 describe の閉じ括弧の後）に追記する。ファイル冒頭の `import { createPlayer } from '../../types/game';` と `renderPanel` ヘルパーは既存のものをそのまま使う。

```tsx
describe('TeamPanel: 選択中の選手の強調表示', () => {
    const onCourtPlayers = [
        { ...createPlayer('a1', 4, '選手4'), isOnCourt: true },
        { ...createPlayer('a2', 7, '選手7'), isOnCourt: true },
    ];

    it('選択中のカードにselectedクラスと✓が付く', () => {
        renderPanel({ players: onCourtPlayers, selectedPlayerId: 'a1' });
        const selected = screen.getByRole('button', { name: /選手4/ });
        expect(selected.className).toContain('selected');
        expect(selected.getAttribute('aria-pressed')).toBe('true');
        expect(selected.querySelector('.player-check')).toBeTruthy();
    });

    it('非選択のカードには✓が付かない', () => {
        renderPanel({ players: onCourtPlayers, selectedPlayerId: 'a1' });
        const other = screen.getByRole('button', { name: /選手7/ });
        expect(other.className).not.toContain('selected');
        expect(other.getAttribute('aria-pressed')).toBe('false');
        expect(other.querySelector('.player-check')).toBeNull();
    });

    it('✓はaria-hiddenで読み上げを二重化しない', () => {
        renderPanel({ players: onCourtPlayers, selectedPlayerId: 'a1' });
        const check = screen
            .getByRole('button', { name: /選手4/ })
            .querySelector('.player-check');
        expect(check?.getAttribute('aria-hidden')).toBe('true');
    });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run src/components/TeamPanel/TeamPanel.test.tsx
```

Expected: FAIL。「選択中のカードにselectedクラスと✓が付く」と「✓はaria-hiddenで…」の2件が落ちる（`.player-check` が存在せず `null` が返る）。「非選択のカードには✓が付かない」は先に通っていてよい。

- [ ] **Step 3: ✓バッジを実装**

`src/components/TeamPanel/TeamPanel.tsx` のファウル表示ブロックの直後、`</button>` の直前に追加する。

変更前:

```tsx
              {player.fouls.length > 0 && (
                <span className={`player-fouls ${player.fouls.length >= 4 ? 'warning' : ''}`}>
                  F{player.fouls.length}
                </span>
              )}
            </button>
```

変更後:

```tsx
              {player.fouls.length > 0 && (
                <span className={`player-fouls ${player.fouls.length >= 4 ? 'warning' : ''}`}>
                  F{player.fouls.length}
                </span>
              )}
              {/* 選択中の目印。aria-pressedで状態は伝わるので読み上げからは外す */}
              {selectedPlayerId === player.id && (
                <span className="player-check" aria-hidden="true">✓</span>
              )}
            </button>
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/components/TeamPanel/TeamPanel.test.tsx
```

Expected: PASS（3件とも通る）

- [ ] **Step 5: 全テストとlintを流す**

```bash
npm run test && npm run lint
```

Expected: 全テストPASS、lintエラーなし

- [ ] **Step 6: コミット**

```bash
git add src/components/TeamPanel/TeamPanel.tsx src/components/TeamPanel/TeamPanel.test.tsx
git commit -m "feat(ui): 選択中の選手カードに✓バッジを追加"
```

---

### Task 2: 選択中カードをピンクで強調（CSS）

**Files:**
- Modify: `src/App.css:491-508`（`.mini-player-card` 基底に左バーの幅を確保）
- Modify: `src/App.css:520-523`（`.mini-player-card.selected` をピンクに）
- Modify: `src/App.css:542-545` の直後（`.player-check` の見た目を追加）

**Interfaces:**
- Consumes: Task 1 が出力する `.player-check` 要素
- Produces: `.mini-player-card.selected` がピンク枠・ピンク背景・外側リング・左バーを持つ。Task 3 がこの `box-shadow` を前提に競合を回避する

- [ ] **Step 1: 左バーの幅を常時確保する**

`src/App.css` の `.app-container .mini-player-card` 内、`border: 2px solid transparent;` の直後に1行足す。非選択時も透明な左枠で幅を取ることで、選択時に内容が横にずれるのを防ぐ。

変更前:

```css
  border-radius: var(--radius-md);
  border: 2px solid transparent;
  cursor: pointer;
```

変更後:

```css
  border-radius: var(--radius-md);
  border: 2px solid transparent;
  /* 選択時の左バー分を非選択時も確保し、レイアウトのずれを防ぐ */
  border-left-width: 10px;
  cursor: pointer;
```

- [ ] **Step 2: 選択時のスタイルをピンクに差し替える**

変更前（`src/App.css:520-523`）:

```css
.app-container .mini-player-card.selected {
  border-color: var(--secondary);
  background: rgba(5, 150, 105, 0.2);
}
```

変更後:

```css
/* 選択中は色・面積・形の3方向で示す（枠＋背景＋外側リング＋左バー＋✓） */
.app-container .mini-player-card.selected {
  border-color: var(--active-highlight);
  background: var(--active-highlight-bg);
  box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.45);
}
```

- [ ] **Step 3: ✓バッジの見た目を追加**

`.app-container .mini-player-card .player-fouls.warning { ... }` のルール（`src/App.css:542-545`）の直後に追加する。

```css
.app-container .mini-player-card .player-check {
  /* ファウル表示の有無にかかわらず右端に揃える */
  margin-left: auto;
  color: var(--active-highlight-light);
  font-size: var(--font-size-lg);
  font-weight: 700;
  line-height: 1;
}
```

- [ ] **Step 4: 開発サーバーで見た目を確認**

`.claude/launch.json` の `dev` 設定でプレビューを起動する（`npm run dev` を Bash で直接実行しない）。

起動後、記録画面まで進める: ホーム画面 → 試合を新規作成 → スタメンを両チーム5名ずつ選択 → 「試合開始」。保存済みの試合の復元プロンプトが出る場合はそれを使ってもよい。

記録画面で選手カードを1枚タップし、次を目視確認する:

1. タップしたカードがピンクの枠・背景・外側リング・左端の太いバー・右端の✓になる
2. タップ前後でカード内の背番号・得点・ファウルの位置が動かない
3. 別の選手をタップすると、ピンクが正しく移る

スクリーンショットを撮ってユーザーに共有する。

- [ ] **Step 5: テストとlintを流す**

```bash
npm run test && npm run lint
```

Expected: 全テストPASS、lintエラーなし

- [ ] **Step 6: コミット**

```bash
git add src/App.css
git commit -m "feat(ui): 記録画面の選手選択をピンクの枠・リング・左バーで強調"
```

---

### Task 3: 二重強調の解消とパルスとの競合回避

**Files:**
- Modify: `src/App.css:393-396`（`.team-panel.active` の外側シャドウを削除）
- Modify: `src/App.css:813-816`（`action-pending` のパルスを非選択カードに限定）
- Modify: `src/App.css:830-835`（`prefers-reduced-motion` 側にも同じ限定を適用）

**Interfaces:**
- Consumes: Task 2 が設定した `.mini-player-card.selected` の `box-shadow`
- Produces: 選択中カードの外側リングが、パルスアニメーションにもチームパネルのシャドウにも打ち消されない状態

- [ ] **Step 1: チームパネルの外側ピンクシャドウを削除**

選手カード自体がピンクで目立つようになったため、パネル外周のピンクシャドウは冗長。枠色だけ残す。

変更前（`src/App.css:393-396`）:

```css
.app-container .team-panel.active {
  border-color: var(--active-highlight);
  box-shadow: 0 0 0 2px rgba(236, 72, 153, 0.4);
}
```

変更後:

```css
/* 選手カード側がピンクで強調されるため、パネル外周のシャドウは重ねない */
.app-container .team-panel.active {
  border-color: var(--active-highlight);
}
```

- [ ] **Step 2: パルスを非選択カードに限定**

`player-target-pulse` は `box-shadow` を動かすため、選択中カードの外側リングを上書きしてしまう。セレクタを絞る。

変更前（`src/App.css:813-816`）:

```css
.app-container .game-main-area.action-pending .mini-player-card {
  border-color: var(--secondary-light);
  animation: player-target-pulse 1.5s ease-in-out infinite;
}
```

変更後:

```css
/* 選択中カードはピンクのリングを持つため、パルスの対象から外す */
.app-container .game-main-area.action-pending .mini-player-card:not(.selected) {
  border-color: var(--secondary-light);
  animation: player-target-pulse 1.5s ease-in-out infinite;
}
```

- [ ] **Step 3: reduced-motion 側にも同じ限定を適用**

変更前（`src/App.css:830-835`）:

```css
@media (prefers-reduced-motion: reduce) {
  .app-container .game-main-area.action-pending .mini-player-card {
    animation: none;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.45);
  }
}
```

変更後:

```css
@media (prefers-reduced-motion: reduce) {
  .app-container .game-main-area.action-pending .mini-player-card:not(.selected) {
    animation: none;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.45);
  }
}
```

- [ ] **Step 4: 開発サーバーで確認**

プレビューを再読み込みし、記録画面で次を確認する:

1. 選手を選んだとき、そのチームのパネル外周に二重のピンクが出ていない（枠のみ）
2. 選手を選ばずにアクションボタン（例: 2P）を押すと、全選手カードが緑にパルスする（従来どおり）
3. 選手を選んだ状態はピンクのまま保たれ、緑のパルスに乗っ取られない

スクリーンショットを撮ってユーザーに共有する。

- [ ] **Step 5: テストとlintを流す**

```bash
npm run test && npm run lint
```

Expected: 全テストPASS、lintエラーなし

- [ ] **Step 6: コミット**

```bash
git add src/App.css
git commit -m "fix(ui): 選択中カードの強調がパネル影とパルスに打ち消されないようにする"
```

---

### Task 4: シンプルモードの調整と仕上げ確認

**Files:**
- Modify: `src/App.css:979-992`（シンプルモードのカードで左バーを細くする）

**Interfaces:**
- Consumes: Task 2 の `border-left-width: 10px`
- Produces: なし（最終タスク）

- [ ] **Step 1: シンプルモードの左バーを 6px に落とす**

シンプルモードのカードは `width: calc(33.33% - 4px)` の3列固定・`box-sizing: border-box` のため、左バー 10px が内容領域を圧迫する。セレクタの詳細度が基底ルールより高いので `!important` は不要。

`.app-container .game-main-area.simple-mode .mini-player-card { ... }` の `box-sizing: border-box;` の直後に追加する。

```css
  box-sizing: border-box;
  /* 3列固定で幅が狭いため、左バーは細めにする */
  border-left-width: 6px;
```

- [ ] **Step 2: シンプルモードで確認**

プレビューでシンプルモードの試合を開き（試合設定でモードを「シンプル」にして開始）、記録画面で次を確認する:

1. 3列のカードが折り返さず、1行に3枚並ぶ
2. 背番号・得点が省略されたり潰れたりしていない
3. 選手をタップするとピンクの強調が正しく出る

スクリーンショットを撮ってユーザーに共有する。

- [ ] **Step 3: フルモードで最終確認**

通常（フル）モードの記録画面に戻り、Task 2 Step 4 の確認項目3点が引き続き満たされていることを確認する。

- [ ] **Step 4: テスト・lint・ビルドを流す**

```bash
npm run test && npm run lint && npm run build
```

Expected: 全テストPASS、lintエラーなし、ビルド成功

- [ ] **Step 5: コミット**

```bash
git add src/App.css
git commit -m "fix(ui): シンプルモードのカード幅に合わせて選択バーを細くする"
```

---

## 完了条件

- `npm run test` / `npm run lint` / `npm run build` がすべて通る
- 記録画面（フルモード・シンプルモード両方）で、選択中の選手がピンクの枠・背景・外側リング・左バー・✓で示される
- 選択・非選択の切り替えでカード内の要素が動かない
- アクション先行フロー（アクション→選手）の緑パルスが従来どおり動く
