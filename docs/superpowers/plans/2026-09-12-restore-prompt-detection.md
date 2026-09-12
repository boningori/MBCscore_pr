# データ消失の検知を作り直す 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 復元プロンプトの判定を「アプリのキーがあるか」から「失ったら困るデータがあるか」へ変え、アプリが自分で書き戻すキー（セッション・心拍・エラーログ）に惑わされないようにする。

**Architecture:** `hasAppData()` を `hasRestorableUserData()` へ置き換える。守るべきキーを列挙し、中身が空のものは数えない。`collectAppData()`（控えの収集）は変えない。

**Tech Stack:** TypeScript 5.9 / React 19 / Vitest + Testing Library（jsdom・fake-indexeddb）/ Playwright

**設計書:** `docs/superpowers/specs/2026-09-12-restore-prompt-detection-design.md`

## Global Constraints

- `collectAppData()` は**変えない**（控えには全部入れる）
- `useGameAutoSave` の `pagehide` フラッシュ、`useSessionOwnership` の心拍、`errorLog` の書き込みは**いずれも触らない**
- `hasAppData` は**残さず置き換える**（似た判定を並立させない）
- 守るキーは8つ。`game-history` / `my-teams` / `opponent-teams` / `saved-opponents` / `hidden-players` / `merged-players` / `app-settings` / `mbc_gemini_api_key`
- 中身が空（`''` / `[]` / `{}` / `null`）のキーは数えない
- コメントは日本語。**なぜそうしたか**を書く
- 各タスクの最後に必ずコミットする。末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

| ファイル | 役割 |
|---|---|
| `src/utils/mirrorBackup.ts`（変更） | `hasAppData` → `hasRestorableUserData` |
| `src/utils/mirrorBackup.restorable.test.ts`（新規） | 新しい判定の単体テスト |
| `src/utils/mirrorBackup.test.ts`（変更） | 参照の差し替え |
| `src/utils/mirrorBackup.prefix.test.ts`（変更） | 参照の差し替え |
| `src/App.tsx`（変更） | 呼び出しの差し替え |
| `src/App.restorePrompt.test.tsx`（新規） | プロンプトが出ることの検査 |
| `e2e/restorePromptAfterWipe.spec.ts`（新規） | 実ブラウザでの通し |

---

### Task 1: 判定を作り直す

**Files:**
- Modify: `src/utils/mirrorBackup.ts`
- Test: `src/utils/mirrorBackup.restorable.test.ts`（新規）
- Modify: `src/utils/mirrorBackup.test.ts`, `src/utils/mirrorBackup.prefix.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `hasRestorableUserData(): boolean`（`hasAppData` は消える）

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/mirrorBackup.restorable.test.ts` を新規作成:

```ts
// 復元プロンプトを出すかどうかの判定。
//
// 以前は「アプリのキーが1つでもあるか」で見ていた。ところがアプリ自身が
// 利用者の操作なしに書き戻すキーが3つある——自動保存のセッション、心拍の印、
// エラーログ。どれか1つでも復活すればプロンプトは二度と出ない。
//
// 実測（Playwright・本番ビルド）: サイトデータを消したあと、6.5秒後には
// minibasket-session-owner だけが復活し、リロードすると pagehide の
// フラッシュが minibasket-game-session も書き戻して、プロンプトは出なかった。
// IndexedDB に完全な控えがあるのに、アプリからは何も案内されない状態になる。
//
// 「アプリのキーがあるか」ではなく「失ったら困るデータがあるか」で見る。

import { describe, it, expect, beforeEach } from 'vitest';
import { hasRestorableUserData } from './mirrorBackup';

beforeEach(() => localStorage.clear());

describe('失ったら困るデータが残っているか', () => {
    it('何も無ければ偽', () => {
        expect(hasRestorableUserData()).toBe(false);
    });

    it('試合履歴があれば真', () => {
        localStorage.setItem('minibasket-game-history', '[{"id":"g1"}]');
        expect(hasRestorableUserData()).toBe(true);
    });

    it('APIキーだけでも真（利用者が入力したもの）', () => {
        localStorage.setItem('mbc_gemini_api_key', 'k');
        expect(hasRestorableUserData()).toBe(true);
    });

    it('アプリが自分で書き戻す3つだけなら偽', () => {
        // これが今回の事故そのもの
        localStorage.setItem('minibasket-game-session', '{"game":{"phase":"playing"}}');
        localStorage.setItem('minibasket-session-owner', '{"id":"t","at":1}');
        localStorage.setItem('mbc_error_log', '[{"message":"x"}]');
        expect(hasRestorableUserData()).toBe(false);
    });

    it('UIの旗と最終バックアップ時刻だけなら偽', () => {
        localStorage.setItem('minibasket-install-guide-dismissed', '1');
        localStorage.setItem('minibasket-last-backup', '{"timestamp":1}');
        expect(hasRestorableUserData()).toBe(false);
    });

    it('中身が空のキーだけなら偽（取り込みの巻き戻しで空が書かれることがある）', () => {
        localStorage.setItem('minibasket-game-history', '[]');
        localStorage.setItem('minibasket-my-teams', '[]');
        localStorage.setItem('minibasket-merged-players', '{}');
        expect(hasRestorableUserData()).toBe(false);
    });

    it('空のキーに混じって中身のあるキーが1つでもあれば真', () => {
        localStorage.setItem('minibasket-game-history', '[]');
        localStorage.setItem('minibasket-my-teams', '[{"id":"t1"}]');
        expect(hasRestorableUserData()).toBe(true);
    });

    it('無関係なキーは数えない', () => {
        localStorage.setItem('unrelated-key', 'x');
        expect(hasRestorableUserData()).toBe(false);
    });
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/utils/mirrorBackup.restorable.test.ts`
Expected: FAIL。`hasRestorableUserData` が export されておらずインポートで全件が落ちる。

