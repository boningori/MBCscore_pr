# フェーズ2: コード重複解消・lint解消 実装計画

> **状態: 実装完了** — main に取り込み済み。実装は本計画の追加コミット `410b97f`（2026-07-05）以降のコミット群にあたる。
> 以下のチェックボックスは実行時に更新していないため未チェックのまま残っている。**残作業の指標として読まないこと。**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 挙動を一切変えずにコード重複（約2,000行）とlintエラー55件を解消し、CIにlintを追加する。

**Architecture:** 抽出方式のリファクタリング。共通ロジックを新設モジュール（createStorage / useSwipe / TeamShared）へ抽出し、既存コンポーネントは残して消費側に書き換える。GameContextのreducerはケース本体を機能別ハンドラ関数ファイルへ「コピー移動」し、薄い委譲switchにする。lint修正は重複解消の後（消えるコードを直さないため）。

**Tech Stack:** React 19, TypeScript strict, Vitest + jsdom（既存）。devDependency追加は `@testing-library/react` のみ。**runtime依存の追加禁止。**

## Global Constraints

- **挙動不変**: UI・文言・操作フロー・保存データ形式・localStorageキーは一切変更しない
- 公開関数のシグネチャ（`saveMyTeam(team: SavedTeam): void` 等）を維持し、呼び出し側の変更を最小化
- 各タスク完了時に `npm test` 全パス＋`npm run build` 成功＋**lintエラー数が前タスク以下**であること（数の記録: `npm run lint 2>&1 | grep problems`）
- 既存のgameReducerテスト（src/context/gameReducer.test.ts）は**一切変更せず**パスさせ続ける
- `notifyStorageError` の呼び出しコンテキスト文字列（'game session' 等）を変更しない
- コミットメッセージ末尾: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 実装中に判断に迷う差分（例: OpponentManagerのJSXがMyTeamManagerと微妙に異なる）を見つけたら、**同一化せず差分を保持**し、レポートに記載する

---

### Task 1: createJsonStorage ユーティリティ（TDD）

**Files:**
- Create: `src/utils/createStorage.ts`
- Test: `src/utils/createStorage.test.ts`

**Interfaces:**
- Produces: `createJsonStorage<T>(key: string, fallback: T): { load(): T; save(value: T): void; clear(): void }`
  - `load`: キー不在またはparse失敗時は `fallback` を返す（構造化cloneした新インスタンスではなく同一参照でよい。現行実装と同じく呼び出しごとにJSON.parseするため共有ミューテーション問題はない）
  - `save`: 失敗時は `notifyStorageError(context, error)` を呼ぶ。contextはオプション第3引数 `errorContext?: string`（省略時はkey）
- Consumes: `notifyStorageError`（`src/utils/storageError.ts`、フェーズ1で作成済み）

- [ ] **Step 1: 失敗するテストを書く — `src/utils/createStorage.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createJsonStorage } from './createStorage';
import { STORAGE_ERROR_EVENT } from './storageError';

interface Demo { count: number; items: string[] }

const storage = createJsonStorage<Demo>('mbc-test-demo', { count: 0, items: [] });

describe('createJsonStorage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('未保存ならfallbackを返す', () => {
        expect(storage.load()).toEqual({ count: 0, items: [] });
    });

    it('saveしたものをloadで復元できる', () => {
        storage.save({ count: 3, items: ['a'] });
        expect(storage.load()).toEqual({ count: 3, items: ['a'] });
        expect(localStorage.getItem('mbc-test-demo')).toBe('{"count":3,"items":["a"]}');
    });

    it('壊れたJSONならfallbackを返す', () => {
        localStorage.setItem('mbc-test-demo', 'こわれた');
        expect(storage.load()).toEqual({ count: 0, items: [] });
    });

    it('clearでキーが消える', () => {
        storage.save({ count: 1, items: [] });
        storage.clear();
        expect(localStorage.getItem('mbc-test-demo')).toBeNull();
    });

    it('save失敗時はstorage-errorイベントが飛ぶ', () => {
        const handler = vi.fn();
        window.addEventListener(STORAGE_ERROR_EVENT, handler);
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });

        storage.save({ count: 9, items: [] });

        expect(handler).toHaveBeenCalledTimes(1);
        setSpy.mockRestore();
        errSpy.mockRestore();
        window.removeEventListener(STORAGE_ERROR_EVENT, handler);
    });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npm test -- createStorage`
Expected: FAIL（モジュール不在）

- [ ] **Step 3: 実装 — `src/utils/createStorage.ts`**

```ts
// localStorageへのJSON保存の共通実装
// 各ストレージモジュール（teamStorage等）はこれを内部で使い、公開関数のシグネチャは変えない

import { notifyStorageError } from './storageError';

export interface JsonStorage<T> {
    load(): T;
    save(value: T): void;
    clear(): void;
}

export function createJsonStorage<T>(key: string, fallback: T, errorContext?: string): JsonStorage<T> {
    const context = errorContext ?? key;
    return {
        load(): T {
            try {
                const data = localStorage.getItem(key);
                if (!data) return fallback;
                return JSON.parse(data) as T;
            } catch (error) {
                console.error(`Failed to load ${context}:`, error);
                return fallback;
            }
        },
        save(value: T): void {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (error) {
                notifyStorageError(context, error);
            }
        },
        clear(): void {
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.error(`Failed to clear ${context}:`, error);
            }
        },
    };
}
```

- [ ] **Step 4: パス確認・lint・コミット**

Run: `npm test -- createStorage` → PASS（5件）
Run: `npx eslint src/utils/createStorage.ts src/utils/createStorage.test.ts` → エラー0

```bash
git add src/utils/createStorage.ts src/utils/createStorage.test.ts
git commit -m "refactor: JSONストレージ共通実装createJsonStorageを追加"
```

---

### Task 2: ストレージ5モジュールの内部をcreateJsonStorageに置換

**Files:**
- Modify: `src/utils/gameSessionStorage.ts`（全面書き換え、公開API不変）
- Modify: `src/utils/appSettings.ts`（同上）
- Modify: `src/utils/teamStorage.ts`（load/save/deleteの内部のみ）
- Modify: `src/utils/gameHistoryStorage.ts`（同上）
- Modify: `src/utils/playerStatsAnalysis.ts`（hiddenPlayers部分のみ）

