# 3P非表示時のファウルフロー2P固定化 ＆ クォーター時間設定（6分/5分） 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3P非表示の試合ではシュートファウル入力のシュート状況選択をスキップして2P固定にし、クォーター時間を試合ごとに6分/5分から選択可能にする。

**Architecture:** `Game`状態に`quarterMinutes: 5 | 6`を追加し、既存の`showThreePoint`と同じパターン（GameSetup→SET_TEAMS→state、試合中は専用アクション、旧データは復元時に補完）で流す。FoulInputFlowには`showThreePoint` propを追加してステップ遷移を分岐する。

**Tech Stack:** React 19 + TypeScript + Vite。テストは vitest + @testing-library/react（`npm test` = `vitest run`）。

**Spec:** `docs/superpowers/specs/2026-07-21-foul-flow-3p-and-quarter-minutes-design.md`

## Global Constraints

- UIコピー・コードコメントは日本語（既存スタイル踏襲）
- 後方互換: 新propはデフォルト値で従来挙動（`showThreePoint`未指定=true、`quarterMinutes`未指定=6）。旧保存データは復元時に`quarterMinutes: 6`補完
- OTは3分固定のまま変更しない
- コミットメッセージは既存スタイル（`feat(scope): 日本語説明`）
- 各タスク完了時に `npm test` が全件PASSしていること
- インデントは各ファイルの既存スタイルに合わせる（src配下は4スペース）

---

### Task 1: quarterMinutes 状態とリデューサー

**Files:**
- Modify: `src/types/game.ts`
- Modify: `src/context/reducers/gameFlowHandlers.ts`
- Modify: `src/context/reducers/index.ts`
- Test: `src/context/quarterMinutes.test.ts`（新規）

**Interfaces:**
- Consumes: 既存の `gameReducer`, `createInitialGame`, `createTeam`
- Produces: `Game.quarterMinutes: 5 | 6`（デフォルト6）、アクション `SET_QUARTER_MINUTES`（payload `{ quarterMinutes: 5 | 6 }`）、`SET_TEAMS` payloadの `quarterMinutes?: 5 | 6`、定数 `DEFAULT_QUARTER_MINUTES`（`QUARTER_DURATION_SECONDS` は削除）

- [ ] **Step 1: 失敗するテストを書く**

`src/context/quarterMinutes.test.ts` を新規作成（既存 `showThreePoint.test.ts` / `gameReducer.test.ts` と同型）:

```ts
import { describe, it, expect } from 'vitest';
import { gameReducer } from './reducers';
import { createInitialGame, createTeam } from '../types/game';
import type { Game } from '../types/game';

// クォーター時間（6分/5分）の試合ごと設定
describe('gameReducer: quarterMinutes（クォーター時間）', () => {
    it('createInitialGameのデフォルトは6分', () => {
        expect(createInitialGame().quarterMinutes).toBe(6);
    });

    it('SET_TEAMSでquarterMinutes:5を渡すとstateに反映される', () => {
        const state = gameReducer(createInitialGame(), {
            type: 'SET_TEAMS',
            payload: {
                teamA: createTeam('teamA', 'ホーム', 'コーチA'),
                teamB: createTeam('teamB', 'ビジター', 'コーチB'),
                quarterMinutes: 5,
            },
        });
        expect(state.quarterMinutes).toBe(5);
    });

    it('SET_TEAMSでquarterMinutes未指定なら現在値を維持する', () => {
        const base: Game = { ...createInitialGame(), quarterMinutes: 5 };
        const state = gameReducer(base, {
            type: 'SET_TEAMS',
            payload: {
                teamA: createTeam('teamA', 'ホーム', 'コーチA'),
                teamB: createTeam('teamB', 'ビジター', 'コーチB'),
            },
        });
        expect(state.quarterMinutes).toBe(5);
    });

    it('SET_QUARTER_MINUTESで切り替えられる', () => {
        const game = createInitialGame();
        const five = gameReducer(game, { type: 'SET_QUARTER_MINUTES', payload: { quarterMinutes: 5 } });
        expect(five.quarterMinutes).toBe(5);
        const six = gameReducer(five, { type: 'SET_QUARTER_MINUTES', payload: { quarterMinutes: 6 } });
        expect(six.quarterMinutes).toBe(6);
    });

    it('RESTORE_GAMEでquarterMinutesが無い試合は6に補完される', () => {
        const legacy = createInitialGame();
        // 既存データを模擬: フィールドを削除
        delete (legacy as Partial<Game>).quarterMinutes;
        const state = gameReducer(createInitialGame(), {
            type: 'RESTORE_GAME',
            payload: { game: legacy },
        });
        expect(state.quarterMinutes).toBe(6);
    });

    it('RESTORE_GAMEで明示的な5分は保持される（6に上書きしない）', () => {
        const saved: Game = { ...createInitialGame(), quarterMinutes: 5 };
        const state = gameReducer(createInitialGame(), {
            type: 'RESTORE_GAME',
            payload: { game: saved },
        });
        expect(state.quarterMinutes).toBe(5);
    });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- src/context/quarterMinutes.test.ts`
