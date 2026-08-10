# MBCscore 商用品質化 実装計画

> **状態: 実装完了** — main に取り込み済み。実装は本計画の追加コミット `d55a9b9`（2026-07-04）以降のコミット群にあたる。
> 以下のチェックボックスは実行時に更新していないため未チェックのまま残っている。**残作業の指標として読まないこと。**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ローカル完結のまま、データ保全・クラッシュ耐性・テスト・セキュリティ・法務表記を商用水準に引き上げる。

**Architecture:** 既存のlocalStorage読み書きは一切変更せず、その上にIndexedDBミラーバックアップ（10世代）・ErrorBoundary・ローカルエラーログを重ねる。スコア集計などの純粋ロジックにVitestユニットテストを整備し、CI（test+build）で守る。法務文書は静的JSXとして設定画面から閲覧可能にする。

**Tech Stack:** React 19, TypeScript (strict), Vite 7, vite-plugin-pwa。新規devDependenciesのみ追加: vitest, jsdom, fake-indexeddb。**新規のruntime dependencyは追加しない。**

## Global Constraints

- 既存の保存・読込ロジック（`gameSessionStorage.ts` 等の関数本体）は変更しない。変更が許されるのはcatch節への通知1行追加のみ
- UIテキストはすべて日本語。連絡先は `mbcscore@gmail.com`
- `vite.config.ts` の `base: '/MBCscore_pr/'` は変更しない
- tsconfigの `strict: true` / `verbatimModuleSyntax: true` / `erasableSyntaxOnly: true` を維持（型のみのimportは `import type` を使う）
- **既存コードにlintエラーが51件ある（既知・本計画のスコープ外）。CIにlintは含めない。** 新規コードはlintエラーを増やさないこと（`npx eslint <新規ファイル>` で個別確認）
- テストファイルは `src/**/*.test.ts` に置き、`tsconfig.app.json` の `exclude` でアプリビルドから除外する
- コミットメッセージ末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` を付ける

---

### Task 1: Vitest基盤の導入 + playerNumberテスト

**Files:**
- Modify: `package.json`（scripts追加）
- Create: `vitest.config.ts`
- Modify: `tsconfig.app.json`（testファイルをexclude）
- Create: `src/types/global.d.ts`
- Modify: `vite.config.ts`（`define` で `__APP_VERSION__` を注入）
- Test: `src/utils/playerNumber.test.ts`

**Interfaces:**
- Produces: `npm test`（vitest run）、`__APP_VERSION__: string` グローバル定数（後続タスクの errorLog.ts が使用）

- [ ] **Step 1: devDependenciesをインストール**

```bash
npm install -D vitest jsdom fake-indexeddb
```

- [ ] **Step 2: vitest.config.ts を作成**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
    },
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.{ts,tsx}'],
    },
});
```

- [ ] **Step 3: package.json の scripts に test を追加**

`"preview": "vite preview",` の行の後に追加:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 4: tsconfig.app.json にexcludeを追加**

`"include": ["src"]` の行を以下に変更:

```json
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/**/*.test.tsx"]
```

- [ ] **Step 5: `src/types/global.d.ts` を作成**

```ts
// vite.config.ts / vitest.config.ts の define で注入されるグローバル定数
declare const __APP_VERSION__: string;
```

- [ ] **Step 6: vite.config.ts に define を追加**

`base: '/MBCscore_pr/',` の直後に追加:

```ts
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
  },
```

- [ ] **Step 7: 失敗するテストを書く — `src/utils/playerNumber.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
    DOUBLE_ZERO_INTERNAL,
    formatPlayerNumber,
    parsePlayerNumber,
    isValidPlayerNumber,
    comparePlayerNumbers,
    sortPlayersByNumber,
} from './playerNumber';

describe('playerNumber', () => {
    it('formatPlayerNumber: 100は"00"、それ以外はそのまま文字列化する', () => {
        expect(formatPlayerNumber(DOUBLE_ZERO_INTERNAL)).toBe('00');
        expect(formatPlayerNumber(0)).toBe('0');
        expect(formatPlayerNumber(23)).toBe('23');
    });

    it('parsePlayerNumber: "00"は100、"0"は0、範囲外・非数値はnull', () => {
        expect(parsePlayerNumber('00')).toBe(DOUBLE_ZERO_INTERNAL);
        expect(parsePlayerNumber('0')).toBe(0);
        expect(parsePlayerNumber(' 15 ')).toBe(15);
        expect(parsePlayerNumber('100')).toBeNull();
        expect(parsePlayerNumber('-1')).toBeNull();
        expect(parsePlayerNumber('abc')).toBeNull();
    });

    it('isValidPlayerNumber: 0-99と100(=00)のみ有効', () => {
        expect(isValidPlayerNumber(0)).toBe(true);
        expect(isValidPlayerNumber(99)).toBe(true);
        expect(isValidPlayerNumber(DOUBLE_ZERO_INTERNAL)).toBe(true);
        expect(isValidPlayerNumber(101)).toBe(false);
        expect(isValidPlayerNumber(-1)).toBe(false);
    });

    it('comparePlayerNumbers: 00(100)は必ず最後に来る', () => {
        expect(comparePlayerNumbers(DOUBLE_ZERO_INTERNAL, 99)).toBeGreaterThan(0);
        expect(comparePlayerNumbers(5, DOUBLE_ZERO_INTERNAL)).toBeLessThan(0);
        expect(comparePlayerNumbers(4, 7)).toBeLessThan(0);
    });

    it('sortPlayersByNumber: 0,1,...,99,00の順にソートし元配列は変更しない', () => {
        const players = [
            { number: DOUBLE_ZERO_INTERNAL },
            { number: 7 },
            { number: 0 },
        ];
        const sorted = sortPlayersByNumber(players);
        expect(sorted.map(p => p.number)).toEqual([0, 7, DOUBLE_ZERO_INTERNAL]);
        expect(players.map(p => p.number)).toEqual([DOUBLE_ZERO_INTERNAL, 7, 0]);
    });
});
```

- [ ] **Step 8: テストを実行して全パスを確認**

Run: `npm test`
Expected: `5 passed`（playerNumber.tsは既存実装のため、このタスクではテストが直ちにパスする。落ちた場合は実装ではなくテストの期待値を疑うこと）

- [ ] **Step 9: ビルドが壊れていないことを確認**

Run: `npm run build`
Expected: 成功（`dist/` 生成、エラーなし）

- [ ] **Step 10: コミット**

```bash
git add package.json package-lock.json vitest.config.ts tsconfig.app.json vite.config.ts src/types/global.d.ts src/utils/playerNumber.test.ts
git commit -m "test: Vitest基盤を導入しplayerNumberテストを追加"
```

---

### Task 2: gameReducerのスコア・ファウル・クォーター集計テスト

**Files:**
- Modify: `src/context/GameContext.tsx:60`（`function gameReducer` → `export function gameReducer`）
- Test: `src/context/gameReducer.test.ts`

**Interfaces:**
- Consumes: `createInitialGame`, `createTeam`, `createPlayer`（`src/types/game.ts` の既存export）
- Produces: `export function gameReducer(state: Game, action: GameAction): Game`（テスト用にexport化。挙動変更なし）