**Interfaces:**
- Consumes: Task 1の `createJsonStorage<T>(key, fallback, errorContext?)`
- Produces: 変更なし（全公開関数のシグネチャ・キー・JSON形式・notifyStorageErrorコンテキスト文字列を維持）

**重要**: 各モジュールの既存テスト（dataBackup.test.ts / playerStatsAnalysis.test.ts / gameReducer.test.ts経由）が無変更でパスすること。`hasGameSession()` のように `localStorage.getItem(...) !== null` を直接使う関数はそのまま残してよい。

- [ ] **Step 1: gameSessionStorage.ts を書き換え**

```ts
// 試合セッション永続保存（キャッシュ）用ストレージ
// 試合中は連続的に保存し、画面遷移しても再開可能にする

import type { Game } from '../types/game';
import { createJsonStorage } from './createStorage';

const GAME_SESSION_KEY = 'minibasket-game-session';

export interface GameSession {
    game: Game;
    gameName: string;
    date: string;
    savedAt: string;
}

const sessionStorage_ = createJsonStorage<GameSession | null>(GAME_SESSION_KEY, null, 'game session');

// 試合セッションを保存
export function saveGameSession(game: Game, gameName: string, date: string): void {
    sessionStorage_.save({
        game,
        gameName,
        date,
        savedAt: new Date().toISOString(),
    });
}

// 試合セッションを読み込み
export function loadGameSession(): GameSession | null {
    return sessionStorage_.load();
}

// 試合セッションをクリア
export function clearGameSession(): void {
    sessionStorage_.clear();
}

// 試合セッションが存在するか確認
export function hasGameSession(): boolean {
    return localStorage.getItem(GAME_SESSION_KEY) !== null;
}
```

- [ ] **Step 2: appSettings.ts を書き換え**

```ts
// アプリ設定の保存・読み込み

import { createJsonStorage } from './createStorage';

const APP_SETTINGS_KEY = 'minibasket-app-settings';

export type GameMode = 'full' | 'simple';

export interface AppSettings {
    defaultGameMode: GameMode;
}

const DEFAULT_SETTINGS: AppSettings = {
    defaultGameMode: 'full',
};

const settingsStorage = createJsonStorage<Partial<AppSettings>>(APP_SETTINGS_KEY, {}, 'app settings');

// アプリ設定を保存
export function saveAppSettings(settings: Partial<AppSettings>): void {
    settingsStorage.save({ ...loadAppSettings(), ...settings });
}

// アプリ設定を読み込み
export function loadAppSettings(): AppSettings {
    return { ...DEFAULT_SETTINGS, ...settingsStorage.load() };
}

// デフォルトゲームモードを取得
export function getDefaultGameMode(): GameMode {
    return loadAppSettings().defaultGameMode;
}

// デフォルトゲームモードを保存
export function saveDefaultGameMode(mode: GameMode): void {
    saveAppSettings({ defaultGameMode: mode });
}
```

- [ ] **Step 3: teamStorage.ts の内部置換**

ファイル先頭に追加: `import { createJsonStorage } from './createStorage';`
モジュールレベルに追加（キー定数の直後）:

```ts
const myTeamsStorage = createJsonStorage<SavedTeam[]>(MY_TEAMS_KEY, [], 'my team');
const opponentsStorage = createJsonStorage<SavedTeam[]>(OPPONENT_TEAMS_KEY, [], 'opponent');
const recentOpponentsStorage = createJsonStorage<SavedTeam[]>(RECENT_OPPONENTS_KEY, [], 'recent opponent');
```

（注: RECENT_OPPONENTS_KEY はファイル内の実際の定数名を確認して使うこと。`'minibasket-saved-opponents'` を指す定数）

各関数の書き換え（try/catch・JSON処理をストレージ呼び出しに置換、ロジックは不変）:
- `loadMyTeams()` → `return myTeamsStorage.load();`
- `saveMyTeam(team)` → 既存の「既存index検索→更新or追加」ロジックはそのまま、最後の `localStorage.setItem(...)` を `myTeamsStorage.save(teams);` に。try/catch削除（save内部で処理される）
- `deleteMyTeam` / `loadOpponents` / `saveOpponent` / `deleteOpponent` / `loadRecentOpponents` / `saveRecentOpponent` / `clearRecentOpponents` も同型で置換
- `loadMyTeam(teamId)` は `loadMyTeams()` 経由のまま不変

- [ ] **Step 4: gameHistoryStorage.ts の内部置換**

同様に `const historyStorage = createJsonStorage<GameRecord[]>(GAME_HISTORY_KEY, [], 'game result');` を追加し、`loadGameHistory` / `saveGameResult` / `updateGameRecordGameInfo`（コンテキストは 'game record' を維持したいので、この関数だけ `historyStorage.save` ではなく既存どおり `notifyStorageError('game record', ...)` になるよう、`const recordStorage = createJsonStorage<GameRecord[]>(GAME_HISTORY_KEY, [], 'game record');` を別途作って使う）/ `deleteGameRecord` の内部を置換。record構築・unshift・filter等のロジックは一切変えない。

- [ ] **Step 5: playerStatsAnalysis.ts のhiddenPlayers置換**

`saveHiddenPlayers` / `loadHiddenPlayers` の内部を `const hiddenStorage = createJsonStorage<Record<string, string[]>>('minibasket-hidden-players', {}, 'hidden players');` 経由に置換。`togglePlayerHidden` / `isPlayerHidden` は無変更。

- [ ] **Step 6: 検証・コミット**

Run: `npm test` → 全パス（37件: 既存32＋Task 1の5）
Run: `npm run build` → 成功
Run: `npm run lint 2>&1 | grep problems` → エラー数がベースライン（55）以下

```bash
git add src/utils/
git commit -m "refactor: ストレージ5モジュールをcreateJsonStorageに統一"
```

---

### Task 3: useSwipeフック（TDD）＋ SwipeableScoreButton置換

**Files:**
- Create: `src/hooks/useSwipe.ts`
- Test: `src/hooks/useSwipe.test.ts`
- Modify: `src/components/ActionButtons/SwipeableScoreButton.tsx`

**Interfaces:**
- Produces: `useSwipe(onSwipeUp: () => void, onSwipeDown: () => void, threshold?: number)` returns `{ swipeDirection: 'up' | 'down' | null; onTouchStart(e: React.TouchEvent): void; onTouchMove(e: React.TouchEvent): void; onTouchEnd(e: React.TouchEvent): void; consumeSwipeFlag(): boolean }`
  - `consumeSwipeFlag()`: 直前の操作がスワイプだったらtrueを返しフラグをクリア（クリックハンドラでのスキップ判定用、現行の `hasSwiped` refと同一挙動）