Expected: FAIL（`quarterMinutes` が `Game` に存在しない型エラー、または `undefined !== 6`）

- [ ] **Step 3: 実装する**

`src/types/game.ts` — 4箇所変更:

(a) `Game` インターフェース（179行目 `showThreePoint` の直後）に追加:

```ts
    showThreePoint: boolean;  // 3P入力ボタンを表示するか（試合ごと・デフォルトfalse）
    quarterMinutes: 5 | 6;    // クォーター時間（分）。試合ごと・デフォルト6。OTは常に3分
```

(b) `GameActionType`（219行目 `| 'SET_SHOW_THREE_POINT';`）の直後に追加:

```ts
    | 'SET_SHOW_THREE_POINT'
    | 'SET_QUARTER_MINUTES';
```

(c) `createInitialGame()`（295行目 `showThreePoint: false,` の直後）に追加:

```ts
    showThreePoint: false,
    quarterMinutes: DEFAULT_QUARTER_MINUTES,
```

(d) 未使用定数 `QUARTER_DURATION_SECONDS`（301行目）を置き換え:

```ts
// 変更前
export const QUARTER_DURATION_SECONDS = 6 * 60; // 6分
// 変更後
export const DEFAULT_QUARTER_MINUTES = 6; // クォーター時間の既定値（分）
```

注意: `DEFAULT_QUARTER_MINUTES` に型注釈を付けないこと（`const` のリテラル型 `6` のまま `5 | 6` に代入可能にするため）。`createInitialGame` は定義位置が定数より前だが、実行は後なので参照可能。

`src/context/reducers/gameFlowHandlers.ts` — 2箇所変更:

(a) `handleSetTeams`（9-24行目）:

```ts
export function handleSetTeams(state: Game, payload: GameAction['payload']): Game {
    const { teamA, teamB, showThreePoint, quarterMinutes } = payload as {
        teamA: Game['teamA'];
        teamB: Game['teamB'];
        showThreePoint?: boolean;
        quarterMinutes?: 5 | 6;
    };
    // デフォルトカラー設定（setupデータから来る場合は上書きされる可能性があるが、ここで保証する）
    const teamAWithColor = { ...teamA, color: teamA.color || 'white' };
    const teamBWithColor = { ...teamB, color: teamB.color || 'blue' };
    return {
        ...state,
        teamA: teamAWithColor,
        teamB: teamBWithColor,
        showThreePoint: showThreePoint ?? state.showThreePoint,
        quarterMinutes: quarterMinutes ?? state.quarterMinutes,
    };
}
```

(b) `handleRestoreGame`（239-253行目）の返り値に補完を追加。ファイル先頭のimportに `DEFAULT_QUARTER_MINUTES` を追加:

```ts
import { createInitialGameInfo, DEFAULT_QUARTER_MINUTES } from '../../types/game';
```

```ts
    return {
        ...game,
        teamA: migrateTeam(game.teamA),
        teamB: migrateTeam(game.teamB),
        showThreePoint: game.showThreePoint ?? true,
        quarterMinutes: game.quarterMinutes ?? DEFAULT_QUARTER_MINUTES,
    };
```

`src/context/reducers/index.ts` — `SET_SHOW_THREE_POINT` case（66-67行目）の直後にcaseを追加:

```ts
        case 'SET_QUARTER_MINUTES':
            return { ...state, quarterMinutes: (action.payload as { quarterMinutes: 5 | 6 }).quarterMinutes };
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: 全件PASS（新規6件を含む。既存テストにquarterMinutes追加による影響がないこと）

- [ ] **Step 5: コミット**

```bash
git add src/types/game.ts src/context/reducers/gameFlowHandlers.ts src/context/reducers/index.ts src/context/quarterMinutes.test.ts
git commit -m "feat(state): クォーター時間quarterMinutes(5|6)をGame状態に追加"
```

---

### Task 2: TimeoutInputModal のクォーター時間反映

**Files:**
- Modify: `src/components/TimeoutInputModal/TimeoutInputModal.tsx`
- Test: `src/components/TimeoutInputModal/TimeoutInputModal.test.tsx`（新規）

**Interfaces:**
- Consumes: なし（Task 1とは独立。propは呼び出し側がTask 3で配線する）
- Produces: `TimeoutInputModalProps.quarterMinutes?: 5 | 6`（未指定時6＝後方互換）

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TimeoutInputModal/TimeoutInputModal.test.tsx` を新規作成:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TimeoutInputModal } from './TimeoutInputModal';

afterEach(cleanup);

const noop = vi.fn();

function renderModal(props: { currentQuarter: number; quarterMinutes?: 5 | 6 }) {
    render(
        <TimeoutInputModal
            isOpen={true}
            teamName="テスト"
            teamColor="white"
            currentQuarter={props.currentQuarter}
            quarterMinutes={props.quarterMinutes}
            onConfirm={noop}
            onCancel={noop}
        />,
    );
}

// 1つ目のselectが「分」、2つ目が「秒」
function getMinuteSelect(): HTMLSelectElement {
    return screen.getAllByRole('combobox')[0] as HTMLSelectElement;
}

