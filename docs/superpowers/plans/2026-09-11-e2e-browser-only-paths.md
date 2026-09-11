# jsdom で踏めない経路を e2e で守る 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Service Worker によるオフライン起動・端末の戻る操作・`pagehide` でのフラッシュ・実 IndexedDB という、jsdom では原理的に検証できない4経路に e2e を1本ずつ足す。

**Architecture:** `e2e/` に1ファイル1領域で4本追加する。既存の `e2e/fixtures/seedGame.ts` に「初回読み込みのときだけ注入する」仕組みと「進行中の試合を仕込む」関数を足す。`deploy` のゲート昇格は見送り、判断時期を `ci.yml` のコメントに書き残す。

**Tech Stack:** Playwright 1.62 / Chromium（`playwright.config.ts` の既存設定をそのまま使う。`npm run preview` でビルド済み `dist` を配って回す）

## Global Constraints

- **e2e の持ち場は「jsdom で踏めない経路」に限る。** 記録ロジックそのものは単体テスト（2319件）が守っている。重複させない
- **見た目の比較（スクリーンショット）はしない。** 手元(Windows)とCI(Linux)でフォントが違い基準画像が食い違う
- **`deploy` の `needs` は `test-and-build` のまま変えない。** 変えてよいのはコメントだけ
- **既存の `e2e/scoresheet.spec.ts` 3件は無変更で通り続けること。** フィクスチャの既定挙動を変えない
- **待ちは固定時間を使わない。** `expect.poll` か Playwright の自動待機で条件を待つ
- ファイル冒頭には「なぜこのテストが要るか」を書く。このリポジトリのテストは全ファイルがその形になっている
- テストは日本語名。既存 e2e・単体テストと揃える

---

### Task 1: オフライン起動（Service Worker）

**Files:**
- Create: `e2e/offline.spec.ts`

**Interfaces:**
- Consumes: `e2e/fixtures/seedGame.ts` の `seedRecordedGame(page)` と `GAME_NAME`（既存・無変更）
- Produces: なし（後続タスクはこのファイルに依存しない）

**背景（実装者向け）:** `vite.config.ts` は `registerType: 'prompt'` で、`clientsClaim` を使わない。試合中に足元のチャンクが入れ替わるのを防ぐための判断。その結果、**初回読み込みではページが SW の制御下に入らない**。制御下に入るのは次の読み込みから。この順序を踏まないとオフライン化しても precache から返らない。

- [ ] **Step 1: テストを書く**

`e2e/offline.spec.ts`:

```ts
// 通信が切れてもアプリが起動することを、実ブラウザで確かめる。
//
// これはこのアプリの中核の約束（体育館ではほぼオフライン）だが、jsdom には
// Service Worker が存在しないため、単体テストでは一行も踏めていない。
// vite.config.ts には「1本でも落ちると SW の install ごと失敗し、オフライン
// 記録まで道連れになる」という判断が書かれているが、それが守られているかを
// 確かめる手立てが今まで無かった。
//
// registerType: 'prompt' は clientsClaim を使わない（試合中に足元のチャンクが
// 入れ替わらないようにするため）。そのため初回読み込みでは SW が install /
// activate されても、そのページは制御下に入らない。読み込み直して初めて
// 制御下に入る。この順序を踏まないと precache から返らない。

import { expect, test } from '@playwright/test';
import { GAME_NAME, seedRecordedGame } from './fixtures/seedGame';

test('通信を切っても、アプリが起動して試合履歴まで開ける', async ({ page, context }) => {
    await seedRecordedGame(page);

    // 1. 初回。SW が登録・有効化されるが、このページはまだ制御下に入らない
    await page.goto('./');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

    // 2. 読み込み直して制御下に入る
    await page.reload();
    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
        .toBe(true);

    // 3. 通信を切る。route.abort() ではなく context 側で切るのは、
    //    SW 自身の fetch も含めて本当に届かない状態を作るため
    await context.setOffline(true);

    // 4. オフラインのまま読み込み直す
    await page.reload();

    // index.html が precache から返っている
    await expect(page.getByRole('button', { name: /新規試合開始/ })).toBeVisible();

    // JSチャンクも読めていて React が動いていること。ホームの描画だけだと
    // 「index.html が返っただけ」でも通ってしまうので、遷移まで見る
    await page.getByRole('button', { name: /試合履歴/ }).click();
    await expect(page.getByRole('heading', { name: '試合履歴' })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(GAME_NAME) })).toBeVisible();
});
```