- [ ] **Step 1: devDependency追加**

```bash
npm install -D @testing-library/react
```

- [ ] **Step 2: 失敗するテストを書く — `src/hooks/useSwipe.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwipe } from './useSwipe';

function touchEvent(clientY: number) {
    return {
        touches: [{ clientY }],
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
    } as unknown as React.TouchEvent;
}

describe('useSwipe', () => {
    it('閾値を超える上スワイプでonSwipeUpが発火する', () => {
        const up = vi.fn();
        const down = vi.fn();
        const { result } = renderHook(() => useSwipe(up, down, 30));

        act(() => result.current.onTouchStart(touchEvent(200)));
        act(() => result.current.onTouchMove(touchEvent(150))); // 50px上
        expect(result.current.swipeDirection).toBe('up');
        act(() => result.current.onTouchEnd(touchEvent(150)));

        expect(up).toHaveBeenCalledTimes(1);
        expect(down).not.toHaveBeenCalled();
        expect(result.current.swipeDirection).toBeNull();
    });

    it('閾値を超える下スワイプでonSwipeDownが発火する', () => {
        const up = vi.fn();
        const down = vi.fn();
        const { result } = renderHook(() => useSwipe(up, down, 30));

        act(() => result.current.onTouchStart(touchEvent(100)));
        act(() => result.current.onTouchMove(touchEvent(160))); // 60px下
        act(() => result.current.onTouchEnd(touchEvent(160)));

        expect(down).toHaveBeenCalledTimes(1);
        expect(up).not.toHaveBeenCalled();
    });

    it('閾値未満の移動では何も発火しない', () => {
        const up = vi.fn();
        const down = vi.fn();
        const { result } = renderHook(() => useSwipe(up, down, 30));

        act(() => result.current.onTouchStart(touchEvent(100)));
        act(() => result.current.onTouchMove(touchEvent(110))); // 10px
        expect(result.current.swipeDirection).toBeNull();
        act(() => result.current.onTouchEnd(touchEvent(110)));

        expect(up).not.toHaveBeenCalled();
        expect(down).not.toHaveBeenCalled();
    });

    it('consumeSwipeFlag: スワイプ後は1回だけtrueを返す', () => {
        const { result } = renderHook(() => useSwipe(() => {}, () => {}, 30));

        act(() => result.current.onTouchStart(touchEvent(200)));
        act(() => result.current.onTouchMove(touchEvent(150)));
        act(() => result.current.onTouchEnd(touchEvent(150)));

        expect(result.current.consumeSwipeFlag()).toBe(true);
        expect(result.current.consumeSwipeFlag()).toBe(false);
    });

    it('スワイプしていなければconsumeSwipeFlagはfalse', () => {
        const { result } = renderHook(() => useSwipe(() => {}, () => {}, 30));
        expect(result.current.consumeSwipeFlag()).toBe(false);
    });
});
```

- [ ] **Step 3: 失敗を確認**

Run: `npm test -- useSwipe`
Expected: FAIL（モジュール不在）

- [ ] **Step 4: 実装 — `src/hooks/useSwipe.ts`**

現行3ボタンのロジック（SwipeableScoreButton.tsx:34-83が原本）を忠実に共通化する:

```ts
// スワイプ操作の共通フック
// 上フリック=onSwipeUp、下フリック=onSwipeDown、タップ判定はconsumeSwipeFlagで行う
// SwipeableScoreButton / SwipeableReboundButton / SwipeableTurnoverButton の重複ロジックを統合

import { useState, useRef, useCallback } from 'react';

const DEFAULT_SWIPE_THRESHOLD = 30;

export type SwipeDirection = 'up' | 'down' | null;

export function useSwipe(
    onSwipeUp: () => void,
    onSwipeDown: () => void,
    threshold: number = DEFAULT_SWIPE_THRESHOLD,
) {
    const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>(null);
    const touchStartY = useRef<number | null>(null);
    const hasSwiped = useRef(false);

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        touchStartY.current = e.touches[0].clientY;
        hasSwiped.current = false;
        setSwipeDirection(null);
    }, []);

    const onTouchMove = useCallback((e: React.TouchEvent) => {
        if (touchStartY.current === null) return;

        const currentY = e.touches[0].clientY;
        const deltaY = touchStartY.current - currentY;

        // スワイプ閾値を超えたらポップアップを表示
        if (Math.abs(deltaY) > threshold) {
            hasSwiped.current = true;
            setSwipeDirection(deltaY > 0 ? 'up' : 'down');
        } else {
            setSwipeDirection(null);
        }
    }, [threshold]);

    const onTouchEnd = useCallback((e: React.TouchEvent) => {
        // スワイプ中なら指を離した時点で確定
        if (swipeDirection === 'up') {
            e.preventDefault();
            e.stopPropagation();
            onSwipeUp();
        } else if (swipeDirection === 'down') {
            e.preventDefault();
            e.stopPropagation();
            onSwipeDown();
        }

        touchStartY.current = null;
        setSwipeDirection(null);
    }, [swipeDirection, onSwipeUp, onSwipeDown]);

    // クリックハンドラ用: 直前がスワイプならtrueを返してフラグをクリア
    const consumeSwipeFlag = useCallback(() => {
        const wasSwipe = hasSwiped.current;
        hasSwiped.current = false;
        return wasSwipe;
    }, []);

    return { swipeDirection, onTouchStart, onTouchMove, onTouchEnd, consumeSwipeFlag };
}
```

- [ ] **Step 5: パス確認**

Run: `npm test -- useSwipe` → PASS（5件）

- [ ] **Step 6: SwipeableScoreButton.tsx をフック利用に書き換え**

state/ref/3ハンドラ（32-83行の `showSelector` 以外）を削除し、以下の形にする（JSX・クラス名・文言は完全不変）:

```tsx
import { useState, useCallback } from 'react';
import { useSwipe } from '../../hooks/useSwipe';
import './SwipeableScoreButton.css';
```

コンポーネント内:

```tsx
    const [showSelector, setShowSelector] = useState(false);
    const info = SCORE_INFO[scoreType];

    const { swipeDirection, onTouchStart, onTouchMove, onTouchEnd, consumeSwipeFlag } = useSwipe(
        useCallback(() => onScore(scoreType), [onScore, scoreType]),
        useCallback(() => onMiss(info.missType), [onMiss, info.missType]),
        SWIPE_THRESHOLD,
    );

    const handleClick = useCallback(() => {
        // スワイプ後はクリックをスキップ
        if (consumeSwipeFlag()) return;
        setShowSelector(true);
    }, [consumeSwipeFlag]);
```

JSX側は `onTouchStart={handleTouchStart}` → `onTouchStart={onTouchStart}`（Move/Endも同様）に差し替えるだけ。`handleSelectScore` / `handleSelectMiss` / `handleClickOutside` と全JSXは不変。

- [ ] **Step 7: 検証・コミット**

Run: `npm test && npm run build` → 全パス・成功
Run: `npx eslint src/hooks/useSwipe.ts src/hooks/useSwipe.test.ts src/components/ActionButtons/SwipeableScoreButton.tsx` → エラー0

```bash
git add package.json package-lock.json src/hooks/ src/components/ActionButtons/SwipeableScoreButton.tsx
git commit -m "refactor: useSwipeフックを抽出しScoreButtonを置換"
```

---

### Task 4: Rebound / Turnover ボタンをuseSwipeに置換

**Files:**
- Modify: `src/components/ActionButtons/SwipeableReboundButton.tsx`
- Modify: `src/components/ActionButtons/SwipeableTurnoverButton.tsx`

**Interfaces:**
- Consumes: Task 3の `useSwipe`（シグネチャは同タスク参照）

**手順**（両ファイルに同じ変換を適用。これは機械的変換であり、Task 3 Step 6と同じパターン）:

- [ ] **Step 1: 各ファイルを読み、以下を確認**
  - `touchStartY` / `hasSwiped` ref、`swipeDirection` state、`handleTouchStart/Move/End` が SwipeableScoreButton.tsx:34-83 と同型で存在すること
  - 上スワイプ/下スワイプ確定時に呼ばれるコールバック（例: Reboundなら OR/DR）を特定
  - **もしロジックがScoreButtonと構造的に異なる場合（閾値以外の差分がある場合）は変換を中止し、NEEDS_CONTEXTで差分を報告する**

- [ ] **Step 2: Task 3 Step 6と同じ変換を適用**
  - ref/state/3ハンドラを削除→ `useSwipe(上確定コールバック, 下確定コールバック, 閾値)` に置換
  - クリックハンドラ冒頭の `if (hasSwiped.current) {...}` を `if (consumeSwipeFlag()) return;` に置換
  - JSXのonTouch*をフックの返り値に差し替え。**JSX・クラス名・文言は不変**

- [ ] **Step 3: 検証・コミット**

Run: `npm test && npm run build` → 全パス・成功
Run: `npx eslint src/components/ActionButtons/SwipeableReboundButton.tsx src/components/ActionButtons/SwipeableTurnoverButton.tsx` → 変更前よりエラー増なし

```bash
git add src/components/ActionButtons/
git commit -m "refactor: Rebound/TurnoverボタンもuseSwipeに統一"
```

---

### Task 5: TeamShared — 共通フックと共通UI部品

**Files:**
- Create: `src/components/TeamShared/useTeamImportExport.ts`
- Create: `src/components/TeamShared/TextImportPanel.tsx`
- Create: `src/components/TeamShared/ImportConfirmPanel.tsx`
- Create: `src/components/TeamShared/DeleteConfirmModal.tsx`
- Create: `src/components/TeamShared/index.ts`

**Interfaces:**
- Produces:
  - `useTeamImportExport(options: { onImported: () => void; defaultImportTarget?: 'myTeam' | 'opponent' })` returns `{ pendingImport, importTarget, setImportTarget, showTextImport, setShowTextImport, importText, updateImportText, textValidation, handleJsonImport, handleConfirmImport, handleCancelImport, handleImportTextSubmit }`
  - `<TextImportPanel importText updateImportText textValidation onSubmit onCancel />`
  - `<ImportConfirmPanel pendingImport importTarget onChangeImportTarget onConfirm onCancel />`
  - `<DeleteConfirmModal title message note onConfirm onCancel />`
- Consumes: `parseImportJSON` / `parseImportFile` / `executeImport` / `ParsedImportData`（dataBackup.ts）、`showToast`（Toast.tsx）

**lint注意**: 現行の「500msデバウンスeffect内の同期 `setTextValidation(null)`」は `react-hooks/set-state-in-effect` に抵触する。フックでは **`updateImportText`（setterラッパー）で入力時に即バリデーションをクリア**し、effectはデバウンス部分のみを持つ設計にする（挙動同一・lintクリーン）。

- [ ] **Step 1: `useTeamImportExport.ts` を実装**

