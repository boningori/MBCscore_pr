# クラウドバックアップ（半自動・共有シート方式）Implementation Plan

> **状態: 実装完了** — main に取り込み済み。実装は本計画の追加コミット `3a3c8b2`（2026-07-10）以降のコミット群にあたる。
> 以下のチェックボックスは実行時に更新していないため未チェックのまま残っている。**残作業の指標として読まないこと。**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ユーザー自身のクラウド（Drive/iCloud等）へワンタップでバックアップでき、試合保存後に適切に督促する機能を追加する。

**Architecture:** 既存の構造化バックアップ（`exportAllData`/`importFullBackup`）に漏れていた2データ（`recentOpponents`・`gameSession`）を追加し、OSの共有シート（Web Share API）でバックアップファイルを保存する `shareBackup()` を新設。最終バックアップ時刻を記録して督促要否を判定し、試合保存直後と設定画面から呼び出す。バックエンド・OAuthは使わない。

**Tech Stack:** React 19 + TypeScript + Vite、vitest（jsdom + fake-indexeddb）、既存の localStorage ラッパ `createJsonStorage`。

## Global Constraints

- 完全クライアントサイド（バックエンド・サーバー・OAuthなし）。GitHub Pages 静的ホスティング。
- 機微情報 `mbc_gemini`（APIキー）はバックアップに含めない（構造化方式のため自然に対象外）。
- バックアップ版数 `BACKUP_VERSION` を `'2.0'` に上げる。旧 `'1.0'` ファイルもインポート可能（新フィールドは任意）。
- localStorage キー：`minibasket-opponent-teams`（recentOpponents）、`minibasket-game-session`（gameSession）、`minibasket-last-backup`（新規・最終バックアップ情報）。
- テストは vitest。各テストの `beforeEach` で `localStorage.clear()`。既存の colocated `*.test.ts` 規約に従う。
- コミットは各タスク完了時。

---

### Task 1: バックアップ範囲を拡張（recentOpponents / gameSession）

**Files:**
- Modify: `src/utils/dataBackup.ts`
- Test: `src/utils/dataBackup.test.ts`

**Interfaces:**
- Consumes: `loadRecentOpponents(): SavedTeam[]`（teamStorage）、`loadGameSession(): GameSession | null` / `hasGameSession(): boolean`（gameSessionStorage）
- Produces:
  - `BackupData.data.recentOpponents?: SavedTeam[]`
  - `BackupData.data.gameSession?: GameSession | null`
  - `BACKUP_VERSION === '2.0'`
  - `exportAllData()` の戻り値に上記2フィールドを含む

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/dataBackup.test.ts` の末尾（最後の `});` の前）に追記。ファイル先頭の import に以下を追加：

```typescript
import { saveRecentOpponent, loadRecentOpponents } from './teamStorage';
import { saveGameSession, loadGameSession, hasGameSession } from './gameSessionStorage';
import { createInitialGame } from '../types/game';
```

テスト本体：

```typescript
describe('dataBackup 拡張範囲（recentOpponents / gameSession）', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('recentOpponents をエクスポート→全消去→インポートで復元できる', () => {
        saveRecentOpponent(makeSavedTeam('opp-1', '最近の相手'));

        const json = JSON.stringify(exportAllData());
        localStorage.clear();
        expect(loadRecentOpponents()).toHaveLength(0);

        const result = executeImport(parseImportJSON(json));
        expect(result.success).toBe(true);
        expect(loadRecentOpponents().some(t => t.id === 'opp-1')).toBe(true);
    });

    it('gameSession をエクスポート→全消去→インポートで復元できる', () => {
        const game = createInitialGame();
        saveGameSession(game, 'テスト大会', '2026-07-10T00:00:00.000Z');

        const json = JSON.stringify(exportAllData());
        localStorage.clear();
        expect(hasGameSession()).toBe(false);

        executeImport(parseImportJSON(json));
        const restored = loadGameSession();
        expect(restored?.gameName).toBe('テスト大会');
    });

    it('進行中セッションがある場合は gameSession を上書きしない', () => {
        saveGameSession(createInitialGame(), 'バックアップ側', '2026-07-10T00:00:00.000Z');
        const json = JSON.stringify(exportAllData());

        // 端末側に別の進行中セッションがある状態で復元
        saveGameSession(createInitialGame(), '端末側の進行中', '2026-07-11T00:00:00.000Z');
        executeImport(parseImportJSON(json));

        expect(loadGameSession()?.gameName).toBe('端末側の進行中');
    });

    it('version 1.0 の（新フィールドを持たない）バックアップもインポートできる', () => {
        const legacy = {
            version: '1.0',
            exportDate: '2026-07-01T00:00:00.000Z',
            appName: 'MBCscore',
            data: { myTeams: [makeSavedTeam('team-legacy', '旧チーム')] },
        };
        const result = executeImport(parseImportJSON(JSON.stringify(legacy)));
        expect(result.success).toBe(true);
        expect(loadMyTeams().some(t => t.id === 'team-legacy')).toBe(true);
    });
});
```

> 補足: `Game` は `createInitialGame()`（引数なし）で生成する。`saveGameSession(game, gameName, date)` の第2・第3引数が試合名・日付。

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- dataBackup`
Expected: FAIL（`recentOpponents`/`gameSession` が復元されない、または型エラー）