- [ ] **Step 2: ビルドしてテストを走らせ、通ることを確かめる**

e2e は `npm run preview`（= ビルド済み `dist`）に対して回る。先にビルドが要る。

Run:
```bash
npm run build && npx playwright test e2e/offline.spec.ts
```
Expected: PASS（1 passed）

- [ ] **Step 3: 実装を壊して、テストが赤くなることを確かめる**

通っただけでは「何も検証していないテスト」かどうか分からない。precache から `index.html` を外す。

`vite.config.ts` の `globIgnores` を一時的に次へ変える（`'index.html'` を追加）:

```ts
globIgnores: [...STANDALONE_PAGES, 'vite.svg', 'screenshots/**', 'splash/**', 'tesseract/**', 'index.html'],
```

Run:
```bash
npm run build && npx playwright test e2e/offline.spec.ts
```
Expected: FAIL（オフライン読み込み後に「新規試合開始」が見えず、`toBeVisible` がタイムアウトする）

- [ ] **Step 4: 壊した箇所を戻し、再び通ることを確かめる**

`vite.config.ts` の `globIgnores` を元に戻す:

```ts
globIgnores: [...STANDALONE_PAGES, 'vite.svg', 'screenshots/**', 'splash/**', 'tesseract/**'],
```

Run:
```bash
git diff --exit-code vite.config.ts && npm run build && npx playwright test e2e/offline.spec.ts
```
Expected: `git diff --exit-code` が無出力（戻し漏れが無い）、テストは PASS

- [ ] **Step 5: コミット**

```bash
git add e2e/offline.spec.ts
git commit -m "test(e2e): 通信を切ってもアプリが起動することを実ブラウザで確かめる"
```

---

### Task 2: 端末の戻る操作

**Files:**
- Create: `e2e/backNavigation.spec.ts`

**Interfaces:**
- Consumes: `seedRecordedGame(page)`（既存・無変更）
- Produces: なし

**背景（実装者向け）:** `src/hooks/useScreenHistorySync.ts` は「実測(v1.6.14・実ブラウザ)」というコメントが並ぶ領域で、手で確かめるしかなかった。ホーム画面は履歴の基点でエントリを持たないため、**ホームでモーダルを開いている間だけ戻る用のエントリを1つ積む**（`modalGuard`）。積まないと popstate 自体が起きず、閉じるどころか PWA ごと終了する。2本目のテストはそこを固定する。

- [ ] **Step 1: テストを書く**

`e2e/backNavigation.spec.ts`:

```ts
// 端末の戻る操作（Androidの戻るボタン／エッジスワイプ）が、実ブラウザで
// 期待どおりの階層で効くことを確かめる。
//
// jsdom にも history はあるが popstate の挙動が実物と違う。useScreenHistorySync
// のコメントに「実測(v1.6.14・実ブラウザ)」が並ぶのはそのためで、ここは手で
// 確かめるしかなかった領域だった。過去の修正がいちばん多い場所でもある。
//
// 2本目が要点。ホームは履歴の基点でエントリを持たないため、モーダルを開いて
// いる間だけ戻る用のエントリを1つ積んでいる（modalGuard）。積まないと popstate
// 自体が起きず、モーダルが閉じるどころか PWA ごと終了していた。

import { expect, test } from '@playwright/test';
import { seedRecordedGame } from './fixtures/seedGame';

test.beforeEach(async ({ page }) => {
    await seedRecordedGame(page);
    await page.goto('./');
});

test('戻る操作で、試合履歴からホームへ帰る', async ({ page }) => {
    await page.getByRole('button', { name: /試合履歴/ }).click();
    await expect(page.getByRole('heading', { name: '試合履歴' })).toBeVisible();

    await page.goBack();

    await expect(page.getByRole('button', { name: /新規試合開始/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: '試合履歴' })).toBeHidden();
});

test('ホームでモーダルを開いて戻ると、モーダルだけ閉じてホームに残る', async ({ page }) => {
    await page.getByRole('button', { name: '設定' }).click();
    const dialog = page.getByRole('dialog', { name: 'アプリ設定' });
    await expect(dialog).toBeVisible();

    await page.goBack();

    // モーダルは閉じる
    await expect(dialog).toBeHidden();
    // ホームからは出ない（ここが崩れると PWA ごと終了していた）
    await expect(page.getByRole('button', { name: /新規試合開始/ })).toBeVisible();
});
```

