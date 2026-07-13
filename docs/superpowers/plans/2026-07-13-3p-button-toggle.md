# 3Pボタンの試合ごと表示/非表示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 試合ごとに3P入力ボタンの表示/非表示を切り替えられるようにする（新規試合はデフォルト非表示）。

**Architecture:** `Game`状態に `showThreePoint: boolean` を1つ持たせ、GameSetupのトグルで設定→`SET_TEAMS`経由でstateに反映→`ActionButtons`が3Pボタンを条件レンダリング。既存試合は`undefined`→`true`補完で後方互換。

**Tech Stack:** React 19 + TypeScript + Vite、状態管理は useReducer + Context、テストは Vitest + @testing-library/react。

## Global Constraints

- 適用範囲は入力ボタンのみ。統計パネル・スコアシート・分析・EditActionModal・音声入力は変更しない。
- 新規試合の初期値は OFF（`showThreePoint: false`）。
- 既存の保存済み試合は `showThreePoint === undefined` の場合 `true`（表示）に補完する。
- `ActionButtons` の `showThreePoint` prop 未指定時のデフォルトは `true`（後方互換）。
- テスト実行: 単一ファイルは `npx vitest run <path>`、全体は `npm test`。型チェックは `npx tsc -b`。

---

### Task 1: Game型に showThreePoint を追加し、reducerで設定・補完する

**Files:**
- Modify: `src/types/game.ts`（`Game`インターフェースと`createInitialGame`）
- Modify: `src/context/reducers/gameFlowHandlers.ts`（`handleSetTeams`, `handleRestoreGame`）
- Test: `src/context/gameReducer.test.ts`（末尾に describe を追加）

**Interfaces:**
- Produces:
  - `Game.showThreePoint: boolean`
  - `createInitialGame(): Game` が `showThreePoint: false` を含む
  - `SET_TEAMS` payload: `{ teamA: Team; teamB: Team; showThreePoint?: boolean }` — `showThreePoint`が渡ればstateに設定、無ければ現在値を維持
  - `RESTORE_GAME` payload: `{ game: Game }` — `game.showThreePoint === undefined` なら `true` に補完

- [ ] **Step 1: 失敗するテストを書く**

`src/context/gameReducer.test.ts` の末尾に追記:

```ts
describe('gameReducer: showThreePoint（3P表示フラグ）', () => {
    it('createInitialGameのデフォルトはfalse（新規試合は3P非表示）', () => {
        expect(createInitialGame().showThreePoint).toBe(false);
    });

    it('SET_TEAMSでshowThreePoint:trueを渡すとstateに反映される', () => {
        const state = gameReducer(createInitialGame(), {
            type: 'SET_TEAMS',
            payload: {
                teamA: createTeam('teamA', 'ホーム', 'コーチA'),
                teamB: createTeam('teamB', 'ビジター', 'コーチB'),
                showThreePoint: true,
            },
        });
        expect(state.showThreePoint).toBe(true);
    });

    it('SET_TEAMSでshowThreePoint未指定なら現在値を維持する', () => {
        const base = { ...createInitialGame(), showThreePoint: true };
        const state = gameReducer(base, {
            type: 'SET_TEAMS',
            payload: {
                teamA: createTeam('teamA', 'ホーム', 'コーチA'),
                teamB: createTeam('teamB', 'ビジター', 'コーチB'),
            },
        });
        expect(state.showThreePoint).toBe(true);
    });

    it('RESTORE_GAMEでshowThreePointが無い試合はtrueに補完される', () => {
        const legacy = createInitialGame();
        // 既存データを模擬: フィールドを削除
        delete (legacy as Partial<Game>).showThreePoint;
        const state = gameReducer(createInitialGame(), {
            type: 'RESTORE_GAME',
            payload: { game: legacy },
        });
        expect(state.showThreePoint).toBe(true);
    });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/context/gameReducer.test.ts`
Expected: FAIL（`showThreePoint`がGame型に存在せず型エラー、または`undefined`で不一致）

- [ ] **Step 3: Game型とcreateInitialGameを変更**

`src/types/game.ts` の `Game` インターフェースに追加（`gameInfo: GameInfo;` の直後）:

```ts
    gameInfo: GameInfo;  // 試合情報
    showThreePoint: boolean;  // 3P入力ボタンを表示するか（試合ごと・デフォルトfalse）
}
```

`createInitialGame` の返却オブジェクトに追加（`gameInfo: createInitialGameInfo(),` の直後）:

```ts
    gameInfo: createInitialGameInfo(),
    showThreePoint: false,
});
```

- [ ] **Step 4: handleSetTeams を変更**

`src/context/reducers/gameFlowHandlers.ts` の `handleSetTeams` を差し替え:

```ts
export function handleSetTeams(state: Game, payload: GameAction['payload']): Game {
    const { teamA, teamB, showThreePoint } = payload as {
        teamA: Game['teamA'];
        teamB: Game['teamB'];
        showThreePoint?: boolean;
    };
    // デフォルトカラー設定（setupデータから来る場合は上書きされる可能性があるが、ここで保証する）
    const teamAWithColor = { ...teamA, color: teamA.color || 'white' };
    const teamBWithColor = { ...teamB, color: teamB.color || 'blue' };
    return {
        ...state,
        teamA: teamAWithColor,
        teamB: teamBWithColor,
        showThreePoint: showThreePoint ?? state.showThreePoint,
    };
}
```