- [ ] **Step 1: 失敗するテストを書く — `src/context/gameReducer.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { gameReducer } from './GameContext';
import type { Game } from '../types/game';
import { createInitialGame, createTeam, createPlayer } from '../types/game';

// 両チーム2名ずつの試合状態を作るヘルパー
function makeGame(): Game {
    const game = createInitialGame();
    const teamA = createTeam('teamA', 'ホーム', 'コーチA');
    teamA.players = [
        createPlayer('a1', 4, '選手A1', true),
        createPlayer('a2', 5, '選手A2'),
    ];
    const teamB = createTeam('teamB', 'ビジター', 'コーチB');
    teamB.players = [
        createPlayer('b1', 6, '選手B1', true),
        createPlayer('b2', 7, '選手B2'),
    ];
    game.teamA = teamA;
    game.teamB = teamB;
    game.phase = 'playing';
    return game;
}

describe('gameReducer: ADD_SCORE', () => {
    it('2Pで得点+2、2P成功/試投が+1され、履歴にランニングスコアが記録される', () => {
        const state = gameReducer(makeGame(), {
            type: 'ADD_SCORE',
            payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' },
        });
        const p = state.teamA.players.find(p => p.id === 'a1')!;
        expect(p.stats.points).toBe(2);
        expect(p.stats.twoPointMade).toBe(1);
        expect(p.stats.twoPointAttempt).toBe(1);
        expect(state.scoreHistory).toHaveLength(1);
        expect(state.scoreHistory[0].points).toBe(2);
        expect(state.scoreHistory[0].runningScoreA).toBe(2);
        expect(state.scoreHistory[0].runningScoreB).toBe(0);
    });

    it('3PとFTの得点・成功数が正しく加算される', () => {
        let state = makeGame();
        state = gameReducer(state, { type: 'ADD_SCORE', payload: { teamId: 'teamB', playerId: 'b1', scoreType: '3P' } });
        state = gameReducer(state, { type: 'ADD_SCORE', payload: { teamId: 'teamB', playerId: 'b1', scoreType: 'FT' } });
        const p = state.teamB.players.find(p => p.id === 'b1')!;
        expect(p.stats.points).toBe(4);
        expect(p.stats.threePointMade).toBe(1);
        expect(p.stats.freeThrowMade).toBe(1);
        expect(state.scoreHistory[1].runningScoreB).toBe(4);
    });
});

describe('gameReducer: ADD_STAT / REMOVE_SCORE', () => {
    it('TO:DDでturnoversとturnoverDDが両方+1される', () => {
        const state = gameReducer(makeGame(), {
            type: 'ADD_STAT',
            payload: { teamId: 'teamA', playerId: 'a2', statType: 'TO:DD' },
        });
        const p = state.teamA.players.find(p => p.id === 'a2')!;
        expect(p.stats.turnovers).toBe(1);
        expect(p.stats.turnoverDD).toBe(1);
        expect(state.statHistory).toHaveLength(1);
    });

    it('REMOVE_SCOREで得点と履歴が取り消される', () => {
        let state = gameReducer(makeGame(), {
            type: 'ADD_SCORE',
            payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' },
        });
        const entryId = state.scoreHistory[0].id;
        state = gameReducer(state, { type: 'REMOVE_SCORE', payload: { entryId } });
        const p = state.teamA.players.find(p => p.id === 'a1')!;
        expect(p.stats.points).toBe(0);
        expect(p.stats.twoPointMade).toBe(0);
        expect(state.scoreHistory).toHaveLength(0);
    });
});

describe('gameReducer: ADD_FOUL', () => {
    it('選手ファウルで当該Qのチームファウルと選手ファウル履歴が+1される', () => {
        const state = gameReducer(makeGame(), {
            type: 'ADD_FOUL',
            payload: { teamId: 'teamA', playerId: 'a1', foulType: 'P' },
        });
        expect(state.teamA.teamFouls[0]).toBe(1);
        const p = state.teamA.players.find(p => p.id === 'a1')!;
        expect(p.fouls).toHaveLength(1);
        expect(state.foulHistory).toHaveLength(1);
        expect(state.foulHistory[0].isCoachOrBench).toBe(false);
    });

    it('コーチテクニカルはチームファウルに加算されない', () => {
        const state = gameReducer(makeGame(), {
            type: 'ADD_FOUL',
            payload: { teamId: 'teamA', playerId: 'COACH', foulType: 'T' },
        });
        expect(state.teamA.teamFouls[0]).toBe(0);
        expect(state.teamA.coachFouls).toEqual(['T']);
        expect(state.foulHistory[0].isCoachOrBench).toBe(true);
        expect(state.foulHistory[0].coachFoulTarget).toBe('COACH');
    });
});

describe('gameReducer: END_QUARTER / END_GAME', () => {
    it('Q1終了でQ2・quarterEndフェーズになる', () => {
        const state = gameReducer(makeGame(), { type: 'END_QUARTER' });
        expect(state.currentQuarter).toBe(2);
        expect(state.phase).toBe('quarterEnd');
    });

    it('Q4終了時に点差があれば試合終了になる', () => {
        let state = makeGame();
        state.currentQuarter = 4;
        state = gameReducer(state, { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'a1', scoreType: '2P' } });
        state = gameReducer(state, { type: 'END_QUARTER' });
        expect(state.phase).toBe('finished');
        expect(state.endTime).not.toBeNull();
    });

    it('Q4終了時に同点ならオーバータイム(Q5)に入り、チームファウル枠が拡張される', () => {
        let state = makeGame();
        state.currentQuarter = 4;
        state = gameReducer(state, { type: 'END_QUARTER' });
        expect(state.currentQuarter).toBe(5);
        expect(state.phase).toBe('quarterEnd');
        expect(state.teamA.teamFouls).toHaveLength(5);
        expect(state.teamB.teamFouls).toHaveLength(5);
        expect(state.teamA.players[0].quartersPlayed).toHaveLength(5);
    });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test`
Expected: FAIL — `gameReducer` がexportされていないため import エラー

- [ ] **Step 3: gameReducerをexportする**

`src/context/GameContext.tsx:60` を変更:

```ts
// 変更前
function gameReducer(state: Game, action: GameAction): Game {
// 変更後
export function gameReducer(state: Game, action: GameAction): Game {
```

- [ ] **Step 4: テストを実行して全パスを確認**

Run: `npm test`
Expected: PASS（playerNumberの5件 + 本タスクの9件）

- [ ] **Step 5: コミット**

```bash
git add src/context/GameContext.tsx src/context/gameReducer.test.ts
git commit -m "test: gameReducerのスコア・ファウル・クォーター集計テストを追加"
```

---

### Task 3: dataBackup往復整合性 + playerStatsAnalysis集計テスト

**Files:**
- Test: `src/utils/dataBackup.test.ts`
- Test: `src/utils/playerStatsAnalysis.test.ts`

**Interfaces:**
- Consumes: `exportAllData`, `parseImportJSON`, `executeImport`（dataBackup.ts）、`saveMyTeam`, `loadMyTeams`, `SavedTeam`（teamStorage.ts）、`saveGameResult`, `loadGameHistory`（gameHistoryStorage.ts）、`aggregatePlayerStats`（playerStatsAnalysis.ts）

- [ ] **Step 1: `src/utils/dataBackup.test.ts` を書く**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { exportAllData, parseImportJSON, executeImport } from './dataBackup';
import { saveMyTeam, loadMyTeams } from './teamStorage';
import type { SavedTeam } from './teamStorage';
import { saveGameResult, loadGameHistory } from './gameHistoryStorage';
import { createTeam, createPlayer } from '../types/game';

function makeSavedTeam(id: string, name: string): SavedTeam {
    return {
        id,
        name,
        coachName: 'コーチ',
        assistantCoachName: '',
        players: [
            { number: 4, name: '選手A', isCaptain: true },
            { number: 5, name: '選手B', isCaptain: false },
        ],
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
    };
}