- [ ] **Step 3: `dataBackup.ts` を実装**

import に追加（既存 import 群の下）：

```typescript
import type { GameSession } from './gameSessionStorage';
import { loadGameSession, hasGameSession } from './gameSessionStorage';
import { loadRecentOpponents } from './teamStorage';
```

`BACKUP_VERSION` を変更：

```typescript
export const BACKUP_VERSION = '2.0';
```

`BackupData` の `data` に2フィールドを追加：

```typescript
    data: {
        gameHistory?: GameRecord[];
        myTeams?: SavedTeam[];
        opponents?: SavedTeam[];
        recentOpponents?: SavedTeam[];
        settings?: AppSettings;
        hiddenPlayers?: Record<string, string[]>;
        gameSession?: GameSession | null;
    };
```

`exportAllData()` を拡張：

```typescript
export function exportAllData(): BackupData {
    const gameHistory = loadGameHistory();
    const myTeams = loadMyTeams();
    const opponents = loadOpponents();
    const recentOpponents = loadRecentOpponents();
    const settings = loadAppSettings();
    const gameSession = loadGameSession();

    // 非表示選手情報を取得
    const hiddenPlayers = getHiddenPlayersData();

    return {
        version: BACKUP_VERSION,
        exportDate: new Date().toISOString(),
        appName: 'MBCscore',
        data: {
            gameHistory,
            myTeams,
            opponents,
            recentOpponents,
            settings,
            hiddenPlayers,
            gameSession,
        },
    };
}
```

`importFullBackup()` の「対戦チームのインポート」ブロックの直後（アプリ設定インポートの前）に追記：

```typescript
        // 最近の対戦相手のインポート（ID単位でマージ・最大10件）
        if (data.data.recentOpponents && Array.isArray(data.data.recentOpponents)) {
            const teams: SavedTeam[] = [];
            for (const t of data.data.recentOpponents) {
                const clean = sanitizeImportedTeam(t);
                if (clean) teams.push(clean);
            }
            const existingRecent = loadRecentOpponents();
            const mergedRecent = mergeArrayById(existingRecent, teams).slice(0, 10);
            localStorage.setItem('minibasket-opponent-teams', JSON.stringify(mergedRecent));
        }

        // 進行中の試合セッションのインポート（端末に進行中セッションが無い場合のみ復元）
        if (data.data.gameSession && !hasGameSession()) {
            localStorage.setItem('minibasket-game-session', JSON.stringify(data.data.gameSession));
        }
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test -- dataBackup`
Expected: PASS（既存テスト含め全緑）