- [ ] **Step 3: 実装**

`src/utils/mirrorBackup.ts` の `hasAppData` を次で置き換える（`collectAppData` はそのまま残す）:

```ts
/**
 * 失ったら困るデータ。復元プロンプトを出すかどうかはこれだけで決める。
 *
 * 「アプリのキーが1つでもあるか」では駄目だった。アプリ自身が利用者の操作
 * なしに書き戻すキーが3つある——自動保存のセッション（pagehide のフラッシュ
 * を含む）、所有権の心拍、エラーログ。どれか1つでも復活すると、データが
 * 全部消えていてもプロンプトが出なくなる。実測で確認済み。
 *
 * 除外を並べる形（ブラックリスト）は採らない。今回の事故は「新しいキーを
 * 黙って数えてしまう規則」から起きたので、除外側に並べると4つ目の自動キーが
 * 増えたときに同じ見落としが起きる。
 *
 * 新しいキーを足したら、ここで「失ったら困るか」を決めること。迷ったら
 * 入れない——入れ忘れてもプロンプトが余計に出るだけで、失う側へは倒れない。
 */
const RESTORABLE_KEYS = [
    'minibasket-game-history',
    'minibasket-my-teams',
    'minibasket-opponent-teams',
    'minibasket-saved-opponents',
    'minibasket-hidden-players',
    'minibasket-merged-players',
    'minibasket-app-settings',
    'mbc_gemini_api_key',
] as const;

/**
 * 中身が空か。
 *
 * 取り込みの巻き戻しなどで空の配列・オブジェクトが書かれることがある。
 * それを「データあり」と数えるとプロンプトが塞がれ、元の木阿弥になる。
 */
function isEmptyStoredValue(raw: string): boolean {
    const trimmed = raw.trim();
    return trimmed === '' || trimmed === '[]' || trimmed === '{}' || trimmed === 'null';
}

/** 失ったら困るデータが localStorage に残っているか */
export function hasRestorableUserData(): boolean {
    try {
        return RESTORABLE_KEYS.some(key => {
            const raw = localStorage.getItem(key);
            return raw !== null && !isEmptyStoredValue(raw);
        });
    } catch {
        // 読めない環境では「ある」に倒す。読めないだけで消えたとは限らず、
        // ここでプロンプトを出すと、無事なデータへ上書きを勧めることになる。
        // 列挙の入れ忘れ（＝余計に出る側へ倒す）とは事情が違う
        return true;
    }
}
```

- [ ] **Step 4: 既存の参照を差し替える**

`src/utils/mirrorBackup.test.ts:23`:

```ts
        expect(m.hasRestorableUserData()).toBe(true);
```

（このテストは `minibasket-my-teams` を `'[]'`、`mbc_gemini_api_key` を `'k'` で置く。新しい規則では前者は空として数えず、後者で真になる。結果は変わらないが理由が変わるので、必要なら一言コメントを添える。）

`src/utils/mirrorBackup.prefix.test.ts` の import と `:38`:

```ts
import { collectAppData, hasRestorableUserData } from './mirrorBackup';
...
    it('守るべきデータが1つも無ければデータ無しと判定する', () => {
        localStorage.setItem('unrelated-key', 'x');
        expect(hasRestorableUserData()).toBe(false);
    });
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npx vitest run src/utils/mirrorBackup`
Expected: PASS（新規8件と既存のミラー系テストすべて）

Run: `npx tsc -b`
Expected: 出力なし（`App.tsx` はまだ `hasAppData` を呼んでいるので**ここで落ちる**。Task 2 で直すため、この時点では `tsc` の失敗を確認するだけでよい）

- [ ] **Step 6: コミット**

Task 2 と合わせて1つのコミットにする（この時点では `tsc` が通らないため、単体でコミットしない）。

---

### Task 2: 呼び出し側を差し替える

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.restorePrompt.test.tsx`（新規）

**Interfaces:**
- Consumes: Task 1 の `hasRestorableUserData`

- [ ] **Step 1: 失敗するテストを書く**

`src/App.restorePrompt.test.tsx` を新規作成:

```tsx
// サイトデータが消えたあと、復元プロンプトが出ること。
//
// 以前は「アプリのキーが1つでもあるか」で判定していたため、アプリが自分で
// 書き戻すキー（自動保存のセッション・心拍の印・エラーログ）が1つでも
// 復活するとプロンプトが出なかった。IndexedDB に完全な控えがあるのに、
// 利用者は何も案内されないまま履歴もチームも失う。

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import App from './App';
import { saveSnapshot } from './utils/mirrorBackup';

/** アプリが自分で書き戻すキーだけを置く（消去直後の実際の姿） */
function onlySelfWrittenKeys() {
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game: { phase: 'playing' }, gameName: '第1節', date: '2026-04-10',
        savedAt: new Date().toISOString(),
    }));
    localStorage.setItem('minibasket-session-owner', JSON.stringify({ id: 't', at: Date.now() }));
    localStorage.setItem('mbc_error_log', JSON.stringify([{ message: 'x' }]));
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
});
afterEach(cleanup);