- [ ] **Step 5: handleRestoreGame にマイグレーションを追加**

`src/context/reducers/gameFlowHandlers.ts` の `handleRestoreGame` の `return` を差し替え:

```ts
    return {
        ...game,
        teamA: migrateTeam(game.teamA),
        teamB: migrateTeam(game.teamB),
        showThreePoint: game.showThreePoint ?? true,
    };
```

- [ ] **Step 6: テストを実行して成功を確認**

Run: `npx vitest run src/context/gameReducer.test.ts`
Expected: PASS（新規4テスト＋既存テストすべて）

- [ ] **Step 7: 型チェック**

Run: `npx tsc -b`
Expected: エラーなし（`Game`を生成する箇所は`createInitialGame`と`handleRestoreGame`のみのため追加対応不要）

- [ ] **Step 8: コミット**

```bash
git add src/types/game.ts src/context/reducers/gameFlowHandlers.ts src/context/gameReducer.test.ts
git commit -m "feat: Game.showThreePointを追加しSET_TEAMS/RESTORE_GAMEで設定・補完"
```

---

### Task 2: ActionButtons が showThreePoint で3Pボタンを出し分ける

**Files:**
- Modify: `src/components/ActionButtons/ActionButtons.tsx`
- Test: `src/components/ActionButtons/ActionButtons.test.tsx`（新規作成）

**Interfaces:**
- Consumes: なし（propは自己完結）
- Produces: `ActionButtonsProps` に `showThreePoint?: boolean` を追加（未指定時 `true`）。3Pボタンは `showThreePoint` が真のときのみ描画。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/ActionButtons/ActionButtons.test.tsx` を新規作成:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ActionButtons } from './ActionButtons';

afterEach(cleanup);

// SwipeableScoreButtonは label に '2P' / '3P' / 'FT' を表示する
const noop = vi.fn();

function renderButtons(showThreePoint?: boolean) {
    render(
        <ActionButtons
            onScore={noop}
            onStat={noop}
            onMiss={noop}
            onFoul={noop}
            gameMode="full"
            showThreePoint={showThreePoint}
        />,
    );
}

describe('ActionButtons: 3Pボタンの表示制御', () => {
    it('showThreePoint=falseのとき3Pボタンは描画されない（2P/FTは描画される）', () => {
        renderButtons(false);
        expect(screen.queryByText('3P')).toBeNull();
        expect(screen.getByText('2P')).toBeTruthy();
        expect(screen.getByText('FT')).toBeTruthy();
    });

    it('showThreePoint=trueのとき3Pボタンが描画される', () => {
        renderButtons(true);
        expect(screen.getByText('3P')).toBeTruthy();
    });

    it('showThreePoint未指定のとき3Pボタンが描画される（後方互換）', () => {
        renderButtons(undefined);
        expect(screen.getByText('3P')).toBeTruthy();
    });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/components/ActionButtons/ActionButtons.test.tsx`
Expected: FAIL（`showThreePoint`未対応で、falseでも3Pが描画され1件目が失敗）

- [ ] **Step 3: ActionButtons を変更**

`src/components/ActionButtons/ActionButtons.tsx` の `ActionButtonsProps` に追加（`gameMode?: ...` の下）:

```ts
    gameMode?: 'full' | 'simple'; // ゲームモード
    showThreePoint?: boolean; // 3P入力ボタンを表示するか（未指定時true=後方互換）
}
```

引数の分割代入に追加（`gameMode = 'full',` の下）:

```ts
    gameMode = 'full',
    showThreePoint = true,
}: ActionButtonsProps) {
```

3Pボタンを条件レンダリングに変更（既存の3P `SwipeableScoreButton` を囲む）:

```tsx
                    {showThreePoint && (
                        <SwipeableScoreButton
                            scoreType="3P"
                            onScore={onScore}
                            onMiss={onMiss}
                            disabled={isBtnDisabled}
                            isActiveScore={isActive('SCORE', '3P')}
                            isActiveMiss={isActive('MISS', '3PA')}
                        />
                    )}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run src/components/ActionButtons/ActionButtons.test.tsx`
Expected: PASS（3テスト）

- [ ] **Step 5: コミット**

```bash
git add src/components/ActionButtons/ActionButtons.tsx src/components/ActionButtons/ActionButtons.test.tsx
git commit -m "feat: ActionButtonsにshowThreePointを追加し3Pボタンを出し分け"
```

---

### Task 3: GameSetupのトグルとAppの配線

**Files:**
- Modify: `src/components/GameSetup/GameSetup.tsx`（state・confirmステップUI・onCompleteシグネチャ）
- Modify: `src/App.tsx`（`handleGameSetupComplete`・`<ActionButtons>`へのprop）

