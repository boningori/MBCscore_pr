# 保存データを受け取る側の守りを2つ足す 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) 別のタブが記録中のあいだ、他のタブから試合画面へ入れないようにする。(2) メジャーが新しいバックアップファイルを取り込まない。

**Architecture:** 所有権は localStorage の印（`{id, at}`）と5秒の心拍で表す。判定は純関数に閉じ、App は入口（再開・新規開始）で押された瞬間に見る。version 検査は既存の `classifyImportData` に1つ条件を足すだけ。

**Tech Stack:** TypeScript 5.9 / React 19 / Vitest + Testing Library（jsdom・fake-indexeddb）/ Playwright

**設計書:** `docs/superpowers/specs/2026-09-12-session-ownership-and-backup-version-design.md`

## Global Constraints

- 心拍 `HEARTBEAT_MS = 5_000`、時間切れ `OWNER_STALE_MS = 30_000`
- 印のキーは `minibasket-session-owner`
- 判定に迷ったら**塞がない側へ倒す**（印が壊れている・読めない → 偽）
- 逃げ道（それでも再開する）は**作らない**
- `useGameAutoSave` と reducer には**一切手を入れない**
- バックアップは 1.x / 2.x を**いままでどおり読む**。断るのはメジャーが現在より大きいと**はっきり読み取れた**ときだけ
- コメントは日本語。**なぜそうしたか**を書く
- 各タスクの最後に必ずコミットする。末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

| ファイル | 役割 |
|---|---|
| `src/utils/sessionOwner.ts`（新規） | 印の読み書きと判定 |
| `src/utils/sessionOwner.test.ts`（新規） | 上の単体テスト |
| `src/hooks/useSessionOwnership.ts`（新規） | 試合画面にいるあいだ心拍を打つ |
| `src/App.tsx`（変更） | 心拍を回し、入口2つで塞ぐ |
| `src/App.sessionOwner.test.tsx`（新規） | 入口が塞がることの検査 |
| `e2e/twoTabs.spec.ts`（新規） | 実ブラウザ・2タブでの通し |
| `src/utils/dataBackup.ts`（変更） | version のメジャー比較 |
| `src/utils/dataBackup.version.test.ts`（新規） | 上の単体テスト |
| `public/manual.html`（変更） | 2タブで開いたときの案内 |

---

### Task 1: 所有権の印

**Files:**
- Create: `src/utils/sessionOwner.ts`
- Test: `src/utils/sessionOwner.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `HEARTBEAT_MS` / `OWNER_STALE_MS` / `OTHER_TAB_MESSAGE` / `myTabId()` / `claimSessionOwner()` / `releaseSessionOwner()` / `isOwnedByOtherTab()`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/sessionOwner.test.ts` を新規作成:

```ts
// 記録中のタブを表す印。
//
// 実測: 同じ端末の2つのタブで同じ試合を記録すると、あとから書いたほうが勝ち、
// もう片方の記録が黙って消える（3本入れて2本しか残らない）。useGameAutoSave が
// メモリ上の状態を丸ごと書くため、相手の得点を知らないまま上書きしてしまう。
// 両方のタブが同じ数字を表示し、スコアシートの辻褄も合うので気づけない。
//
// 起きてから警告するのではなく、後から開いたタブを入口で止める。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    OWNER_STALE_MS,
    claimSessionOwner,
    isOwnedByOtherTab,
    myTabId,
    releaseSessionOwner,
} from './sessionOwner';

const OWNER_KEY = 'minibasket-session-owner';

/** 別のタブが age ミリ秒前に打った印 */
function foreignOwner(age: number) {
    localStorage.setItem(OWNER_KEY, JSON.stringify({ id: 'other-tab', at: Date.now() - age }));
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('別のタブが記録中か', () => {
    it('印が無ければ偽', () => {
        expect(isOwnedByOtherTab()).toBe(false);
    });

    it('自分が宣言した直後は偽（自分の印だから）', () => {
        claimSessionOwner();
        expect(isOwnedByOtherTab()).toBe(false);
    });

    it('別のタブの新しい印があれば真', () => {
        foreignOwner(1_000);
        expect(isOwnedByOtherTab()).toBe(true);
    });

    it('別のタブでも時間切れなら偽（端末が落ちたあと復帰できる）', () => {
        foreignOwner(OWNER_STALE_MS + 1);
        expect(isOwnedByOtherTab()).toBe(false);
    });

    it('手放すと偽に戻る', () => {
        claimSessionOwner();
        releaseSessionOwner();
        expect(localStorage.getItem(OWNER_KEY)).toBeNull();
        expect(isOwnedByOtherTab()).toBe(false);
    });

    it('他人の印は手放さない（自分のときだけ消す）', () => {
        foreignOwner(1_000);
        releaseSessionOwner();
        expect(isOwnedByOtherTab()).toBe(true);
    });

    it('壊れた印は塞がない側へ倒す', () => {
        localStorage.setItem(OWNER_KEY, '{壊れた');
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        expect(isOwnedByOtherTab()).toBe(false);
    });

    it('タブのidは読み込みのあいだ変わらない', () => {
        expect(myTabId()).toBe(myTabId());
    });
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/utils/sessionOwner.test.ts`
Expected: FAIL。`Failed to resolve import "./sessionOwner"` で全件が落ちる。