describe('TimeoutInputModal: クォーター時間の反映', () => {
    it('quarterMinutes=5のとき分の選択肢は0〜5で初期値は5', () => {
        renderModal({ currentQuarter: 1, quarterMinutes: 5 });
        const select = getMinuteSelect();
        expect(select.options.length).toBe(6);
        expect(select.value).toBe('5');
    });

    it('quarterMinutes未指定のとき従来どおり0〜6で初期値は6（後方互換）', () => {
        renderModal({ currentQuarter: 1 });
        const select = getMinuteSelect();
        expect(select.options.length).toBe(7);
        expect(select.value).toBe('6');
    });

    it('OT（第5ピリオド以降）はquarterMinutesに関係なく0〜3で初期値は3', () => {
        renderModal({ currentQuarter: 5, quarterMinutes: 5 });
        const select = getMinuteSelect();
        expect(select.options.length).toBe(4);
        expect(select.value).toBe('3');
    });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- src/components/TimeoutInputModal/TimeoutInputModal.test.tsx`
Expected: FAIL（`quarterMinutes` propが存在しない型エラー、または5分ケースで `options.length` 7 !== 6）

- [ ] **Step 3: 実装する**

`src/components/TimeoutInputModal/TimeoutInputModal.tsx` の props と `quarterDuration` を変更:

```tsx
interface TimeoutInputModalProps {
    isOpen: boolean;
    teamName: string;
    teamColor: 'white' | 'blue';
    currentQuarter: number;
    quarterMinutes?: 5 | 6;  // クォーター時間（分）。未指定時6＝後方互換
    onConfirm: (elapsedMinutes: number) => void;
    onCancel: () => void;
}

export function TimeoutInputModal({
    isOpen,
    teamName,
    teamColor,
    currentQuarter,
    quarterMinutes = 6,
    onConfirm,
    onCancel,
}: TimeoutInputModalProps) {
    // OTは3分、通常Qは試合設定のクォーター時間
    const quarterDuration = currentQuarter > 4 ? 3 : quarterMinutes;
```

これ以外のロジック（初期値リセット・経過分計算・分ドロップダウンの `quarterDuration + 1` 個生成）は既存のまま自動追従する。

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: 全件PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/TimeoutInputModal/TimeoutInputModal.tsx src/components/TimeoutInputModal/TimeoutInputModal.test.tsx
git commit -m "feat(timeout): タイムアウト入力の残り時間範囲をクォーター時間設定に追従"
```

---

### Task 3: クォーター時間のUI配線（GameSetup・試合オプション・履歴復元）

**Files:**
- Modify: `src/components/GameSetup/GameSetup.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/History/History.tsx`

**Interfaces:**
- Consumes: Task 1の `SET_QUARTER_MINUTES` アクション・`SET_TEAMS` payloadの `quarterMinutes?: 5 | 6`・`state.quarterMinutes`、Task 2の `TimeoutInputModal` の `quarterMinutes` prop
- Produces: GameSetup `onComplete` setupDataに `quarterMinutes: 5 | 6` を追加

UI配線のみのタスク（GameSetup/App.tsxには既存テストがないため新規テストは書かない）。型チェックと既存テストで検証する。

- [ ] **Step 1: GameSetup にクォーター時間選択を追加**

`src/components/GameSetup/GameSetup.tsx`:

(a) `GameSetupProps.onComplete` のsetupData型（34行目 `showThreePoint` の直後）に追加:

```ts
        showThreePoint: boolean;  // 3P入力ボタンを表示するか
        quarterMinutes: 5 | 6;    // クォーター時間（分）
```

(b) state追加（58行目 `showThreePoint` のuseState直後）:

```ts
    // クォーター時間（分）。JBA公式は6分、地方大会などで5分運用あり
    const [quarterMinutes, setQuarterMinutes] = useState<5 | 6>(6);
```

(c) `onComplete({...})`（190-199行目）に `quarterMinutes,` を追加:

```ts
            onComplete({
                gameName: effectiveGameName,
                date,
                myTeam: filteredMyTeam,
                opponentTeam,
                myTeamColor,
                opponentTeamColor,
                numberType,
                showThreePoint,
                quarterMinutes,
            });
```

(d) confirmステップの3Pシュート選択ブロック（475-497行目の `<div className="confirm-number-type">`〜`</div>`）の直後に、同じUIパターンで追加:

```tsx
                            <div className="confirm-number-type">
                                <span className="number-type-label">クォーター時間</span>
                                <div className="number-type-options">
                                    <label className={`number-type-option ${quarterMinutes === 6 ? 'selected' : ''}`}>
                                        <input
                                            type="radio"
                                            name="quarterMinutes"
                                            checked={quarterMinutes === 6}
                                            onChange={() => setQuarterMinutes(6)}
                                        />
                                        <span>6分（公式）</span>
                                    </label>
                                    <label className={`number-type-option ${quarterMinutes === 5 ? 'selected' : ''}`}>
                                        <input
                                            type="radio"
                                            name="quarterMinutes"
                                            checked={quarterMinutes === 5}
                                            onChange={() => setQuarterMinutes(5)}
                                        />
                                        <span>5分</span>
                                    </label>
                                </div>
                            </div>
```

- [ ] **Step 2: App.tsx の配線**

`src/App.tsx` — 3箇所変更:

(a) `handleGameSetupComplete` のsetupData型（144-153行目）に `quarterMinutes: 5 | 6;` を追加し、`SET_TEAMS` dispatch（182行目）に載せる:

```ts
  const handleGameSetupComplete = (setupData: {
    gameName: string;
    date: string;
    myTeam: SavedTeam;
    opponentTeam: SavedTeam;
    myTeamColor: 'white' | 'blue';
    opponentTeamColor: 'white' | 'blue';
    numberType: NumberType;
    showThreePoint: boolean;
    quarterMinutes: 5 | 6;
  }) => {
```

```ts
    dispatch({ type: 'SET_TEAMS', payload: { teamA, teamB, showThreePoint: setupData.showThreePoint, quarterMinutes: setupData.quarterMinutes } });
```

(b) 試合オプションモーダル（1497-1523行目）に クォーター時間の切り替えを追加。「閉じる」ボタンの前に3Pと同じパターンで挿入:

```tsx
          <h3 id="game-options-title">試合オプション</h3>
          <p className="end-game-confirm-message">3Pシュートの入力ボタン</p>
          <div className="modal-actions-column">
            <button
              className={`btn btn-large ${!state.showThreePoint ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => dispatch({ type: 'SET_SHOW_THREE_POINT', payload: { showThreePoint: false } })}
            >
              🚫 使わない{!state.showThreePoint ? '（現在）' : ''}
            </button>
            <button
              className={`btn btn-large ${state.showThreePoint ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => dispatch({ type: 'SET_SHOW_THREE_POINT', payload: { showThreePoint: true } })}
            >
              🎯 使う{state.showThreePoint ? '（現在）' : ''}
            </button>
          </div>
          <p className="end-game-confirm-message">クォーター時間</p>
          <div className="modal-actions-column">
            <button
              className={`btn btn-large ${state.quarterMinutes === 6 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => dispatch({ type: 'SET_QUARTER_MINUTES', payload: { quarterMinutes: 6 } })}
            >
              6分（公式）{state.quarterMinutes === 6 ? '（現在）' : ''}
            </button>
            <button
              className={`btn btn-large ${state.quarterMinutes === 5 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => dispatch({ type: 'SET_QUARTER_MINUTES', payload: { quarterMinutes: 5 } })}
            >
              5分{state.quarterMinutes === 5 ? '（現在）' : ''}
            </button>
            <button className="btn btn-secondary btn-large" onClick={() => setShowGameOptions(false)}>
              閉じる
            </button>
          </div>
```

（元の1つの `modal-actions-column` を2つに分割し、「閉じる」は最後のカラムに置く）

(c) `TimeoutInputModal` の呼び出し（1526-1536行目）に prop を追加:

```tsx
        currentQuarter={currentQuarter}
        quarterMinutes={state.quarterMinutes}
```

- [ ] **Step 3: History.tsx の復元補完**

`src/components/History/History.tsx` の `recordToGame`（72-88行目）、`showThreePoint` 補完行の直後に追加:

```ts
        showThreePoint: (record as { showThreePoint?: boolean }).showThreePoint ?? true,
        quarterMinutes: (record as { quarterMinutes?: 5 | 6 }).quarterMinutes ?? 6,
```

- [ ] **Step 4: 型チェック・テスト・lint**

Run: `npm run build`
Expected: tsc・viteビルドともエラーなし

Run: `npm test`
Expected: 全件PASS

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
git add src/components/GameSetup/GameSetup.tsx src/App.tsx src/components/History/History.tsx
git commit -m "feat(setup): クォーター時間6分/5分を試合設定・試合オプションから選択可能に"
```

---

### Task 4: FoulInputFlow の3P非表示対応（シュート状況選択スキップ）

**Files:**
- Modify: `src/components/FoulInputFlow/FoulInputFlow.tsx`
- Modify: `src/App.tsx`
- Modify: `public/manual.html`
- Test: `src/components/FoulInputFlow/FoulInputFlow.test.tsx`（新規）

**Interfaces:**
- Consumes: `state.showThreePoint`（既存のGame状態）
- Produces: `FoulInputFlowProps.showThreePoint?: boolean`（未指定時true＝後方互換）

- [ ] **Step 1: 失敗するテストを書く**

`src/components/FoulInputFlow/FoulInputFlow.test.tsx` を新規作成:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { FoulInputFlow } from './FoulInputFlow';

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

const noop = vi.fn();

function renderFlow(showThreePoint?: boolean) {
    render(
        <FoulInputFlow
            onComplete={noop}
            onCancel={noop}
            hasSelectedPlayer={true}
            teamFouls={0}
            opponentTeamId="teamB"
            opponentPlayers={[]}
            opponentTeamName="相手チーム"
            showThreePoint={showThreePoint}
        />,
    );
}

// Pファウルボタンを長押し（500ms超）してシュートファウル入力に入る
function longPressPFoul() {
    const pButton = screen.getByText('パーソナルファウル').closest('button')!;
    fireEvent.mouseDown(pButton);
    act(() => {
        vi.advanceTimersByTime(600);
    });
    fireEvent.mouseUp(pButton);
}

describe('FoulInputFlow: 3P非表示時のシュートファウル', () => {
    it('showThreePoint=falseのときP長押しでシュート状況選択をスキップし直接シュート結果へ進む（2P扱い）', () => {
        vi.useFakeTimers();
        renderFlow(false);
        longPressPFoul();
        // シュート状況選択は表示されない
        expect(screen.queryByText('シュート状況を選択（シュートファウル）')).toBeNull();
        expect(screen.queryByText('3Pシュート中')).toBeNull();
        // 直接シュート結果選択が表示され、失敗時FTは2本（=2P扱い）
        expect(screen.getByText('シュートの結果')).toBeTruthy();
        expect(screen.getByText('シュート失敗（FT2本）')).toBeTruthy();
    });

    it('showThreePoint=falseのときシュート結果画面から戻るとファウル種類選択に戻る', () => {
        vi.useFakeTimers();
        renderFlow(false);
        longPressPFoul();
        fireEvent.click(screen.getByText('← 戻る'));
        expect(screen.getByText('ファウル種類を選択')).toBeTruthy();
        expect(screen.getByText('パーソナルファウル')).toBeTruthy();
    });

    it('showThreePoint=trueのときは従来どおり2P/3Pの選択が表示される', () => {
        vi.useFakeTimers();
        renderFlow(true);
        longPressPFoul();
        expect(screen.getByText('シュート状況を選択（シュートファウル）')).toBeTruthy();
        expect(screen.getByText('2Pシュート中')).toBeTruthy();
        expect(screen.getByText('3Pシュート中')).toBeTruthy();
    });

    it('showThreePoint未指定のときも従来どおり2P/3Pの選択が表示される（後方互換）', () => {
        vi.useFakeTimers();
        renderFlow(undefined);
        longPressPFoul();
        expect(screen.getByText('2Pシュート中')).toBeTruthy();
        expect(screen.getByText('3Pシュート中')).toBeTruthy();
    });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- src/components/FoulInputFlow/FoulInputFlow.test.tsx`
Expected: FAIL（`showThreePoint` propが存在しない型エラー、または1つ目のテストで「シュート状況を選択（シュートファウル）」が表示されてしまう）

- [ ] **Step 3: 実装する**

`src/components/FoulInputFlow/FoulInputFlow.tsx` — 4箇所変更:

(a) props型（11-32行目）の `benchFoulLabel?: string;` の後に追加し、関数の分割代入（46-58行目）にも `showThreePoint = true,` を追加:

```ts
    // ベンチファウルモード用
    benchFoulMode?: boolean;
    benchFoulType?: FoulType;
    benchFoulLabel?: string;
    showThreePoint?: boolean;  // 3P入力を使う試合か（未指定時true＝後方互換）
```

```ts
    benchFoulMode = false,
    benchFoulType,
    benchFoulLabel,
    showThreePoint = true,
}: FoulInputFlowProps) {
```

(b) `handlePFoulLongPress`（118-121行目）を分岐:

```ts
    // Pファウル長押し（シュートファウル）
    const handlePFoulLongPress = useCallback(() => {
        setFoulType('P');
        if (showThreePoint) {
            setStep('shotSituation');
        } else {
            // 3P非表示の試合ではシュートファウルは常に2P扱い（状況選択をスキップ）
            setShotSituation('2P');
            setStep('shotResult');
        }
    }, [showThreePoint]);
```

(c) `handleBack`（234-277行目）の `shotResult` / `ftCount` caseを分岐し、依存配列に `showThreePoint` を追加:

```ts
            case 'shotResult':
                if (showThreePoint) {
                    setStep('shotSituation');
                } else {
                    // shotSituationステップをスキップしているためファウル種類選択まで戻る
                    setStep('foulType');
                    setFoulType(null);
                    setShotSituation('none');
                }
                setShotMade(false);
                break;
            case 'ftCount':
                if (['T', 'U', 'D'].includes(foulType!)) {
                    setStep('foulType');
                    setFoulType(null);
                } else {
                    // Pファウルのシュートファウル時
                    setStep(showThreePoint ? 'shotSituation' : 'shotResult');
                }
                break;
```

```ts
    }, [step, foulType, freeThrows, shotSituation, benchFoulMode, onCancel, showThreePoint]);
```

(d) `src/App.tsx` の `FoulInputFlow` 3箇所すべてに `showThreePoint={state.showThreePoint}` を渡す:

- 保留アクション解決時（1132-1145行目）: `opponentTeamName={opponentTeam.name}` の後に追加
- 通常時（1156-1169行目）: `opponentTeamName={opponentTeam.name}` の後に追加
- ベンチファウル（1436-1447行目）: `benchFoulLabel={coachFoulState.label}` の後に追加（shooterステップ開始のため実質影響なしだが一貫性のため）

- [ ] **Step 4: マニュアル更新**

`public/manual.html` の848行目（シュートファウル手順）に3P非表示時の挙動を追記:

```html
<!-- 変更前 -->
  <li>Pボタンを<strong>長押し</strong>し、「2Pシュート中」「3Pシュート中」のいずれかを選択</li>
<!-- 変更後 -->
  <li>Pボタンを<strong>長押し</strong>し、「2Pシュート中」「3Pシュート中」のいずれかを選択（3Pシュートを「使わない」設定の試合ではこの選択はスキップされ、自動的に2Pシュート中として扱われます）</li>
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test`
Expected: 全件PASS

Run: `npm run build`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/components/FoulInputFlow/FoulInputFlow.tsx src/components/FoulInputFlow/FoulInputFlow.test.tsx src/App.tsx public/manual.html
git commit -m "feat(foul): 3P非表示の試合はシュートファウルの状況選択をスキップし2P固定に"
```

---

## 完了後の確認

- [ ] `npm test` 全件PASS
- [ ] `npm run build` エラーなし
- [ ] `npm run lint` エラーなし
- [ ] スペック要件との照合: シュート状況スキップ／戻る遷移／quarterMinutes状態／GameSetup UI／試合オプションUI／TimeoutInputModal追従／旧データ6分補完／FoulInputFlow・TimeoutInputModal未指定時の後方互換
