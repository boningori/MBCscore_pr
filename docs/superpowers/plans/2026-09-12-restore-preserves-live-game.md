# 記録中の復元が進行中の試合を消さないようにする 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 守るべき試合（記録中、または終了したが未保存）があるあいだ、復元・取り込みが `minibasket-game-session` を書き換えないようにする。

**Architecture:** 判定を `gameSessionStorage`（キーの持ち主）に1つ置き、2つの復元経路（`mirrorBackup.restoreSnapshot` と `dataBackup` の取り込み）が同じものを見る。書き込みを弾くのは各経路の内側で行い、呼び出し側に委ねない。

**Tech Stack:** TypeScript 5.9 / React 19 / Vitest + Testing Library（jsdom・fake-indexeddb）/ Playwright

**設計書:** `docs/superpowers/specs/2026-09-12-restore-preserves-live-game-design.md`

## Global Constraints

- 判定関数は `isLiveSessionProtected(): boolean`。中身は `getGameSessionState() !== 'none'`
- 守る対象は `minibasket-game-session` の1キーのみ。他のキーの扱いは変えない
- `useGameAutoSave` には**一切手を入れない**
- 起動時の `RestorePrompt` の挙動は**変えない**
- `restoreSnapshot` の戻り値の意味は変えない（書けたら true）
- コメントは日本語。**なぜそうしたか**を書く（このリポジトリの既存コメントに倣う）
- 各タスクの最後に必ずコミットする。コミットメッセージは日本語、末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

| ファイル | 役割 |
|---|---|
| `src/utils/gameSessionStorage.ts`（変更） | `GAME_SESSION_KEY` を公開し、`isLiveSessionProtected()` を足す |
| `src/utils/gameSessionStorage.protect.test.ts`（新規） | 上の単体テスト |
| `src/utils/mirrorBackup.ts`（変更） | `restoreSnapshot` がセッションキーを除いて書く |
| `src/utils/mirrorBackup.restore.test.ts`（変更・追記） | 除外の検査 |
| `src/utils/dataBackup.ts`（変更） | 取り込みの条件を `isLiveSessionProtected` に揃える |
| `src/components/Settings/MirrorBackupList.tsx`（変更） | 確認ダイアログの文言を場合分け |
| `src/components/Settings/AppSettingsModal.tsx`（変更） | 守るべき試合があるときはリロードしない |
| `src/components/Settings/MirrorBackupList.test.tsx`（変更・追記） | 文言の検査 |
| `src/components/Settings/AppSettingsModal.restoreUi.test.tsx`（変更・追記） | リロード有無の検査 |
| `e2e/restoreDuringGame.spec.ts`（新規） | 実ブラウザでの通し |

---

### Task 1: 判定を1つ置く

**Files:**
- Modify: `src/utils/gameSessionStorage.ts`
- Test: `src/utils/gameSessionStorage.protect.test.ts`

**Interfaces:**
- Consumes: 既存の `getGameSessionState()`
- Produces: `export const GAME_SESSION_KEY: string` / `export function isLiveSessionProtected(): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/gameSessionStorage.protect.test.ts` を新規作成:

```ts
// 復元・取り込みが中断セッションを書き換えてよいかの判定。
//
// 記録中の試合と、終了したが未保存の試合は、まだ履歴に入っていない＝この世に
// 1つしかない記録である。復元がこれを上書きすると、作りかけの記録が消える。
//
// 読めないセッションは守らない。中身が壊れていて復元で上書きできるなら、
// そのほうがよい（鍵の有無だけを見る hasGameSession では、壊れたものまで
// 守ってしまい、正しい控えから戻す道を塞ぐ）。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GAME_SESSION_KEY, isLiveSessionProtected, saveGameSession } from './gameSessionStorage';
import type { Game } from '../types/game';

const game = (phase: Game['phase']) => ({ phase } as Game);

beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => { });
    vi.spyOn(console, 'error').mockImplementation(() => { });
});
afterEach(() => vi.restoreAllMocks());

describe('守るべき試合があるか', () => {
    it('記録中なら守る', () => {
        saveGameSession(game('playing'), '第1節', '2026-04-10');
        expect(isLiveSessionProtected()).toBe(true);
    });

    it('終了したが未保存でも守る（まだ履歴に入っていない）', () => {
        saveGameSession(game('finished'), '第1節', '2026-04-10');
        expect(isLiveSessionProtected()).toBe(true);
    });

    it('セッションが無ければ守らない', () => {
        expect(isLiveSessionProtected()).toBe(false);
    });

    it('読めないセッションは守らない（壊れたものを守る理由が無い）', () => {
        localStorage.setItem(GAME_SESSION_KEY, '{壊れた');
        expect(isLiveSessionProtected()).toBe(false);
    });

    it('鍵の名前を公開している（復元側が参照する）', () => {
        expect(GAME_SESSION_KEY).toBe('minibasket-game-session');
    });
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/utils/gameSessionStorage.protect.test.ts`
Expected: FAIL。`GAME_SESSION_KEY` と `isLiveSessionProtected` が export されていないため、インポートで全件が落ちる。