describe('dataBackup 往復整合性', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('全データをエクスポート→全消去→インポートで復元できる', () => {
        saveMyTeam(makeSavedTeam('team-1', 'マイチーム'));
        const teamA = createTeam('teamA', 'マイチーム', 'コーチ');
        teamA.players = [createPlayer('teamA-player-0', 4, '選手A', true)];
        const teamB = createTeam('teamB', '相手チーム', '相手コーチ');
        saveGameResult('テスト大会', teamA, teamB, [], [], []);

        const json = JSON.stringify(exportAllData());

        localStorage.clear();
        expect(loadMyTeams()).toHaveLength(0);
        expect(loadGameHistory()).toHaveLength(0);

        const parsed = parseImportJSON(json);
        expect(parsed.type).toBe('backup');
        const result = executeImport(parsed);
        expect(result.success).toBe(true);

        const teams = loadMyTeams();
        expect(teams).toHaveLength(1);
        expect(teams[0].name).toBe('マイチーム');
        expect(teams[0].players).toHaveLength(2);

        const history = loadGameHistory();
        expect(history).toHaveLength(1);
        expect(history[0].gameName).toBe('テスト大会');
    });

    it('バージョン情報のないJSONはunknownとして拒否される', () => {
        expect(parseImportJSON('{"foo": 1}').type).toBe('unknown');
        expect(parseImportJSON('こわれたJSON').type).toBe('unknown');
    });

    it('unknownデータのインポートは失敗を返す', () => {
        const result = executeImport(parseImportJSON('{"foo": 1}'));
        expect(result.success).toBe(false);
    });
});
```

- [ ] **Step 2: `src/utils/playerStatsAnalysis.test.ts` を書く**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { aggregatePlayerStats, generatePlayerKey } from './playerStatsAnalysis';
import type { SavedTeam } from './teamStorage';
import { saveGameResult } from './gameHistoryStorage';
import { createTeam, createPlayer } from '../types/game';

const myTeam: SavedTeam = {
    id: 'team-1',
    name: 'マイチーム',
    coachName: 'コーチ',
    assistantCoachName: '',
    players: [{ number: 4, name: '選手A', isCaptain: true }],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
};

// 選手Aがpoints得点した試合を1件保存するヘルパー
function recordGame(points: number, opponentPoints: number, date: Date) {
    const teamA = createTeam('teamA', 'マイチーム', 'コーチ');
    teamA.isMyTeam = true;
    const player = createPlayer('teamA-player-0', 4, '選手A', true);
    player.stats.points = points;
    teamA.players = [player];

    const teamB = createTeam('teamB', '相手チーム', '相手コーチ');
    const opponent = createPlayer('teamB-player-0', 6, '相手選手', true);
    opponent.stats.points = opponentPoints;
    teamB.players = [opponent];

    saveGameResult('テスト大会', teamA, teamB, [], [], [], date);
}

describe('playerStatsAnalysis', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('generatePlayerKey: ライセンスNoがあれば名前_番号、なければ名前のみ', () => {
        expect(generatePlayerKey('選手A', 'AB123')).toBe('選手A_AB123');
        expect(generatePlayerKey('選手A')).toBe('選手A');
    });

    it('複数試合の合計・平均・出場試合数・勝敗が正しく集計される', () => {
        recordGame(10, 5, new Date('2026-06-01'));  // 勝ち
        recordGame(20, 30, new Date('2026-06-08')); // 負け

        const stats = aggregatePlayerStats(myTeam);
        expect(stats).toHaveLength(1);
        const playerA = stats[0];
        expect(playerA.name).toBe('選手A');
        expect(playerA.gamesPlayed).toBe(2);
        expect(playerA.totalStats.points).toBe(30);
        expect(playerA.avgStats.points).toBe(15);
        expect(playerA.gameHistory.map(g => g.result).sort()).toEqual(['loss', 'win']);
    });

    it('期間フィルタで範囲外の試合は集計されない', () => {
        recordGame(10, 5, new Date('2026-05-01'));
        recordGame(20, 5, new Date('2026-06-15'));

        const stats = aggregatePlayerStats(myTeam, new Date('2026-06-01'));
        expect(stats[0].gamesPlayed).toBe(1);
        expect(stats[0].totalStats.points).toBe(20);
    });
});
```

- [ ] **Step 3: テストを実行して全パスを確認**

Run: `npm test`
Expected: PASS（既存実装をテストしているため、パスするのが正。落ちた場合はテストの前提（isMyTeamフラグ等）を実装コードと突き合わせて修正）

- [ ] **Step 4: コミット**

```bash
git add src/utils/dataBackup.test.ts src/utils/playerStatsAnalysis.test.ts
git commit -m "test: バックアップ往復整合性とスタッツ集計のテストを追加"
```

---

### Task 4: mirrorBackup.ts — IndexedDBミラーバックアップ（TDD）

**Files:**
- Create: `src/utils/mirrorBackup.ts`
- Test: `src/utils/mirrorBackup.test.ts`

**Interfaces:**
- Produces（後続タスクのApp.tsx統合が使用）:
  - `interface MirrorSnapshot { timestamp: number; entries: Record<string, string> }`
  - `collectAppData(): Record<string, string>`
  - `hasAppData(): boolean`
  - `saveSnapshot(now?: number): Promise<void>`
  - `maybeSnapshot(): Promise<void>`（30秒スロットル）
  - `getLatestSnapshot(): Promise<MirrorSnapshot | null>`
  - `restoreSnapshot(snapshot: MirrorSnapshot): void`
  - `requestPersistentStorage(): Promise<boolean>`

- [ ] **Step 1: 失敗するテストを書く — `src/utils/mirrorBackup.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// モジュール内部のスロットル状態をテストごとにリセットするため動的import
async function freshModule() {
    vi.resetModules();
    return await import('./mirrorBackup');
}

describe('mirrorBackup', () => {
    beforeEach(() => {
        localStorage.clear();
        indexedDB.deleteDatabase('mbc-mirror-backup');
    });

    it('collectAppData: アプリのキーのみ収集する', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '[]');
        localStorage.setItem('mbc_gemini_api_key', 'k');
        localStorage.setItem('unrelated-key', 'x');
        const data = m.collectAppData();
        expect(Object.keys(data).sort()).toEqual(['mbc_gemini_api_key', 'minibasket-my-teams']);
        expect(m.hasAppData()).toBe(true);
    });

    it('saveSnapshot→getLatestSnapshotで最新世代が取得できる', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '["v1"]');
        await m.saveSnapshot(1000);
        localStorage.setItem('minibasket-my-teams', '["v2"]');
        await m.saveSnapshot(2000);

        const latest = await m.getLatestSnapshot();
        expect(latest).not.toBeNull();
        expect(latest!.timestamp).toBe(2000);
        expect(latest!.entries['minibasket-my-teams']).toBe('["v2"]');
    });

    it('10世代を超えた古いスナップショットは削除される', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '[]');
        for (let i = 1; i <= 12; i++) {
            await m.saveSnapshot(i * 1000);
        }
        const latest = await m.getLatestSnapshot();
        expect(latest!.timestamp).toBe(12000);
        // 1000, 2000 の世代は削除されているはず（3000が最古）
        const all = await m.getAllSnapshots();
        expect(all).toHaveLength(10);
        expect(Math.min(...all.map(s => s.timestamp))).toBe(3000);
    });

    it('空のlocalStorageではスナップショットを作らない（既存世代を守る）', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '["v1"]');
        await m.saveSnapshot(1000);
        localStorage.clear();
        await m.saveSnapshot(2000);
        const latest = await m.getLatestSnapshot();
        expect(latest!.timestamp).toBe(1000);
    });

    it('restoreSnapshot: エントリをlocalStorageへ書き戻す', async () => {
        const m = await freshModule();
        m.restoreSnapshot({ timestamp: 1, entries: { 'minibasket-my-teams': '["restored"]' } });
        expect(localStorage.getItem('minibasket-my-teams')).toBe('["restored"]');
    });

    it('maybeSnapshot: 30秒以内の連続呼び出しはスキップされる', async () => {
        const m = await freshModule();
        // Dateのみ偽装する（setTimeoutまで偽装するとfake-indexeddbの内部処理が止まる）
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-07-04T10:00:00Z'));
        localStorage.setItem('minibasket-my-teams', '["v1"]');
        await m.maybeSnapshot();
        localStorage.setItem('minibasket-my-teams', '["v2"]');
        await m.maybeSnapshot(); // 30秒未満なのでスキップ
        const latest = await m.getLatestSnapshot();
        expect(latest!.entries['minibasket-my-teams']).toBe('["v1"]');

        vi.setSystemTime(new Date('2026-07-04T10:00:31Z'));
        await m.maybeSnapshot();
        const latest2 = await m.getLatestSnapshot();
        expect(latest2!.entries['minibasket-my-teams']).toBe('["v2"]');
        vi.useRealTimers();
    });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- mirrorBackup`
Expected: FAIL — `./mirrorBackup` が存在しない

- [ ] **Step 3: `src/utils/mirrorBackup.ts` を実装**