- [ ] **Step 5: コミット**

```bash
git add src/utils/dataBackup.ts src/utils/dataBackup.test.ts
git commit -m "feat: バックアップ範囲にrecentOpponents/gameSessionを追加しv2.0に"
```

---

### Task 2: 最終バックアップ記録と督促要否判定（lastBackupStorage）

**Files:**
- Create: `src/utils/lastBackupStorage.ts`
- Test: `src/utils/lastBackupStorage.test.ts`

**Interfaces:**
- Consumes: `loadGameHistory(): GameRecord[]`（gameHistoryStorage）、`createJsonStorage`（createStorage）
- Produces:
  - `interface LastBackupInfo { timestamp: number; gameCount: number }`
  - `loadLastBackup(): LastBackupInfo | null`
  - `recordBackup(): void`（現在の試合数と現在時刻で記録）
  - `isBackupDue(): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/lastBackupStorage.test.ts` を新規作成：

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { loadLastBackup, recordBackup, isBackupDue } from './lastBackupStorage';
import { saveGameResult } from './gameHistoryStorage';
import { createTeam } from '../types/game';

function saveOneGame(name: string) {
    const teamA = createTeam('teamA', 'A', 'コーチ');
    const teamB = createTeam('teamB', 'B', 'コーチ');
    saveGameResult(name, teamA, teamB, [], [], []);
}

describe('lastBackupStorage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('試合が1件も無ければ督促しない', () => {
        expect(isBackupDue()).toBe(false);
    });

    it('未記録で試合が1件以上あれば督促する', () => {
        saveOneGame('第1試合');
        expect(loadLastBackup()).toBeNull();
        expect(isBackupDue()).toBe(true);
    });

    it('recordBackup後は督促しない', () => {
        saveOneGame('第1試合');
        recordBackup();
        const info = loadLastBackup();
        expect(info?.gameCount).toBe(1);
        expect(typeof info?.timestamp).toBe('number');
        expect(isBackupDue()).toBe(false);
    });

    it('バックアップ後に試合が増えたら再び督促する', () => {
        saveOneGame('第1試合');
        recordBackup();
        saveOneGame('第2試合');
        expect(isBackupDue()).toBe(true);
    });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- lastBackupStorage`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: `lastBackupStorage.ts` を実装**

```typescript
// 最終バックアップ情報の記録と督促要否の判定
// 「前回バックアップ後に試合が増えていれば督促する」ためのごく小さなストレージ

import { createJsonStorage } from './createStorage';
import { loadGameHistory } from './gameHistoryStorage';

const LAST_BACKUP_KEY = 'minibasket-last-backup';

export interface LastBackupInfo {
    timestamp: number;
    gameCount: number;
}

const lastBackupStorage = createJsonStorage<LastBackupInfo | null>(LAST_BACKUP_KEY, null, 'last backup');

// 最終バックアップ情報を取得
export function loadLastBackup(): LastBackupInfo | null {
    return lastBackupStorage.load();
}

// 現在の試合数・現在時刻でバックアップ済みとして記録
export function recordBackup(): void {
    lastBackupStorage.save({
        timestamp: Date.now(),
        gameCount: loadGameHistory().length,
    });
}