```ts
// チームインポート/エクスポート共通フック
// MyTeamManager / OpponentManager / AppSettingsModal に重複していたロジックを統合

import { useState, useEffect } from 'react';
import { parseImportFile, parseImportJSON, executeImport } from '../../utils/dataBackup';
import type { ParsedImportData } from '../../utils/dataBackup';
import { showToast } from '../Toast/Toast';

export type ImportTarget = 'myTeam' | 'opponent';

export interface UseTeamImportExportOptions {
    onImported: () => void;
    defaultImportTarget?: ImportTarget;
}

export function useTeamImportExport({ onImported, defaultImportTarget = 'myTeam' }: UseTeamImportExportOptions) {
    const [pendingImport, setPendingImport] = useState<ParsedImportData | null>(null);
    const [importTarget, setImportTarget] = useState<ImportTarget>(defaultImportTarget);
    const [showTextImport, setShowTextImport] = useState(false);
    const [importText, setImportText] = useState('');
    const [textValidation, setTextValidation] = useState<{ valid: boolean; message: string } | null>(null);

    // 入力更新（空になったら即バリデーション表示をクリア — effect内setStateを避ける）
    const updateImportText = (text: string) => {
        setImportText(text);
        if (!text.trim()) {
            setTextValidation(null);
        }
    };

    // リアルタイムJSONバリデーション（500msデバウンス）
    useEffect(() => {
        if (!importText.trim()) return;
        const timer = setTimeout(() => {
            try {
                const parsed = parseImportJSON(importText.trim());
                if (parsed.type === 'unknown') {
                    setTextValidation({ valid: false, message: '有効なJSONデータを入力してください' });
                } else {
                    const typeLabel = parsed.type === 'team' ? 'チームデータ' : parsed.type === 'backup' ? '全データバックアップ' : parsed.type === 'game' ? '試合データ' : 'データ';
                    setTextValidation({ valid: true, message: `✓ ${typeLabel}が検出されました` });
                }
            } catch {
                setTextValidation({ valid: false, message: '有効なJSONデータを入力してください' });
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [importText]);

    const handleJsonImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const parsed = await parseImportFile(file);
            if (parsed.type === 'unknown') {
                showToast(`インポート失敗: ${parsed.summary}`, 'error');
            } else {
                // すべてのインポートタイプで確認画面を表示（データ損失防止）
                setPendingImport(parsed);
            }
        } catch (error) {
            showToast('インポートに失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'), 'error');
        }

        e.target.value = '';
    };

    const handleConfirmImport = () => {
        if (!pendingImport) return;
        const options = pendingImport.type === 'team' ? { teamTarget: importTarget } : undefined;
        const result = executeImport(pendingImport, options);
        if (result.success) {
            showToast(`✓ ${result.message}`, 'success');
            onImported();
        } else {
            showToast(`インポート失敗: ${result.message}`, 'error');
        }
        setPendingImport(null);
    };

    const handleCancelImport = () => {
        setPendingImport(null);
    };

    const handleImportTextSubmit = () => {
        if (!importText.trim()) return;
        const parsed = parseImportJSON(importText.trim());
        if (parsed.type === 'unknown') {
            showToast(`インポート失敗: ${parsed.summary}`, 'error');
        } else {
            // すべてのインポートタイプで確認画面を表示（データ損失防止）
            setPendingImport(parsed);
            setShowTextImport(false);
            setImportText('');
        }
    };

    return {
        pendingImport,
        importTarget,
        setImportTarget,
        showTextImport,
        setShowTextImport,
        importText,
        updateImportText,
        textValidation,
        handleJsonImport,
        handleConfirmImport,
        handleCancelImport,
        handleImportTextSubmit,
    };
}
```

- [ ] **Step 2: `TextImportPanel.tsx` を実装**（MyTeamManager.tsx:218-241のJSXを部品化。文言・クラス名不変）

```tsx
interface TextImportPanelProps {
    importText: string;
    updateImportText: (text: string) => void;
    textValidation: { valid: boolean; message: string } | null;
    onSubmit: () => void;
    onCancel: () => void;
}

export function TextImportPanel({ importText, updateImportText, textValidation, onSubmit, onCancel }: TextImportPanelProps) {
    return (
        <div className="text-import-panel">
            <h4>📝 JSONデータの貼り付け</h4>
            <p className="text-import-hint">MBCscoreの「エクスポート」や「クリップボードにコピー」で取得したJSONデータを貼り付けてください。</p>
            <textarea
                className="text-import-textarea"
                value={importText}
                onChange={e => updateImportText(e.target.value)}
                placeholder='ここにコピーしたデータを貼り付けてください'
                rows={10}
                style={{ minHeight: '200px' }}
            />
            {textValidation && (
                <p className={`text-validation ${textValidation.valid ? 'valid' : 'invalid'}`}>
                    {textValidation.message}
                </p>
            )}
            <div className="text-import-actions">
                <button className="btn btn-secondary" onClick={onCancel}>キャンセル</button>
                <button className="btn btn-primary" onClick={onSubmit} disabled={!importText.trim()}>読み込む</button>
            </div>
        </div>
    );
}
```

- [ ] **Step 3: `ImportConfirmPanel.tsx` を実装**（MyTeamManager.tsx:243-304のJSXを部品化。文言・クラス名不変）