```ts
// IndexedDBへのミラーバックアップ
// localStorageのアプリデータを世代管理付きでIndexedDBに複製し、
// ブラウザによるlocalStorage消去からの復元手段を提供する。
// IndexedDBが使えない環境（プライベートブラウズ等）では静かに無効化され、
// アプリ本体の動作には影響しない。

const DB_NAME = 'mbc-mirror-backup';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';
const MAX_GENERATIONS = 10;
const MIN_SNAPSHOT_INTERVAL_MS = 30_000;

// バックアップ対象のlocalStorageキーのプレフィックス
const APP_KEY_PREFIXES = ['minibasket-', 'mbc_'];

export interface MirrorSnapshot {
    timestamp: number;
    entries: Record<string, string>;
}

let lastSnapshotAt = 0;

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'timestamp' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// アプリのlocalStorageデータを収集
export function collectAppData(): Record<string, string> {
    const entries: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && APP_KEY_PREFIXES.some(prefix => key.startsWith(prefix))) {
            const value = localStorage.getItem(key);
            if (value !== null) entries[key] = value;
        }
    }
    return entries;
}

// アプリデータがlocalStorageに存在するか
export function hasAppData(): boolean {
    return Object.keys(collectAppData()).length > 0;
}

// スナップショットを保存し、古い世代を削除
export async function saveSnapshot(now: number = Date.now()): Promise<void> {
    try {
        const entries = collectAppData();
        // 空データで既存世代を潰さない
        if (Object.keys(entries).length === 0) return;

        const db = await openDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const snapshot: MirrorSnapshot = { timestamp: now, entries };
            store.put(snapshot);
            const keysReq = store.getAllKeys();
            keysReq.onsuccess = () => {
                const keys = (keysReq.result as number[]).sort((a, b) => b - a);
                keys.slice(MAX_GENERATIONS).forEach(key => store.delete(key));
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
        lastSnapshotAt = now;
    } catch {
        // IndexedDB不可の環境では静かに無効化
    }
}

// 最短間隔(30秒)を空けてスナップショット保存（連続保存のI/O負荷対策）
export async function maybeSnapshot(): Promise<void> {
    const now = Date.now();
    if (now - lastSnapshotAt < MIN_SNAPSHOT_INTERVAL_MS) return;
    await saveSnapshot(now);
}

// 全スナップショットを取得（新しい順）
export async function getAllSnapshots(): Promise<MirrorSnapshot[]> {
    try {
        const db = await openDb();
        const snapshots = await new Promise<MirrorSnapshot[]>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).getAll();
            req.onsuccess = () => {
                const all = req.result as MirrorSnapshot[];
                all.sort((a, b) => b.timestamp - a.timestamp);
                resolve(all);
            };
            req.onerror = () => reject(req.error);
        });
        db.close();
        return snapshots;
    } catch {
        return [];
    }
}

// 最新スナップショットを取得
export async function getLatestSnapshot(): Promise<MirrorSnapshot | null> {
    const all = await getAllSnapshots();
    return all[0] ?? null;
}

// スナップショットをlocalStorageへ書き戻す
export function restoreSnapshot(snapshot: MirrorSnapshot): void {
    for (const [key, value] of Object.entries(snapshot.entries)) {
        localStorage.setItem(key, value);
    }
}

// 永続ストレージを要求（ブラウザ都合のデータ自動削除を抑止）
export async function requestPersistentStorage(): Promise<boolean> {
    try {
        if (navigator.storage && navigator.storage.persist) {
            return await navigator.storage.persist();
        }
    } catch {
        // 未対応ブラウザは無視
    }
    return false;
}
```

- [ ] **Step 4: テストを実行して全パスを確認**

Run: `npm test`
Expected: PASS（全ファイル）

- [ ] **Step 5: 新規ファイルのlint確認とコミット**

Run: `npx eslint src/utils/mirrorBackup.ts src/utils/mirrorBackup.test.ts`
Expected: エラー0件

```bash
git add src/utils/mirrorBackup.ts src/utils/mirrorBackup.test.ts
git commit -m "feat: IndexedDBミラーバックアップ(10世代)を追加"
```

---

### Task 5: 保存失敗の検知とToast通知

**Files:**
- Create: `src/utils/storageError.ts`
- Test: `src/utils/storageError.test.ts`
- Modify: `src/utils/gameSessionStorage.ts:26`（saveGameSessionのcatch節）
- Modify: `src/utils/teamStorage.ts`（saveMyTeam / saveRecentOpponent / saveOpponent のcatch節）
- Modify: `src/utils/gameHistoryStorage.ts`（saveGameResult / updateGameRecordGameInfo のcatch節）
- Modify: `src/utils/appSettings.ts:22`（saveAppSettingsのcatch節）

**Interfaces:**
- Produces:
  - `export const STORAGE_ERROR_EVENT = 'mbc-storage-error'`
  - `notifyStorageError(context: string, error: unknown): void`
- Consumes（Task 6が使用）: App.tsx側で `window.addEventListener(STORAGE_ERROR_EVENT, ...)`

- [ ] **Step 1: 失敗するテストを書く — `src/utils/storageError.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { STORAGE_ERROR_EVENT, notifyStorageError } from './storageError';

describe('storageError', () => {
    it('notifyStorageErrorでカスタムイベントが発火し、contextが渡る', () => {
        const handler = vi.fn();
        window.addEventListener(STORAGE_ERROR_EVENT, handler);
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

        notifyStorageError('game session', new Error('quota exceeded'));

        expect(handler).toHaveBeenCalledTimes(1);
        const event = handler.mock.calls[0][0] as CustomEvent;
        expect(event.detail.context).toBe('game session');
        expect(spy).toHaveBeenCalled();

        window.removeEventListener(STORAGE_ERROR_EVENT, handler);
        spy.mockRestore();
    });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- storageError`
Expected: FAIL — `./storageError` が存在しない

- [ ] **Step 3: `src/utils/storageError.ts` を実装**

```ts
// localStorage保存失敗をアプリ全体へ通知するためのイベント機構
// 保存関数のcatch節から呼び出し、App側でリッスンしてToast表示する

export const STORAGE_ERROR_EVENT = 'mbc-storage-error';

export function notifyStorageError(context: string, error: unknown): void {
    console.error(`Failed to save ${context}:`, error);
    try {
        window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: { context } }));
    } catch {
        // イベント発火の失敗は無視（保存失敗自体はconsoleに残っている）
    }
}
```

- [ ] **Step 4: テストを実行してパスを確認**

Run: `npm test -- storageError`
Expected: PASS

- [ ] **Step 5: 各保存関数のcatch節を差し替える**

対象は**保存系関数のみ**（読込系は対象外）。各ファイルにimportを追加し、catch節の `console.error(...)` を `notifyStorageError(...)` に置き換える。

`src/utils/gameSessionStorage.ts` — 先頭のimport群に追加:

```ts
import { notifyStorageError } from './storageError';
```

`saveGameSession` のcatch節（26行目付近）:

```ts
    } catch (error) {
        notifyStorageError('game session', error);
    }
```

`src/utils/teamStorage.ts` — import追加は同様。`saveMyTeam` のcatch節:

```ts
    } catch (error) {
        notifyStorageError('my team', error);
    }
```

`saveRecentOpponent` のcatch節:

```ts
    } catch (error) {
        notifyStorageError('recent opponent', error);
    }
```

`saveOpponent` のcatch節:

```ts
    } catch (error) {
        notifyStorageError('opponent', error);
    }
```

`src/utils/gameHistoryStorage.ts` — import追加は同様。`saveGameResult` のcatch節:

```ts
    } catch (error) {
        notifyStorageError('game result', error);
    }
```

`updateGameRecordGameInfo` のcatch節:

```ts
    } catch (error) {
        notifyStorageError('game record', error);
    }
```

`src/utils/appSettings.ts` — import追加:

```ts
import { notifyStorageError } from './storageError';
```

`saveAppSettings` のcatch節:

```ts
    } catch (error) {
        notifyStorageError('app settings', error);
    }
```

- [ ] **Step 6: テストとビルドを確認**

Run: `npm test && npm run build`
Expected: 全テストPASS、ビルド成功

- [ ] **Step 7: コミット**

```bash
git add src/utils/storageError.ts src/utils/storageError.test.ts src/utils/gameSessionStorage.ts src/utils/teamStorage.ts src/utils/gameHistoryStorage.ts src/utils/appSettings.ts
git commit -m "feat: 保存失敗をイベント通知する仕組みを追加"
```

---

### Task 6: App統合 — 永続化要求・自動スナップショット・復元プロンプト・保存失敗Toast

**Files:**
- Create: `src/components/RestorePrompt/RestorePrompt.tsx`
- Create: `src/components/RestorePrompt/RestorePrompt.css`
- Create: `src/components/RestorePrompt/index.ts`
- Modify: `src/App.tsx`（import追加、useEffect×4、早期return追加）

**Interfaces:**
- Consumes: Task 4の `mirrorBackup.ts` 全API、Task 5の `STORAGE_ERROR_EVENT`、既存の `showToast`（`src/components/Toast/Toast.tsx`）
- Produces: `RestorePrompt`コンポーネント `{ snapshot: MirrorSnapshot; onDismiss: () => void }`

- [ ] **Step 1: `src/components/RestorePrompt/RestorePrompt.tsx` を作成**

```tsx
import type { MirrorSnapshot } from '../../utils/mirrorBackup';
import { restoreSnapshot } from '../../utils/mirrorBackup';
import './RestorePrompt.css';

interface RestorePromptProps {
    snapshot: MirrorSnapshot;
    onDismiss: () => void;
}

export function RestorePrompt({ snapshot, onDismiss }: RestorePromptProps) {
    const savedAt = new Date(snapshot.timestamp).toLocaleString('ja-JP');
    const keyCount = Object.keys(snapshot.entries).length;

    const handleRestore = () => {
        restoreSnapshot(snapshot);
        window.location.reload();
    };

    return (
        <div className="restore-prompt-overlay">
            <div className="restore-prompt">
                <h2>💾 以前のデータが見つかりました</h2>
                <p>
                    端末内のバックアップ（{savedAt} 保存・{keyCount}項目）から
                    チーム・試合データを復元できます。
                </p>
                <p className="restore-prompt-note">
                    ブラウザのデータ消去などでアプリのデータが失われた可能性があります。
                </p>
                <div className="restore-prompt-actions">
                    <button className="btn btn-primary" onClick={handleRestore}>
                        復元する
                    </button>
                    <button className="btn btn-secondary" onClick={onDismiss}>
                        復元せずに始める
                    </button>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: `src/components/RestorePrompt/RestorePrompt.css` を作成**

```css
.restore-prompt-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
}