- [ ] **Step 3: 実装**

`src/utils/sessionOwner.ts` を新規作成:

```ts
// 記録中のタブを表す印。
//
// 同じ端末の2つのタブで同じ試合を記録すると、あとから書いたほうが勝ち、もう
// 片方の記録が黙って消える。useGameAutoSave はメモリ上の状態を丸ごと書くので、
// 相手の得点を知らないまま自分の版で上書きしてしまう（実測: 3本入れて2本しか
// 残らない）。両方のタブが同じ数字を表示し、スコアシートの辻褄も合うため、
// 足りないことに気づく手がかりが無い。
//
// 起きてから警告するのでは遅い。後から開いたタブを入口で止める。

/** 記録中のタブを表す印の置き場 */
const OWNER_KEY = 'minibasket-session-owner';

/**
 * 心拍の間隔。
 *
 * 自動保存は状態が変わったときにしか走らない。タイムアウトやハーフタイムで
 * 数分タップが無いと印が古くなり、その隙に別のタブが入れてしまう。だから
 * 状態と無関係に一定間隔で打つ。
 */
export const HEARTBEAT_MS = 5_000;

/**
 * これを過ぎた印は「もう誰も使っていない」とみなす。
 *
 * 心拍の6回ぶん。短すぎると静かな時間に所有権を落とし、長すぎると端末が
 * 落ちたあとの復帰が遅れる。
 */
export const OWNER_STALE_MS = 30_000;

/** 塞いだときに出す文言。呼び出し側とテストで同じものを使う */
export const OTHER_TAB_MESSAGE = '別のタブでこの試合を記録中です。そちらのタブで続けてください。';

interface Owner {
    id: string;
    at: number;
}

let tabId: string | null = null;

/** このタブのid（読み込みごとに1つ） */
export function myTabId(): string {
    tabId ??= crypto.randomUUID();
    return tabId;
}

function readOwner(): Owner | null {
    try {
        const raw = localStorage.getItem(OWNER_KEY);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return null;
        const owner = parsed as Owner;
        if (typeof owner.id !== 'string' || typeof owner.at !== 'number') return null;
        return owner;
    } catch (error) {
        // 読めない印は「誰も使っていない」として扱う。ここで塞ぐ側へ倒すと、
        // 壊れた値ひとつで試合を始められない端末ができる
        console.warn('Discarded malformed session owner in localStorage:', error);
        return null;
    }
}

/** 自分が使っていると宣言する（心拍） */
export function claimSessionOwner(): void {
    try {
        localStorage.setItem(OWNER_KEY, JSON.stringify({ id: myTabId(), at: Date.now() }));
    } catch {
        // 書けなくても記録そのものは続く。所有権は「守れたら守る」程度の
        // 仕組みで、ここで止めるほうが害が大きい
    }
}

/** 自分が持っているなら手放す */
export function releaseSessionOwner(): void {
    const owner = readOwner();
    if (owner?.id !== myTabId()) return;
    try {
        localStorage.removeItem(OWNER_KEY);
    } catch {
        // 消せなくても時間切れで自然に解ける
    }
}

/** 別のタブが、いま記録中か */
export function isOwnedByOtherTab(): boolean {
    const owner = readOwner();
    if (!owner) return false;
    if (owner.id === myTabId()) return false;
    return Date.now() - owner.at <= OWNER_STALE_MS;
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/utils/sessionOwner.test.ts`
Expected: PASS（8件）

