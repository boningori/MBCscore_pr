# 保存領域の残量をホームでも知らせる 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保存領域の使用率が8割を超えているあいだ、ホームに閉じられない帯を出し、設定画面を開かない人にも上限到達の前に届くようにする。

**Architecture:** 計測は既存の `src/utils/storageUsage.ts`（2026-08-06 から設定画面で使われている）をそのまま使う。表示する `StorageWarning` が自分で測って出し入れを決めるため、`Home` には props を足さない。

**Tech Stack:** React 19 / TypeScript 5.9 / Vitest + Testing Library（jsdom）

**設計書:** `docs/superpowers/specs/2026-09-12-storage-usage-warning-design.md`

## Global Constraints

- **`src/utils/storageUsage.ts` を変更しない。** 設定画面（`AppSettingsModal.tsx:39`）が使っており、`mirrorBackup.prefix.test.ts` がキー基準の一致を見張っている
- 使うのは `estimateStorageUsage()`（`{ usedBytes, limitBytes, ratio, nearlyFull }` を返す）と `formatBytes(bytes)` のみ。しきい値の判定は `usage.nearlyFull`（中身は `ratio > 0.8`）に任せ、比較を書き直さない
- 帯に**閉じるボタンを付けない。ボタンを一切付けない**
- 帯に「あと何試合」を書かない
- 文言は設定画面の警告文（「バックアップを保存し、試合履歴から古い試合を削除してください」）を引き継ぐ
- テストで `estimateStorageUsage` をモックしない。実際に localStorage を太らせて跨がせる
- コメントは日本語。**何をしたか**ではなく**なぜそうしたか**を書く
- 各タスクの最後に必ずコミットする。コミットメッセージは日本語、末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

| ファイル | 役割 |
|---|---|
| `src/components/Home/StorageWarning.tsx`（新規） | 帯。自分で測り、8割以下なら `null` を返す |
| `src/components/Home/StorageWarning.css`（新規） | 帯の見た目。`InstallPrompt.css` に揃える |
| `src/components/Home/Home.storageWarning.test.tsx`（新規） | ホームに帯が出る／出ないの検査 |
| `src/components/Home/Home.tsx`（変更） | 帯を `InstallPrompt` の直前に置く |
| `public/manual.html`（変更） | 16章に、使用容量の見方と帯の説明を足す |

---

### Task 1: ホームの帯

**Files:**
- Create: `src/components/Home/StorageWarning.tsx`
- Create: `src/components/Home/StorageWarning.css`
- Modify: `src/components/Home/Home.tsx`
- Test: `src/components/Home/Home.storageWarning.test.tsx`

**Interfaces:**
- Consumes: `estimateStorageUsage` / `formatBytes`（`src/utils/storageUsage.ts`、既存・無変更）
- Produces: `StorageWarning()`（props なし。8割以下なら `null` を返す）

- [ ] **Step 1: 失敗するテストを書く**

`src/components/Home/Home.storageWarning.test.tsx` を新規作成:

```tsx
// 保存領域が8割を超えたら、ホームにも帯を出す。
//
// 使用容量の可視化と8割超の警告は既にある（設定 → データ管理、eaafdd8）。
// ただしデータ管理の欄は折り畳みの中にあり、普段そこを開く用事は
// 「バックアップを取る」ときだけで、まさにその用事を思いつかない人に届かない。
// 開かないまま録り続けた人が最初に知るのは、試合が終わって保存を押した
// その瞬間になる。撤収しながら書き出して古い試合を選んで消すのは無理がある。
//
// 帯は閉じられない。放置すると記録が保存できなくなるので、8割を切るまで
// 出続ける。ボタンも付けない——「設定」も「試合履歴」もすぐ下のメニューに
// 並んでおり、重ねて出す理由がない。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { Home } from './Home';
import { LOCAL_STORAGE_LIMIT_BYTES, WARN_RATIO, estimateStorageUsage } from '../../utils/storageUsage';

const noop = vi.fn();

function renderHome() {
    render(
        <Home
            onStartGame={noop}
            onManageTeams={noop}
            onViewHistory={noop}
            onManageOpponents={noop}
            onViewPlayerStats={noop}
            onOpenSettings={noop}
            isFullScreen={false}
            onToggleFullScreen={noop}
            isFullScreenSupported={false}
        />,
    );
}

/**
 * アプリのキーの合計がちょうど target バイトになるまで埋める。
 *
 * estimateStorageUsage を差し替えないのは、測る対象が localStorage
 * そのものだから。そこを模すと何も確かめたことにならない
 * （既存の storageUsage.test.ts も同じやり方）。
 */
function fillTo(target: number) {
    const KEY = 'minibasket-filler';
    localStorage.removeItem(KEY);
    const need = target - estimateStorageUsage().usedBytes - KEY.length;
    if (need < 0) throw new Error(`既に ${target} バイトを超えている`);
    localStorage.setItem(KEY, 'x'.repeat(need));
}

/** 8割ちょうど。既存の判定は `>` なので、ここでは出ない */
const EXACTLY_80 = LOCAL_STORAGE_LIMIT_BYTES * WARN_RATIO;
/** formatBytes が「4.2MB」を返す量（4.2 × 1024 × 1024 = 4,404,019.2） */
const OVER_80 = 4_404_019;

const BAND = /保存領域の空きが少なくなっています/;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('保存領域の帯', () => {
    it('8割ちょうどでは出さない', () => {
        fillTo(EXACTLY_80);
        renderHome();
        expect(screen.queryByText(BAND)).toBeNull();
    });

    it('8割を超えたら、使用量が読める', () => {
        fillTo(OVER_80);
        renderHome();
        expect(screen.getByText(BAND)).toBeTruthy();
        expect(screen.getByText(/端末内の使用容量は 4\.2MB \/ 約5\.0MB です/)).toBeTruthy();
    });

    it('閉じるボタンが無い', () => {
        // 放置すると保存できなくなる。消したければ実際にデータを減らす
        fillTo(OVER_80);
        renderHome();
        const band = screen.getByText(BAND).closest('.storage-warning') as HTMLElement;
        expect(within(band).queryAllByRole('button')).toEqual([]);
    });

    it('帯が出ていても、いつもどおり試合を始められる', () => {
        fillTo(OVER_80);
        renderHome();
        expect(screen.getByRole('button', { name: /新規試合開始/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /試合履歴/ })).toBeTruthy();
    });
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/components/Home/Home.storageWarning.test.tsx`
Expected: FAIL。3件が `Unable to find an element with the text: /保存領域の空きが少なくなっています/` で落ちる。「8割ちょうどでは出さない」だけは通る（帯がまだ存在しないため）。

- [ ] **Step 3: 帯を作る**

`src/components/Home/StorageWarning.css` を新規作成:

```css
/* ホーム下部の案内カード。InstallPrompt と同じ作りだが、閉じられないので
   閉じるボタン用の余白は要らない。縁だけ警告色にし、中に操作は置かない
   （角丸の箱はボタン専用という方針の例外を作らないため） */
.storage-warning {
    margin-top: var(--spacing-md);
    padding: var(--spacing-md);
    background: var(--bg-tertiary);
    border: 1px solid var(--warning);
    border-radius: var(--radius-md);
    text-align: left;
}

.storage-warning-title {
    margin: 0 0 var(--spacing-xs) 0;
    color: var(--warning-light);
    font-size: var(--font-size-md);
    font-weight: 700;
}

.storage-warning-body {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.5;
}
```

`src/components/Home/StorageWarning.tsx` を新規作成:

```tsx
import { estimateStorageUsage, formatBytes } from '../../utils/storageUsage';
import './StorageWarning.css';

/**
 * 保存領域が埋まってきたことを、ホームでも知らせる帯。
 *
 * 使用容量の可視化と8割超の警告は設定 → データ管理に既にある。ただしあの欄は
 * 折り畳みの中で、普段そこを開く用事は「バックアップを取る」ときだけである。
 * まさにその用事を思いつかない人に届かない。開かないまま録り続けた人が
 * 最初に知るのは、試合が終わって保存を押したその瞬間になる。
 *
 * 閉じるボタンは付けない。InstallPrompt は閉じられるが、あれは無くても
 * 困らない案内である。こちらは放置すると記録が保存できなくなるので、
 * 8割を切るまで出続ける。消したければ実際にデータを減らせばよい。
 *
 * ボタンも付けない。「設定」も「試合履歴」もすぐ下のメニューに並んでおり、
 * 帯から重ねて出す理由がない。ここは情報表示であって操作ではない。
 *
 * 文言は設定画面の警告文を引き継ぐ。同じことを別の言葉で二度言うと、
 * 別のことのように読める。
 */
export function StorageWarning() {
    // 描画のたびに測る。Home が loadMyTeams / getGameSessionState について
    // 決めているのと同じ方針（ホームの再描画はまれ）。マウント時1回に絞ると、
    // 設定モーダルからバックアップを復元してもホームは再マウントされないため、
    // データが増えたのに帯が出ない食い違いができる
    const usage = estimateStorageUsage();
    if (!usage.nearlyFull) return null;

    return (
        <div className="storage-warning">
            <p className="storage-warning-title">⚠️ 保存領域の空きが少なくなっています</p>
            <p className="storage-warning-body">
                端末内の使用容量は {formatBytes(usage.usedBytes)} / 約{formatBytes(usage.limitBytes)} です。いっぱいになると、新しい試合を保存できなくなります。
                設定 →「データ管理」からバックアップを保存し、試合履歴から古い試合を削除してください。
            </p>
        </div>
    );
}
```