- [ ] **Step 2: テストを走らせ、通ることを確かめる**

Run:
```bash
npx playwright test e2e/backNavigation.spec.ts
```
Expected: PASS（2 passed）

`dist` は Task 1 で最新化済み。この時点で `npm run build` は不要。

- [ ] **Step 3: 実装を壊して、テストが赤くなることを確かめる**

`src/components/Modal/modalStack.ts` の `closeTopModal` を一時的に「誰も閉じない」ようにする。

壊す場所を呼び出し側（`useScreenHistorySync.ts` の `const closed = closeTopModal();`）にしないのは、そこを `null` に置き換えると `closed` の型が `null` に狭まり、後段の `closed === 'received'` が「重なりの無い比較」として **`tsc -b` のエラーになる**ため。`npm run build` が通らず、テストまで辿り着けない。戻り値の型が宣言されている関数側で潰せば型は保たれる。

次の行を探す:

```ts
export function closeTopModal(): CloseTopModalResult {
    const top = stack[stack.length - 1];
```

`return null;` を差し込む:

```ts
export function closeTopModal(): CloseTopModalResult {
    return null;
    const top = stack[stack.length - 1];
```

Run:
```bash
npm run build && npx playwright test e2e/backNavigation.spec.ts
```
Expected: 2本目が FAIL（モーダルを閉じずに画面遷移として扱われるため、「新規試合開始」が見えなくなる）。1本目は PASS のまま

- [ ] **Step 4: 壊した箇所を戻し、再び通ることを確かめる**

Run:
```bash
git checkout src/components/Modal/modalStack.ts && npm run build && npx playwright test e2e/backNavigation.spec.ts
```
Expected: PASS（2 passed）

- [ ] **Step 5: コミット**

```bash
git add e2e/backNavigation.spec.ts
git commit -m "test(e2e): 端末の戻る操作が期待どおりの階層で効くことを確かめる"
```

---

### Task 3: 自動保存と再開（`pagehide` のフラッシュ）

**Files:**
- Modify: `e2e/fixtures/seedGame.ts`
- Create: `e2e/sessionResume.spec.ts`

**Interfaces:**
- Consumes: `seedGame.ts` の既存の module-private ヘルパー `buildPlayers` / `buildTeam` / `toSavedTeam`、および `GAME_NAME` / `TEAM_A_NAME` / `TEAM_B_NAME` / `GAME_DATE`
- Produces:
  - `async function inject(page: Page, entries: [string, string][], once: boolean): Promise<void>`（module-private）
  - `export async function seedInProgressGame(page: Page): Promise<void>`
  - `export const IN_PROGRESS_PLAYER_NAME: string`（値は `'田中 陽翔'`。Task 3 のテストが選手カードを引くのに使う）

**背景（実装者向け）:** `page.addInitScript` は**毎回のページ読み込み前**に走る。リロードを挟む検証では、記録した内容が元のフィクスチャで上書きされてしまい必ず落ちる。そこで「初回だけ注入する」仕組みを入れる。sessionStorage はタブ内のリロードをまたいで残るので、目印に使える。

- [ ] **Step 1: フィクスチャに注入ヘルパーと進行中セッションを足す**

`e2e/fixtures/seedGame.ts` の import に追記:

```ts
import type { FoulEntry, FoulType, Game, Player, ScoreEntry, ScoreType, Team } from '../../src/types/game';
import { createInitialGame, createInitialGameInfo, createPlayer, createTeam } from '../../src/types/game';
```

キー定数の並びに追記（既存の `HISTORY_KEY` / `MY_TEAMS_KEY` の下）:

```ts
const SESSION_KEY = 'minibasket-game-session';

/** 初回読み込みのときだけ注入するための目印。
 *  アプリが使う 'mbc-restore-dismissed' / 'voicememo-session' と衝突しない名前にする */
const SEEDED_FLAG = 'e2e-seeded';
```

ファイル末尾（既存の `seedRecordedGame` の手前）に追記:

```ts
/**
 * localStorage へ注入する。
 *
 * addInitScript は「毎回のページ読み込み前」に走る。リロードを挟む検証
 * （自動保存・ミラー復元）では、記録した内容や消したはずのデータが元の
 * フィクスチャで上書きされてしまう。once を立てると sessionStorage の目印で
 * 初回だけに絞る。sessionStorage はタブ内のリロードをまたいで残る。
 */
async function inject(page: Page, entries: [string, string][], once: boolean): Promise<void> {
    await page.addInitScript(
        (payload: { entries: [string, string][]; once: boolean; flag: string }) => {
            if (payload.once) {
                if (window.sessionStorage.getItem(payload.flag)) return;
                window.sessionStorage.setItem(payload.flag, '1');
            }
            for (const [key, value] of payload.entries) window.localStorage.setItem(key, value);
        },
        { entries, once, flag: SEEDED_FLAG },
    );
}

/** 進行中セッションのフィクスチャで使う teamA の選手名（テストが選手カードを引くのに使う） */
export const IN_PROGRESS_PLAYER_NAME = '田中 陽翔';

/**
 * 第1Q進行中・両チーム5人がコート上の中断セッションを仕込む（page.goto の前に呼ぶ）。
 *
 * マイチームも同時に入れる。ホームは登録マイチームが1件も無いとメニューを出さず
 * 登録案内だけを表示するため（Home.tsx の hasMyTeams）、セッションだけでは
 * 「試合を再開」に辿り着けない。
 *
 * 注入は初回だけ。記録したあとリロードする検証で使うので、毎回入れ直すと
 * 記録が消えて必ず落ちる。
 */
export async function seedInProgressGame(page: Page): Promise<void> {
    const teamA = buildTeam('teamA', TEAM_A_NAME, '佐藤 太郎', buildPlayers('a', [
        [4, IN_PROGRESS_PLAYER_NAME], [5, '佐藤 蓮'], [6, '鈴木 大和'], [7, '高橋 湊'], [8, '伊藤 陽菜'],
    ]), 'white');
    const teamB = buildTeam('teamB', TEAM_B_NAME, '鈴木 花子', buildPlayers('b', [
        [4, '渡辺 悠真'], [5, '山本 結愛'], [6, '中村 律'], [7, '小林 芽依'], [8, '加藤 樹'],
    ]), 'blue');

    // 第1Qだけ進行中にする（buildPlayers は全Qを 'starter' にするので上書きする）
    for (const team of [teamA, teamB]) {
        for (const player of team.players) {
            player.isOnCourt = true;
            player.quartersPlayed = ['starter', false, false, false];
        }
    }

    const game: Game = {
        ...createInitialGame(),
        teamA,
        teamB,
        phase: 'playing',
        currentQuarter: 1,
    };

    await inject(page, [
        [SESSION_KEY, JSON.stringify({
            game,
            gameName: GAME_NAME,
            date: '2026-08-15',
            savedAt: GAME_DATE,
        })],
        [MY_TEAMS_KEY, JSON.stringify([toSavedTeam(teamA)])],
    ], true);
}
```

既存の `seedRecordedGame` の本体を `inject` 経由に差し替える（振る舞いは変えない。`once` は false）:

```ts
export async function seedRecordedGame(page: Page, record: GameRecord = FINISHED_GAME): Promise<void> {
    await inject(page, [
        [HISTORY_KEY, JSON.stringify([record])],
        [MY_TEAMS_KEY, JSON.stringify([toSavedTeam(record.teamA)])],
    ], false);
}
```

- [ ] **Step 2: 既存3件が無変更で通ることを確かめる**

フィクスチャに手を入れたので、先に回帰を見る。

Run:
```bash
npx playwright test e2e/scoresheet.spec.ts
```
Expected: PASS（3 passed）

- [ ] **Step 3: テストを書く**

`e2e/sessionResume.spec.ts`:

```ts
// 記録した直後に端末が落ちても、その記録が残っていることを確かめる。
//
// useGameAutoSave は 500ms のデバウンスで中断セッションへ書く。PWA は
// バックグラウンドに回った時点で OS に凍結・破棄されうるので、待ちに入ったまま
// 落とされると直前の得点が残らない。そのため visibilitychange(hidden) と
// pagehide でデバウンスを待たずに書き出している。
//
// jsdom でもイベントは模せるが、リロードで本当に発火するか・本当に間に合うかは
// 実ブラウザでしか確かめられない。

import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { IN_PROGRESS_PLAYER_NAME, seedInProgressGame } from './fixtures/seedGame';

/** スコアボードの白チーム側の得点 */
const teamAScore = (page: Page) => page.locator('.team-a-block .score-display');

test('記録した直後に読み込み直しても、その1点が残っている', async ({ page }) => {
    await seedInProgressGame(page);
    await page.goto('./');

    await page.getByRole('button', { name: /試合を再開/ }).click();
    await expect(teamAScore(page)).toHaveText('0');

    // 選手カード → 2Pボタン（タップでセレクターが開く）→ 成功
    await page.getByRole('button', { name: new RegExp(IN_PROGRESS_PLAYER_NAME) }).click();
    await page.getByRole('button', { name: '2Pシュート' }).click();
    await page.getByRole('button', { name: '2P成功' }).click();

    await expect(teamAScore(page)).toHaveText('2');

    // デバウンス(500ms)の満了を待たずに読み込み直す。待ってしまうと通常の保存で
    // 通ってしまい、検証したい pagehide のフラッシュ経路を踏まない
    await page.reload();

    await page.getByRole('button', { name: /試合を再開/ }).click();
    await expect(teamAScore(page)).toHaveText('2');
});
```

- [ ] **Step 4: テストを走らせ、通ることを確かめる**

Run:
```bash
npx playwright test e2e/sessionResume.spec.ts
```
Expected: PASS（1 passed）

- [ ] **Step 5: 実装を壊して、テストが赤くなることを確かめる**

`src/hooks/useGameAutoSave.ts` のフラッシュを一時的に無効化する。次の行を探す:

```ts
        const flush = () => {
            const current = latestRef.current;
```

`const current` の直前に `return;` を差し込む:

```ts
        const flush = () => {
            return;
            const current = latestRef.current;
```

（`npm run lint` は通らなくなるが、この手順では走らせない）

Run:
```bash
npm run build && npx playwright test e2e/sessionResume.spec.ts
```
Expected: FAIL（再開後の得点が '0' のままで、`toHaveText('2')` がタイムアウトする）

- [ ] **Step 6: 壊した箇所を戻し、再び通ることを確かめる**

Run:
```bash
git checkout src/hooks/useGameAutoSave.ts && npm run build && npx playwright test e2e/sessionResume.spec.ts e2e/scoresheet.spec.ts
```
Expected: PASS（4 passed）

- [ ] **Step 7: コミット**

```bash
git add e2e/fixtures/seedGame.ts e2e/sessionResume.spec.ts
git commit -m "test(e2e): 記録直後に落ちても中断セッションに残ることを確かめる"
```

---

### Task 4: ミラー復元（実 IndexedDB）

**Files:**
- Modify: `e2e/fixtures/seedGame.ts`
- Create: `e2e/mirrorRestore.spec.ts`

**Interfaces:**
- Consumes: Task 3 で追加した module-private の `inject(page, entries, once)`
- Produces: `seedRecordedGame` に3つ目の引数 `options?: { once?: boolean }` を足す（既定 `false` で、既存の呼び出しは無変更で動く）

**背景（実装者向け）:** 単体テストは `fake-indexeddb` で代替している。「起動時にスナップショットを取る側」と「localStorage が空になったら書き戻す側」を実物で通したことがない。IndexedDB に直接書き込む形にはしない —— それでは「アプリが実際にスナップショットを取ったか」が検証されないため。

- [ ] **Step 1: `seedRecordedGame` に `once` を足す**

`e2e/fixtures/seedGame.ts` の `seedRecordedGame` を次へ差し替える:

```ts
export interface SeedOptions {
    /** true なら初回読み込みのときだけ注入する（既定 false ＝ 毎回） */
    once?: boolean;
}

export async function seedRecordedGame(
    page: Page,
    record: GameRecord = FINISHED_GAME,
    options: SeedOptions = {},
): Promise<void> {
    await inject(page, [
        [HISTORY_KEY, JSON.stringify([record])],
        [MY_TEAMS_KEY, JSON.stringify([toSavedTeam(record.teamA)])],
    ], options.once ?? false);
}
```

- [ ] **Step 2: 既存の呼び出しが無変更で通ることを確かめる**

Run:
```bash
npx playwright test e2e/scoresheet.spec.ts e2e/backNavigation.spec.ts
```
Expected: PASS（5 passed）