Run: `npx tsc -b`
Expected: 出力なし

- [ ] **Step 5: コミット**

```bash
git add src/utils/sessionOwner.ts src/utils/sessionOwner.test.ts
```

件名 `feat(session): 記録中のタブを表す印を置く`。本文で実測の内容、心拍が要る理由、時間切れの数字の根拠、迷ったら塞がない側へ倒す理由を書く。

---

### Task 2: 心拍を回し、入口を塞ぐ

**Files:**
- Create: `src/hooks/useSessionOwnership.ts`
- Modify: `src/App.tsx`
- Test: `src/App.sessionOwner.test.tsx`

**Interfaces:**
- Consumes: Task 1 の全部
- Produces: `useSessionOwnership(screen: string, phase: Game['phase']): void`

- [ ] **Step 1: 失敗するテストを書く**

`src/App.sessionOwner.test.tsx` を新規作成:

```tsx
// 別のタブが記録中のあいだ、このタブからは試合画面へ入れない。
//
// 再開だけを塞いでも足りない。別のタブが記録中に新規試合を始めると、同じ
// セッションのキーをその新しい試合で上書きすることになり、結果は同じである。

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { showToast } from './components/Toast/toastApi';
import { OWNER_STALE_MS } from './utils/sessionOwner';

vi.mock('./components/Toast/toastApi', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./components/Toast/toastApi')>()),
    showToast: vi.fn(),
}));

const myTeam = {
    id: 'team-1', name: 'テストチーム', coachName: 'コーチ', assistantCoachName: '',
    players: Array.from({ length: 6 }, (_, i) => ({ number: i + 4, name: `選手${i + 4}`, isCaptain: i === 0 })),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

/** 別のタブが age ミリ秒前に打った印 */
function foreignOwner(age: number) {
    localStorage.setItem('minibasket-session-owner', JSON.stringify({ id: 'other-tab', at: Date.now() - age }));
}

/** 中断中の試合を置く（「試合を再開」を出すため） */
function seedSession() {
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game: { phase: 'playing' }, gameName: '第1節', date: '2026-04-10',
        savedAt: new Date().toISOString(),
    }));
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    vi.mocked(showToast).mockClear();
});
afterEach(cleanup);

describe('別のタブが記録中のとき', () => {
    it('「試合を再開」を押しても進まず、知らせる', () => {
        seedSession();
        foreignOwner(1_000);
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: /試合を再開/ }));

        // ホームに留まっている
        expect(screen.getByRole('button', { name: /新規試合開始/ })).toBeTruthy();
        expect(vi.mocked(showToast).mock.calls[0][0]).toMatch(/別のタブ/);
    });

    it('「新規試合開始」も進まない（同じキーを上書きするため）', () => {
        seedSession();
        foreignOwner(1_000);
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: /新規試合開始/ }));

        expect(screen.getByRole('button', { name: /新規試合開始/ })).toBeTruthy();
        expect(vi.mocked(showToast).mock.calls[0][0]).toMatch(/別のタブ/);
    });

    it('印が時間切れなら、いつもどおり進む', () => {
        seedSession();
        foreignOwner(OWNER_STALE_MS + 1_000);
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: /試合を再開/ }));

        expect(screen.queryByRole('button', { name: /新規試合開始/ })).toBeNull();
    });
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/App.sessionOwner.test.tsx`
Expected: FAIL。最初の2件が、試合画面へ進んでしまい `新規試合開始` が見つからない、あるいは `showToast` が呼ばれていないことで落ちる。3件目は通る。

- [ ] **Step 3: 心拍のフックを作る**

`src/hooks/useSessionOwnership.ts` を新規作成:

```ts
// 試合系画面にいるあいだ、「このタブが記録中」の印を打ち続ける。
//
// useGameAutoSave と同じ条件で回す。あちらが書く相手（セッション）を、
// こちらが守る。状態が変わらなくても打ち続けるのが要点で、タイムアウトや
// ハーフタイムの数分間に印が古くなると、その隙に別のタブが入れてしまう。

import { useEffect } from 'react';
import type { Game } from '../types/game';
import { HEARTBEAT_MS, claimSessionOwner, releaseSessionOwner } from '../utils/sessionOwner';
import { isGameScreen } from '../types/screens';

export function useSessionOwnership(screen: string, phase: Game['phase']): void {
    const active = isGameScreen(screen) && phase !== 'setup';
    useEffect(() => {
        if (!active) return;
        claimSessionOwner();
        const timer = window.setInterval(claimSessionOwner, HEARTBEAT_MS);
        return () => {
            clearInterval(timer);
            // 試合画面から離れたら手放す。放っておいても時間切れで解けるが、
            // 30秒待たせる理由が無い
            releaseSessionOwner();
        };
    }, [active]);
}
```

- [ ] **Step 4: App を直す**

`src/App.tsx` の import に足す:

```ts
import { useSessionOwnership } from './hooks/useSessionOwnership';
import { isOwnedByOtherTab, OTHER_TAB_MESSAGE } from './utils/sessionOwner';
```

`useGameAutoSave(state, screen, gameName, date, phase);`（292行）の直後に足す:

```ts
  useSessionOwnership(screen, phase);
```

`handleResumeGame`（1022行）の先頭に足す:

```ts
  const handleResumeGame = () => {
    // 別のタブが記録中なら入らない。入ると、あとから書いたほうが勝って
    // もう片方の記録が黙って消える
    if (isOwnedByOtherTab()) {
      showToast(OTHER_TAB_MESSAGE, 'error');
      return;
    }
    const session = loadGameSession();
```

`handleStartNewGame`（1033行）の先頭に足す。**`clearSetupDraft()` より前に置くこと**——後ろに置くと、断るだけなのに下書きを消してしまう:

```ts
  const handleStartNewGame = () => {
    // 別のタブが記録中なら入らない。新規試合も同じセッションのキーを
    // 上書きするので、再開だけ塞いでも穴が残る
    if (isOwnedByOtherTab()) {
      showToast(OTHER_TAB_MESSAGE, 'error');
      return;
    }
    // 新規はいつでも最初から。前の試合の設定の残りを引きずらせない
    clearSetupDraft();
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npx vitest run src/App.sessionOwner.test.tsx`
Expected: PASS（3件）

Run: `npx vitest run src/App`
Expected: PASS（既存の App のテスト27ファイルすべて）

Run: `npx tsc -b && npm run lint`
Expected: どちらも出力なし

- [ ] **Step 6: コミット**

```bash
git add src/hooks/useSessionOwnership.ts src/App.tsx src/App.sessionOwner.test.tsx
```

件名 `feat(session): 別のタブが記録中なら、試合画面へ入れないようにする`。本文で「なぜ新規試合開始も塞ぐか」「なぜボタンを無効化せず押した瞬間に見るか」「clearSetupDraft より前に置く理由」を書く。

---

### Task 3: 2タブの通し（e2e）

**Files:**
- Create: `e2e/twoTabs.spec.ts`

**Interfaces:**
- Consumes: `e2e/fixtures/seedGame.ts` の `seedInProgressGame` / `IN_PROGRESS_PLAYER_NAME`

- [ ] **Step 1: e2e を書く**

`e2e/twoTabs.spec.ts` を新規作成:

```ts
// 同じ端末の2つのタブで同じ試合を記録できないことを確かめる。
//
// 直していたころの実測: tab1 が2点、tab2 が2点、tab1 がさらに2点を入れると、
// 保存されるのは4点（2本）だった。tab1 は tab2 の得点を知らないまま自分の版で
// 上書きする。両方のタブが同じ数字を表示し、スコアシートの辻褄も合うので、
// 1本足りないことに気づく手がかりが無い。
//
// 同じ localStorage を共有する2つのタブは jsdom では作れない。実ブラウザの
// 同一 context に2ページ開いて確かめる。

import { expect, test } from '@playwright/test';
import { IN_PROGRESS_PLAYER_NAME, seedInProgressGame } from './fixtures/seedGame';

test('別のタブが記録中なら、2つ目のタブは試合に入れない', async ({ page, context }) => {
    await seedInProgressGame(page);
    await page.goto('./');
    await page.getByRole('button', { name: /試合を再開/ }).click();

    // タブ1 で1本決めて、記録中であることをはっきりさせる
    await page.getByRole('button', { name: new RegExp(IN_PROGRESS_PLAYER_NAME) }).click();
    await page.getByRole('button', { name: '2Pシュート' }).click();
    await page.locator('.score-selector .score-option.success').click();
    await expect(page.locator('.team-a-block .score-display')).toHaveText('2');

    // タブ2 を開く。再開も新規開始も断られる
    const page2 = await context.newPage();
    await page2.goto('./');

    await page2.getByRole('button', { name: /試合を再開/ }).click();
    await expect(page2.getByText(/別のタブでこの試合を記録中です/)).toBeVisible();
    await expect(page2.getByRole('button', { name: /新規試合開始/ })).toBeVisible();

    await page2.getByRole('button', { name: /新規試合開始/ }).click();
    await expect(page2.getByRole('button', { name: /新規試合開始/ })).toBeVisible();

    // タブ1 は影響を受けない
    await expect(page.locator('.team-a-block .score-display')).toHaveText('2');
});
```