**注意:** JSX は要素をまたぐ改行を空白に畳む。`{formatBytes(usage.usedBytes)} / 約{formatBytes(usage.limitBytes)} です。` の途中で改行すると `4.2MB / 約 5.0MB` のように余分な空白が入り、テストの正規表現に一致しない。**この1文は改行を挟まず1行に書くこと。**

- [ ] **Step 4: Home に組み込む**

`src/components/Home/Home.tsx` の `InstallPrompt` の import の直後に1行足す:

```tsx
import { StorageWarning } from './StorageWarning';
```

`InstallPrompt` を出しているブロックの**直前**に置く（保存できなくなる話のほうが、ホーム画面への追加案内より先に読まれるべき）:

```tsx
                <StorageWarning />

                {install.mode !== 'none' && (
                    <InstallPrompt
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npx vitest run src/components/Home/ src/utils/storageUsage.test.ts`
Expected: PASS（新規4件と、既存の Home・storageUsage のテストすべて）

Run: `npx tsc -b`
Expected: 出力なし

- [ ] **Step 6: コミット**

```bash
git add src/components/Home/StorageWarning.tsx src/components/Home/StorageWarning.css src/components/Home/Home.storageWarning.test.tsx src/components/Home/Home.tsx
```

コミットメッセージ（件名 `feat(home): 保存領域の空きが少ないことをホームでも知らせる`。本文で「既に設定画面にあること」「それが折り畳みの奥で届かないこと」「なぜ閉じられないか」「なぜボタンを付けないか」を説明する）。

---

### Task 2: 説明書

**Files:**
- Modify: `public/manual.html`

**Interfaces:**
- Consumes: Task 1 の帯の文言
- Produces: なし

- [ ] **Step 1: 16章の末尾に足す**

`public/manual.html` の「16. データ管理（バックアップ・復元）」の最後にある warn-box（`これは手動バックアップの代わりにはなりません` で始まるもの）の**直後**、`<div class="page-break"></div>` の**直前**に、次を挿入する。

使用容量の表示は 2026-08-06 からありながら説明書に一度も書かれていないので、帯とあわせてここで起こす。

```html
<h3>保存領域の空きを確かめる</h3>
<p>
  このアプリは試合の記録を<strong>すべて端末の中</strong>に置いています。
  試合を録るたびに増えていくので、いつかは入りきらなくなります。
</p>
<p>
  いまどれくらい使っているかは、設定画面 →「データ管理」の<strong>「端末内の使用容量」</strong>で確かめられます。
  残りが少なくなると、同じ場所と<strong>ホーム画面</strong>の両方に
  <strong>「⚠️ 保存領域の空きが少なくなっています」</strong>という案内が出ます。
</p>
<p>
  この案内が出ても、試合はいつもどおり記録できます。すぐに何かが失われることはありません。
  ただし<strong>そのまま録り続けると、いずれ試合を保存できなくなります</strong>。
  落ち着いたときに、次の順で片付けてください。
</p>
<ol>
  <li>設定画面 →「データ管理」から<strong>バックアップを保存する</strong>（消す前に必ず）</li>
  <li>「試合履歴」を開き、<strong>もう端末に置いておく必要のない試合を削除する</strong></li>
</ol>
<div class="warn-box">
  <div class="box-title">ホーム画面の案内は閉じられません</div>
  消えるのは、実際にデータが減って余裕ができたときだけです。
  放置すると試合を保存できなくなるため、あえて閉じられないようにしています。
</div>
```

- [ ] **Step 2: 説明書の版数テストが通ることを確かめる**

Run: `npx vitest run src/utils/manualVersion.test.ts`
Expected: PASS

このタスクでは版数（`vX.Y 対応`）を**変えない**。版を上げるかどうかは他の未リリース分とあわせて後で判断する。

- [ ] **Step 3: 全体を確かめる**

Run: `npx vitest run`
Expected: PASS（全件）

Run: `npx tsc -b && npx vite build`
Expected: ビルド成功

- [ ] **Step 4: コミット**

```bash
git add public/manual.html
```

コミットメッセージ（件名 `docs(manual): 保存領域の空きの確かめ方と片付け方を書く`。本文で「使用容量の表示が v1.5 相当の頃からありながら未記載だったこと」「なぜバックアップが先か」「なぜ閉じられないと書くか」を説明する）。

---

## 実機確認（全タスク完了後）

`npm run build && npm run preview` で本番ビルドを立ち上げ、ブラウザで:

1. `minibasket-` 接頭辞のキーを 4.2MB 分置いてホームを開き、帯が出て使用量が読めること
2. 帯が出た状態でも新規試合・試合履歴へ進めること
3. 設定 → データ管理の使用容量バーと、同じ数字を指していること
4. 太らせた分を消してホームへ戻ると、帯が消えること