// 督促すべきか（前回バックアップ後に試合が増えていれば true）
export function isBackupDue(): boolean {
    const count = loadGameHistory().length;
    if (count === 0) return false;
    const last = loadLastBackup();
    if (!last) return true;
    return count > last.gameCount;
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test -- lastBackupStorage`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/utils/lastBackupStorage.ts src/utils/lastBackupStorage.test.ts
git commit -m "feat: 最終バックアップ記録と督促要否判定を追加"
```

---

### Task 3: `shareBackup()` — 共有シート/ダウンロードで保存し記録

**Files:**
- Modify: `src/utils/dataBackup.ts`
- Test: `src/utils/dataBackup.test.ts`

**Interfaces:**
- Consumes: `exportAllData()`、`generateBackupFilename()`、`shareFile()`、`downloadJSON()`（すべて dataBackup 内）、`recordBackup()`（lastBackupStorage）
- Produces: `shareBackup(): Promise<boolean>`（バックアップファイルを共有またはダウンロードできたら true・記録も更新。ハードエラー時 false）

**設計判断（頑健性優先）:** Web Share がキャンセル/失敗（`shareFile` が false）した場合でも、データ保全のためダウンロードにフォールバックしてファイルを必ず生成する。ファイルが生成できた両経路で `recordBackup()` を呼ぶ。例外時のみ false。

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/dataBackup.test.ts` の import に追加：

```typescript
import { shareBackup } from './dataBackup';
import { loadLastBackup } from './lastBackupStorage';
import { vi, afterEach } from 'vitest';
```

（既存の `import { describe, it, expect, beforeEach } from 'vitest';` に `vi, afterEach` が無ければ統合する）

テスト本体を末尾に追記：

```typescript
describe('shareBackup', () => {
    beforeEach(() => {
        localStorage.clear();
    });
    afterEach(() => {
        vi.restoreAllMocks();
        // テストで差し込んだ navigator.share を除去
        // @ts-expect-error テスト用クリーンアップ
        delete (navigator as unknown as { share?: unknown }).share;
    });

    it('Web Share非対応時はダウンロードで保存し、最終バックアップを記録する', async () => {
        const teamA = createTeam('teamA', 'A', 'コーチ');
        const teamB = createTeam('teamB', 'B', 'コーチ');
        saveGameResult('第1試合', teamA, teamB, [], [], []);

        // jsdomにはURL.createObjectURL等が無いためダウンロード経路をスタブ
        const createEl = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
            const el = createEl(tag);
            if (tag === 'a') el.click = () => {};
            return el as HTMLElement;
        });
        // @ts-expect-error jsdom未実装APIのスタブ
        URL.createObjectURL = () => 'blob:mock';
        // @ts-expect-error jsdom未実装APIのスタブ
        URL.revokeObjectURL = () => {};

        const ok = await shareBackup();
        expect(ok).toBe(true);
        expect(loadLastBackup()?.gameCount).toBe(1);
    });

    it('Web Share成功時はダウンロードせず記録する', async () => {
        const teamA = createTeam('teamA', 'A', 'コーチ');
        const teamB = createTeam('teamB', 'B', 'コーチ');
        saveGameResult('第1試合', teamA, teamB, [], [], []);

        // navigator.share を成功するモックに
        // @ts-expect-error テスト用に share を注入
        navigator.share = vi.fn().mockResolvedValue(undefined);
        const downloadSpy = vi.spyOn(URL, 'createObjectURL');

        const ok = await shareBackup();
        expect(ok).toBe(true);
        expect(loadLastBackup()?.gameCount).toBe(1);
        expect(downloadSpy).not.toHaveBeenCalled();
    });
});
```

> 補足: `shareFile()` は内部で `navigator.share({ files })` を呼ぶ。上のモックは files 付き share を成功させる。もし実機で files 非対応の分岐が必要になっても、本テストの範囲では `navigator.share` を resolve させれば共有成功として扱われる。

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- dataBackup`
Expected: FAIL（`shareBackup` が未定義）

- [ ] **Step 3: `shareBackup()` を実装**

`dataBackup.ts` の import に追加：

```typescript
import { recordBackup } from './lastBackupStorage';
```

`shareFile` 関数の直後あたりに新規関数を追加：