- [ ] **Step 2: 通ることを確かめる**

Run: `npm run build`
Expected: 成功

Run: `npx playwright test e2e/twoTabs.spec.ts --reporter=list`
Expected: PASS（1件）

- [ ] **Step 3: 修正前に落ちることを確かめる**

この検査が本当に差を捉えるかを見る。`src/utils/sessionOwner.ts` の `isOwnedByOtherTab` を一時的に `return false;` にして:

Run: `npx vite build`（`npm run build` ではなく。`tsc` が落ちると `vite build` に届かず、`dist` が古いままで偽の緑になる）
Run: `npx playwright test e2e/twoTabs.spec.ts --reporter=list`
Expected: FAIL

確かめたら `git checkout -- src/utils/sessionOwner.ts` で戻し、`npx vite build` で `dist` を戻すこと。

- [ ] **Step 4: コミット**

```bash
git add e2e/twoTabs.spec.ts
```

件名 `test(e2e): 2つのタブで同じ試合を記録できないことを固定する`。本文で「jsdom では2タブを作れない」ことと、Step 3 の確認結果を書く。

---

### Task 4: バックアップの version 比較

**Files:**
- Modify: `src/utils/dataBackup.ts`
- Test: `src/utils/dataBackup.version.test.ts`

**Interfaces:**
- Consumes: 既存の `BACKUP_VERSION` / `parseImportJSON`
- Produces: なし（`classifyImportData` の挙動追加のみ）

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/dataBackup.version.test.ts` を新規作成:

```ts
// 取り込みは version の存在しか見ていなかった。
//
// 今日の実害はゼロである。直す理由は「次に形式を変えたとき、既に配られている
// アプリが新しいファイルを拒めるようにしておく」一点。あとから足しても、その
// 時点で世に出ている版には効かない。registerType: 'prompt' なので、更新を
// 断り続けた古いアプリは長く残る。
//
// 1.x と 2.x はいままでどおり読む。e590901 が 1.x を作り、e6b064c が
// フィールドを足して 2.0 にした——追加だけの変更だったので古いファイルも
// 読める。その互換性は壊さない。

import { describe, it, expect } from 'vitest';
import { parseImportJSON } from './dataBackup';

/** version だけを差し替えた最小のバックアップ */
function backupWith(version: unknown): string {
    return JSON.stringify({
        version,
        exportDate: new Date().toISOString(),
        appName: 'MBCscore',
        data: { myTeams: [{ id: 't1', name: 'テストミニバス', players: [] }] },
    });
}

