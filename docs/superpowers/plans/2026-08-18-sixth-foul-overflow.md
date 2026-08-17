# 6個目以降のファウルの取りこぼし防止 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公式様式のファウル欄（5枠）に収まらない6個目以降のファウルを、記録者が気づかないまま作ってしまうのを防ぐ。

**Architecture:** 判定を純粋関数1つに集約し、3つの入り口（記録フロー・交代要員のテクニカル・履歴の付け替え）から呼ぶ。記録そのものは止めず、確認またはインライン警告で伝える。reducer と公式様式（RunningScoresheet）には一切触れない。

**Tech Stack:** React 19 / TypeScript / Vitest + @testing-library/react

**設計:** `docs/superpowers/specs/2026-08-18-sixth-foul-overflow-design.md`

## Global Constraints

- `src/components/RunningScoresheet/` は変更しない（様式・PDF/JPEG出力の見た目を変えないこと）
- `src/context/reducers/` は変更しない（押し切ったときは従来どおり記録され、チームファウルの加算も従来どおり）
- 判定条件は「現在のファウル数 >= `MAX_PERSONAL_FOULS`(5)」。`getDisqualification` / `isFouledOut` を流用しない（D 1つ・T/U 2回でも失格は成立するが、それが3〜4個目なら様式には収まるため）
- テストは既存の作法に合わせる。`@testing-library/user-event` と `jest-dom` はこのリポジトリに入っていないので使わない（`fireEvent` と素の DOM プロパティで書く）
- コミットメッセージは日本語。末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を付ける

## File Structure

| ファイル | 責務 |
|---|---|
| `src/utils/foulColumns.ts`（新規） | 「あと1つ記録すると様式の5枠を超えるか」の判定のみ |
| `src/utils/foulColumns.test.ts`（新規） | 上記の単体テスト |
| `src/components/FoulInputFlow/FoulInputFlow.tsx`（変更） | ゲート1: 種類選択直後の確認 |
| `src/components/FoulInputFlow/FoulInputFlow.sixthFoul.test.tsx`（新規） | ゲート1のテスト |
| `src/components/EditActionModal/EditActionModal.tsx`（変更） | ゲート2: 付け替え先のインライン警告 |
| `src/components/EditActionModal/EditActionModal.foulOverflow.test.tsx`（新規） | ゲート2のテスト |
| `src/App.tsx`（変更） | ゲート1b: 交代要員のテクニカルの確認 |
| `src/App.benchTechOverflow.test.tsx`（新規） | ゲート1bのテスト |

---

### Task 1: 判定ヘルパー

**Files:**
- Create: `src/utils/foulColumns.ts`
- Test: `src/utils/foulColumns.test.ts`

**Interfaces:**
- Consumes: `MAX_PERSONAL_FOULS`, `FoulType`, `FoulRecord`（`src/types/game.ts`）
- Produces: `wouldOverflowFoulColumns(fouls: (FoulType | FoulRecord)[] | undefined): boolean` — Task 2/3/4 がこれを呼ぶ

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/foulColumns.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { wouldOverflowFoulColumns } from './foulColumns';
import type { FoulType, FoulRecord } from '../types/game';

const p = (n: number): FoulType[] => Array.from({ length: n }, () => 'P' as FoulType);