- [ ] **Step 3: テストを書く**

`e2e/mirrorRestore.spec.ts`:

```ts
// ブラウザにデータを消されても、端末内のミラーから戻せることを確かめる。
//
// mirrorBackup は localStorage のアプリデータを IndexedDB に複製し、起動時に
// localStorage が空だったら復元を促す。単体テストは fake-indexeddb で代替して
// いるので、「起動時にスナップショットを取る側」と「書き戻す側」を実物で通した
// ことがない。
//
// IndexedDB へ直接書き込む形にはしない。それでは「アプリが実際にスナップ
// ショットを取ったか」が検証されず、書き戻し側しか守れない。

import { expect, test } from '@playwright/test';
import { GAME_NAME, seedRecordedGame } from './fixtures/seedGame';

test('localStorage を消しても、復元プロンプトから試合履歴が戻る', async ({ page }) => {
    // 初回だけ注入する。毎回入れ直すと、下で消した端から書き戻されて
    // 復元プロンプトの条件（localStorage が空）が成立しない
    await seedRecordedGame(page, undefined, { once: true });

    // 1. データのある状態で開く。起動時スナップショットが IndexedDB に入る
    await page.goto('./');
    await expect(page.getByRole('button', { name: /試合履歴/ })).toBeVisible();

    // スナップショットが実際に書かれるまで待つ（saveSnapshot は非同期）
    await expect
        .poll(() => page.evaluate(() => new Promise<number>(resolve => {
            const request = indexedDB.open('mbc-mirror-backup');
            request.onsuccess = () => {
                const db = request.result;
                const countRequest = db.transaction('snapshots', 'readonly')
                    .objectStore('snapshots')
                    .count();
                countRequest.onsuccess = () => { resolve(countRequest.result); db.close(); };
                countRequest.onerror = () => { resolve(0); db.close(); };
            };
            request.onerror = () => resolve(0);
        })))
        .toBeGreaterThan(0);

    // 2. ブラウザのサイトデータ消去を模す。IndexedDB は残す
    await page.evaluate(() => window.localStorage.clear());

    // 3. 開き直すと復元プロンプトが出る
    await page.reload();
    await expect(page.getByRole('heading', { name: /以前のデータが見つかりました/ })).toBeVisible();

    // 4. 復元すると履歴が戻る（復元後はアプリが自分で読み込み直す）
    await page.getByRole('button', { name: '復元する' }).click();

    await expect(page.getByRole('button', { name: /試合履歴/ })).toBeVisible();
    await page.getByRole('button', { name: /試合履歴/ }).click();
    await expect(page.getByRole('button', { name: new RegExp(GAME_NAME) })).toBeVisible();
});
```

- [ ] **Step 4: テストを走らせ、通ることを確かめる**

Run:
```bash
npx playwright test e2e/mirrorRestore.spec.ts
```
Expected: PASS（1 passed）

- [ ] **Step 5: 実装を壊して、テストが赤くなることを確かめる**

`src/utils/mirrorBackup.ts` の `saveSnapshot` を一時的に何もしないようにする。次の行を探す:

```ts
export async function saveSnapshot(now: number = Date.now()): Promise<void> {
    try {
        const entries = collectAppData();
```

`try {` の直後に `return;` を差し込む:

```ts
export async function saveSnapshot(now: number = Date.now()): Promise<void> {
    try {
        return;
        const entries = collectAppData();
```

Run:
```bash
npm run build && npx playwright test e2e/mirrorRestore.spec.ts
```
Expected: FAIL（IndexedDB にスナップショットが入らず、Step 3 の `expect.poll(...).toBeGreaterThan(0)` がタイムアウトする）

- [ ] **Step 6: 壊した箇所を戻し、e2e 全体が通ることを確かめる**

Run:
```bash
git checkout src/utils/mirrorBackup.ts && npm run build && npm run test:e2e
```
Expected: PASS（7 passed。既存3件＋新規4件）

- [ ] **Step 7: コミット**

```bash
git add e2e/fixtures/seedGame.ts e2e/mirrorRestore.spec.ts
git commit -m "test(e2e): 端末内ミラーからの復元を実 IndexedDB で確かめる"
```

---

### Task 5: `ci.yml` のコメントを現状に合わせる

**Files:**
- Modify: `.github/workflows/ci.yml`（コメントのみ。`needs` は変えない）