describe('バックアップの version', () => {
    it('1.0 は受け付ける（古い形式の互換を壊さない）', () => {
        expect(parseImportJSON(backupWith('1.0')).type).not.toBe('unknown');
    });

    it('2.0 と 2.5 は受け付ける', () => {
        expect(parseImportJSON(backupWith('2.0')).type).not.toBe('unknown');
        expect(parseImportJSON(backupWith('2.5')).type).not.toBe('unknown');
    });

    it('3.0 は断り、ファイルの版を案内に入れる', () => {
        const parsed = parseImportJSON(backupWith('3.0'));
        expect(parsed.type).toBe('unknown');
        expect(parsed.summary).toContain('3.0');
        expect(parsed.summary).toMatch(/更新/);
    });

    it('10.0 も断る（文字列ではなく数として見る）', () => {
        expect(parseImportJSON(backupWith('10.0')).type).toBe('unknown');
    });

    it('version が無ければ、いままでどおり「エクスポートデータではない」', () => {
        const parsed = parseImportJSON(backupWith(undefined));
        expect(parsed.type).toBe('unknown');
        expect(parsed.summary).toMatch(/バージョン情報が見つかりません/);
    });

    it('読めない版は、いままでどおり受け付ける（断る条件をはっきりしたものに絞る）', () => {
        expect(parseImportJSON(backupWith('abc')).type).not.toBe('unknown');
    });
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/utils/dataBackup.version.test.ts`
Expected: FAIL。「3.0 は断り…」と「10.0 も断る」の2件が、`type` が `'unknown'` でないことで落ちる。他の4件は通る。

- [ ] **Step 3: 実装**

`src/utils/dataBackup.ts` の `classifyImportData` の中、`if (!data.version) { ... }` ブロックの**直後**に足す:

```ts
    // メジャーが自分より新しいファイルは受け付けない。
    //
    // 知らないフィールドは検査で黙って捨てられるので、読めたことにして
    // 取り込むと、利用者は「戻せた」と思ったまま一部を失う。
    //
    // 断るのは「はっきり新しいと読み取れたとき」だけにする。読めない版まで
    // 弾くと、想定外の形で既存の取り込みを壊しかねない。1.x / 2.x は
    // いままでどおり読む（2.0 への変更はフィールドの追加だけだった）。
    const fileMajor = Number(String(data.version).split('.')[0]);
    const currentMajor = Number(BACKUP_VERSION.split('.')[0]);
    if (Number.isFinite(fileMajor) && fileMajor > currentMajor) {
        return {
            type: 'unknown',
            data: null,
            summary: `このバックアップは新しいバージョンのアプリで作られています（v${String(data.version)}）。アプリを更新してから取り込んでください。`,
        };
    }
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/utils/dataBackup`
Expected: PASS（新規6件と既存のバックアップ系テストすべて）

Run: `npx tsc -b`
Expected: 出力なし

- [ ] **Step 5: コミット**

```bash
git add src/utils/dataBackup.ts src/utils/dataBackup.version.test.ts
```

件名 `feat(backup): メジャーが新しいバックアップは取り込まない`。本文で「今日の実害はゼロで、あとから足しても世に出ている版には効かないから今入れる」ことと、1.x / 2.x の互換を壊さない理由を書く。

---

### Task 5: 説明書

**Files:**
- Modify: `public/manual.html`

- [ ] **Step 1: 16章の末尾に足す**

`public/manual.html` の16章、「保存領域の空きを確かめる」の warn-box（`ホーム画面の案内は閉じられません`）の**直後**、`<div class="page-break"></div>` の**直前**に挿入する:

```html
<div class="warn-box">
  <div class="box-title">同じ試合を2つのタブで開かないでください</div>
  記録中のタブがあるあいだ、別のタブから「試合を再開」「新規試合開始」を押すと
  <strong>「別のタブでこの試合を記録中です」</strong>と表示され、その先へは進めません。
  2つのタブで同時に記録すると、<strong>あとから操作したほうの内容で上書きされ、
  もう一方の記録が失われる</strong>ためです。
  <br>
  記録に使うタブを閉じた場合は、30秒ほどで別のタブから再開できるようになります。
</div>
```

- [ ] **Step 2: 全体を確かめる**

Run: `npx vitest run src/utils/manualVersion.test.ts`
Expected: PASS（版数は変えない）

Run: `npx vitest run`
Expected: PASS（全件）

Run: `npx tsc -b && npx vite build && npm run test:e2e`
Expected: すべて成功（e2e は10件）

- [ ] **Step 3: コミット**

```bash
git add public/manual.html
```

件名 `docs(manual): 同じ試合を2つのタブで開けないことを書く`。本文で「押しても進まないのを不具合と読まれないため」「30秒で解けること」を書く。

---

## 実機確認（全タスク完了後）

`npm run build && npm run preview` で本番ビルドを立ち上げ、ブラウザで:

1. 1つのタブで試合を記録し、別のタブで開いて「試合を再開」を押す → 断られる
2. 「新規試合開始」も断られる
3. 記録に使っていたタブを閉じ、30秒ほど待つ → 別のタブから再開できる
4. 1つのタブだけで使うかぎり、いままでどおり何も変わらない
