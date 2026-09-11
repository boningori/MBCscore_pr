# 保存領域の残量を先に知らせる 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** localStorage の使用率が8割を超えているあいだ、ホームに閉じられない帯を出し、上限に達する前に利用者が手を打てるようにする。

**Architecture:** 計測は `src/utils/storageUsage.ts` の純関数に閉じる（localStorage の全キーを文字数で合計）。表示は `src/components/Home/StorageWarning.tsx` が自分で測って自分で出し入れを決めるため、`Home` には props を足さない。既存の保存失敗経路（上限に達したあとの手当て）には触れない。

**Tech Stack:** React 19 / TypeScript 5.9 / Vitest + Testing Library（jsdom）

**設計書:** `docs/superpowers/specs/2026-09-12-storage-usage-warning-design.md`

## Global Constraints

- `LOCAL_STORAGE_LIMIT_CHARS = 5 * 1024 * 1024`（= 5,242,880）。バイトではなく**文字数**で数える
- `STORAGE_WARN_RATIO = 0.8`。判定は `>=`（ちょうど8割で出す）
- 計測は `minibasket-` 以外のキーも含む（壁はオリジン単位に効くため）
- 帯に**閉じるボタンを付けない。ボタンを一切付けない**
- 帯に「あと何試合」を書かない
- 表示は MB 小数第1位・使用率は整数パーセント。MB 換算は 1MiB = 1024×1024 文字
- テストで `measureLocalStorageUsage` をモックしない。実際に localStorage を太らせて跨がせる
- コメントは日本語。**何をしたか**ではなく**なぜそうしたか**を書く（このリポジトリの既存コメントに倣う）
- 各タスクの最後に必ずコミットする。コミットメッセージは日本語、末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

| ファイル | 役割 |
|---|---|
| `src/utils/storageUsage.ts`（新規） | 計測の純関数と定数、MB 整形 |
| `src/utils/storageUsage.test.ts`（新規） | 上の単体テスト |
| `src/components/Home/StorageWarning.tsx`（新規） | 帯。自分で測り、8割未満なら `null` を返す |
| `src/components/Home/StorageWarning.css`（新規） | 帯の見た目。`InstallPrompt.css` に揃える |
| `src/components/Home/Home.storageWarning.test.tsx`（新規） | ホームに帯が出る／出ないの検査 |
| `src/components/Home/Home.tsx`（変更） | 帯を `InstallPrompt` の直前に置く |
| `public/manual.html`（変更） | 16章に帯の説明を足す |

---

### Task 1: 使用量の計測

**Files:**
- Create: `src/utils/storageUsage.ts`
- Test: `src/utils/storageUsage.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `LOCAL_STORAGE_LIMIT_CHARS: number`
  - `STORAGE_WARN_RATIO: number`
  - `interface StorageUsage { used: number; limit: number; ratio: number }`
  - `measureLocalStorageUsage(): StorageUsage`
  - `isStorageNearlyFull(): boolean`
  - `formatStorageMB(chars: number): string`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/storageUsage.test.ts` を新規作成:

```ts
// localStorage をどれだけ使っているかを数える。
//
// 上限に達したときの手当ては既にある（保存の成否を見て知らせ、セッションを
// 消さない）。足りないのは「達する前に知らせる」ほうで、そのための物差し。
//
// navigator.storage.estimate() は使えない。あれが返すのは IndexedDB・Cache を
// 含むオリジン全体の枠で、localStorage の 5MB はそれとは別に効く独立した壁
// である。estimate() が「まだ1%」と言っている横で localStorage は満杯になり得る。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    LOCAL_STORAGE_LIMIT_CHARS,
    STORAGE_WARN_RATIO,
    measureLocalStorageUsage,
    isStorageNearlyFull,
    formatStorageMB,
} from './storageUsage';

/** 合計がちょうど chars 文字になるように1件だけ置く（'k' が1文字） */
function fillTo(chars: number) {
    localStorage.setItem('k', 'x'.repeat(chars - 1));
}

/** 8割ちょうどの文字数。5,242,880 × 0.8 = 4,194,304 で割り切れる */
const EXACTLY_80 = LOCAL_STORAGE_LIMIT_CHARS * STORAGE_WARN_RATIO;

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('使用量を数える', () => {
    it('空なら 0', () => {
        expect(measureLocalStorageUsage()).toEqual({
            used: 0,
            limit: LOCAL_STORAGE_LIMIT_CHARS,
            ratio: 0,
        });
    });

    it('キー名も数える', () => {
        // 鍵も値と同じだけ領域を食う
        localStorage.setItem('ab', 'cd');
        expect(measureLocalStorageUsage().used).toBe(4);
    });

    it('このアプリ以外のキーも数える', () => {
        // 壁はオリジン単位に効く。minibasket- で絞ると実際より軽く見える
        localStorage.setItem('minibasket-x', '1');
        localStorage.setItem('other', '22');
        expect(measureLocalStorageUsage().used).toBe(20);
    });
});

describe('8割の境目', () => {
    it('8割の直下では知らせない', () => {
        fillTo(EXACTLY_80 - 1);
        expect(isStorageNearlyFull()).toBe(false);
    });

    it('ちょうど8割で知らせる', () => {
        fillTo(EXACTLY_80);
        expect(isStorageNearlyFull()).toBe(true);
    });

    it('上限を超えていても壊れない', () => {
        fillTo(LOCAL_STORAGE_LIMIT_CHARS + 1000);
        expect(measureLocalStorageUsage().ratio).toBeGreaterThan(1);
        expect(isStorageNearlyFull()).toBe(true);
    });
});

describe('測れないとき', () => {
    it('0 として扱い、知らせない', () => {
        // プライベートモードやストレージを禁じた設定で起きる。
        // ここで投げるとホームが描けなくなる
        localStorage.setItem('minibasket-x', 'y');
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError');
        });

        expect(measureLocalStorageUsage().used).toBe(0);
        expect(isStorageNearlyFull()).toBe(false);
    });
});

describe('MB 表示', () => {
    it('1MiB = 1024×1024 文字として小数第1位まで', () => {
        expect(formatStorageMB(LOCAL_STORAGE_LIMIT_CHARS)).toBe('5.0');
        expect(formatStorageMB(EXACTLY_80)).toBe('4.0');
        expect(formatStorageMB(0)).toBe('0.0');
    });
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/utils/storageUsage.test.ts`
Expected: FAIL。`Failed to resolve import "./storageUsage"` で全件が落ちる。

- [ ] **Step 3: 最小の実装**

`src/utils/storageUsage.ts` を新規作成:

```ts
// localStorage をどれだけ使っているかを数える。
//
// このアプリは全データを端末内に置き、試合履歴は録るたびに増える。実測は
// 52.9KB/試合で、5MB に達するのは約95〜99試合（dataBackup.ts のコメント）。
// 上限に達したときの手当ては既にあるが、利用者がそれを知るのは試合直後に
// 保存を押したその瞬間になる。撤収しながら書き出して古い試合を消すのは
// 無理があるので、達する前に知らせるための物差しを用意する。
//
// navigator.storage.estimate() は使えない。あれが返すのは IndexedDB・Cache を
// 含むオリジン全体の枠（実装によっては数百MB〜GB）で、localStorage の 5MB は
// それとは別に効く独立した壁である。

/**
 * localStorage の上限（文字数）。
 *
 * Chrome / Firefox / Safari はいずれもオリジンあたり約 5MiB を UTF-16 の
 * 文字数で数える。バイト換算より端末差が出にくいので、こちらで揃える。
 */
export const LOCAL_STORAGE_LIMIT_CHARS = 5 * 1024 * 1024;

/** 帯を出し始める使用率。残り約2割＝半シーズン分の余裕を残して知らせる */
export const STORAGE_WARN_RATIO = 0.8;

export interface StorageUsage {
    /** 使用中の文字数 */
    used: number;
    /** 上限の見積り（文字数） */
    limit: number;
    /** used / limit。上限を超えていれば 1 を超える */
    ratio: number;
}

/**
 * localStorage の使用量を測る。
 *
 * このアプリ以外のキーも数える。壁はオリジン単位に効くので、minibasket- で
 * 絞ると実際より軽く見え、知らせが手遅れになる。
 */
export function measureLocalStorageUsage(): StorageUsage {
    let used = 0;
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key === null) continue;
            used += key.length + (localStorage.getItem(key)?.length ?? 0);
        }
    } catch (error) {
        // 測れないこと自体は異常ではない（プライベートモードの一部、
        // ストレージを禁じた設定）。途中まで足した数を返すと実際より軽く
        // 見えるので 0 に倒し、知らせない側へ寄せる。ここで投げると
        // ホームが描けなくなる
        console.warn('Failed to measure localStorage usage:', error);
        used = 0;
    }
    return {
        used,
        limit: LOCAL_STORAGE_LIMIT_CHARS,
        ratio: used / LOCAL_STORAGE_LIMIT_CHARS,
    };
}

/** 帯を出すべきか */
export function isStorageNearlyFull(): boolean {
    return measureLocalStorageUsage().ratio >= STORAGE_WARN_RATIO;
}

/**
 * 文字数を MB の文字列へ（小数第1位）。
 *
 * 1MiB = 1024×1024 文字として扱う。LOCAL_STORAGE_LIMIT_CHARS と同じ尺度で
 * ないと「5.2MB / 5.0MB」のような、上限を超えていないのに超えて見える
 * 表示になる。
 */
export function formatStorageMB(chars: number): string {
    return (chars / (1024 * 1024)).toFixed(1);
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/utils/storageUsage.test.ts`
Expected: PASS（9件）

Run: `npx tsc -b`
Expected: 出力なし（成功）

- [ ] **Step 5: コミット**

```bash
git add src/utils/storageUsage.ts src/utils/storageUsage.test.ts
```

コミットメッセージ（`feat(storage): localStorage の使用量を測る` を件名に、本文で「なぜ estimate() を使わないか」「なぜ minibasket- 以外も数えるか」「測れないときに 0 へ倒す理由」を説明する）。

---

### Task 2: ホームの帯

**Files:**
- Create: `src/components/Home/StorageWarning.tsx`
- Create: `src/components/Home/StorageWarning.css`
- Modify: `src/components/Home/Home.tsx`
- Test: `src/components/Home/Home.storageWarning.test.tsx`

**Interfaces:**
- Consumes: Task 1 の `measureLocalStorageUsage` / `STORAGE_WARN_RATIO` / `formatStorageMB`
- Produces: `StorageWarning()`（props なし。8割未満なら `null` を返す）

- [ ] **Step 1: 失敗するテストを書く**

`src/components/Home/Home.storageWarning.test.tsx` を新規作成:

```tsx
// 保存領域が8割を超えたら、ホームに帯を出す。
//
// 上限に達したときは既に知らせている（試合終了時の保存が失敗し、
// 「端末の空き容量が足りない可能性があります」が出る）。ただしそれを知るのは
// 試合直後に保存を押したその瞬間で、体育館で撤収しながらバックアップを
// 書き出して古い試合を選んで消すのは無理がある。もっと前に伝える。
//
// 帯は閉じられない。放置すると記録が保存できなくなるので、8割を切るまで
// 出続ける。ボタンも付けない——「設定」も「試合履歴」もすぐ下のメニューに
// 並んでおり、重ねて出す理由がない。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { Home } from './Home';
import { LOCAL_STORAGE_LIMIT_CHARS, STORAGE_WARN_RATIO, measureLocalStorageUsage } from '../../utils/storageUsage';

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
 * localStorage の合計がちょうど target 文字になるまで埋める。
 *
 * measureLocalStorageUsage を差し替えないのは、測る対象が localStorage
 * そのものだから。そこを模すと何も確かめたことにならない。
 */
function fillTo(target: number) {
    const KEY = 'filler';
    localStorage.removeItem(KEY);
    const need = target - measureLocalStorageUsage().used - KEY.length;
    if (need < 0) throw new Error(`既に ${target} 文字を超えている`);
    localStorage.setItem(KEY, 'x'.repeat(need));
}

const EXACTLY_80 = LOCAL_STORAGE_LIMIT_CHARS * STORAGE_WARN_RATIO;
const BAND = /保存領域が少なくなっています/;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('保存領域の帯', () => {
    it('8割の直下では出さない', () => {
        fillTo(EXACTLY_80 - 1);
        renderHome();
        expect(screen.queryByText(BAND)).toBeNull();
    });

    it('8割に届いたら、使用量と使用率が読める', () => {
        fillTo(EXACTLY_80);
        renderHome();
        expect(screen.getByText(BAND)).toBeTruthy();
        expect(screen.getByText(/保存領域の約80%（4\.0MB \/ 5\.0MB）を使っています/)).toBeTruthy();
    });

    it('閉じるボタンが無い', () => {
        // 放置すると保存できなくなる。消したければ実際にデータを減らす
        fillTo(EXACTLY_80);
        renderHome();
        const band = screen.getByText(BAND).closest('.storage-warning') as HTMLElement;
        expect(within(band).queryAllByRole('button')).toEqual([]);
    });

    it('帯が出ていても、いつもどおり試合を始められる', () => {
        fillTo(EXACTLY_80);
        renderHome();
        expect(screen.getByRole('button', { name: /新規試合開始/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /試合履歴/ })).toBeTruthy();
    });
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/components/Home/Home.storageWarning.test.tsx`
Expected: FAIL。「8割に届いたら…」など3件が `Unable to find an element with the text: /保存領域が少なくなっています/` で落ちる。「8割の直下では出さない」だけは通る。

- [ ] **Step 3: 帯を作る**

`src/components/Home/StorageWarning.css` を新規作成:

```css
/* ホーム下部の案内カード。InstallPrompt と同じ作りだが、閉じられないので
   閉じるボタン用の余白は要らない。縁だけ警告色にして、押せる面ではないことを
   保つ（角丸の箱はボタン専用という方針の例外にならないよう、中に操作を置かない） */
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
import { measureLocalStorageUsage, STORAGE_WARN_RATIO, formatStorageMB } from '../../utils/storageUsage';
import './StorageWarning.css';

/**
 * 保存領域が埋まってきたことを、上限に達する前に知らせる帯。
 *
 * 上限に達したときの手当ては既にある（試合終了時の保存が成否を見て分岐し、
 * 失敗すればセッションを消さずに知らせる）。ただしそれを知るのは試合直後に
 * 保存を押したその瞬間で、撤収しながらバックアップを書き出して古い試合を
 * 選んで消すのは無理がある。
 *
 * 閉じるボタンは付けない。InstallPrompt は閉じられるが、あれは無くても
 * 困らない案内である。こちらは放置すると記録が保存できなくなるので、
 * 8割を切るまで出続ける。消したければ実際にデータを減らせばよい。
 *
 * ボタンも付けない。「設定」も「試合履歴」もすぐ下のメニューに並んでおり、
 * 帯から重ねて出す理由がない。ここは情報表示であって操作ではない。
 *
 * 「あと何試合」は書かない。判断基準を使用率にした以上、そこだけ
 * 52.9KB/試合 という推定を混ぜると、人数の少ないチームや記録の薄い試合で
 * 平気で倍ずれる。外れる数字を書くくらいなら書かない。
 */
export function StorageWarning() {
    // 描画のたびに測る。Home が loadMyTeams / getGameSessionState について
    // 決めているのと同じ方針（ホームの再描画はまれ）。マウント時1回に絞ると、
    // 設定モーダルからバックアップを復元してもホームは再マウントされないため、
    // データが増えたのに帯が出ない食い違いができる
    const usage = measureLocalStorageUsage();
    if (usage.ratio < STORAGE_WARN_RATIO) return null;

    return (
        <div className="storage-warning">
            <p className="storage-warning-title">⚠️ 保存領域が少なくなっています</p>
            <p className="storage-warning-body">
                保存領域の約{Math.round(usage.ratio * 100)}%
                （{formatStorageMB(usage.used)}MB / {formatStorageMB(usage.limit)}MB）を使っています。
                いっぱいになると、新しい試合を保存できなくなります。
                バックアップを書き出したうえで、不要な試合を試合履歴から削除してください。
            </p>
        </div>
    );
}
```