- [ ] **Step 3: 実装**

`src/utils/gameSessionStorage.ts` の9行目を `export` にする:

```ts
/** 中断セッションのキー。復元・取り込み側が「書き換えてはいけないもの」として参照する */
export const GAME_SESSION_KEY = 'minibasket-game-session';
```

ファイル末尾（`getGameSessionState` の直後）に足す:

```ts
/**
 * 復元・取り込みが中断セッションを書き換えてはいけないか。
 *
 * 記録中の試合と、終了したが未保存の試合を守る。どちらもまだ履歴に入って
 * いない＝この世に1つしかない記録で、復元が上書きすると作りかけの記録が消える。
 *
 * 読めないセッションは守らない。中身が壊れていて復元で上書きできるなら、
 * そのほうがよい。鍵の有無だけを見る hasGameSession では、壊れたものまで
 * 守ってしまい、正しい控えから戻す道を塞ぐ。
 *
 * 判定をここに置くのは、このキーを所有しているのがこのモジュールだからである。
 * 呼び出し側に委ねると、復元経路が増えたときに忘れられる（実際 mirrorBackup が
 * dataBackup と同じ判断を持たないまま出荷されていた）。
 */
export function isLiveSessionProtected(): boolean {
    return getGameSessionState() !== 'none';
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/utils/gameSessionStorage`
Expected: PASS（新規5件と既存のセッション系テストすべて）

Run: `npx tsc -b`
Expected: 出力なし

- [ ] **Step 5: コミット**

```bash
git add src/utils/gameSessionStorage.ts src/utils/gameSessionStorage.protect.test.ts
```

件名 `feat(session): 守るべき試合があるかの判定を1つ置く`。本文で「なぜ gameSessionStorage に置くか」「なぜ hasGameSession ではなく getGameSessionState か」「終了・未保存も守る理由」を説明する。

---

### Task 2: 2つの復元経路を揃える

**Files:**
- Modify: `src/utils/mirrorBackup.ts`
- Modify: `src/utils/dataBackup.ts`
- Test: `src/utils/mirrorBackup.restore.test.ts`（追記）