describe('データ消失後の復元プロンプト', () => {
    it('アプリが書き戻したキーしか無ければ、控えから戻すか尋ねる', async () => {
        // 控えを作る（このときはデータがある）
        localStorage.setItem('minibasket-my-teams', '[{"id":"t1","name":"テスト"}]');
        expect(await saveSnapshot('startup')).toBe(true);

        // サイトデータ消去を模し、アプリが書き戻す分だけ戻す
        localStorage.clear();
        onlySelfWrittenKeys();

        render(<App />);

        expect(await screen.findByRole('heading', { name: /以前のデータが見つかりました/ })).toBeTruthy();
    });

    it('試合履歴が残っていれば尋ねない', async () => {
        localStorage.setItem('minibasket-my-teams', '[{"id":"t1","name":"テスト"}]');
        expect(await saveSnapshot('startup')).toBe(true);

        onlySelfWrittenKeys();
        localStorage.setItem('minibasket-game-history', '[{"id":"g1"}]');

        render(<App />);

        await waitFor(() => expect(screen.queryByRole('heading', { name: /以前のデータが見つかりました/ })).toBeNull());
    });
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/App.restorePrompt.test.tsx`
Expected: FAIL。1件目が `Unable to find a role="heading"...` で落ちる（`hasAppData` がまだ真を返すためプロンプトが出ない）。

- [ ] **Step 3: 実装**

`src/App.tsx:56` の import:

```ts
import { hasRestorableUserData, getLatestSnapshot, saveSnapshot, requestPersistentStorage } from './utils/mirrorBackup';
```

`src/App.tsx:263`:

```ts
      // 「アプリのキーがあるか」では駄目だった。自動保存のセッション・心拍の印・
      // エラーログはアプリが自分で書き戻すので、データが全部消えていても
      // それらが残り、プロンプトが二度と出なくなる（実測で確認）
      if (!hasRestorableUserData() && !sessionStorage.getItem('mbc-restore-dismissed')) {
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/App.restorePrompt.test.tsx`
Expected: PASS（2件）

Run: `npx vitest run src/App src/utils/mirrorBackup`
Expected: PASS

Run: `npx tsc -b && npm run lint`
Expected: どちらも出力なし

Run: `grep -rn "hasAppData" src/`
Expected: 出力なし（コメント内の言及も含めて残っていないこと。残っていれば新しい名前へ直す）

- [ ] **Step 5: コミット**

```bash
git add src/utils/mirrorBackup.ts src/utils/mirrorBackup.restorable.test.ts src/utils/mirrorBackup.test.ts src/utils/mirrorBackup.prefix.test.ts src/App.tsx src/App.restorePrompt.test.tsx
```

件名 `fix(restore): データ消失の検知が、アプリ自身の書き戻しに惑わされないようにする`。本文で実測の内容、3つの自動キー、ブラックリストを採らない理由、読めない環境で「ある」に倒す理由を書く。

---

### Task 3: 実ブラウザでの通し

**Files:**
- Create: `e2e/restorePromptAfterWipe.spec.ts`

- [ ] **Step 1: e2e を書く**

`pagehide` のフラッシュも5秒の心拍も実ブラウザでしか回らない。監査で使った手順をそのまま固定する。

```ts
// 記録中にサイトデータを消されても、開き直したときに復元を案内すること。
//
// 直していたころの実測: 消去から6.5秒後には minibasket-session-owner だけが
// 心拍で復活し、リロードすると pagehide のフラッシュが
// minibasket-game-session も書き戻していた。どちらも「アプリのキー」なので
// hasAppData() が真になり、IndexedDB に完全な控えがあるのに復元プロンプトは
// 出なかった。
//
// pagehide のフラッシュも心拍も jsdom では回らない。

import { expect, test } from '@playwright/test';
import { seedInProgressGame } from './fixtures/seedGame';

test('記録中にデータを消されても、開き直せば復元を案内する', async ({ page }) => {
    await seedInProgressGame(page);
    await page.goto('./');

    // 控えが IndexedDB に入るまで待つ
    await expect
        .poll(() => page.evaluate(() => new Promise<number>(resolve => {
            const request = indexedDB.open('mbc-mirror-backup');
            request.onsuccess = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('snapshots')) { resolve(0); db.close(); return; }
                const c = db.transaction('snapshots', 'readonly').objectStore('snapshots').count();
                c.onsuccess = () => { resolve(c.result); db.close(); };
                c.onerror = () => { resolve(0); db.close(); };
            };
            request.onerror = () => resolve(0);
        })))
        .toBeGreaterThan(0);

    // 記録中にする（心拍が回り始める）
    await page.getByRole('button', { name: /試合を再開/ }).click();
    await page.waitForTimeout(500);

    // ブラウザのサイトデータ消去を模す（IndexedDB は残す）
    await page.evaluate(() => window.localStorage.clear());

    // 心拍（5秒）を1回またぐ。ここで minibasket-session-owner が復活する
    await page.waitForTimeout(6_500);
    expect(await page.evaluate(() => Object.keys(localStorage))).toContain('minibasket-session-owner');

    // 開き直すと復元を案内する
    await page.reload();
    await expect(page.getByRole('heading', { name: /以前のデータが見つかりました/ })).toBeVisible();
});
```

- [ ] **Step 2: 通ることを確かめる**

Run: `npm run build`
Expected: 成功

Run: `npx playwright test e2e/restorePromptAfterWipe.spec.ts --reporter=list`
Expected: PASS（1件）

- [ ] **Step 3: 修正前に落ちることを確かめる**

`src/utils/mirrorBackup.ts` の `hasRestorableUserData` を一時的に、旧挙動と同じ `return Object.keys(collectAppData()).length > 0;` にして:

Run: `npx vite build`（`npm run build` ではない。`tsc` が落ちると `vite build` に届かず、`dist` が古いままで偽の緑になる）
Run: `npx playwright test e2e/restorePromptAfterWipe.spec.ts --reporter=list`
Expected: FAIL（プロンプトが出ない）

確かめたら `git checkout -- src/utils/mirrorBackup.ts` で戻し、`npx vite build` で `dist` も戻すこと。

- [ ] **Step 4: 全体を確かめる**

Run: `npx vitest run`
Expected: PASS（全件）

Run: `npm run test:e2e`
Expected: PASS（11件）

- [ ] **Step 5: コミット**

```bash
git add e2e/restorePromptAfterWipe.spec.ts
```

件名 `test(e2e): データ消去後に復元を案内することを実ブラウザで固定する`。本文で「jsdom では pagehide のフラッシュも心拍も回らない」ことと、Step 3 の確認結果を書く。

---

## 実機確認（全タスク完了後）

`npm run build && npm run preview` で本番ビルドを立ち上げ、ブラウザで:

1. 試合を記録中に localStorage を消し、6秒待ってから開き直す → 復元プロンプトが出る
2. 「復元する」を押すと、履歴とチームが戻る
3. データが残っている状態では、いままでどおりプロンプトは出ない