**注意:** JSX は要素をまたぐ改行を空白に畳むため、上のように `%` と `（` のあいだで改行すると `約80% （4.0MB…` と空白が入り、テストの正規表現に一致しない。**`約{...}%（{...}MB / {...}MB）を使っています。` は改行を挟まず1行に書くこと。**

- [ ] **Step 4: Home に組み込む**

`src/components/Home/Home.tsx` の import に1行足す（`InstallPrompt` の import の直後）:

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

Run: `npx vitest run src/components/Home/`
Expected: PASS（`Home.storageWarning.test.tsx` の4件を含め、既存の Home のテストも全部）

Run: `npx tsc -b`
Expected: 出力なし

- [ ] **Step 6: コミット**

```bash
git add src/components/Home/StorageWarning.tsx src/components/Home/StorageWarning.css src/components/Home/Home.storageWarning.test.tsx src/components/Home/Home.tsx
```

コミットメッセージ（`feat(home): 保存領域が8割を超えたら先に知らせる` を件名に、本文で「なぜ試合直後では遅いか」「なぜ閉じられないか」「なぜボタンを付けないか」「なぜ『あと何試合』を書かないか」を説明する）。

---

### Task 3: 説明書

**Files:**
- Modify: `public/manual.html`

**Interfaces:**
- Consumes: Task 2 の帯の文言
- Produces: なし

- [ ] **Step 1: 16章の末尾に足す**

`public/manual.html` の「16. データ管理（バックアップ・復元）」の最後にある warn-box（`これは手動バックアップの代わりにはなりません` で始まるもの、1716〜1721行あたり）の**直後**、`<div class="page-break"></div>` の**直前**に、次を挿入する:

```html
<h3>「保存領域が少なくなっています」と出たら</h3>
<p>
  このアプリは試合の記録を<strong>すべて端末の中</strong>に置いています。
  試合を録るたびに増えていくので、いつかは入りきらなくなります。
  残りが少なくなると、ホーム画面に<strong>「⚠️ 保存領域が少なくなっています」</strong>という案内が出ます。
</p>
<p>
  この案内が出ても、試合はいつもどおり記録できます。すぐに何かが失われることはありません。
  ただし<strong>そのまま録り続けると、いずれ試合を保存できなくなります</strong>。
  落ち着いたときに、次の順で片付けてください。
</p>
<ol>
  <li>設定画面 →「データ管理」から<strong>バックアップを書き出す</strong>（消す前に必ず）</li>
  <li>「試合履歴」を開き、<strong>もう端末に置いておく必要のない試合を削除する</strong></li>
</ol>
<div class="warn-box">
  <div class="box-title">この案内は閉じられません</div>
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

コミットメッセージ（`docs(manual): 保存領域の案内が出たときの片付け方を書く` を件名に、本文で「なぜバックアップが先か」「なぜ閉じられないと書くか」を説明する）。

---

## 実機確認（全タスク完了後、コントローラーが行う）

`npm run build && npm run preview` で本番ビルドを立ち上げ、ブラウザで:

1. localStorage を 4.2MB 分太らせてホームを開き、帯が出て使用量が読めること
2. 帯が出た状態でも新規試合・試合履歴へ進めること
3. 太らせた分を消してホームへ戻ると、帯が消えること