```typescript
/**
 * 全データバックアップを共有シート（対応時）またはダウンロードで保存する。
 * どちらかでファイルを生成できたら最終バックアップとして記録し true を返す。
 * データ保全のため、共有がキャンセル/失敗してもダウンロードにフォールバックする。
 */
export async function shareBackup(): Promise<boolean> {
    try {
        const data = exportAllData();
        const filename = generateBackupFilename();

        // モバイル等でWeb Shareが使えるならまず共有シートを試す
        if ('share' in navigator) {
            const shared = await shareFile(data, filename, 'MBCscore 全データバックアップ');
            if (shared) {
                recordBackup();
                return true;
            }
        }

        // 非対応・共有キャンセル時はダウンロードにフォールバック
        downloadJSON(data, filename);
        recordBackup();
        return true;
    } catch (error) {
        console.error('shareBackup failed:', error);
        return false;
    }
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test -- dataBackup`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/utils/dataBackup.ts src/utils/dataBackup.test.ts
git commit -m "feat: shareBackup（共有/ダウンロードで保存し記録）を追加"
```

---

### Task 4: 試合保存直後の督促UI（BackupPrompt）

**Files:**
- Create: `src/components/BackupPrompt/BackupPrompt.tsx`
- Create: `src/components/BackupPrompt/BackupPrompt.css`
- Test: `src/components/BackupPrompt/BackupPrompt.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `shareBackup()`（dataBackup）、`isBackupDue()`（lastBackupStorage）、既存 `Modal`
- Produces: `BackupPrompt` コンポーネント（props: `onBackup: () => void; onDismiss: () => void`）

- [ ] **Step 1: 失敗するテストを書く（コンポーネント単体）**

`src/components/BackupPrompt/BackupPrompt.test.tsx` を新規作成：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BackupPrompt } from './BackupPrompt';

