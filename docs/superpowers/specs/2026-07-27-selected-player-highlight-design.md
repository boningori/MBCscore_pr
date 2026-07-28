# アクション記録画面の選手選択表示を強調 — 設計

- 日付: 2026-07-27
- ステータス: 設計承認済み（実装計画待ち）

## 背景・目的

アクション記録画面（`TeamPanel` の `mini-player-card`）で選手を選んだとき、現状の表現は次の2つだけである。

```css
.app-container .mini-player-card.selected {
  border-color: var(--secondary);      /* 緑 #059669 */
  background: rgba(5, 150, 105, 0.2);
}
```

暗い背景（`--bg-tertiary` #334155）の上に載る緑の細枠は視認性が低く、試合中に手元から目を離すと「今どの選手を選んでいたか」が分かりにくい。加えて緑は「コート上」表示（`.player-card.on-court`）やスタメン画面の出場済みドットにも使われており、意味が重複している。

一方ピンク（`--active-highlight` #ec4899）はアプリ内で既に「アクティブ／選択中」を表す色として `.team-panel.active` に使われている。選択状態をピンクに寄せることで、色の意味を整理しつつ視認性を上げる。

## スコープ

### やること

- `mini-player-card.selected` の表現を、ピンクの枠＋背景＋外側リング＋左端の太いバー＋✓バッジに変更
- 二重強調になる `.team-panel.active` の外側シャドウを削除
- アクション先行フローのパルスアニメーションと選択リングの競合を回避
- シンプルモードのカード幅に左バーが与える影響を実機確認して調整
- DOM レベルのテストを追加

### やらないこと（YAGNI・今回のスコープ外）

- ステータスバーへの選択中選手名の表示（別途検討。選択→アクションと、アクション→選手の非対称は残る）
- スタメン選択画面（`QuarterLineup` / `lineup-player-card`）の選択表示。こちらは既に緑枠＋緑背景＋✓バッジがあり、本件の対象外
- `PlayerCard`（`.player-card.selected`、青系）の選択表示
- カラーパレット変数そのものの再定義

## 設計判断（ユーザー合意事項）

| 論点 | 決定 |
|---|---|
| 選択色 | 緑（`--secondary`）→ ピンク（`--active-highlight`）に変更 |
| 強調の強さ | 色だけでなく面積・形でも示す（枠・リング・左バー・✓） |
| ベタ塗り反転 | 採用しない。ピンク地の上で得点の青・ファウルの赤/橙が沈むため |
| チームパネルのピンク枠 | シャドウは外し、枠色のみ残す |

## 変更内容

### 1. 選手カードの選択表示（`src/App.css`）

枠を 2px から太くすると幅が変わりレイアウトが動くため、**枠は 2px のまま外側リングで太さを出す**。左バーは非選択時も透明で幅を確保し、選択時に色が付くだけにする。

```css
.app-container .mini-player-card {
  /* 既存: border: 2px solid transparent; */
  border-left-width: 10px;              /* 常時確保してレイアウトずれを防ぐ */
}

.app-container .mini-player-card.selected {
  border-color: var(--active-highlight);
  background: var(--active-highlight-bg);          /* 既存変数 rgba(236,72,153,0.2) */
  box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.45);
}
```

左バーが常時 10px 入るぶん、全カードで内容が右にずれる。これは選択・非選択で変わらないため、選択時のレイアウトシフトは発生しない。

### 2. ✓バッジ（`src/components/TeamPanel/TeamPanel.tsx`）

選択時のみカード末尾に追加する。

```tsx
{selectedPlayerId === player.id && (
  <span className="player-check" aria-hidden="true">✓</span>
)}
```

`aria-pressed` が既にあるため、✓ は `aria-hidden` にして読み上げの二重化を避ける。

```css
.app-container .mini-player-card .player-check {
  margin-left: auto;
  color: var(--active-highlight-light);
  font-weight: 700;
}
```

`margin-left: auto` を付けることで、ファウル表示がある選手（`.player-fouls` 側の auto が先に余白を吸う）でも、無い選手でも右端に揃う。

### 3. チームパネルの二重強調を解消（`src/App.css:393`）

```css
.app-container .team-panel.active {
  border-color: var(--active-highlight);
  /* box-shadow は削除 */
}
```

選手カード自体がピンクで目立つため、パネル外周のピンクシャドウは冗長になる。

### 4. パルスとの競合を防ぐ（`src/App.css:813`）

`.game-main-area.action-pending .mini-player-card` は `box-shadow` でパルスさせるため、選択リングの `box-shadow` を上書きし得る。セレクタを選択中カード以外に絞る。

```css
.app-container .game-main-area.action-pending .mini-player-card:not(.selected) { ... }
```

`prefers-reduced-motion` 側の上書き（`App.css:831`）にも同じ `:not(.selected)` を付ける。新規アニメーションは追加しないため、reduced-motion への追加対応は不要。

### 5. シンプルモードの確認（`src/App.css:979`）

シンプルモードのカードは `width: calc(33.33% - 4px)` の3列固定・`box-sizing: border-box` のため、左バー 10px が内容領域を圧迫する。シンプルモード限定で左バーを 6px に落とし、実機（またはブラウザプレビュー）で背番号・得点・ファウルが折り返さないことを確認する。

## テスト

見た目そのものは単体テストで担保できないため、`src/components/TeamPanel/TeamPanel.test.tsx` に DOM レベルの検証を追加する。

- 選択中の選手カードに `selected` クラスが付く
- 選択中の選手カードに ✓ が表示され、非選択のカードには表示されない
- ✓ は `aria-hidden` で、`aria-pressed` が選択状態を正しく表す

CSS の見た目は、ブラウザプレビューで通常モード・シンプルモードの両方をスクリーンショット確認する。

## 影響範囲

| ファイル | 変更 |
|---|---|
| `src/App.css` | `.mini-player-card` / `.selected` / `.team-panel.active` / `action-pending` パルス / シンプルモード |
| `src/components/TeamPanel/TeamPanel.tsx` | ✓バッジの追加 |
| `src/components/TeamPanel/TeamPanel.test.tsx` | テスト追加 |

`QuarterLineup`・`PlayerCard`・`SubstitutionModal` の選択表示には触れないため、緑の選択表示はそれらに残る。アクション記録画面とスタメン画面で選択色が異なることになるが、記録画面のピンクは「今まさに操作対象」を、スタメン画面の緑は「この Q に出す」を意味するため、役割が違うものとして許容する。