**Interfaces:**
- Consumes: なし
- Produces: なし

**背景（実装者向け）:** 現在のコメントは「安定を確かめてから needs へ昇格させる」と書いているが、条件（フレーク無しの連続成功）は既に満たされている（e2e 導入以降 10回連続成功）。それでも据え置くのは、今回4領域を足して前提が変わったため。前回「安定を確かめてから」とだけ書いた結果、条件が満たされても誰も動かさなかったので、**判断時期まで書く**。

- [ ] **Step 1: コメントを差し替える**

`.github/workflows/ci.yml` の次の3行を探す:

```yaml
  # deploy の needs には入れていない。導入したてで、実ブラウザ特有の不安定さが
  # どれだけ出るか分かっていない段階でゲートにすると、アプリが壊れていないのに
  # 公開が止まる。安定を確かめてから needs へ昇格させる。
```

次へ差し替える:

```yaml
  # deploy の needs には入れていない。
  #
  # 当初の条件（実ブラウザ特有の不安定さが出ないことの確認）は満たされた ——
  # 出力3件で 10回連続成功、フレーク無し。それでも据え置くのは、jsdom で踏めない
  # 4経路（オフライン起動・戻る操作・自動保存のフラッシュ・ミラー復元）を
  # 足したばかりで、前提が変わったため。とくにオフラインは SW の有効化待ちが
  # 絡み、この中では最も揺れやすい。
  #
  # 昇格の判断は次のマイナーリリース（v1.11）を切るときに行う。前回は
  # 「安定を確かめてから」とだけ書いた結果、条件が満たされても誰も動かさなかった。
  # 時期を決めておかないと同じことになる。
```

- [ ] **Step 2: コメント以外を変えていないことを確かめる**

Run:
```bash
git diff .github/workflows/ci.yml | grep -E '^[-+]' | grep -v '^[-+][-+]' | grep -vE '^[-+]\s*#' | grep -vE '^[-+]\s*$'
```
Expected: 無出力（追加・削除された行がすべてコメント行か空行）

- [ ] **Step 3: ワークフローが構文として読めることを確かめる**

Run:
```bash
node -e "const s=require('fs').readFileSync('.github/workflows/ci.yml','utf8');const body=s.slice(s.indexOf('\njobs:'));const jobs=[...body.matchAll(/^  ([A-Za-z0-9_-]+):$/gm)].map(m=>m[1]);console.log(jobs.join(','));if(!/deploy:\s*\n\s*needs: test-and-build/.test(s))throw new Error('deploy の needs が変わっている');"
```
Expected: `test-and-build,e2e,deploy` と出力され、例外が出ない

ジョブ名の文字種は `[A-Za-z0-9_-]` にすること。`[a-z-]` だと **数字を含む `e2e` が拾えない**。また `jobs:` 以降に絞ること。絞らないと `on:` 配下の `push:` が同じ2スペース字下げで引っかかる。（初版はどちらも外していて、期待値 `test-and-build,e2e,deploy` が原理的に出ない命令になっていた）

- [ ] **Step 4: コミット**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: e2e をゲートに昇格させる判断時期を書き残す"
```

---

## 完了時の確認

- [ ] **全体を通す**

Run:
```bash
npm run lint && npx tsc -b && npm run typecheck:test && npm test && npm run build && npm run test:e2e
```
Expected: lint / tsc いずれも無出力、単体 2319 passed、e2e 7 passed

- [ ] **CI で1回通し、e2e ジョブの所要時間を記録する**

push したあと、CI の e2e ジョブが緑になることと所要時間を確かめる。

Run:
```bash
gh run list --workflow=ci.yml --limit 1 --json databaseId -q '.[0].databaseId' | xargs -I{} gh run view {} --json jobs -q '.jobs[] | select(.name=="e2e") | .name + ": " + .conclusion + " (" + (.startedAt) + " → " + (.completedAt) + ")"'
```
Expected: `e2e: success`

CI の e2e ジョブは現状 1m2s。+1〜2分の見込みで、大きく超えるなら `playwright.config.ts` の `workers: process.env.CI ? 1 : undefined` を CI でも 2 以上へ上げることを検討する。手元での所要時間は `npm run test:e2e` の出力末尾で分かるが、CI（Linux・1 worker）とは条件が違うので判断は CI の値で行う。