describe('BackupPrompt', () => {
    it('「今すぐ保存」でonBackupが呼ばれる', () => {
        const onBackup = vi.fn();
        const onDismiss = vi.fn();
        render(<BackupPrompt onBackup={onBackup} onDismiss={onDismiss} />);
        fireEvent.click(screen.getByRole('button', { name: /今すぐ保存/ }));
        expect(onBackup).toHaveBeenCalledTimes(1);
    });

    it('「あとで」でonDismissが呼ばれる', () => {
        const onBackup = vi.fn();
        const onDismiss = vi.fn();
        render(<BackupPrompt onBackup={onBackup} onDismiss={onDismiss} />);
        fireEvent.click(screen.getByRole('button', { name: /あとで/ }));
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- BackupPrompt`
Expected: FAIL（コンポーネント未実装）

- [ ] **Step 3: `BackupPrompt.tsx` と CSS を実装**

`src/components/BackupPrompt/BackupPrompt.tsx`：

```tsx
import React from 'react';
import { Modal } from '../Modal';
import './BackupPrompt.css';

interface BackupPromptProps {
    onBackup: () => void;
    onDismiss: () => void;
}

export const BackupPrompt: React.FC<BackupPromptProps> = ({ onBackup, onDismiss }) => {
    return (
        <Modal
            onClose={onDismiss}
            overlayClassName="backup-prompt-overlay"
            contentClassName="backup-prompt-modal"
            labelledBy="backup-prompt-title"
        >
            <div className="backup-prompt-body">
                <h2 id="backup-prompt-title">💾 バックアップしますか？</h2>
                <p>
                    新しい試合が記録されました。端末の故障や機種変更に備えて、
                    今のうちにクラウド（Drive/iCloud等）へバックアップしておくと安心です。
                </p>
                <div className="backup-prompt-actions">
                    <button className="btn btn-secondary" onClick={onDismiss}>あとで</button>
                    <button className="btn btn-primary" onClick={onBackup}>今すぐ保存</button>
                </div>
            </div>
        </Modal>
    );
};
```

`src/components/BackupPrompt/BackupPrompt.css`：

```css
.backup-prompt-modal {
    max-width: 420px;
    padding: 1.25rem;
}

.backup-prompt-body h2 {
    margin: 0 0 0.75rem;
    font-size: 1.15rem;
}

.backup-prompt-body p {
    margin: 0 0 1.25rem;
    line-height: 1.6;
}

.backup-prompt-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
}
```

> 補足: `Modal` の props 名（`overlayClassName`/`contentClassName`/`labelledBy`/`onClose`）は `src/components/Modal` の実装に必ず合わせること（`AppSettingsModal.tsx` と同じ使い方）。異なる場合はそのシグネチャに合わせる。

- [ ] **Step 4: コンポーネントテストを実行して成功を確認**

Run: `npm test -- BackupPrompt`
Expected: PASS

- [ ] **Step 5: `App.tsx` に配線**

import 追加（既存 import 群に合わせて）：

```typescript
import { BackupPrompt } from './components/BackupPrompt/BackupPrompt';
import { isBackupDue } from './utils/lastBackupStorage';
import { shareBackup } from './utils/dataBackup';
```

督促表示用の state を他の `useState` 付近に追加：

```typescript
const [showBackupPrompt, setShowBackupPrompt] = useState(false);
```

`handleGameFinished` を変更（`clearGameSession()` の後、`setScreen('home')` の前に督促判定を追加）：

```typescript
  const handleGameFinished = () => {
    // 試合結果を保存
    saveGameResult(
      gameName,
      state.teamA,
      state.teamB,
      state.scoreHistory,
      state.statHistory,
      state.foulHistory,
      new Date(date),
      state.gameInfo
    );

    // セッションデータをクリア
    clearGameSession();

    // ホームへ戻る
    setScreen('home');

    // 前回バックアップ後に試合が増えていれば督促
    if (isBackupDue()) {
      setShowBackupPrompt(true);
    }
  };
```

`restoreCandidate` の early return ブロックの直前に、督促モーダルのレンダリングを追加：

```tsx
  if (showBackupPrompt) {
    return (
      <BackupPrompt
        onBackup={async () => {
          await shareBackup();
          setShowBackupPrompt(false);
        }}
        onDismiss={() => setShowBackupPrompt(false)}
      />
    );
  }
```

> 補足: `App.tsx` は画面ごとに early return する構造。督促は `home` 画面へ戻った上に重ねたいので、上記モーダル return は `if (screen === 'home')` ブロックより前に置き、モーダルを閉じると通常のホーム描画に戻るようにする（モーダルは全画面を占有せず overlay で重なる想定。`Modal` が overlay 実装のため背面は隠れるが、閉じれば直後のレンダーでホームが表示される）。

- [ ] **Step 6: 型チェック・ビルドと全テスト**

Run: `npm run build`
Expected: 型エラーなくビルド成功

Run: `npm test`
Expected: 全テスト PASS

- [ ] **Step 7: コミット**

```bash
git add src/components/BackupPrompt src/App.tsx
git commit -m "feat: 試合保存直後のバックアップ督促UIを追加"
```

---

### Task 5: 設定画面の「今すぐクラウドに保存」と最終バックアップ日時表示

**Files:**
- Modify: `src/components/Settings/AppSettingsModal.tsx`

**Interfaces:**
- Consumes: `shareBackup()`（dataBackup）、`loadLastBackup()`（lastBackupStorage）
- Produces: なし（UI配線のみ）

- [ ] **Step 1: import と最終バックアップ表示を追加**

import に追加：

```typescript
import { shareBackup } from '../../utils/dataBackup';
import { loadLastBackup } from '../../utils/lastBackupStorage';
```

（`shareBackup` は `../../utils/dataBackup` の既存 import 文にまとめて追加してよい）

コンポーネント内、`isOpen` が true になったときの初期化ブロック（`if (isOpen) { ... }`）に最終バックアップ表示用 state を追加。まず state 宣言：

```typescript
const [lastBackupText, setLastBackupText] = useState<string>('未バックアップ');
```

初期化ブロック内に：

```typescript
            const lb = loadLastBackup();
            setLastBackupText(lb ? new Date(lb.timestamp).toLocaleString('ja-JP') : '未バックアップ');
```

- [ ] **Step 2: `handleExportAll` を `shareBackup` 経由に変更**

既存の `handleExportAll` を差し替え：

```typescript
    const handleExportAll = async () => {
        const ok = await shareBackup();
        if (ok) {
            const lb = loadLastBackup();
            setLastBackupText(lb ? new Date(lb.timestamp).toLocaleString('ja-JP') : '未バックアップ');
            showStatus('✓ バックアップを保存しました', 'success');
        } else {
            showStatus('バックアップに失敗しました', 'error');
        }
    };
```

- [ ] **Step 3: バックアップカードに最終バックアップ日時を表示**

`data-section-card`（📤 バックアップ）の `<h4 className="subsection-title">📤 バックアップ</h4>` の直後に追加：

```tsx
                                <p className="section-description last-backup-label">
                                    最終バックアップ: {lastBackupText}
                                </p>
```

「全データをエクスポート」ボタンのラベルを実態に合わせて微調整（任意）：

```tsx
                                <button
                                    className="btn btn-primary btn-block"
                                    onClick={handleExportAll}
                                    aria-label="全データをクラウドまたはファイルに保存"
                                >
                                    💾 今すぐクラウド/ファイルに保存
                                </button>
```

- [ ] **Step 4: 型チェック・ビルドと全テスト**

Run: `npm run build`
Expected: 型エラーなくビルド成功

Run: `npm test`
Expected: 全テスト PASS

- [ ] **Step 5: 動作確認（プレビュー）**

Run: 開発サーバを起動し、設定→「今すぐクラウド/ファイルに保存」でファイルが生成され、「最終バックアップ」表示が更新されることを確認。試合を保存すると督促モーダルが出ること、「あとで」で閉じ、再度試合を保存すると再び出ることを確認。

- [ ] **Step 6: コミット**

```bash
git add src/components/Settings/AppSettingsModal.tsx
git commit -m "feat: 設定画面にクラウド保存ボタンと最終バックアップ日時を追加"
```

---

## Self-Review（計画者による確認）

- **仕様カバレッジ**:
  - §2 共有シート方式 → Task 3 `shareBackup`
  - §3 範囲拡張（recentOpponents/gameSession、v2.0、後方互換、gameSession上書き防止）→ Task 1
  - §4.1 共有アクション → Task 3
  - §4.2 最終バックアップ記録 → Task 2 `recordBackup`（Task 3 で成功時呼び出し）
  - §4.3 督促要否 → Task 2 `isBackupDue`
  - §4.4(a) 試合保存直後の督促 → Task 4
  - §4.4(b) 設定の常設ボタン＋最終日時 → Task 5
  - §6 エラーハンドリング（Share非対応→ダウンロード、gameSession上書き防止）→ Task 1 / Task 3
  - §7 テスト → 各 Task の Step1/2/4
  - §8 スコープ外（OAuth自動同期・APIキー同梱・起動時バナー）→ 実装しない
- **プレースホルダ**: なし（各コード片は実コード。`createGame`/`Modal` の実シグネチャ確認補足のみ付記）。
- **型整合**: `LastBackupInfo`/`recordBackup`/`isBackupDue`/`shareBackup`/`BackupPrompt(props)` はタスク間で名称一致。`BACKUP_VERSION='2.0'`。

## 既知の要確認点（実装時に現物合わせ）

- `src/components/Modal` の props 名（Task 4）。`AppSettingsModal.tsx` と同じ使い方で合わせる。
- jsdom でのダウンロード経路スタブ（Task 3 テスト）。環境により `URL.createObjectURL` の扱いが異なるため、失敗時はモック方法を調整。