**Interfaces:**
- Consumes:
  - `Game.showThreePoint`（Task 1）
  - `ActionButtons` の `showThreePoint` prop（Task 2）
  - `SET_TEAMS` payload の `showThreePoint`（Task 1）
- Produces:
  - `GameSetupProps.onComplete` の setupData に `showThreePoint: boolean` を追加

- [ ] **Step 1: GameSetupのonCompleteシグネチャにshowThreePointを追加**

`src/components/GameSetup/GameSetup.tsx` の `GameSetupProps.onComplete` の型に追加（`numberType: NumberType;` の下）:

```ts
        numberType: NumberType;  // マイチームの使用番号タイプ
        showThreePoint: boolean;  // 3P入力ボタンを表示するか
    }) => void;
```

- [ ] **Step 2: GameSetupにトグルstateを追加**

`numberType` のstate定義（`const [numberType, setNumberType] = useState<NumberType>('bib');`）の直後に追加:

```ts
    // 3P入力ボタンを表示するか（ミニバスは通常OFF）
    const [showThreePoint, setShowThreePoint] = useState(false);
```

- [ ] **Step 3: handleConfirmでshowThreePointを渡す**

`src/components/GameSetup/GameSetup.tsx` の `handleConfirm` 内 `onComplete({ ... })` に追加（`numberType,` の下）:

```ts
                numberType,
                showThreePoint,
            });
```

- [ ] **Step 4: confirmステップにトグルUIを追加**

confirmステップの「使用番号」ブロック（`<div className="confirm-number-type"> ... </div>`）の直後に追加:

```tsx
                            <div className="confirm-number-type">
                                <span className="number-type-label">3Pシュート</span>
                                <div className="number-type-options">
                                    <label className={`number-type-option ${!showThreePoint ? 'selected' : ''}`}>
                                        <input
                                            type="radio"
                                            name="showThreePoint"
                                            checked={!showThreePoint}
                                            onChange={() => setShowThreePoint(false)}
                                        />
                                        <span>使わない（ミニバス）</span>
                                    </label>
                                    <label className={`number-type-option ${showThreePoint ? 'selected' : ''}`}>
                                        <input
                                            type="radio"
                                            name="showThreePoint"
                                            checked={showThreePoint}
                                            onChange={() => setShowThreePoint(true)}
                                        />
                                        <span>使う（U15/一般）</span>
                                    </label>
                                </div>
                            </div>
```

- [ ] **Step 5: App.handleGameSetupCompleteのsetupData型にshowThreePointを追加**

`src/App.tsx` の `handleGameSetupComplete` の引数型に追加（`numberType: NumberType;` の下）:

```ts
    numberType: NumberType;
    showThreePoint: boolean;
  }) => {
```

- [ ] **Step 6: SET_TEAMSにshowThreePointを渡す**

`src/App.tsx` の `handleGameSetupComplete` 内の該当dispatchを差し替え:

```ts
    dispatch({ type: 'SET_TEAMS', payload: { teamA, teamB, showThreePoint: setupData.showThreePoint } });
```

- [ ] **Step 7: ActionButtonsにgame.showThreePointを渡す**

`src/App.tsx` の試合画面の `<ActionButtons>`（`gameMode={gameMode}` を含む箇所）に prop を追加:

```tsx
                    activeAction={pendingAction}
                    gameMode={gameMode}
                    showThreePoint={game.showThreePoint}
                  />
```

> 注: `game` は当該スコープで参照している状態オブジェクト名に合わせること（`state`/`game` など既存コードの命名に一致させる）。

- [ ] **Step 8: 型チェック・ビルド**

Run: `npx tsc -b`
Expected: エラーなし

- [ ] **Step 9: Lint**

Run: `npm run lint`
Expected: エラーなし（新規の未使用変数・型不整合がないこと）

- [ ] **Step 10: 手動確認（dev server）**

`npm run dev` で起動し、以下を確認:
1. 新規試合設定 → 確認ステップで「3Pシュート」が初期「使わない」になっている
2. そのまま試合開始 → 試合画面のシュートボタンに **2P/FT のみ**表示され 3P が無い
3. 別の新規試合で「使う」を選択 → 試合画面に **3P ボタンが表示**される
4. 既存の保存済み試合を履歴から再開 → 3Pボタンが表示される（後方互換）

- [ ] **Step 11: コミット**

```bash
git add src/components/GameSetup/GameSetup.tsx src/App.tsx
git commit -m "feat: GameSetupに3Pトグルを追加しApp/ActionButtonsへ配線"
```

---

## Self-Review 結果

- **Spec coverage:** データモデル(Task1)、UI/GameSetup(Task3)、データフロー(Task1+3)、後方互換(Task1)、ActionButtons出し分け(Task2)、テスト(Task1,2)、スコープ外は全タスクで非変更 — すべてカバー。
- **Placeholder scan:** プレースホルダなし。全ステップに実コード/実コマンドあり。
- **Type consistency:** `showThreePoint: boolean` を Game / SET_TEAMS payload / ActionButtonsProps / GameSetup onComplete / handleGameSetupComplete setupData で一貫使用。`?? true` 補完（RESTORE/ActionButtons既定）と `false`（新規既定）の使い分けを明記。