.restore-prompt {
    background: var(--bg-secondary, #1e293b);
    color: var(--text-primary, #f1f5f9);
    border-radius: 12px;
    padding: 24px;
    max-width: 420px;
    width: calc(100% - 32px);
}

.restore-prompt h2 {
    margin: 0 0 12px;
    font-size: 1.2rem;
}

.restore-prompt-note {
    font-size: 0.85rem;
    color: var(--text-muted, #94a3b8);
}

.restore-prompt-actions {
    display: flex;
    gap: 12px;
    margin-top: 20px;
}

.restore-prompt-actions .btn {
    flex: 1;
    min-height: 48px;
}
```

- [ ] **Step 3: `src/components/RestorePrompt/index.ts` を作成**

```ts
export { RestorePrompt } from './RestorePrompt';
```

- [ ] **Step 4: App.tsx にimportを追加**

`import { ToastContainer } from './components/Toast/Toast';` の行を以下に変更し、その下にimportを追加:

```tsx
import { ToastContainer, showToast } from './components/Toast/Toast';
import { RestorePrompt } from './components/RestorePrompt';
import type { MirrorSnapshot } from './utils/mirrorBackup';
import { hasAppData, getLatestSnapshot, saveSnapshot, maybeSnapshot, requestPersistentStorage } from './utils/mirrorBackup';
import { STORAGE_ERROR_EVENT } from './utils/storageError';
```

- [ ] **Step 5: AppContent内にstate・useEffectを追加**

`const { phase, selectedPlayerId, selectedTeamId, currentQuarter, pendingActions } = state;`（56行目付近、**このdestructureより後ろでないと`phase`が未定義になる**）の直後に追加:

```tsx
  const [restoreCandidate, setRestoreCandidate] = useState<MirrorSnapshot | null>(null);

  // 起動時: 永続ストレージ要求・データ消失検知・起動スナップショット
  useEffect(() => {
    requestPersistentStorage();
    (async () => {
      if (!hasAppData() && !sessionStorage.getItem('mbc-restore-dismissed')) {
        const snapshot = await getLatestSnapshot();
        if (snapshot && Object.keys(snapshot.entries).length > 0) {
          setRestoreCandidate(snapshot);
          return;
        }
      }
      saveSnapshot();
    })();
  }, []);

  // 保存失敗をToastでユーザーに通知
  useEffect(() => {
    const handler = () => {
      showToast('⚠️ データの保存に失敗しました。設定画面からバックアップを保存してください', 'error');
    };
    window.addEventListener(STORAGE_ERROR_EVENT, handler);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, handler);
  }, []);

  // 試合終了時は即座にミラーバックアップ
  useEffect(() => {
    if (phase === 'finished') {
      saveSnapshot();
    }
  }, [phase]);
```

- [ ] **Step 6: 既存のデバウンス保存にミラーを相乗りさせる**

App.tsx の既存useEffect内（68行目付近）:

```tsx
      saveTimeoutRef.current = window.setTimeout(() => {
        saveGameSession(state, gameName, date);
      }, 500);
```

を以下に変更:

```tsx
      saveTimeoutRef.current = window.setTimeout(() => {
        saveGameSession(state, gameName, date);
        maybeSnapshot();
      }, 500);
```

- [ ] **Step 7: 復元プロンプトの早期returnを追加**

AppContentの最初の画面分岐（`if (screen === ...)`群）より前、追加したuseEffect群の直後の適切な位置（レンダリング部の先頭）に追加:

```tsx
  if (restoreCandidate) {
    return (
      <RestorePrompt
        snapshot={restoreCandidate}
        onDismiss={() => {
          sessionStorage.setItem('mbc-restore-dismissed', '1');
          setRestoreCandidate(null);
          saveSnapshot();
        }}
      />
    );
  }
```

注意: この早期returnは**すべてのReact Hooks呼び出しの後**に置くこと（Hooksルール違反防止）。AppContent内の既存の最初の `if (screen === ...) return` 文の直前が正しい位置。

- [ ] **Step 8: テスト・ビルド・動作確認**

Run: `npm test && npm run build`
Expected: 全テストPASS、ビルド成功

手動確認（`npm run dev` でブラウザ起動）:
1. DevTools → Application → Local Storage で `minibasket-*` キーがあることを確認
2. DevTools → Application → IndexedDB → `mbc-mirror-backup` にスナップショットが作られることを確認（起動時に1件）
3. Local Storageのみ全削除 → リロード → 復元プロンプトが表示される → 「復元する」でデータが戻る

- [ ] **Step 9: コミット**

```bash
git add src/components/RestorePrompt src/App.tsx
git commit -m "feat: 起動時の永続化要求・自動ミラーバックアップ・消失時の復元プロンプトを追加"
```

---

### Task 7: ローカルエラーログ + ErrorBoundary

**Files:**
- Create: `src/utils/errorLog.ts`
- Test: `src/utils/errorLog.test.ts`
- Create: `src/components/ErrorBoundary/ErrorBoundary.tsx`
- Create: `src/components/ErrorBoundary/ErrorBoundary.css`
- Create: `src/components/ErrorBoundary/index.ts`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `__APP_VERSION__`（Task 1）
- Produces（Task 8のエラーログUIが使用）:
  - `interface ErrorLogEntry { timestamp: string; source: string; message: string; stack?: string }`
  - `logError(source: string, message: string, stack?: string): void`
  - `getErrorLog(): ErrorLogEntry[]`
  - `clearErrorLog(): void`
  - `formatErrorLog(): string`
  - `installGlobalErrorHandlers(): void`
  - `ErrorBoundary`コンポーネント（children）

- [ ] **Step 1: 失敗するテストを書く — `src/utils/errorLog.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { logError, getErrorLog, clearErrorLog, formatErrorLog } from './errorLog';

describe('errorLog', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('logErrorで新しいエントリが先頭に追加される', () => {
        logError('window', '1つ目');
        logError('react', '2つ目', 'Error: stack\n  at foo');
        const log = getErrorLog();
        expect(log).toHaveLength(2);
        expect(log[0].message).toBe('2つ目');
        expect(log[0].source).toBe('react');
        expect(log[0].stack).toContain('at foo');
    });

    it('50件を超えると古いエントリが捨てられる', () => {
        for (let i = 1; i <= 55; i++) {
            logError('window', `エラー${i}`);
        }
        const log = getErrorLog();
        expect(log).toHaveLength(50);
        expect(log[0].message).toBe('エラー55');
        expect(log[49].message).toBe('エラー6');
    });

    it('clearErrorLogで空になる', () => {
        logError('window', 'x');
        clearErrorLog();
        expect(getErrorLog()).toHaveLength(0);
    });

    it('formatErrorLogにバージョンとメッセージが含まれる', () => {
        logError('promise', '失敗しました');
        const text = formatErrorLog();
        expect(text).toContain('MBCscore エラーレポート');
        expect(text).toContain('失敗しました');
    });

    it('壊れたログデータがあっても例外を出さない', () => {
        localStorage.setItem('mbc_error_log', 'こわれたJSON');
        expect(getErrorLog()).toEqual([]);
        expect(() => logError('window', 'x')).not.toThrow();
    });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- errorLog`
Expected: FAIL — `./errorLog` が存在しない

- [ ] **Step 3: `src/utils/errorLog.ts` を実装**

```ts
// ローカルエラーログ（外部送信なし）
// エラーを端末内のリングバッファに記録し、設定画面から閲覧・コピーできるようにする。
// プライバシー設計維持のため自動送信は行わない。

const ERROR_LOG_KEY = 'mbc_error_log';
const MAX_ENTRIES = 50;

export interface ErrorLogEntry {
    timestamp: string;
    source: string;   // 'react' | 'window' | 'promise' など発生箇所
    message: string;
    stack?: string;
}

export function getErrorLog(): ErrorLogEntry[] {
    try {
        const data = localStorage.getItem(ERROR_LOG_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? (parsed as ErrorLogEntry[]) : [];
    } catch {
        return [];
    }
}

export function logError(source: string, message: string, stack?: string): void {
    try {
        const entries = getErrorLog();
        entries.unshift({
            timestamp: new Date().toISOString(),
            source,
            message: String(message).slice(0, 500),
            stack: stack ? String(stack).split('\n').slice(0, 6).join('\n') : undefined,
        });
        localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    } catch {
        // エラーログの保存失敗は握りつぶす（通知するとループの恐れがあるため）
    }
}

export function clearErrorLog(): void {
    try {
        localStorage.removeItem(ERROR_LOG_KEY);
    } catch {
        // 無視
    }
}

// メール送付・クリップボード用のテキスト形式
export function formatErrorLog(): string {
    const entries = getErrorLog();
    const header = [
        `MBCscore エラーレポート (v${__APP_VERSION__})`,
        `作成日時: ${new Date().toISOString()}`,
        `UserAgent: ${navigator.userAgent}`,
        `件数: ${entries.length}`,
        '---',
    ].join('\n');
    const body = entries
        .map(e => `[${e.timestamp}] (${e.source}) ${e.message}${e.stack ? '\n' + e.stack : ''}`)
        .join('\n---\n');
    return `${header}\n${body}`;
}

// グローバルエラーハンドラを登録（main.tsxで1回だけ呼ぶ）
export function installGlobalErrorHandlers(): void {
    window.addEventListener('error', (event) => {
        logError('window', event.message, event.error instanceof Error ? event.error.stack : undefined);
    });
    window.addEventListener('unhandledrejection', (event) => {
        const reason: unknown = event.reason;
        if (reason instanceof Error) {
            logError('promise', reason.message, reason.stack);
        } else {
            logError('promise', String(reason));
        }
    });
}
```

- [ ] **Step 4: テストを実行してパスを確認**

Run: `npm test -- errorLog`
Expected: PASS（5件）

- [ ] **Step 5: `src/components/ErrorBoundary/ErrorBoundary.tsx` を作成**

```tsx
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { logError, formatErrorLog } from '../../utils/errorLog';
import './ErrorBoundary.css';

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        logError('react', error.message, `${error.stack ?? ''}\n${info.componentStack ?? ''}`);
    }

    handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(formatErrorLog());
            alert('エラー情報をコピーしました。メールに貼り付けて送付できます。');
        } catch {
            alert('コピーに失敗しました。設定画面のエラーログから再度お試しください。');
        }
    };

    render() {
        if (this.state.error) {
            return (
                <div className="error-boundary">
                    <h1>⚠️ エラーが発生しました</h1>
                    <p>申し訳ありません。アプリで予期しないエラーが発生しました。</p>
                    <p>
                        <strong>記録済みの試合・チームデータは端末内に保存されています。</strong>
                        再読み込みで復帰できます。
                    </p>
                    <div className="error-boundary-actions">
                        <button className="btn btn-primary" onClick={() => window.location.reload()}>
                            再読み込み
                        </button>
                        <button className="btn btn-secondary" onClick={this.handleCopy}>
                            エラー情報をコピー
                        </button>
                    </div>
                    <p className="error-boundary-contact">
                        繰り返し発生する場合は、エラー情報を添えて mbcscore@gmail.com までご連絡ください。
                    </p>
                </div>
            );
        }
        return this.props.children;
    }
}
```

- [ ] **Step 6: `src/components/ErrorBoundary/ErrorBoundary.css` を作成**

```css
.error-boundary {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    text-align: center;
    background: var(--bg-primary, #0f172a);
    color: var(--text-primary, #f1f5f9);
}

.error-boundary h1 {
    font-size: 1.4rem;
    margin-bottom: 16px;
}

.error-boundary p {
    max-width: 480px;
    margin: 8px 0;
    line-height: 1.6;
}

.error-boundary-actions {
    display: flex;
    gap: 12px;
    margin: 24px 0 8px;
}

.error-boundary-actions .btn {
    min-height: 48px;
    padding: 0 24px;
}

.error-boundary-contact {
    font-size: 0.85rem;
    color: var(--text-muted, #94a3b8);
}
```

- [ ] **Step 7: `src/components/ErrorBoundary/index.ts` を作成**

```ts
export { ErrorBoundary } from './ErrorBoundary';
```

- [ ] **Step 8: `src/main.tsx` を書き換える**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { installGlobalErrorHandlers } from './utils/errorLog'

installGlobalErrorHandlers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
```

- [ ] **Step 9: テスト・ビルド・動作確認**

Run: `npm test && npm run build`
Expected: 全テストPASS、ビルド成功

手動確認: `npm run dev` を起動し、DevToolsコンソールで一時的に例外を投げるのは難しいため、任意のコンポーネント（例: Home.tsx）の先頭に `throw new Error('test');` を一時追加 → 白画面ではなく復旧画面が出ることを確認 → **必ず元に戻す**。

- [ ] **Step 10: コミット**

```bash
git add src/utils/errorLog.ts src/utils/errorLog.test.ts src/components/ErrorBoundary src/main.tsx
git commit -m "feat: ErrorBoundaryとローカルエラーログを追加"
```

---

### Task 8: 設定画面にエラーログセクションを追加

**Files:**
- Modify: `src/components/Settings/AppSettingsModal.tsx`（ヘルプセクションの後にエラーログセクション追加）

**Interfaces:**
- Consumes: `getErrorLog`, `clearErrorLog`, `formatErrorLog`（Task 7）、既存の `showToast`

- [ ] **Step 1: importとstateを追加**

`AppSettingsModal.tsx` の先頭import群に追加:

```tsx
import { getErrorLog, clearErrorLog, formatErrorLog } from '../../utils/errorLog';
import type { ErrorLogEntry } from '../../utils/errorLog';
```

コンポーネント内のstate定義群（`const fileInputRef = ...` の後）に追加:

```tsx
    const [errorLog, setErrorLog] = useState<ErrorLogEntry[]>([]);
    const [showErrorDetail, setShowErrorDetail] = useState(false);
```

既存の `useEffect(() => { if (isOpen) { ... } }, [isOpen]);` 内の末尾（`setImportText('');` の後）に追加:

```tsx
            setErrorLog(getErrorLog());
            setShowErrorDetail(false);
```

- [ ] **Step 2: ハンドラを追加**

コンポーネント内（`handleSave` の後）に追加:

```tsx
    const handleCopyErrorLog = async () => {
        try {
            await navigator.clipboard.writeText(formatErrorLog());
            showToast('エラーログをコピーしました', 'success');
        } catch {
            showToast('コピーに失敗しました', 'error');
        }
    };

    const handleClearErrorLog = () => {
        clearErrorLog();
        setErrorLog([]);
        showToast('エラーログを削除しました', 'success');
    };
```

- [ ] **Step 3: ヘルプセクションの直後にJSXを追加**

`</section>`（ヘルプセクションの閉じタグ、532行目付近）の直後に追加:

```tsx
                    {/* エラーログセクション */}
                    <section className="settings-section">
                        <h3>エラーログ</h3>
                        <p className="section-description">
                            アプリ内で発生したエラーの記録です（端末内にのみ保存。外部送信はされません）。
                            不具合報告の際は「コピー」した内容を mbcscore@gmail.com にお送りください。
                        </p>
                        <p className="section-description">記録件数: {errorLog.length}件</p>
                        {errorLog.length > 0 && (
                            <>
                                <div className="backup-buttons">
                                    <button className="btn btn-secondary" onClick={() => setShowErrorDetail(!showErrorDetail)}>
                                        {showErrorDetail ? '内容を隠す' : '内容を表示'}
                                    </button>
                                    <button className="btn btn-secondary" onClick={handleCopyErrorLog}>
                                        📋 コピー
                                    </button>
                                    <button className="btn btn-secondary" onClick={handleClearErrorLog}>
                                        🗑 削除
                                    </button>
                                </div>
                                {showErrorDetail && (
                                    <pre className="error-log-detail">
                                        {errorLog.slice(0, 10).map(e =>
                                            `[${new Date(e.timestamp).toLocaleString('ja-JP')}] (${e.source}) ${e.message}`
                                        ).join('\n')}
                                    </pre>
                                )}
                            </>
                        )}
                    </section>
```

- [ ] **Step 4: CSSを追加**

`src/components/Settings/AppSettingsModal.css` の末尾に追加:

```css
.error-log-detail {
    margin-top: 12px;
    padding: 12px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    font-size: 0.75rem;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 200px;
    overflow-y: auto;
}
```

- [ ] **Step 5: テスト・ビルド・動作確認・コミット**

Run: `npm test && npm run build`
Expected: 全テストPASS、ビルド成功

手動確認: 設定画面を開き「エラーログ」セクションが表示される（0件時はボタン非表示）。

```bash
git add src/components/Settings/AppSettingsModal.tsx src/components/Settings/AppSettingsModal.css
git commit -m "feat: 設定画面にエラーログの閲覧・コピー・削除を追加"
```

---

### Task 9: APIキーのヘッダー送信化・本番console除去・UNDO死にコード削除・README修正

**Files:**
- Modify: `src/utils/imageOCR.ts:53`（testGeminiConnection）、`:237`付近（recognizeWithGemini）
- Modify: `vite.config.ts`（esbuild pure設定）
- Modify: `src/context/GameContext.tsx:684-688`（UNDO_LAST_ACTIONケース削除）
- Modify: `src/types/game.ts:198`（'UNDO_LAST_ACTION' 削除）
- Modify: `README.md`（アンドゥ/リドゥの記載修正）

**Interfaces:**
- Consumes: なし（独立タスク）

- [ ] **Step 1: testGeminiConnection のAPIキーをヘッダーへ**

`src/utils/imageOCR.ts` 53行目付近:

```ts
// 変更前
            const url = `${GEMINI_API_BASE}${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
// 変更後
            const url = `${GEMINI_API_BASE}${model}:generateContent`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey,
                },
```

- [ ] **Step 2: recognizeWithGemini も同様に変更**

`src/utils/imageOCR.ts` 237行目付近（`recognizeWithGemini` 内）:

```ts
// 変更前
            const url = `${GEMINI_API_BASE}${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
// 変更後
            const url = `${GEMINI_API_BASE}${model}:generateContent`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey,
                },
```

- [ ] **Step 3: 変更後、ファイル内に `?key=` が残っていないことを確認**

Run: `grep -n "key=" src/utils/imageOCR.ts`
Expected: `?key=${apiKey}` を含む行が0件

- [ ] **Step 4: vite.config.ts に本番console除去を追加**

`define: {...},`（Task 1で追加済み）の直後に追加:

```ts
  esbuild: {
    // 本番ビルドでデバッグ用consoleを除去（warn/errorは診断用に残す）
    pure: ['console.log', 'console.debug', 'console.info'],
  },
```

- [ ] **Step 5: UNDO_LAST_ACTIONの死にコードを削除**

`src/context/GameContext.tsx` 684行目付近の以下を削除（このアクションはどこからもdispatchされていない）:

```ts
        case 'UNDO_LAST_ACTION': {
            // TODO: 実装
            return state;
        }
```

`src/types/game.ts` 198行目の `    | 'UNDO_LAST_ACTION'` の行を削除。

- [ ] **Step 6: READMEの記載を実態に合わせる**

`README.md` の以下の行:

```markdown
- **アンドゥ/リドゥ**: 直前の操作を取り消したり、やり直したりすることが可能。
```

を以下に変更:

```markdown
- **記録の取り消し**: アクション履歴から誤った記録を削除・修正して、いつでも訂正可能。
```

- [ ] **Step 7: テスト・ビルド確認（console除去の検証込み）**

Run: `npm test && npm run build`
Expected: 全テストPASS、ビルド成功

Run: `grep -rl "console.log" dist/assets/*.js | head -5`
Expected: 出力なし（本番バンドルにconsole.logが含まれない）

- [ ] **Step 8: コミット**

```bash
git add src/utils/imageOCR.ts vite.config.ts src/context/GameContext.tsx src/types/game.ts README.md
git commit -m "fix: APIキーをヘッダー送信に変更し、本番consoleと未実装UNDOを削除"
```

---

### Task 10: 法務・表記 — 利用規約/プライバシーポリシー/OSSライセンス/JBA免責

**Files:**
- Create: `src/components/Legal/LegalModal.tsx`
- Create: `src/components/Legal/LegalModal.css`
- Create: `src/components/Legal/index.ts`
- Modify: `src/components/Settings/AppSettingsModal.tsx`（「アプリについて」セクション追加）
- Modify: `src/components/RunningScoresheet/RunningScoresheet.tsx`（ツールバーにJBA非公認の注記）

**Interfaces:**
- Produces: `LegalModal`コンポーネント `{ isOpen: boolean; initialTab?: LegalTab; onClose: () => void }`、`type LegalTab = 'terms' | 'privacy' | 'licenses'`

- [ ] **Step 1: `src/components/Legal/LegalModal.tsx` を作成**

```tsx
import { useState, useEffect } from 'react';
import './LegalModal.css';

export type LegalTab = 'terms' | 'privacy' | 'licenses';

interface LegalModalProps {
    isOpen: boolean;
    initialTab?: LegalTab;
    onClose: () => void;
}

const OSS_LICENSES = [
    { name: 'React / React DOM', license: 'MIT License', url: 'https://github.com/facebook/react' },
    { name: 'Tesseract.js', license: 'Apache License 2.0', url: 'https://github.com/naptha/tesseract.js' },
    { name: 'jsPDF', license: 'MIT License', url: 'https://github.com/parallax/jsPDF' },
    { name: 'html2canvas', license: 'MIT License', url: 'https://github.com/niklasvh/html2canvas' },
    { name: 'DOMPurify', license: 'Apache License 2.0 / MPL 2.0', url: 'https://github.com/cure53/DOMPurify' },
    { name: 'Vite / vite-plugin-pwa', license: 'MIT License', url: 'https://github.com/vitejs/vite' },
];

export function LegalModal({ isOpen, initialTab = 'terms', onClose }: LegalModalProps) {
    const [tab, setTab] = useState<LegalTab>(initialTab);

    useEffect(() => {
        if (isOpen) setTab(initialTab);
    }, [isOpen, initialTab]);

    if (!isOpen) return null;

    return (
        <div className="legal-modal-overlay" onClick={onClose}>
            <div className="legal-modal" onClick={e => e.stopPropagation()}>
                <div className="legal-modal-header">
                    <div className="legal-tabs">
                        <button className={tab === 'terms' ? 'active' : ''} onClick={() => setTab('terms')}>利用規約</button>
                        <button className={tab === 'privacy' ? 'active' : ''} onClick={() => setTab('privacy')}>プライバシー</button>
                        <button className={tab === 'licenses' ? 'active' : ''} onClick={() => setTab('licenses')}>ライセンス</button>
                    </div>
                    <button className="legal-close" onClick={onClose} aria-label="閉じる">×</button>
                </div>

                <div className="legal-modal-body">
                    {tab === 'terms' && (
                        <div>
                            <h2>利用規約</h2>
                            <p>最終更新日: 2026年7月4日</p>

                            <h3>第1条（本アプリについて）</h3>
                            <p>
                                MBCscore（以下「本アプリ」）は、ミニバスケットボールの試合記録を支援するアプリです。
                                本アプリを利用することで、本規約に同意したものとみなされます。
                            </p>

                            <h3>第2条（記録の正確性・公式記録について）</h3>
                            <p>
                                本アプリはJBA（公益財団法人日本バスケットボール協会）公式スコアシートに準拠した
                                レイアウトを提供しますが、<strong>JBA公認製品ではありません</strong>。
                                本アプリの記録・出力はあくまで補助的なものであり、
                                公式記録は大会主催者が定める正規のスコアシートが優先されます。
                            </p>

                            <h3>第3条（データの管理）</h3>
                            <p>
                                本アプリのデータはすべてご利用の端末内に保存されます。
                                端末の故障・ブラウザのデータ消去等によるデータ消失について、
                                開発者は責任を負いません。定期的なバックアップ機能のご利用を推奨します。
                            </p>

                            <h3>第4条（免責事項）</h3>
                            <p>
                                本アプリは現状有姿で提供されます。開発者は、本アプリの利用により生じた
                                いかなる損害についても、法令で許容される最大限の範囲で責任を負わないものとします。
                            </p>

                            <h3>第5条（禁止事項）</h3>
                            <p>
                                本アプリの複製・改変・再配布による営利利用、リバースエンジニアリング、
                                第三者の権利を侵害する態様での利用を禁止します。
                            </p>

                            <h3>第6条（お問い合わせ）</h3>
                            <p>
                                本規約に関するお問い合わせ: <a href="mailto:mbcscore@gmail.com">mbcscore@gmail.com</a>
                            </p>
                        </div>
                    )}

                    {tab === 'privacy' && (
                        <div>
                            <h2>プライバシーポリシー</h2>
                            <p>最終更新日: 2026年7月4日</p>

                            <h3>1. データの保存場所</h3>
                            <p>
                                本アプリで入力された選手名・背番号・試合記録などのデータは、
                                <strong>すべてご利用の端末内（ブラウザのストレージ）にのみ保存されます</strong>。
                                開発者がこれらのデータを収集・閲覧することはありません。
                            </p>

                            <h3>2. 児童の個人情報について</h3>
                            <p>
                                ミニバスケットボールの特性上、本アプリでは児童の氏名等を扱います。
                                選手情報の入力・管理は、保護者またはチーム管理者の責任において、
                                必要な同意を得たうえで行ってください。
                                氏名の代わりにコートネーム（ニックネーム）のみで運用することも可能です。
                            </p>

                            <h3>3. 外部への送信</h3>
                            <p>
                                本アプリが外部にデータを送信するのは、<strong>OCR機能（高精度モード）を
                                ご自身のGoogle Gemini APIキーで利用した場合の撮影画像のみ</strong>です。
                                この送信はGoogle社のサーバーに対して行われ、
                                <a href="https://ai.google.dev/terms" target="_blank" rel="noopener noreferrer">Google AI利用規約</a>が適用されます。
                                無料枠のAPIキーでは送信データがモデル改善に利用される可能性があるため、
                                有料プランの利用を推奨します。オフラインOCR（基本モード）では画像は端末外に送信されません。
                            </p>

                            <h3>4. アクセス解析・広告</h3>
                            <p>本アプリはアクセス解析ツール・広告・外部トラッキングを一切使用していません。</p>

                            <h3>5. エラーログ</h3>
                            <p>
                                アプリ内で発生したエラーの記録は端末内にのみ保存されます。
                                自動送信は行われず、ユーザーが明示的にコピーして送付した場合のみ開発者に届きます。
                            </p>

                            <h3>6. お問い合わせ</h3>
                            <p>
                                個人情報の取扱いに関するお問い合わせ: <a href="mailto:mbcscore@gmail.com">mbcscore@gmail.com</a>
                            </p>
                        </div>
                    )}

                    {tab === 'licenses' && (
                        <div>
                            <h2>オープンソースライセンス</h2>
                            <p>MBCscore v{__APP_VERSION__}</p>
                            <p>本アプリは以下のオープンソースソフトウェアを使用しています。</p>
                            <ul className="license-list">
                                {OSS_LICENSES.map(lib => (
                                    <li key={lib.name}>
                                        <a href={lib.url} target="_blank" rel="noopener noreferrer">{lib.name}</a>
                                        <span> — {lib.license}</span>
                                    </li>
                                ))}
                            </ul>
                            <p className="license-note">
                                各ライセンスの全文は、リンク先のリポジトリでご確認いただけます。
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: `src/components/Legal/LegalModal.css` を作成**

```css
.legal-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1500;
}

.legal-modal {
    background: var(--bg-secondary, #1e293b);
    color: var(--text-primary, #f1f5f9);
    border-radius: 12px;
    max-width: 640px;
    width: calc(100% - 32px);
    max-height: 85vh;
    display: flex;
    flex-direction: column;
}

.legal-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.legal-tabs {
    display: flex;
    gap: 8px;
}

.legal-tabs button {
    background: transparent;
    border: none;
    color: var(--text-muted, #94a3b8);
    padding: 8px 12px;
    cursor: pointer;
    border-radius: 6px;
    font-size: 0.9rem;
}

.legal-tabs button.active {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-primary, #f1f5f9);
    font-weight: bold;
}

.legal-close {
    background: transparent;
    border: none;
    color: var(--text-muted, #94a3b8);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0 8px;
}

.legal-modal-body {
    padding: 16px 20px;
    overflow-y: auto;
    line-height: 1.7;
    font-size: 0.9rem;
}

.legal-modal-body h2 {
    font-size: 1.1rem;
    margin: 0 0 8px;
}

.legal-modal-body h3 {
    font-size: 0.95rem;
    margin: 16px 0 4px;
}

.legal-modal-body a {
    color: var(--primary, #3b82f6);
}

.license-list {
    padding-left: 20px;
}

.license-list li {
    margin: 8px 0;
}

.license-note {
    font-size: 0.8rem;
    color: var(--text-muted, #94a3b8);
}
```

- [ ] **Step 3: `src/components/Legal/index.ts` を作成**

```ts
export { LegalModal } from './LegalModal';
export type { LegalTab } from './LegalModal';
```

- [ ] **Step 4: AppSettingsModalに「アプリについて」セクションを追加**

`src/components/Settings/AppSettingsModal.tsx` のimport群に追加:

```tsx
import { LegalModal } from '../Legal';
import type { LegalTab } from '../Legal';
```

state定義群に追加:

```tsx
    const [legalTab, setLegalTab] = useState<LegalTab | null>(null);
```

エラーログセクション（Task 8で追加）の直後にJSXを追加:

```tsx
                    {/* アプリについてセクション */}
                    <section className="settings-section">
                        <h3>アプリについて</h3>
                        <p className="section-description">MBCscore バージョン {__APP_VERSION__}</p>
                        <div className="backup-buttons">
                            <button className="btn btn-secondary" onClick={() => setLegalTab('terms')}>
                                📜 利用規約
                            </button>
                            <button className="btn btn-secondary" onClick={() => setLegalTab('privacy')}>
                                🔒 プライバシーポリシー
                            </button>
                            <button className="btn btn-secondary" onClick={() => setLegalTab('licenses')}>
                                📦 OSSライセンス
                            </button>
                        </div>
                        <p className="section-description">
                            ※本アプリはJBA公式スコアシートに準拠したレイアウトを提供しますが、JBA公認製品ではありません。
                        </p>
                    </section>
```

コンポーネントのreturn内の最後（`</div>` 閉じタグ群の手前、settings-footerの後）に追加:

```tsx
                <LegalModal
                    isOpen={legalTab !== null}
                    initialTab={legalTab ?? 'terms'}
                    onClose={() => setLegalTab(null)}
                />
```

- [ ] **Step 5: RunningScoresheetのツールバーにJBA非公認の注記を追加**

`src/components/RunningScoresheet/RunningScoresheet.tsx` のツールバー（176行目付近）:

```tsx
            </div>

            {/* スコアシート本体 */}
```

を以下に変更:

```tsx
            </div>

            <p className="rs-unofficial-note">
                ※JBA公式スコアシート準拠レイアウト（JBA公認製品ではありません）。公式記録は大会指定のスコアシートが優先されます。
            </p>

            {/* スコアシート本体 */}
```

`src/components/RunningScoresheet/RunningScoresheet.css` の末尾に追加:

```css
.rs-unofficial-note {
    font-size: 0.75rem;
    color: var(--text-muted, #94a3b8);
    margin: 4px 0 8px;
    text-align: center;
}
```

- [ ] **Step 6: テスト・ビルド・動作確認**

Run: `npm test && npm run build`
Expected: 全テストPASS、ビルド成功

手動確認: 設定画面 →「アプリについて」→ 3つのボタンからそれぞれのタブが開く。スコアシート画面のツールバー下に注記が表示される（PDF出力の印刷対象 `.running-scoresheet` の外側なので出力物には含まれない）。

- [ ] **Step 7: コミット**

```bash
git add src/components/Legal src/components/Settings/AppSettingsModal.tsx src/components/RunningScoresheet/RunningScoresheet.tsx src/components/RunningScoresheet/RunningScoresheet.css
git commit -m "feat: 利用規約・プライバシーポリシー・OSSライセンス表記とJBA非公認明示を追加"
```

---

### Task 11: CI導入と最終検証

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm test`（Task 1）、`npm run build`

- [ ] **Step 1: `.github/workflows/ci.yml` を作成**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test-and-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
```

注意: lintは既存コードに51件のエラーがあるため意図的に含めない（次フェーズのリファクタリングで解消後に追加する）。

- [ ] **Step 2: 最終検証（設計書の成功基準を確認）**

1. Run: `npm test` → 全パス
2. Run: `npm run build` → 成功
3. Run: `grep -rl "console.log" dist/assets/*.js` → 出力なし
4. Run: `grep -rn "?key=" src/utils/imageOCR.ts` → 出力なし
5. `npm run dev` で手動確認:
   - localStorage全消去→リロード→復元プロンプト→復元成功
   - 設定画面から利用規約・プライバシーポリシー・OSSライセンスが開ける
   - 設定画面にエラーログセクションがある

- [ ] **Step 3: コミット**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: テストとビルドのGitHub Actionsワークフローを追加"
```

- [ ] **Step 4: プッシュしてCIがグリーンになることを確認**

```bash
git push origin main
```

GitHub Actionsの実行結果を確認（`gh run watch` または GitHubのActionsタブ）。
Expected: CI成功