**Interfaces:**
- Consumes: Task 1 の `GAME_SESSION_KEY` / `isLiveSessionProtected`
- Produces: なし（既存関数の挙動変更のみ）

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/mirrorBackup.restore.test.ts` の末尾（最後の `});` の後）に足す。既存の `snapshot` 定数はセッションキーを含まないので、この describe 用に別の控えを作る:

```ts
// 記録中の復元が、進行中の試合を消さないこと。
//
// 実測（Playwright・本番ビルド）: 記録中に控えから戻すと、復元した
// セッションがリロードの pagehide で書き戻され、無言で元へ戻っていた。
// 試合履歴やチームは戻るので、利用者には区別が付かない。
//
// dataBackup の取り込みは「端末に進行中セッションが無い場合のみ復元」と
// 書いて既に守っている。こちらにだけ同じ判断が無かった。
describe('restoreSnapshot と進行中の試合', () => {
    const withSession: MirrorSnapshot = {
        timestamp: 2,
        entries: {
            'minibasket-my-teams': '[{"id":"t1"}]',
            'minibasket-game-session': '{"game":{"phase":"playing"},"gameName":"控えの試合","date":"2026-04-01","savedAt":"2026-04-01T00:00:00.000Z"}',
        },
    };

    /** いま記録中の試合を localStorage に置く */
    function liveGame() {
        localStorage.setItem(
            'minibasket-game-session',
            '{"game":{"phase":"playing"},"gameName":"いまの試合","date":"2026-04-10","savedAt":"2026-04-10T00:00:00.000Z"}',
        );
    }

    it('守るべき試合があるとき、セッションだけ書き換えない', () => {
        liveGame();

        expect(restoreSnapshot(withSession)).toBe(true);
        // 他のキーは戻る
        expect(localStorage.getItem('minibasket-my-teams')).toBe('[{"id":"t1"}]');
        // 進行中の試合はそのまま
        expect(localStorage.getItem('minibasket-game-session')).toContain('いまの試合');
    });

    it('守るべき試合が無ければ、セッションも控えのとおりに戻す', () => {
        expect(restoreSnapshot(withSession)).toBe(true);
        expect(localStorage.getItem('minibasket-game-session')).toContain('控えの試合');
    });

    it('読めないセッションは守らない（正しい控えから戻せる）', () => {
        localStorage.setItem('minibasket-game-session', '{壊れた');
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.spyOn(console, 'error').mockImplementation(() => { });

        expect(restoreSnapshot(withSession)).toBe(true);
        expect(localStorage.getItem('minibasket-game-session')).toContain('控えの試合');
    });
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/utils/mirrorBackup.restore.test.ts`
Expected: FAIL。「守るべき試合があるとき、セッションだけ書き換えない」が
`expected '…控えの試合…' to contain 'いまの試合'` で落ちる。他の2件は通る。

- [ ] **Step 3: `restoreSnapshot` を直す**

`src/utils/mirrorBackup.ts` の import に足す:

```ts
import { GAME_SESSION_KEY, isLiveSessionProtected } from './gameSessionStorage';
```

`restoreSnapshot` の先頭（`const entries = ...` の行）を差し替える:

```ts
export function restoreSnapshot(snapshot: MirrorSnapshot): boolean {
    // 記録中の試合と、終了したが未保存の試合は書き換えない。
    //
    // 実測: 記録中に戻すと、復元したセッションがリロードの pagehide で
    // useGameAutoSave に書き戻され、無言で元へ返っていた。履歴やチームは
    // 戻るので利用者には区別が付かない。結果が正しく見えることもあったが、
    // それは控えを取った時刻（セッションを含むか）で決まる事故だった。
    //
    // dataBackup の取り込みは同じ判断を既に持っている。片方だけが解いて
    // いる状態を残さない。
    const entries = Object.entries(snapshot.entries)
        .filter(([key]) => !(key === GAME_SESSION_KEY && isLiveSessionProtected()));
    const previous = entries.map(([key]) => [key, localStorage.getItem(key)] as const);
    ...
```

（`previous` 以降は変更しない。除外したキーは `entries` に無いので、巻き戻しの対象にもならない。）

- [ ] **Step 4: `dataBackup` の条件を揃える**

`src/utils/dataBackup.ts` の13行目:

```ts
import { loadGameSession, hasGameSession } from './gameSessionStorage';
```

を次に変える:

```ts
import { loadGameSession, isLiveSessionProtected } from './gameSessionStorage';
```

`hasGameSession` が他で使われていないことを確かめる:

Run: `grep -n "hasGameSession" src/utils/dataBackup.ts`
Expected: 出力なし（この差し替えで最後の1箇所が消える）

1197〜1198行を差し替える:

```ts
        // 進行中の試合セッションのインポート。
        //
        // 守るべき試合（記録中・終了して未保存）があるときは復元しない。
        // 判定を mirrorBackup と共有して、2つの復元経路が別々の条件を持つ
        // 状態にしない。以前は hasGameSession（鍵の有無）で見ていたため、
        // 壊れて読めないセッションが残っている端末では、正しい控えから
        // 戻すこともできなかった
        let sessionRestored = false;
        if (data.data.gameSession && !isLiveSessionProtected()) {
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npx vitest run src/utils/mirrorBackup src/utils/dataBackup src/utils/gameSessionStorage`
Expected: PASS（新規3件を含め、ミラー・バックアップ・セッションのテストすべて）

Run: `npx tsc -b`
Expected: 出力なし

- [ ] **Step 6: コミット**

```bash
git add src/utils/mirrorBackup.ts src/utils/dataBackup.ts src/utils/mirrorBackup.restore.test.ts
```

件名 `fix(restore): 記録中の復元が進行中の試合を消さないようにする`。本文で実測の内容、`dataBackup` が既に解いていた非対称、`hasGameSession` → `isLiveSessionProtected` の挙動変更（壊れたセッションが復元を塞がなくなる）を説明する。

---

### Task 3: 画面の振る舞いと文言

**Files:**
- Modify: `src/components/Settings/AppSettingsModal.tsx`
- Modify: `src/components/Settings/MirrorBackupList.tsx`
- Test: `src/components/Settings/AppSettingsModal.restoreUi.test.tsx`（追記）
- Test: `src/components/Settings/MirrorBackupList.test.tsx`（追記）

**Interfaces:**
- Consumes: Task 1 の `isLiveSessionProtected`
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

`src/components/Settings/MirrorBackupList.test.tsx` の末尾に足す。

このファイルは `vi.mock('../../utils/mirrorBackup')` でモジュール全体を差し替えており、`beforeEach` で各モックを `mockReset()` している。**そのため新しい describe でも `getSnapshotMetas.mockResolvedValue([...])` を自分で用意しないと一覧が空になり、「この時点に戻す」ボタンが出ない。** また既存の `beforeEach` は `localStorage` を消していないので、セッションを置くテストは自分で後始末する:

```ts
// 記録中は、確認ダイアログの言うことが変わる。
//
// 「現在のチーム・試合履歴・設定は上書きされます」「戻したあと再読み込みします」は
// どちらも記録中には当てはまらない。進行中の試合は書き換えず、リロードもしない。
// 当てはまらないことを言うと、戻せなかったのだと読まれる。
describe('記録中の確認ダイアログ', () => {
    /** 一覧に1件だけ出す（このファイルは mirrorBackup を丸ごとモックしている） */
    function oneSnapshot() {
        getSnapshotMetas.mockResolvedValue([metaOf(new Date('2026-08-06T10:00:00').getTime(), 'startup')]);
    }

    /** 記録中の試合を置く */
    function liveGame() {
        localStorage.setItem(
            'minibasket-game-session',
            '{"game":{"phase":"playing"},"gameName":"いまの試合","date":"2026-04-10","savedAt":"2026-04-10T00:00:00.000Z"}',
        );
    }

    afterEach(() => localStorage.clear());

    async function openConfirm() {
        render(<MirrorBackupList onRestored={RELOAD} />);
        fireEvent.click(await screen.findByRole('button', { name: 'この時点に戻す' }));
        return screen.findByRole('dialog');
    }

    it('進行中の試合はそのまま続くと伝え、再読み込みとは言わない', async () => {
        oneSnapshot();
        liveGame();

        const dialog = await openConfirm();
        expect(within(dialog).getByText(/進行中の試合はそのまま続きます/)).toBeTruthy();
        expect(within(dialog).queryByText(/再読み込みします/)).toBeNull();
    });

    it('記録中でなければ、従来どおり再読み込みすると伝える', async () => {
        oneSnapshot();

        const dialog = await openConfirm();
        expect(within(dialog).getByText(/再読み込みします/)).toBeTruthy();
        expect(within(dialog).queryByText(/進行中の試合はそのまま続きます/)).toBeNull();
    });
});
```

`src/components/Settings/AppSettingsModal.restoreUi.test.tsx` の末尾に足す:

```ts
// 記録中はリロードしない。
//
// リロードすると記録者は試合画面から弾き出され、ホームの「試合を再開」を
// 押し直すことになる。体育館でそれをさせる理由が無い。履歴もチームも
// 開いた時点で読み直されるので、表示が古いまま残ることもない。
describe('復元後のリロード', () => {
    it('記録中は呼ばない', () => {
        localStorage.setItem(
            'minibasket-game-session',
            '{"game":{"phase":"playing"},"gameName":"いまの試合","date":"2026-04-10","savedAt":"2026-04-10T00:00:00.000Z"}',
        );
        expect(shouldReloadAfterRestore()).toBe(false);
    });

    it('記録中でなければ呼ぶ', () => {
        expect(shouldReloadAfterRestore()).toBe(true);
    });
});
```

このテストのために `AppSettingsModal.tsx` から次を export する（`window.location.reload` を jsdom で差し替えるより、判断だけを切り出して検査するほうが確か）:

```ts
export function shouldReloadAfterRestore(): boolean
```

import 行に足すこと:

```ts
import { AppSettingsModal, shouldReloadAfterRestore } from './AppSettingsModal';
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/components/Settings/`
Expected: FAIL。`shouldReloadAfterRestore` が存在せずインポートで落ち、`MirrorBackupList` の文言テストは
`Unable to find an element with the text: /進行中の試合はそのまま続きます/` で落ちる。

- [ ] **Step 3: 文言を場合分けする**

`src/components/Settings/MirrorBackupList.tsx` の import に足す:

```ts
import { isLiveSessionProtected } from '../../utils/gameSessionStorage';
```

`ConfirmModal` の `message` を差し替える（138〜144行付近）:

```tsx
                <ConfirmModal
                    title="この時点に戻しますか？"
                    message={
                        `${new Date(pending.timestamp).toLocaleString('ja-JP')}（${reasonLabel(pending.reason)}）の状態に戻します。\n` +
                        '現在のチーム・試合履歴・設定は、この時点の内容で上書きされます。\n' +
                        // 記録中は言うことが変わる。進行中の試合は書き換えず、
                        // リロードもしない。当てはまらないことを言うと、
                        // 戻せなかったのだと読まれる。戻るものを並べて伝える
                        (isLiveSessionProtected()
                            ? '進行中の試合はそのまま続きます。戻るのは試合履歴・チーム・設定です。'
                            : '戻したあとアプリを再読み込みします。')
                    }
```

- [ ] **Step 4: リロードを止める**

`src/components/Settings/AppSettingsModal.tsx` の import に足す:

```ts
import { isLiveSessionProtected } from '../../utils/gameSessionStorage';
```

コンポーネント定義の外（ファイル内のトップレベル）に足す:

```ts
/**
 * 復元のあとに読み込み直すか。
 *
 * 記録中は読み込み直さない。リロードすると記録者は試合画面から弾き出され、
 * ホームの「試合を再開」を押し直すことになる。履歴もチームも開いた時点で
 * 読み直されるので、表示が古いまま残ることはない（Home が「描画のたびに
 * 読み直す」と決めているのと同じ理由）。
 *
 * 判断だけを切り出すのは、jsdom で window.location.reload を差し替えずに
 * 検査できるようにするため。
 */
export function shouldReloadAfterRestore(): boolean {
    return !isLiveSessionProtected();
}
```

788行を差し替える:

```tsx
<MirrorBackupList onRestored={() => { if (shouldReloadAfterRestore()) window.location.reload(); }} />
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npx vitest run src/components/Settings/`
Expected: PASS（新規4件と既存の設定画面テストすべて）

Run: `npx tsc -b`
Expected: 出力なし

- [ ] **Step 6: コミット**

```bash
git add src/components/Settings/MirrorBackupList.tsx src/components/Settings/AppSettingsModal.tsx src/components/Settings/MirrorBackupList.test.tsx src/components/Settings/AppSettingsModal.restoreUi.test.tsx
```

件名 `feat(settings): 記録中の復元では、リロードせず進行中の試合が続くと伝える`。本文で「なぜリロードしないか」「なぜ文言を場合分けするか」「判断を関数に切り出した理由」を説明する。

---

### Task 4: 実ブラウザでの通し

**Files:**
- Create: `e2e/restoreDuringGame.spec.ts`

**Interfaces:**
- Consumes: `e2e/fixtures/seedGame.ts` の `seedInProgressGame` / `IN_PROGRESS_PLAYER_NAME`
- Produces: なし

- [ ] **Step 1: e2e を書く**

今回の事故は `pagehide` という実ブラウザでしか踏めない経路で起きた。jsdom のテストだけを足しても同じ失敗をもう一度通すので、通しを1本置く。

`e2e/restoreDuringGame.spec.ts` を新規作成:

```ts
// 記録中に端末内の控えから戻しても、進行中の試合が消えないことを確かめる。
//
// 直していたころの実測: 復元した中断セッションが、リロードの pagehide で
// useGameAutoSave に書き戻され、無言で元へ返っていた。試合履歴やチームは
// 戻るので、利用者には区別が付かない。
//
// pagehide は jsdom では本物の遷移を伴わないため、この経路は実ブラウザで
// しか踏めない。既存の4本（オフライン起動・戻る操作・自動保存のフラッシュ・
// ミラー復元）を足したときと同じ判断で、ここにも1本置く。

import { expect, test } from '@playwright/test';
import { IN_PROGRESS_PLAYER_NAME, seedInProgressGame } from './fixtures/seedGame';

const SESSION_KEY = 'minibasket-game-session';
const TEAMS_KEY = 'minibasket-my-teams';

test('記録中に控えから戻しても、進行中の試合はそのまま続く', async ({ page }) => {
    await seedInProgressGame(page);

    // 1. 開く。起動時の控えが IndexedDB に入る（この時点の試合は0点）
    await page.goto('./');
    await expect
        .poll(() => page.evaluate(() => new Promise<number>(resolve => {
            const request = indexedDB.open('mbc-mirror-backup');
            request.onsuccess = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('snapshots')) { resolve(0); db.close(); return; }
                const countRequest = db.transaction('snapshots', 'readonly').objectStore('snapshots').count();
                countRequest.onsuccess = () => { resolve(countRequest.result); db.close(); };
                countRequest.onerror = () => { resolve(0); db.close(); };
            };
            request.onerror = () => resolve(0);
        })))
        .toBeGreaterThan(0);

    // 2. 試合を再開して1本決める（控えとの差をつくる）
    await page.getByRole('button', { name: /試合を再開/ }).click();
    await page.getByRole('button', { name: new RegExp(IN_PROGRESS_PLAYER_NAME) }).click();
    await page.getByRole('button', { name: '2Pシュート' }).click();
    await page.locator('.score-selector .score-option.success').click();
    await expect(page.locator('.team-a-block .score-display')).toHaveText('2');

    // 3. マイチームを壊す（＝控えから戻したくなる状況をつくる）
    await page.evaluate((k) => window.localStorage.setItem(k, '[]'), TEAMS_KEY);

    // 4. 記録中のまま、設定 → データ管理 → 端末内の自動バックアップ から戻す
    await page.getByRole('button', { name: '試合オプション' }).click();
    await page.getByRole('button', { name: /アプリ設定・バックアップ/ }).click();
    await page.getByRole('button', { name: /データ管理/ }).click();
    await page.getByRole('button', { name: 'この時点に戻す' }).first().click();

    // 記録中は「進行中の試合はそのまま続きます」と言う
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/進行中の試合はそのまま続きます/)).toBeVisible();
    await dialog.getByRole('button', { name: '戻す' }).click();

    // 5. マイチームは戻り、進行中の試合は残っている
    await expect.poll(() => page.evaluate((k) => window.localStorage.getItem(k), TEAMS_KEY))
        .not.toBe('[]');

    const points = await page.evaluate((k) => {
        const raw = window.localStorage.getItem(k);
        if (!raw) return null;
        const s = JSON.parse(raw) as { game: { teamA: { players: { stats: { points: number } }[] } } };
        return s.game.teamA.players.reduce((n, p) => n + p.stats.points, 0);
    }, SESSION_KEY);
    expect(points).toBe(2);
});
```

- [ ] **Step 2: 通ることを確かめる**

Run: `npm run build`
Expected: 成功（e2e はビルド済み dist に対して回る）

Run: `npx playwright test e2e/restoreDuringGame.spec.ts --reporter=list`
Expected: PASS（1件）

Run: `npm run test:e2e`
Expected: PASS（9件）

- [ ] **Step 3: コミット**

```bash
git add e2e/restoreDuringGame.spec.ts
```

件名 `test(e2e): 記録中の復元で進行中の試合が消えないことを実ブラウザで固定する`。本文で「なぜ jsdom では守れないか（pagehide）」を説明する。

---

### Task 5: 説明書

**Files:**
- Modify: `public/manual.html`

**Interfaces:**
- Consumes: Task 3 の文言
- Produces: なし

- [ ] **Step 1: 16章の「端末内の自動バックアップ」に足す**

`public/manual.html` の info-box「戻す前に、いまの状態の控えを自動で取ります」の**直後**に、次を挿入する:

```html
<div class="info-box">
  <div class="box-title">記録中に戻しても、その試合は消えません</div>
  試合を記録している最中に「この時点に戻す」を実行した場合、
  <strong>進行中の試合はそのまま続きます</strong>。戻るのは試合履歴・チーム・設定です。
  記録中はアプリの再読み込みも行わないので、設定画面を閉じればそのまま記録を続けられます。
  <br>
  終了した試合をまだ保存していない場合も同じく、その試合は戻されません。
</div>
```

- [ ] **Step 2: 版数テストが通ることを確かめる**

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

件名 `docs(manual): 記録中に控えから戻したときの扱いを書く`。本文で「なぜ書くか（戻せなかったと読まれないため）」を説明する。

---

## 実機確認（全タスク完了後）

`npm run build && npm run preview` で本番ビルドを立ち上げ、ブラウザで:

1. 試合を記録中に、設定 → データ管理 → 端末内の自動バックアップ から戻す
2. 確認ダイアログに「進行中の試合はそのまま続きます」が出ること
3. 戻したあと、リロードされずに設定画面のままであること
4. 設定を閉じると試合画面に戻り、得点が消えていないこと
5. 試合をしていない状態で同じ操作をすると、従来どおり「再読み込みします」と出てリロードされること