```tsx
import type { ParsedImportData } from '../../utils/dataBackup';
import type { ImportTarget } from './useTeamImportExport';

interface ImportConfirmPanelProps {
    pendingImport: ParsedImportData;
    importTarget: ImportTarget;
    onChangeImportTarget: (target: ImportTarget) => void;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ImportConfirmPanel({ pendingImport, importTarget, onChangeImportTarget, onConfirm, onCancel }: ImportConfirmPanelProps) {
    return (
        <div className={`import-confirm-panel ${pendingImport.hasDuplicates ? 'has-duplicates' : ''}`}>
            <h4>📋 インポート内容の確認</h4>
            <p className="import-summary">{pendingImport.summary}</p>
            {pendingImport.type === 'backup' && (
                <div className="import-danger-warning">
                    <p className="import-warning-title">⚠️ 重要な警告</p>
                    <p className="import-warning-text">
                        これは全データバックアップファイルです。<br />
                        インポートすると、<strong>試合履歴・マイチーム・対戦チーム・設定</strong>が上書きされます。
                    </p>
                </div>
            )}
            {pendingImport.type === 'backup' && (
                <div className="import-merge-info">
                    <p className="import-info">
                        📌 復元ルール:<br />
                        • 同じデータがあれば新しい方に更新されます<br />
                        • 新しいデータは追加されます<br />
                        • 既存データが削除されることはありません
                    </p>
                </div>
            )}
            {pendingImport.type === 'game' && (
                <p className="import-info">ℹ️ 試合データをインポートします。同じIDの試合がある場合は上書きされます。</p>
            )}
            {pendingImport.type === 'team' && (
                <>
                    <p className="import-info">📌 同じIDのチームが既にある場合、インポートしたデータで上書きされます。</p>
                    <div className="import-target-selector">
                        <label>インポート先：</label>
                        <select value={importTarget} onChange={e => onChangeImportTarget(e.target.value as ImportTarget)}>
                            <option value="myTeam">マイチーム</option>
                            <option value="opponent">対戦チーム</option>
                        </select>
                    </div>
                </>
            )}
            {pendingImport.preview && pendingImport.preview.length > 0 && (
                <div className="import-preview">
                    {pendingImport.preview.map((line, i) => (
                        <p key={i} className="import-preview-line">{line}</p>
                    ))}
                </div>
            )}
            {pendingImport.hasDuplicates && (
                <p className="import-warning">⚠️ {pendingImport.duplicateDetails}</p>
            )}
            <div className="import-confirm-actions">
                <button className="btn btn-secondary" onClick={onCancel}>キャンセル</button>
                {pendingImport.type === 'backup' ? (
                    <button className="btn btn-danger" onClick={onConfirm}>全データをインポート（上書き）</button>
                ) : (
                    <button className="btn btn-primary" onClick={onConfirm}>
                        {pendingImport.type === 'team'
                            ? (importTarget === 'myTeam' ? 'マイチームにインポート' : '対戦チームにインポート')
                            : 'インポート実行'}
                    </button>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 4: `DeleteConfirmModal.tsx` を実装**（MyTeamManager.tsx:363-380を部品化）

```tsx
interface DeleteConfirmModalProps {
    title: string;
    message: string;
    note?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export function DeleteConfirmModal({ title, message, note, onConfirm, onCancel }: DeleteConfirmModalProps) {
    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>{title}</h3>
                <p>{message}</p>
                {note && <p className="text-muted text-sm my-2">{note}</p>}
                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={onCancel}>
                        キャンセル
                    </button>
                    <button className="btn btn-danger" onClick={onConfirm}>
                        削除する
                    </button>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 5: `index.ts`**

```ts
export { useTeamImportExport } from './useTeamImportExport';
export type { ImportTarget, UseTeamImportExportOptions } from './useTeamImportExport';
export { TextImportPanel } from './TextImportPanel';
export { ImportConfirmPanel } from './ImportConfirmPanel';
export { DeleteConfirmModal } from './DeleteConfirmModal';
```

- [ ] **Step 6: 検証・コミット**

Run: `npm test && npm run build` → 全パス・成功
Run: `npx eslint src/components/TeamShared/` → エラー0

```bash
git add src/components/TeamShared/
git commit -m "refactor: チーム管理の共通フックとUI部品(TeamShared)を追加"
```

---

### Task 6: MyTeamManagerをTeamSharedに置換

**Files:**
- Modify: `src/components/MyTeamManager/MyTeamManager.tsx`

**Interfaces:**
- Consumes: Task 5の全export

- [ ] **Step 1: import追加・重複ロジック削除**

追加: `import { useTeamImportExport, TextImportPanel, ImportConfirmPanel, DeleteConfirmModal } from '../TeamShared';`

削除して置換:
- state: `pendingImport` / `importTarget` / `showTextImport` / `importText` / `textValidation`（30-38行のうち該当5つ）
- 42-61行のデバウンスeffect
- `handleJsonImport` / `handleConfirmImport` / `handleCancelImport` / `handleImportTextSubmit`（128-175行）

置換後:

```tsx
    const {
        pendingImport, importTarget, setImportTarget,
        showTextImport, setShowTextImport,
        importText, updateImportText, textValidation,
        handleJsonImport, handleConfirmImport, handleCancelImport, handleImportTextSubmit,
    } = useTeamImportExport({ onImported: refreshTeams, defaultImportTarget: 'myTeam' });
```

- [ ] **Step 2: JSXブロックを部品に置換**

- 218-241行（テキスト貼り付けUI）→

```tsx
            {showTextImport && (
                <TextImportPanel
                    importText={importText}
                    updateImportText={updateImportText}
                    textValidation={textValidation}
                    onSubmit={handleImportTextSubmit}
                    onCancel={() => { setShowTextImport(false); updateImportText(''); }}
                />
            )}
```

- 243-304行（インポート確認）→

```tsx
            {pendingImport && (
                <ImportConfirmPanel
                    pendingImport={pendingImport}
                    importTarget={importTarget}
                    onChangeImportTarget={setImportTarget}
                    onConfirm={handleConfirmImport}
                    onCancel={handleCancelImport}
                />
            )}
```

- 363-380行（削除確認モーダル）→

```tsx
            {deleteTargetId && (
                <DeleteConfirmModal
                    title="チーム削除の確認"
                    message="このチームを削除してもよろしいですか？"
                    note="※この操作は取り消せません"
                    onConfirm={confirmDelete}
                    onCancel={cancelDelete}
                />
            )}
```

- [ ] **Step 3: 検証・コミット**

Run: `npm test && npm run build` → 全パス・成功
Run: `npx eslint src/components/MyTeamManager/MyTeamManager.tsx` → 変更前よりエラー増なし（44行目のset-state-in-effectが消えるので減るはず）
未使用となったimport（parseImportFile等）を削除すること。

```bash
git add src/components/MyTeamManager/
git commit -m "refactor: MyTeamManagerをTeamShared部品に置換"
```

---

### Task 7: OpponentManager / TeamManagerをTeamSharedに置換

**Files:**
- Modify: `src/components/OpponentManager/OpponentManager.tsx`
- Modify: `src/components/TeamManager/TeamManager.tsx`

**Interfaces:**
- Consumes: Task 5の全export

- [ ] **Step 1: OpponentManager.tsx に Task 6 と同一の変換を適用**
  - 同名のstate群・デバウンスeffect・4ハンドラを `useTeamImportExport({ onImported: <このファイルのリフレッシュ関数>, defaultImportTarget: 'opponent' })` に置換
  - テキスト貼り付けUI・インポート確認・削除確認のJSXブロックを部品に置換
  - **JSXが MyTeamManager版と異なる箇所があれば、その箇所だけインラインのまま残し**、レポートに差分を記載（同一化しない）

- [ ] **Step 2: TeamManager.tsx に同じ変換を適用**（共通ハンドラの出現は14箇所と少ないため、存在するものだけ置換。存在しない部品は導入しない）

- [ ] **Step 3: 検証・コミット**

Run: `npm test && npm run build` → 全パス・成功
Run: `npm run lint 2>&1 | grep problems` → エラー数が前タスク以下
Run: `wc -l src/components/MyTeamManager/MyTeamManager.tsx src/components/OpponentManager/OpponentManager.tsx src/components/TeamManager/TeamManager.tsx` → 合計が2,400行から**300行以上減**（目安）

```bash
git add src/components/OpponentManager/ src/components/TeamManager/
git commit -m "refactor: OpponentManager/TeamManagerもTeamSharedに統一"
```

---

### Task 8: CSS統合

**Files:**
- Create: `src/styles/common-components.css`
- Modify: `src/main.tsx`（import 1行追加）
- Modify: `src/components/MyTeamManager/MyTeamManager.css` ほか重複定義の削除

- [ ] **Step 1: 現状把握**

Run: `grep -n "\.spinner\b" -A8 src/components/MyTeamManager/MyTeamManager.css src/components/OpponentManager/OpponentManager.css src/components/TeamManager/TeamManager.css`
Run: `grep -n "\.modal-overlay" -A10 src/index.css src/components/History/History.css src/components/MyTeamManager/MyTeamManager.css src/components/OpponentManager/OpponentManager.css`

3ファイルの `.spinner` / `@keyframes spin` が同一定義であること、`.modal-overlay`（および`.modal-content`）の各定義と `src/index.css` の定義との差分を確認する。

- [ ] **Step 2: `src/styles/common-components.css` を作成**

Step 1で確認した `.spinner` / `@keyframes spin` の定義（3ファイルで同一のもの）をそのまま移す。**プロパティは1文字も変えない。**

- [ ] **Step 3: `src/main.tsx` にimport追加**

`import './index.css'` の直後に `import './styles/common-components.css'` を追加。

- [ ] **Step 4: 重複削除**

- `.spinner` / `@keyframes spin` を3つのコンポーネントCSSから削除
- `.modal-overlay` / `.modal-content` が `src/index.css` の定義と**完全同一**のコンポーネントCSSからのみ削除。1プロパティでも異なる場合は**削除せず残し**、レポートに差分を記載

- [ ] **Step 5: 検証・コミット**

Run: `npm run build` → 成功
（見た目の同一性はコントローラーがプレビューで確認する。実装者はビルドまで）

```bash
git add src/styles/ src/main.tsx src/components/
git commit -m "refactor: spinner等の重複CSSをcommon-components.cssに集約"
```

---

### Task 9: GameContext分割 (1/3) — score/statハンドラ抽出

**Files:**
- Create: `src/context/reducers/shared.ts`
- Create: `src/context/reducers/scoreHandlers.ts`
- Create: `src/context/reducers/statHandlers.ts`
- Modify: `src/context/GameContext.tsx`

**Interfaces:**
- Produces:
  - `shared.ts`: `recalculateRunningScores(scoreHistory: ScoreEntry[]): ScoreEntry[]`（GameContext.tsx:39-57の関数を移動）
  - 各ハンドラ: `export function handleAddScore(state: Game, payload: GameAction['payload']): Game` の形。**関数本体は既存caseブロックのコピーで、`action.payload` を `payload` に読み替える以外は1文字も変えない**
- 対象case→関数のマッピング:

| 移動元 (GameContext.tsx) | 移動先 | 関数名 |
|---|---|---|
| `case 'ADD_SCORE'` (132-187) | scoreHandlers.ts | `handleAddScore` |
| `case 'REMOVE_SCORE'` (687付近) | scoreHandlers.ts | `handleRemoveScore` |
| `case 'EDIT_SCORE'` | scoreHandlers.ts | `handleEditScore` |
| `case 'CONVERT_SCORE_TO_MISS'` | scoreHandlers.ts | `handleConvertScoreToMiss` |
| `case 'CONVERT_MISS_TO_SCORE'` | scoreHandlers.ts | `handleConvertMissToScore` |
| `case 'TOGGLE_OWN_GOAL'` | scoreHandlers.ts | `handleToggleOwnGoal` |
| `case 'ADD_STAT'` (189-242) | statHandlers.ts | `handleAddStat` |
| `case 'REMOVE_STAT'` (723付近) | statHandlers.ts | `handleRemoveStat` |
| `case 'EDIT_STAT'` | statHandlers.ts | `handleEditStat` |

- [ ] **Step 1: shared.ts に recalculateRunningScores を移動**（GameContext.tsxからは削除しimportに）
- [ ] **Step 2: scoreHandlers.ts / statHandlers.ts を作成し、上表のcase本体をコピー移動**

gameReducer側は各caseを委譲に置き換える:

```ts
        case 'ADD_SCORE':
            return handleAddScore(state, action.payload);
```

- [ ] **Step 3: 検証・コミット**

Run: `npm test` → 全パス（**gameReducer.test.tsは無変更のまま**）
Run: `npm run build` → 成功
Run: `npx eslint src/context/reducers/` → エラー0

```bash
git add src/context/
git commit -m "refactor: score/statハンドラをreducersディレクトリに抽出"
```

---

### Task 10: GameContext分割 (2/3) — foul/pendingハンドラ抽出

**Files:**
- Create: `src/context/reducers/foulHandlers.ts`
- Create: `src/context/reducers/pendingHandlers.ts`
- Modify: `src/context/GameContext.tsx`

**マッピング**（方式はTask 9と同一。case本体のコピー移動、セマンティクス変更ゼロ）:

| 移動元case | 移動先 | 関数名 |
|---|---|---|
| `ADD_FOUL` (244-328) | foulHandlers.ts | `handleAddFoul` |
| `ADD_FOUL_WITH_FREE_THROWS` (330-556) | foulHandlers.ts | `handleAddFoulWithFreeThrows` |
| `REMOVE_FOUL` (763付近) | foulHandlers.ts | `handleRemoveFoul` |
| `ADD_PENDING_ACTION` | pendingHandlers.ts | `handleAddPendingAction` |
| `RESOLVE_PENDING_ACTION` | pendingHandlers.ts | `handleResolvePendingAction` |
| `RESOLVE_PENDING_ACTION_WITH_FOUL_TYPE` | pendingHandlers.ts | `handleResolvePendingActionWithFoulType` |
| `RESOLVE_PENDING_ACTION_WITH_FREE_THROWS` | pendingHandlers.ts | `handleResolvePendingActionWithFreeThrows` |
| `RESOLVE_PENDING_ACTION_UNKNOWN` | pendingHandlers.ts | `handleResolvePendingActionUnknown` |
| `UPDATE_PENDING_ACTION_CANDIDATES` | pendingHandlers.ts | `handleUpdatePendingActionCandidates` |
| `REMOVE_PENDING_ACTION` | pendingHandlers.ts | `handleRemovePendingAction` |

- [ ] **Step 1: 2ファイルを作成しcase本体を移動、gameReducerを委譲化**
- [ ] **Step 2: 検証・コミット**（Task 9 Step 3と同じコマンド群）

```bash
git add src/context/
git commit -m "refactor: foul/pendingハンドラをreducersに抽出"
```

---

### Task 11: GameContext分割 (3/3) — gameFlowハンドラ抽出と仕上げ

**Files:**
- Create: `src/context/reducers/gameFlowHandlers.ts`
- Modify: `src/context/GameContext.tsx`

**マッピング**: 残る全case（`SET_TEAMS` / `START_GAME` / `PAUSE_GAME` / `RESUME_GAME` / `END_QUARTER` / `END_GAME` / `ADD_TIMEOUT` / `SUBSTITUTE_PLAYER` / `ADD_PLAYER_TO_TEAM` / `SELECT_PLAYER` / `CLEAR_SELECTION` / `RESET_GAME` / `RESTORE_GAME` / `UPDATE_GAME_INFO` / `SET_END_TIME`）を `gameFlowHandlers.ts` の `handleSetTeams` / `handleStartGame` ... に移動（1〜3行の単純caseは委譲せずgameReducer内に残してよい: PAUSE_GAME / RESUME_GAME / END_GAME / CLEAR_SELECTION / RESET_GAME / SET_END_TIME）。

- [ ] **Step 1: gameFlowHandlers.ts を作成しcase本体を移動、gameReducerを委譲化**
- [ ] **Step 2: 行数確認**

Run: `wc -l src/context/GameContext.tsx`
Expected: **300行以下**（Provider＋薄いswitch＋ヘルパーのみ）

- [ ] **Step 3: 検証・コミット**（テスト無変更パス・ビルド・eslint。Task 9 Step 3と同じ）

```bash
git add src/context/
git commit -m "refactor: gameFlowハンドラを抽出しGameContextを委譲switchに縮小"
```

---

### Task 12: lint解消（機械的分）

**Files:**
- Modify: lintエラーが残る各ファイル（`npm run lint` の実行結果が正）

**方針**（ルール別レシピ。**修正はエラー行のみ**、周辺リファクタ禁止）:

- [ ] **Step 1: 現状のエラー一覧を取得**

Run: `npm run lint 2>&1 | grep -B1 "error"` で全エラーをファイル:行:ルール別にリスト化しレポートに記録。

- [ ] **Step 2: ルール別に修正**

| ルール | レシピ |
|---|---|
| `@typescript-eslint/no-explicit-any` | 実際に渡っている型を書く。`GameAction.payload?: any` は `payload?: unknown` にし、各ハンドラ内の `as` キャストは既存のまま（Task 9-11でキャストは温存されている）。**注意: キャストなしで `payload` を分割代入している箇所（SET_TEAMS の `const { teamA, teamB } = action.payload;` 等）は unknown 化で型エラーになるため、`as { teamA: Team; teamB: Team }` のように実際の形のキャストを追加する（挙動不変）**。`(record as any).gameInfo` は `(record as { gameInfo?: GameInfo }).gameInfo` 型に |
| `no-case-declarations` | case節を `{ }` で囲む |
| `no-var` | `let`/`const` に |
| `prefer-const` | `const` に |
| `@typescript-eslint/no-unused-vars` | 未使用変数・引数を削除（`_`プレフィクスでの温存はしない） |
| `no-useless-escape` | 不要なエスケープ文字を削除（正規表現の挙動が変わらないことを目視確認） |
| `react-refresh/only-export-components` | 非コンポーネントexportを別ファイルへ移動（例: Toast.tsxの `showToast` → `src/components/Toast/toastApi.ts` に移して再export…ではなく**移動＋全importの張り替え**。GameContext.tsxの `gameReducer` export → `src/context/reducers/index.ts` から再exportし、テストのimportを更新（これはテストファイルのimport行のみの変更で、テスト本体は不変）） |

**注**: `react-hooks/set-state-in-effect` はこのタスクでは触らない（Task 13）。

- [ ] **Step 3: 検証・コミット**

Run: `npm test && npm run build` → 全パス・成功
Run: `npm run lint 2>&1 | grep problems` → **エラーは `react-hooks/set-state-in-effect` 系のみ残存**

```bash
git add -A src/
git commit -m "fix: 機械的なlintエラーを解消（any型付け・case節ブレース等）"
```

---

### Task 13: lint解消（set-state-in-effect是正）

**Files:**
- Modify: `npm run lint` で `react-hooks/set-state-in-effect` が出る各ファイル（Task 6-7で減っている想定。残存見込み: App.tsx:518 / GameInfoModal / History / Home / OpponentSelect / PlayerStatsAnalysis / QuarterLineup / OCRSettingsModal / TimeoutInputModal）

**方針**: このルール違反は「モーダルopen時のstateリセット」パターンが大半。**リポジトリ内の参照実装 `src/components/Legal/LegalModal.tsx:144付近`（レンダー中の状態調整パターン）に合わせて是正**する。1件ずつ:

1. 該当effectが「propの変化に応じたstateリセット」なら → レンダー中調整（prev値をstateに持ち比較して更新）に書き換え
2. 「初期化を1回だけ」なら → `useState(() => 初期値)` の遅延初期化に
3. 上記で表現できない複雑なものは → **無理に直さずその行に `// eslint-disable-next-line react-hooks/set-state-in-effect -- <理由>` を付け、レポートに列挙**（挙動を壊すくらいなら抑制が正。ただし理由必須）

- [ ] **Step 1: 対象を列挙**（`npm run lint 2>&1 | grep -B2 set-state-in-effect`）
- [ ] **Step 2: 1ファイルずつ是正 → そのたびに `npm test && npm run build`**
- [ ] **Step 3: 最終確認・コミット**

Run: `npm run lint 2>&1 | grep problems` → **エラー0件**（warningの`exhaustive-deps` 4件は残ってよい）

```bash
git add -A src/
git commit -m "fix: set-state-in-effectをレンダー中調整パターンに是正しlintエラー0に"
```

---

### Task 14: CIにlint追加・最終検証

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: ci.yml の `- run: npm test` の直前に追加**

```yaml
      - run: npm run lint
```

- [ ] **Step 2: 最終検証（スペックの成功基準）**

1. `npm run lint` → エラー0
2. `npm test` → 全パス（47件前後: 既存32＋createStorage 5＋useSwipe 5＋α）
3. `npm run build` → 成功
4. `wc -l src/context/GameContext.tsx` → 300行以下
5. `git diff --stat main@{1}..HEAD -- src/ | tail -1` 相当で削減行数を記録（目標: 差引約2,000行減。未達でも虚偽報告せず実数を記載）

- [ ] **Step 3: コミット**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lintチェックをCIに追加"
```

（push・プレビューでの手動スモークはコントローラーが実施）