describe('wouldOverflowFoulColumns', () => {
    it('4個なら次は5個目で、様式の5枠に収まる', () => {
        expect(wouldOverflowFoulColumns(p(4))).toBe(false);
    });

    it('5個なら次は6個目で、5枠に収まらない', () => {
        expect(wouldOverflowFoulColumns(p(5))).toBe(true);
    });

    it('6個以上でも収まらないまま', () => {
        expect(wouldOverflowFoulColumns(p(6))).toBe(true);
    });

    it('記録が無ければ収まる', () => {
        expect(wouldOverflowFoulColumns([])).toBe(false);
        expect(wouldOverflowFoulColumns(undefined)).toBe(false);
    });

    it('失格していても、枠に収まるかどうかは個数だけで決まる', () => {
        // D 1つで失格だが、まだ3個目。様式には収まるので警告の対象外
        const disqualifiedButShort: FoulType[] = ['D', 'P', 'P'];
        expect(wouldOverflowFoulColumns(disqualifiedButShort)).toBe(false);
    });

    it('FoulRecord形式（FT付き）も個数で数える', () => {
        const records: FoulRecord[] = Array.from({ length: 5 }, () => ({ type: 'P', freeThrows: 2 }));
        expect(wouldOverflowFoulColumns(records)).toBe(true);
    });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/utils/foulColumns.test.ts`
Expected: FAIL — `Failed to resolve import "./foulColumns"`

- [ ] **Step 3: 実装する**

`src/utils/foulColumns.ts`:

```ts
// 公式様式のファウル欄は選手1人につき5枠しかない（RunningScoresheet は
// [0,1,2,3,4] の5マスしか描かない）。6個目以降は様式から無言で消える。
//
// アプリは6個目を止めない。練習試合では相手チームの同意のうえで失格者が
// 出続ける運用があり（useFoulOutNotice のコメント）、そこで実際に起きる
// ファウルとチームファウルを落とすわけにいかないため。
// 代わりに、記録者へ確認・警告を出すためにこの判定を使う。

import { MAX_PERSONAL_FOULS } from '../types/game';
import type { FoulType, FoulRecord } from '../types/game';

/**
 * あと1つ記録すると、公式様式のファウル欄（5枠）に収まらなくなるか。
 *
 * 判定は個数だけで決める。失格判定（getDisqualification）を流用してはいけない。
 * 失格は D 1つ・T/U 2回でも成立し、どちらも5個目より先に来るため、
 * まだ枠に収まる3個目・4個目にまで警告が出て、本当に止めたい場面の
 * 重みが薄れる。
 */
export function wouldOverflowFoulColumns(
    fouls: (FoulType | FoulRecord)[] | undefined,
): boolean {
    return (fouls?.length ?? 0) >= MAX_PERSONAL_FOULS;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/utils/foulColumns.test.ts`
Expected: PASS（6件）

- [ ] **Step 5: コミット**

```bash
git add src/utils/foulColumns.ts src/utils/foulColumns.test.ts
git commit -m "feat: 様式のファウル欄(5枠)を超えるかの判定を追加

失格判定(getDisqualification)は流用しない。D1つやT/U2回でも失格は
成立するが、それが3〜4個目なら様式には収まるため。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: ゲート1 — 記録時の確認（FoulInputFlow）

**Files:**
- Modify: `src/components/FoulInputFlow/FoulInputFlow.tsx`
- Test: `src/components/FoulInputFlow/FoulInputFlow.sixthFoul.test.tsx`

**Interfaces:**
- Consumes: `wouldOverflowFoulColumns`（Task 1）、`ConfirmModal`（`src/components/Modal`）
- Produces: なし（コンポーネント内部で完結。props は変えない）

**背景:** 選手のファウルを記録する入り口（通常の記録・保留アクションの解決・保留の直接解決）は、いずれもこのコンポーネントの `foulType` ステップを通る。ここに1つ置けば取りこぼさない。交代要員のテクニカルだけは `foulType` を通らないので Task 4 で扱う。

**注意:** `ConfirmModal` は `FoulInputFlow` 自身の `Modal` の中に入れ子で描画される。これは既存の作法にある（履歴ポップアップの `Modal` の中で `EditActionModal` が開く）。`modalStack` は LIFO なので、端末の戻る操作は確認ダイアログから先に閉じる。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/FoulInputFlow/FoulInputFlow.sixthFoul.test.tsx`:

```tsx
// 6個目以降のファウルは公式様式のファウル欄（5枠）に収まらず、
// これまでは無言で消えていた。記録は止めないが、確認は挟む。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { FoulInputFlow } from './FoulInputFlow';
import type { FoulType } from '../../types/game';

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

const CONFIRM_TITLE = 'このファウルは6個目です';

function renderFlow(currentFouls: FoulType[], onComplete = vi.fn()) {
    render(
        <FoulInputFlow
            onComplete={onComplete}
            onCancel={vi.fn()}
            hasSelectedPlayer={true}
            currentFoulCount={currentFouls.length}
            currentFouls={currentFouls}
            playerName="選手A"
            teamFouls={0}
            opponentTeamId="teamB"
            opponentPlayers={[]}
            opponentTeamName="相手チーム"
        />,
    );
    return onComplete;
}

/** Pファウルを通常タップ（長押し判定に入る前に離す） */
function tapPFoul() {
    const button = screen.getByText('パーソナルファウル').closest('button')!;
    fireEvent.mouseDown(button);
    fireEvent.mouseUp(button);
}

/** Pファウルを長押し（500ms超）してシュートファウルへ */
function longPressPFoul() {
    const button = screen.getByText('パーソナルファウル').closest('button')!;
    fireEvent.mouseDown(button);
    act(() => {
        vi.advanceTimersByTime(600);
    });
    fireEvent.mouseUp(button);
}

describe('FoulInputFlow: 6個目以降の確認', () => {
    it('4ファウルなら確認なしでそのまま記録される', () => {
        const onComplete = renderFlow(['P', 'P', 'P', 'P']);
        tapPFoul();

        expect(screen.queryByText(CONFIRM_TITLE)).toBeNull();
        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('5ファウルなら確認が出て、まだ記録されない', () => {
        const onComplete = renderFlow(['P', 'P', 'P', 'P', 'P']);
        tapPFoul();

        expect(screen.getByText(CONFIRM_TITLE)).toBeTruthy();
        expect(onComplete).not.toHaveBeenCalled();
    });

    it('「記録する」を押すと記録される', () => {
        const onComplete = renderFlow(['P', 'P', 'P', 'P', 'P']);
        tapPFoul();

        fireEvent.click(screen.getByRole('button', { name: '記録する' }));

        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('「やめる」を押すと記録されず、種類選択に留まる', () => {
        const onComplete = renderFlow(['P', 'P', 'P', 'P', 'P']);
        tapPFoul();

        fireEvent.click(screen.getByRole('button', { name: 'やめる' }));

        expect(onComplete).not.toHaveBeenCalled();
        expect(screen.queryByText(CONFIRM_TITLE)).toBeNull();
        expect(screen.getByText('ファウル種類を選択')).toBeTruthy();
    });

    it('Dで失格済みでも3ファウルなら確認は出ない', () => {
        const onComplete = renderFlow(['D', 'P', 'P']);
        tapPFoul();

        expect(screen.queryByText(CONFIRM_TITLE)).toBeNull();
        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('テクニカルでも6個目なら確認が出る', () => {
        const onComplete = renderFlow(['P', 'P', 'P', 'P', 'P']);

        fireEvent.click(screen.getByText('テクニカルファウル').closest('button')!);

        expect(screen.getByText(CONFIRM_TITLE)).toBeTruthy();
        expect(onComplete).not.toHaveBeenCalled();
    });

    it('シュートファウル（長押し）でも6個目なら確認が出る', () => {
        vi.useFakeTimers();
        renderFlow(['P', 'P', 'P', 'P', 'P']);

        longPressPFoul();

        expect(screen.getByText(CONFIRM_TITLE)).toBeTruthy();
        // シュート状況選択へは進まない
        expect(screen.queryByText('シュート状況を選択（シュートファウル）')).toBeNull();
    });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/components/FoulInputFlow/FoulInputFlow.sixthFoul.test.tsx`
Expected: FAIL — 「5ファウルなら確認が出て…」等で `Unable to find an element with the text: このファウルは6個目です`。4ファウル・D失格の2件は先に PASS する（既存の正しい挙動の退行防止）

- [ ] **Step 3: import と確認用の state を追加**

`src/components/FoulInputFlow/FoulInputFlow.tsx` の import に追加:

```tsx
import { Modal, ConfirmModal } from '../Modal';
import { wouldOverflowFoulColumns } from '../../utils/foulColumns';
```

（既存の `import { Modal } from '../Modal';` を上の1行目に置き換える）

ファイル冒頭、`const LONG_PRESS_DURATION = 500;` の下に型を追加:

```tsx
/**
 * 6個目の確認で保留にした「本来やろうとしていたこと」。
 *
 * 関数をそのまま state に入れると React が更新関数と解釈するため、
 * 何をするつもりだったかを素のデータで持つ。
 */
type OverflowIntent =
    | { kind: 'pNormal' }
    | { kind: 'pShot' }
    | { kind: 'special'; foulType: FoulType };
```

- [ ] **Step 4: 既存ハンドラを `run*` にリネームし、ゲートを挟む**

`const [shotMade, setShotMade] = useState<boolean>(false);` の直後に追加:

```tsx
    // 6個目以降になる記録は、様式のファウル欄（5枠）に載らない。
    // 押し切れば記録できるが、黙って作らせない
    const [overflowIntent, setOverflowIntent] = useState<OverflowIntent | null>(null);
    const willOverflowFoulColumns = wouldOverflowFoulColumns(currentFouls);
```

既存の `handlePFoulNormalTap` / `handlePFoulLongPress` / `handleSpecialFoulSelect` を **`run` 接頭辞にリネーム**する（中身は変えない）:

- `const handlePFoulNormalTap = useCallback(` → `const runPFoulNormalTap = useCallback(`
- `const handlePFoulLongPress = useCallback(` → `const runPFoulLongPress = useCallback(`
- `const handleSpecialFoulSelect = useCallback((type: FoulType) => {` → `const runSpecialFoulSelect = useCallback((type: FoulType) => {`

**さらに `runSpecialFoulSelect` の定義ブロックを、`runPFoulLongPress` の直後まで移動する。**

これは必須。`handlePressStart` は依存配列 `[handlePFoulLongPress]` を**レンダー中に評価する**ため、新しい `handlePFoulLongPress` がその後ろで定義されていると `Cannot access 'handlePFoulLongPress' before initialization` で落ちる（`const` の TDZ）。ゲート一式は必ず `handlePressStart` より前に置くこと。

**最終的な定義順:**

1. `runPFoulNormalTap`
2. `runPFoulLongPress`
3. `runSpecialFoulSelect` ← 元は `handlePFoulKeyDown` の後ろにあったものを移動
4. `runIntent` / `requestIntent` / `handlePFoulNormalTap` / `handlePFoulLongPress` / `handleSpecialFoulSelect`（下記）
5. `handlePressStart` / `handlePressEnd` / `handlePFoulKeyDown`（既存のまま・変更なし）

`runSpecialFoulSelect` の直後に、ゲートと新しい公開ハンドラを追加:

```tsx
    const runIntent = useCallback((intent: OverflowIntent) => {
        if (intent.kind === 'pNormal') runPFoulNormalTap();
        else if (intent.kind === 'pShot') runPFoulLongPress();
        else runSpecialFoulSelect(intent.foulType);
    }, [runPFoulNormalTap, runPFoulLongPress, runSpecialFoulSelect]);

    // 種類が決まった直後に確認する。シューターやFT結果まで入れさせてから
    // 止めると、入れた分が無駄になる
    const requestIntent = useCallback((intent: OverflowIntent) => {
        if (willOverflowFoulColumns) {
            setOverflowIntent(intent);
            return;
        }
        runIntent(intent);
    }, [willOverflowFoulColumns, runIntent]);

    const handlePFoulNormalTap = useCallback(() => {
        requestIntent({ kind: 'pNormal' });
    }, [requestIntent]);

    const handlePFoulLongPress = useCallback(() => {
        requestIntent({ kind: 'pShot' });
    }, [requestIntent]);

    const handleSpecialFoulSelect = useCallback((type: FoulType) => {
        requestIntent({ kind: 'special', foulType: type });
    }, [requestIntent]);
```

`handlePressStart` / `handlePressEnd` / `handlePFoulKeyDown` は**中身を変えない**。呼び先が新しい `handlePFoulNormalTap` / `handlePFoulLongPress` になるので、自動的にゲートを通る。

`handleBack` の `case 'ftCount'` などが `foulType` を見ている箇所も変更不要（確認は種類確定より前に出るため、`foulType` はまだ更新されていない）。

- [ ] **Step 5: 確認ダイアログを描画する**

`FoulInputFlow.tsx` の JSX 末尾、`{/* キャンセルボタン */}` の `</div>` の直後（`</>` の直前）に追加:

```tsx
                {/*
                  6個目以降は公式様式のファウル欄（5枠）に載らない。
                  記録は止めず、承知のうえかどうかだけ確かめる。
                  打ち消し側が既定フォーカス（ConfirmModal の作法）
                */}
                {overflowIntent && (
                    <ConfirmModal
                        title="このファウルは6個目です"
                        message={`${playerName || '選手'} は既に${currentFoulCount}ファウルです。6個目以降は公式様式のファウル欄（5枠）に記録できません。`}
                        note="チームファウルには加算されます。"
                        confirmLabel="記録する"
                        cancelLabel="やめる"
                        onConfirm={() => {
                            const intent = overflowIntent;
                            setOverflowIntent(null);
                            runIntent(intent);
                        }}
                        onCancel={() => setOverflowIntent(null)}
                    />
                )}
```

- [ ] **Step 6: テストが通ることを確認**

Run: `npx vitest run src/components/FoulInputFlow/`
Expected: PASS（新規7件 + 既存の FoulInputFlow テスト群すべて）

- [ ] **Step 7: コミット**

```bash
git add src/components/FoulInputFlow/FoulInputFlow.tsx src/components/FoulInputFlow/FoulInputFlow.sixthFoul.test.tsx
git commit -m "feat: 6個目以降のファウルに確認を挟む

公式様式のファウル欄は5枠で、6個目以降は無言で消えていた。
記録は止めない（練習試合で失格者が続行する運用があり、実在の
ファウルとチームファウルを落とせない）。種類が決まった直後に
確認し、押し切れば従来どおり記録する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: ゲート2 — 付け替え時の警告（EditActionModal）

**Files:**
- Modify: `src/components/EditActionModal/EditActionModal.tsx`
- Test: `src/components/EditActionModal/EditActionModal.foulOverflow.test.tsx`

**Interfaces:**
- Consumes: `wouldOverflowFoulColumns`（Task 1）
- Produces: なし

**背景:** ゲート1だけでは穴が残る。`handleEditFoul`（`src/context/reducers/foulHandlers.ts`）は付け替え先のファウル数を見ていないため、履歴の編集から確認を通らずに6個目を作れる。付け替えは長押し→編集と既に慎重な操作なので、ダイアログではなくインライン警告にとどめ、保存はブロックしない。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/EditActionModal/EditActionModal.foulOverflow.test.tsx`:

```tsx
// ファウルの選手を付け替えると、記録フローの確認を通らずに6個目を作れる。
// handleEditFoul は付け替え先のファウル数を見ていない。
// 付け替えは長押し→編集と既に慎重な操作なので、警告だけ出して保存は止めない。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { EditActionModal } from './EditActionModal';
import { createPlayer } from '../../types/game';
import type { FoulType, Player } from '../../types/game';

afterEach(cleanup);

const withFouls = (player: Player, count: number): Player => ({
    ...player,
    fouls: Array.from({ length: count }, () => 'P' as FoulType),
});

const players: Player[] = [
    withFouls(createPlayer('p1', 4, '選手A'), 1),
    withFouls(createPlayer('p2', 5, '選手B'), 5),
    withFouls(createPlayer('p3', 6, '選手C'), 4),
];

const foulItem = {
    id: 'f1',
    type: 'foul' as const,
    entryType: 'P',
    playerId: 'p1',
    playerNumber: 4,
    typeLabel: 'パーソナルファウル',
};

function renderModal(item = foulItem) {
    render(
        <EditActionModal
            item={item}
            players={players}
            onSave={vi.fn()}
            onCancel={vi.fn()}
        />
    );
    return screen.getByLabelText('選手') as HTMLSelectElement;
}

const warning = () => screen.queryByText(/付け替えると6個目になり/);

describe('EditActionModal: 付け替えで6個目になるファウル', () => {
    it('開いた直後（元の選手のまま）は警告を出さない', () => {
        renderModal();
        expect(warning()).toBeNull();
    });

    it('付け替え先が5ファウルなら警告を出す', () => {
        const select = renderModal();

        fireEvent.change(select, { target: { value: 'p2' } });

        expect(warning()).toBeTruthy();
        expect(screen.getByText(/選手B/)).toBeTruthy();
    });

    it('付け替え先が4ファウルなら警告を出さない', () => {
        const select = renderModal();

        fireEvent.change(select, { target: { value: 'p3' } });

        expect(warning()).toBeNull();
    });

    it('警告が出ていても保存はできる', () => {
        const select = renderModal();

        fireEvent.change(select, { target: { value: 'p2' } });

        const save = screen.getByRole('button', { name: '保存' }) as HTMLButtonElement;
        expect(save.disabled).toBe(false);
    });

    it('得点の編集では出さない（様式のファウル欄を消費しない）', () => {
        render(
            <EditActionModal
                item={{ id: 's1', type: 'score', entryType: '2P', playerId: 'p1', playerNumber: 4 }}
                players={players}
                onSave={vi.fn()}
                onCancel={vi.fn()}
            />
        );

        fireEvent.change(screen.getByLabelText('選手'), { target: { value: 'p2' } });

        expect(warning()).toBeNull();
    });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/components/EditActionModal/EditActionModal.foulOverflow.test.tsx`
Expected: FAIL — 「付け替え先が5ファウルなら警告を出す」で `expected null to be truthy`。他の4件は先に PASS する

- [ ] **Step 3: import と判定を追加**

`src/components/EditActionModal/EditActionModal.tsx` の import に追加:

```tsx
import { wouldOverflowFoulColumns } from '../../utils/foulColumns';
```

既存の `const isFoul = item.type === 'foul';` の**直後**に追加:

```tsx
    // 付け替え先が既に5ファウルなら、移した瞬間に6個目になり公式様式の
    // ファウル欄（5枠）から漏れる。handleEditFoul は付け替え先の個数を
    // 見ていないため、記録フローの確認（FoulInputFlow）をすり抜ける経路になる。
    // 付け替えは長押し→編集と既に慎重な操作なので、ダイアログは重ねず警告だけ出す
    const foulOverflowTarget = isFoul && selectedPlayerId !== item.playerId
        ? players.find(p => p.id === selectedPlayerId && wouldOverflowFoulColumns(p.fouls))
        : undefined;
```

- [ ] **Step 4: 警告を描画する**

既存の `{isConversion() && ( ... )}` ブロックの**直後**（`</div>` で `edit-form` が閉じる前）に追加:

```tsx
                    {foulOverflowTarget && (
                        <div className="conversion-notice">
                            ⚠️ #{formatPlayerNumber(foulOverflowTarget.number)} {foulOverflowTarget.courtName || foulOverflowTarget.name} は既に{foulOverflowTarget.fouls.length}ファウルです。
                            付け替えると{foulOverflowTarget.fouls.length + 1}個目になり、公式様式には記録されません
                        </div>
                    )}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npx vitest run src/components/EditActionModal/`
Expected: PASS（新規5件 + 既存の EditActionModal テスト群すべて）

- [ ] **Step 6: コミット**

```bash
git add src/components/EditActionModal/EditActionModal.tsx src/components/EditActionModal/EditActionModal.foulOverflow.test.tsx
git commit -m "feat: 付け替えで6個目になるファウルに警告を出す

handleEditFoul は付け替え先のファウル数を見ていないため、履歴の編集から
記録フローの確認をすり抜けて6個目を作れた。保存は止めない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: ゲート1b — 交代要員のテクニカル（App.tsx）

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.benchTechOverflow.test.tsx`

**Interfaces:**
- Consumes: `wouldOverflowFoulColumns`（Task 1）、`ConfirmModal`（`src/components/Modal`、App.tsx で import 済み）
- Produces: なし

**背景:** ベンチファウルの入力は `benchFoulMode` で `shooter` ステップから始まり、`foulType` ステップを通らないため Task 2 のゲートで捕まらない。交代要員（Sub）だけは選手行に「T」を書く＝様式の5枠を消費する。コーチ・A.コーチ・ベンチ関係者は選手行に書かないので対象外。

**注意:** 交代要員のテクニカルは**チームファウルに加算されない**（`handleAddFoulWithFreeThrows` の `benchTechType === 'Sub'` 分岐）。したがって確認の補足文は Task 2 と変える。

- [ ] **Step 1: 失敗するテストを書く**

`src/App.benchTechOverflow.test.tsx`:

```tsx
// 交代要員のテクニカルは選手行に「T」を書く＝様式のファウル欄（5枠）を消費する。
// ベンチファウルの入力は shooter ステップから始まり FoulInputFlow の
// 種類選択を通らないため、そちらのゲートでは捕まらない。

import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { createInitialGame, createTeam, createPlayer } from './types/game';
import type { FoulType, Game, Player } from './types/game';

const CONFIRM_TITLE = 'このファウルは6個目です';

const onCourt = (p: Player): Player => ({ ...p, isOnCourt: true });
const withFouls = (p: Player, n: number): Player => ({
    ...p,
    fouls: Array.from({ length: n }, () => 'P' as FoulType),
});

/** ベンチに「5ファウルの選手」と「1ファウルの選手」がいる中断セッションを作る */
function seedSession() {
    const teamA = createTeam('teamA', 'ホームチーム', 'コーチ');
    teamA.players = [
        ...Array.from({ length: 5 }, (_, i) => onCourt(createPlayer(`a${i}`, 4 + i, `ホーム${i + 1}`))),
        withFouls(createPlayer('bench-five', 20, 'ベンチ五郎'), 5),
        withFouls(createPlayer('bench-one', 21, 'ベンチ一郎'), 1),
    ];
    const teamB = createTeam('teamB', 'アウェイチーム', 'コーチB');
    teamB.players = Array.from({ length: 5 }, (_, i) => onCourt(createPlayer(`b${i}`, 11 + i, `アウェイ${i + 1}`)));

    const game: Game = { ...createInitialGame(), teamA, teamB, phase: 'playing' };
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game,
        gameName: 'テスト大会',
        date: '2026-08-18',
        savedAt: new Date().toISOString(),
    }));
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    seedSession();
});

afterEach(cleanup);

/** 中断セッションを再開し、ホームチームの交代要員選択まで進める */
function openBenchPlayerSelect() {
    render(<App />);
    fireEvent.click(screen.getByText('試合を再開'));
    // ベンチファウルは両チーム分あるので、先頭（ホーム）を使う
    fireEvent.click(screen.getAllByRole('button', { name: /ベンチ\s*ファウル/ })[0]);
    fireEvent.click(screen.getByText(/交代要員/).closest('button')!);
}

describe('交代要員のテクニカル: 6個目以降の確認', () => {
    it('5ファウルのベンチ選手を選ぶと確認が出る', () => {
        openBenchPlayerSelect();

        fireEvent.click(screen.getByText('ベンチ五郎').closest('button')!);

        expect(screen.getByText(CONFIRM_TITLE)).toBeTruthy();
    });

    it('1ファウルのベンチ選手を選ぶと確認なしでFT入力へ進む', () => {
        openBenchPlayerSelect();

        fireEvent.click(screen.getByText('ベンチ一郎').closest('button')!);

        expect(screen.queryByText(CONFIRM_TITLE)).toBeNull();
        expect(screen.getByText(/シューター選択/)).toBeTruthy();
    });

    it('確認で「やめる」を押すと選手選択に留まる', () => {
        openBenchPlayerSelect();
        fireEvent.click(screen.getByText('ベンチ五郎').closest('button')!);

        fireEvent.click(screen.getByRole('button', { name: 'やめる' }));

        expect(screen.queryByText(CONFIRM_TITLE)).toBeNull();
        expect(screen.getByText(/交代要員を選択/)).toBeTruthy();
    });

    it('確認で「記録する」を押すとFT入力へ進む', () => {
        openBenchPlayerSelect();
        fireEvent.click(screen.getByText('ベンチ五郎').closest('button')!);

        fireEvent.click(screen.getByRole('button', { name: '記録する' }));

        expect(screen.getByText(/シューター選択/)).toBeTruthy();
    });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/App.benchTechOverflow.test.tsx`
Expected: FAIL — 「5ファウルのベンチ選手を選ぶと確認が出る」で `Unable to find an element with the text: このファウルは6個目です`。1ファウルのケースは先に PASS する

- [ ] **Step 3: import を追加**

`src/App.tsx` の import を変更:

```tsx
import type { Team, Player, FoulType, FreeThrowResult, ShotSituation, ScoreType, StatType } from './types/game';
```

（既存の `import type { Team, FoulType, ... }` に `Player` を足す）

`import { shareBackup } from './utils/dataBackup';` の下に追加:

```tsx
import { wouldOverflowFoulColumns } from './utils/foulColumns';
```

- [ ] **Step 4: 確認を挟むよう `handleBenchPlayerSelect` を分割する**

既存の `handleBenchPlayerSelect`（`// 交代要員選択（ベンチの選手を選択）` のブロック）を、まるごと次に置き換える:

```tsx
  // 交代要員のテクニカルは選手行に「T」を書く＝様式のファウル欄（5枠）を使う。
  // ベンチファウルは FoulInputFlow の種類選択を通らないので、そちらのゲートでは
  // 捕まらない。ここで同じ条件の確認を挟む
  const [benchOverflowPlayerId, setBenchOverflowPlayerId] = useState<string | null>(null);

  const proceedBenchPlayerSelect = (player: Player) => {
    setCoachFoulState(prev => prev && ({
      ...prev,
      step: 'foulInput',
      foulType: 'T',
      playerId: player.id,
      label: `#${formatPlayerNumber(player.number)} ${player.courtName || player.name} (T)`,
      benchTechType: 'Sub',
    }));
  };

  // 交代要員選択（ベンチの選手を選択）
  const handleBenchPlayerSelect = (playerId: string) => {
    if (!coachFoulState) return;
    const team = coachFoulState.teamId === 'teamA' ? state.teamA : state.teamB;
    const player = team.players.find(p => p.id === playerId);
    if (!player) return;

    if (wouldOverflowFoulColumns(player.fouls)) {
      setBenchOverflowPlayerId(playerId);
      return;
    }
    proceedBenchPlayerSelect(player);
  };
```

- [ ] **Step 5: 確認ダイアログを描画する**

`src/App.tsx` の「記録済みタイムアウトの取り消し確認」ブロック（`{timeoutCancelTeam && ( ... )}`）の**直後**、閉じ `</div>` の前に追加:

```tsx
      {/*
        交代要員のテクニカルが6個目以降になるときの確認。
        このファウルはチームファウルには加算されない（選手行にT・コーチ行にB）ので、
        FoulInputFlow 側の確認とは補足文を変える
      */}
      {benchOverflowPlayerId && coachFoulState && (() => {
        const team = coachFoulState.teamId === 'teamA' ? state.teamA : state.teamB;
        const player = team.players.find(p => p.id === benchOverflowPlayerId);
        if (!player) return null;
        return (
          <ConfirmModal
            title="このファウルは6個目です"
            message={`#${formatPlayerNumber(player.number)} ${player.courtName || player.name} は既に${player.fouls.length}ファウルです。6個目以降は公式様式のファウル欄（5枠）に記録できません。`}
            note="コーチ行の「B」は記録されます。"
            confirmLabel="記録する"
            cancelLabel="やめる"
            onConfirm={() => { setBenchOverflowPlayerId(null); proceedBenchPlayerSelect(player); }}
            onCancel={() => setBenchOverflowPlayerId(null)}
          />
        );
      })()}
```

- [ ] **Step 6: テストが通ることを確認**

Run: `npx vitest run src/App.benchTechOverflow.test.tsx`
Expected: PASS（4件）

- [ ] **Step 7: 全体の検証**

```bash
npm test
npm run build
npm run lint
npm run typecheck:test
```

Expected: すべて成功。テストは 145ファイル / 974件 から 149ファイル / 996件 前後に増える

- [ ] **Step 8: コミット**

```bash
git add src/App.tsx src/App.benchTechOverflow.test.tsx
git commit -m "feat: 交代要員のテクニカルが6個目以降になるときも確認する

ベンチファウルは shooter ステップから始まり FoulInputFlow の種類選択を
通らないため、そちらのゲートでは捕まらなかった。交代要員だけは選手行に
Tを書く＝様式の5枠を使う。チームファウルには加算されないので、
補足文は記録フロー側と変えている。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 完了条件

- 4ファウル以下の選手への記録は、これまでと一字一句同じ挙動（確認は出ない）
- 5ファウル以上の選手へ記録しようとすると、種類が決まった直後に確認が出る
- 確認を押し切れば従来どおり記録され、チームファウルの加算も従来どおり
- 履歴の付け替えで6個目になる場合は警告が出るが、保存はできる
- `RunningScoresheet` と `src/context/reducers/` に差分が無い
