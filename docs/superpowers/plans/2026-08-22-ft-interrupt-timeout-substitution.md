# FT入力中のタイムアウト・選手交代 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ファウル→FTの入力中、シューターが確定して以降に限り、入力を捨てずにタイムアウト・選手交代のモーダルを開けるようにする。

**Architecture:** `FoulInputFlow` はマウントしたまま、App が持つ既存のタイムアウト／交代モーダルをその上に重ねる。フローは対象チームを選ばせてコールバックを呼ぶだけで、モーダルの状態は従来どおり App が持つ。入力途中の状態はフローの内部 state に残るので退避も復元も不要。

**Tech Stack:** React 19 + TypeScript + Vite / Vitest + @testing-library/react（jsdom）

## Global Constraints

- **データモデルを変えない。** 1ファウル＝1シューター（`FoulRecord.shooterPlayerId`、`FoulWithFreeThrowsBase.shooterPlayerId`）のまま。FT1本ごとにシューターを持たせない
- **reducer を変えない。** `ADD_TIMEOUT` / `SUBSTITUTE_PLAYER` / `ADD_FOUL_WITH_FREE_THROWS` はいずれも現状のまま
- **`RunningScoresheet`（様式・PDF/JPEG出力）を変えない**
- **`TeamPanel` / `TimeoutInputModal` / `SubstitutionModal` の中身を変えない**
- **`z-index` を触らない。** オーバーレイは全て 1000 で、重なり順は DOM 順（後の兄弟が上）で決める
- 中断ブロックを出すのは `shooterPlayerId !== null` かつ `step` が `'shooter'` または `'ftResult'` のときだけ
- 保留アクション解決の `FoulInputFlow` には中断ブロックを出さない（過去のクォーターの記録を解決する場合があり、タイムアウトが `currentQuarter` に付いて食い違うため）
- ダークテーマ一色のアプリ。色は既存トークン（`--warning` / `--border` / `--bg-tertiary` / `--text-primary` / `--text-secondary`）だけを使い、`src/index.css` の `:root` に新しいトークンを足さない（`src/index.contrast.test.ts` が `:root` を読んでいる）
- 全タスク完了時に `npm test`、`npm run lint`、`npm run typecheck:test` が通ること

設計の全文: [docs/superpowers/specs/2026-08-22-ft-interrupt-timeout-substitution-design.md](../specs/2026-08-22-ft-interrupt-timeout-substitution-design.md)

---

## File Structure

| ファイル | 責務 | 変更 |
|---|---|---|
| `src/components/FoulInputFlow/FoulInputFlow.tsx` | 中断ブロックの表示条件・チーム選択・シューター離脱の警告 | 変更 |
| `src/components/FoulInputFlow/FoulInputFlow.css` | 中断ブロックと警告の見た目 | 変更 |
| `src/components/FoulInputFlow/FoulInputFlow.interrupt.test.tsx` | 中断ブロックの単体テスト | 新規 |
| `src/components/FoulInputFlow/FoulInputFlow.shooterLeft.test.tsx` | シューター離脱の単体テスト | 新規 |
| `src/App.tsx` | 3つの呼び出し元への出し分け・モーダルの結線・JSX の並び替え | 変更 |
| `src/App.ftInterrupt.test.tsx` | 重なりと入力状態の保持を通しで見るテスト | 新規 |

---

## Task 1: 中断ブロック（表示条件・チーム選択・コールバック）

**Files:**
- Modify: `src/components/FoulInputFlow/FoulInputFlow.tsx`
- Modify: `src/components/FoulInputFlow/FoulInputFlow.css`
- Test: `src/components/FoulInputFlow/FoulInputFlow.interrupt.test.tsx`（新規）

**Interfaces:**
- Consumes: なし（このタスクが起点）
- Produces:
  ```ts
  export interface InterruptTeam {
      id: 'teamA' | 'teamB';
      name: string;
      timeoutUsed: boolean;
  }
  ```
  `FoulInputFlowProps` に追加する省略可能プロパティ:
  `interruptTeams?: InterruptTeam[]` / `onRequestTimeout?: (teamId: 'teamA' | 'teamB') => void` / `onRequestSubstitution?: (teamId: 'teamA' | 'teamB') => void`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/FoulInputFlow/FoulInputFlow.interrupt.test.tsx` を新規作成:

```tsx
// FT入力中のタイムアウト・選手交代。
//
// FoulInputFlow は背後の選手カードを一切触らせないため、FT結果を入れている
// 最中にタイムアウトや交代が入ると、記録者には「FTを最後まで入れてから戻る」か
// 「キャンセルして入力を捨てる」しか手が無かった。
//
// 出すのはシューターが確定して以降だけ。確定前に交代が入ると、候補リストが
// 今のコート状況から引き直されるため、ファウル時点でコートにいなかった選手が
// 並び、ファウルされた本人が下がっていれば候補から消える。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FoulInputFlow } from './FoulInputFlow';
import { createPlayer } from '../../types/game';

afterEach(cleanup);

const OPPONENTS = [
    { ...createPlayer('b1', 10, '相手1'), isOnCourt: true },
    { ...createPlayer('b2', 11, '相手2'), isOnCourt: true },
];

const TEAMS = [
    { id: 'teamA' as const, name: '東京中', timeoutUsed: false },
    { id: 'teamB' as const, name: '大阪中', timeoutUsed: false },
];

function renderFlow(overrides: Partial<Parameters<typeof FoulInputFlow>[0]> = {}) {
    const onRequestTimeout = vi.fn();
    const onRequestSubstitution = vi.fn();
    render(
        <FoulInputFlow
            hasSelectedPlayer
            playerName="佐藤 花子"
            playerNumber={5}
            // 4個目まで済み＝このファウルからペナルティ。Pの通常タップで
            // 直接シューター選択へ入るので、テストの導線が短くなる
            teamFouls={4}
            opponentTeamId="teamB"
            opponentTeamName="相手"
            opponentPlayers={OPPONENTS}
            interruptTeams={TEAMS}
            onRequestTimeout={onRequestTimeout}
            onRequestSubstitution={onRequestSubstitution}
            onComplete={vi.fn()}
            onCancel={vi.fn()}
            {...overrides}
        />,
    );
    return { onRequestTimeout, onRequestSubstitution };
}

/** Pファウルを通常タップ（キーボード経路）してシューター選択へ入る */
function tapPFoul() {
    const pButton = screen.getByText('パーソナルファウル').closest('button')!;
    fireEvent.keyDown(pButton, { key: 'Enter' });
}

/** シューターを選ぶ（まだ「次へ」は押さない） */
function selectShooter() {
    fireEvent.click(screen.getByText('相手1').closest('button')!);
}

/** FT結果入力まで進む */
function goToFtResult() {
    tapPFoul();
    selectShooter();
    fireEvent.click(screen.getByText('次へ'));
}

describe('中断ブロック: 表示条件', () => {
    it('ファウル種類選択では出ない', () => {
        renderFlow();
        expect(screen.queryByText('試合の中断')).toBeNull();
    });

    it('シューター選択でまだ誰も選んでいなければ出ない', () => {
        renderFlow();
        tapPFoul();
        expect(screen.getByText('シューターを選択')).toBeTruthy();
        expect(screen.queryByText('試合の中断')).toBeNull();
    });

    it('FT本数選択では出ない', () => {
        renderFlow();
        // T は本数選択ステップへ入る
        fireEvent.click(screen.getByText('テクニカルファウル').closest('button')!);
        expect(screen.getByText('フリースロー本数を選択')).toBeTruthy();
        expect(screen.queryByText('試合の中断')).toBeNull();
    });

    it('シューターを選んだ後は、シューター選択のままでも出る', () => {
        renderFlow();
        tapPFoul();
        selectShooter();
        expect(screen.getByText('試合の中断')).toBeTruthy();
        expect(screen.getByText('⏱ タイムアウト')).toBeTruthy();
        expect(screen.getByText('🔄 選手交代')).toBeTruthy();
    });

    it('FT結果入力でも出る', () => {
        renderFlow();
        goToFtResult();
        expect(screen.getByText('試合の中断')).toBeTruthy();
    });

    it('interruptTeams を渡さなければ出ない（保留アクション解決の経路）', () => {
        renderFlow({ interruptTeams: undefined });
        goToFtResult();
        expect(screen.queryByText('試合の中断')).toBeNull();
    });

    it('onRequestTimeout を渡さなければ交代のボタンだけが出る', () => {
        renderFlow({ onRequestTimeout: undefined });
        goToFtResult();
        expect(screen.queryByText('⏱ タイムアウト')).toBeNull();
        expect(screen.getByText('🔄 選手交代')).toBeTruthy();
    });
});

describe('中断ブロック: チーム選択', () => {
    it('タイムアウトを押すと同じ行がチーム選択に入れ替わる', () => {
        renderFlow();
        goToFtResult();
        fireEvent.click(screen.getByText('⏱ タイムアウト'));

        expect(screen.getByText('タイムアウトを記録するチーム')).toBeTruthy();
        expect(screen.getByText('東京中')).toBeTruthy();
        expect(screen.getByText('大阪中')).toBeTruthy();
        // 入れ替わりなので元のボタンは消える
        expect(screen.queryByText('⏱ タイムアウト')).toBeNull();
        expect(screen.queryByText('🔄 選手交代')).toBeNull();
    });

    it('チームを押すと onRequestTimeout がそのチームIDで呼ばれ、初期状態に戻る', () => {
        const { onRequestTimeout } = renderFlow();
        goToFtResult();
        fireEvent.click(screen.getByText('⏱ タイムアウト'));
        fireEvent.click(screen.getByText('大阪中'));

        expect(onRequestTimeout).toHaveBeenCalledWith('teamB');
        expect(screen.getByText('⏱ タイムアウト')).toBeTruthy();
    });

    it('交代も同じようにチームを選んで onRequestSubstitution が呼ばれる', () => {
        const { onRequestSubstitution } = renderFlow();
        goToFtResult();
        fireEvent.click(screen.getByText('🔄 選手交代'));

        expect(screen.getByText('選手交代をするチーム')).toBeTruthy();
        fireEvent.click(screen.getByText('東京中'));
        expect(onRequestSubstitution).toHaveBeenCalledWith('teamA');
    });

    it('FT結果を入れた後にタイムアウトを要求しても、入力とステップが残る', () => {
        const { onRequestTimeout } = renderFlow();
        goToFtResult();
        const madeButtons = screen.getAllByText('○ 成功');
        fireEvent.click(madeButtons[0]);
        expect(screen.getByText('結果: 1/2 成功 (+1点)')).toBeTruthy();

        fireEvent.click(screen.getByText('⏱ タイムアウト'));
        fireEvent.click(screen.getByText('東京中'));

        expect(onRequestTimeout).toHaveBeenCalledWith('teamA');
        // FT結果入力のまま、入れた1本目も残っている
        expect(screen.getByText('結果: 1/2 成功 (+1点)')).toBeTruthy();
        expect(screen.getByText('シューター: #10 相手1')).toBeTruthy();
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run:
```bash
npx vitest run src/components/FoulInputFlow/FoulInputFlow.interrupt.test.tsx
```
Expected: FAIL。`interruptTeams` などのプロパティが型に無く、「試合の中断」も描画されないため、表示条件のうち「出る」側の全ケースが `Unable to find an element with the text: 試合の中断` で落ちる。

- [ ] **Step 3: プロパティと state を足す**

`src/components/FoulInputFlow/FoulInputFlow.tsx`。`type Step = ...` の直後に型を追加:

```ts
/** 中断（タイムアウト・交代）で選ばせるチーム */
export interface InterruptTeam {
    id: 'teamA' | 'teamB';
    name: string;
    /** 現クォーターでタイムアウトを使用済みか */
    timeoutUsed: boolean;
}
```

`interface FoulInputFlowProps` の `showThreePoint?: boolean;` の下に追加:

```ts
    /**
     * 試合中断（タイムアウト・交代）で選ばせるチーム。省略時は中断ブロックを出さない。
     *
     * 保留アクションの解決は過去のクォーターを後から埋める場合があり、そこで
     * タイムアウトを記録すると currentQuarter に付いて実際と食い違う。
     * その経路では渡さないことで出さない。
     */
    interruptTeams?: InterruptTeam[];
    /** タイムアウト記録の要求。省略時はタイムアウトのボタンを出さない */
    onRequestTimeout?: (teamId: 'teamA' | 'teamB') => void;
    /** 選手交代の要求。省略時は交代のボタンを出さない */
    onRequestSubstitution?: (teamId: 'teamA' | 'teamB') => void;
```

分割代入（`showThreePoint = true,` の下）に追加:

```ts
    interruptTeams,
    onRequestTimeout,
    onRequestSubstitution,
```

`const [shotMade, setShotMade] = useState<boolean>(false);` の下に state を追加:

```ts
    // 中断ブロックでどちらを押したか。null は初期状態（2つのボタンが出ている）
    const [interruptChoice, setInterruptChoice] = useState<'timeout' | 'substitution' | null>(null);
```

- [ ] **Step 4: 表示条件とハンドラを足す**

`const availableShooters = opponentPlayers.filter(p => p.isOnCourt);` の直前に追加:

```ts
    // 中断ブロックはシューターが確定して以降だけ出す。
    // 確定前はシューターがアプリのどこにも入っておらず、中断から戻ると
    // 記録者の記憶しか頼りが無い。さらに候補リストは今のコート状況から
    // 毎回引き直すため、確定前に交代が入ると正しい選択肢が画面から消える。
    const canInterrupt =
        interruptTeams !== undefined &&
        interruptTeams.length > 0 &&
        (onRequestTimeout !== undefined || onRequestSubstitution !== undefined) &&
        shooterPlayerId !== null &&
        (step === 'shooter' || step === 'ftResult');
```

`handleShooterComplete` の下にハンドラを追加:

```ts
    // 中断のチーム選択。App 側が上にモーダルを重ねる。
    // このコンポーネントはマウントされたままなので入力途中の状態は残る
    const handleInterruptTeamSelect = useCallback((teamId: 'teamA' | 'teamB') => {
        if (interruptChoice === 'timeout') {
            onRequestTimeout?.(teamId);
        } else if (interruptChoice === 'substitution') {
            onRequestSubstitution?.(teamId);
        }
        setInterruptChoice(null);
    }, [interruptChoice, onRequestTimeout, onRequestSubstitution]);
```

- [ ] **Step 5: 中断ブロックを描画する**

`{/* キャンセルボタン */}` の直前に挿入:

```tsx
                {/*
                  試合の中断（タイムアウト・選手交代）。
                  FT結果の入力ボタンと隣り合わせにすると誤タップするので、
                  区切り線で独立させてキャンセルの直上に置く。
                  チーム選択は同じ行を置き換える。モーダルを増やさないためと、
                  ただでさえ縦に長いこの画面の高さを増やさないため
                */}
                {canInterrupt && (
                    <div className="interrupt-section">
                        <div className="interrupt-title">試合の中断</div>
                        {interruptChoice === null ? (
                            <div className="interrupt-buttons">
                                {onRequestTimeout && (
                                    <button
                                        className="btn btn-secondary interrupt-btn"
                                        onClick={() => setInterruptChoice('timeout')}
                                    >
                                        ⏱ タイムアウト
                                    </button>
                                )}
                                {onRequestSubstitution && (
                                    <button
                                        className="btn btn-secondary interrupt-btn"
                                        onClick={() => setInterruptChoice('substitution')}
                                    >
                                        🔄 選手交代
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="interrupt-team-select">
                                <div className="interrupt-prompt">
                                    {interruptChoice === 'timeout'
                                        ? 'タイムアウトを記録するチーム'
                                        : '選手交代をするチーム'}
                                </div>
                                <div className="interrupt-buttons">
                                    {(interruptTeams ?? []).map(team => {
                                        // 1クォーター1回。取り消しは既存のチップに任せる
                                        const used = interruptChoice === 'timeout' && team.timeoutUsed;
                                        return (
                                            <button
                                                key={team.id}
                                                className="btn btn-secondary interrupt-btn"
                                                onClick={() => handleInterruptTeamSelect(team.id)}
                                                disabled={used}
                                            >
                                                {team.name}{used ? '（済）' : ''}
                                            </button>
                                        );
                                    })}
                                    <button
                                        className="btn btn-secondary interrupt-btn interrupt-cancel"
                                        onClick={() => setInterruptChoice(null)}
                                    >
                                        やめる
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

```

- [ ] **Step 6: CSS を足す**

`src/components/FoulInputFlow/FoulInputFlow.css` の `.foul-input-flow .foul-input-actions { ... }` ブロックの直前に追加:

```css
/* 試合の中断（タイムアウト・選手交代）。
   FT入力ボタンとの誤タップを避けるため区切り線で独立させる */
.foul-input-flow .interrupt-section {
    margin-top: var(--spacing-lg);
    padding-top: var(--spacing-md);
    border-top: 1px solid var(--border);
}

.foul-input-flow .interrupt-title {
    text-align: center;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--spacing-sm);
}

.foul-input-flow .interrupt-prompt {
    text-align: center;
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--spacing-sm);
}

.foul-input-flow .interrupt-buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--spacing-sm);
}

.foul-input-flow .interrupt-btn {
    flex: 1 1 auto;
    min-width: 0;
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-sm);
    /* チーム名は語中で折り返させない（v1.3.14 の方針） */
    overflow-wrap: anywhere;
    word-break: normal;
}

.foul-input-flow .interrupt-btn:disabled {
    opacity: 0.5;
}
```

- [ ] **Step 7: テストが通ることを確認**

Run:
```bash
npx vitest run src/components/FoulInputFlow/FoulInputFlow.interrupt.test.tsx
```
Expected: PASS（11件）

- [ ] **Step 8: 既存テストの退行が無いことを確認**

Run:
```bash
npx vitest run src/components/FoulInputFlow
```
Expected: PASS（`FoulInputFlow.interrupt` を含む全ファイル）

- [ ] **Step 9: コミット**

```bash
git add src/components/FoulInputFlow/FoulInputFlow.tsx src/components/FoulInputFlow/FoulInputFlow.css src/components/FoulInputFlow/FoulInputFlow.interrupt.test.tsx
git commit -m "feat(foul): FT入力中に中断してタイムアウト・交代を要求できるようにする"
```

---

## Task 2: 中断ブロックの安全弁（使用済み・やめる・戻る操作）

**Files:**
- Modify: `src/components/FoulInputFlow/FoulInputFlow.tsx`
- Test: `src/components/FoulInputFlow/FoulInputFlow.interrupt.test.tsx`（Task 1 で作成済み、追記）

**Interfaces:**
- Consumes: Task 1 の `interruptTeams` / `onRequestTimeout` / `onRequestSubstitution` / `interruptChoice` state / `handleInterruptTeamSelect`
- Produces: なし（`handleBack` の挙動が変わるだけ）

- [ ] **Step 1: 失敗するテストを書く**

`FoulInputFlow.interrupt.test.tsx` の末尾に追記:

```tsx
describe('中断ブロック: 安全弁', () => {
    it('タイムアウト使用済みのチームは押せず「済」が出る', () => {
        const { onRequestTimeout } = renderFlow({
            interruptTeams: [
                { id: 'teamA', name: '東京中', timeoutUsed: true },
                { id: 'teamB', name: '大阪中', timeoutUsed: false },
            ],
        });
        goToFtResult();
        fireEvent.click(screen.getByText('⏱ タイムアウト'));

        const used = screen.getByText('東京中（済）').closest('button')! as HTMLButtonElement;
        expect(used.disabled).toBe(true);
        fireEvent.click(used);
        expect(onRequestTimeout).not.toHaveBeenCalled();
    });

    it('使用済みでも交代のチーム選択では押せる', () => {
        const { onRequestSubstitution } = renderFlow({
            interruptTeams: [
                { id: 'teamA', name: '東京中', timeoutUsed: true },
                { id: 'teamB', name: '大阪中', timeoutUsed: false },
            ],
        });
        goToFtResult();
        fireEvent.click(screen.getByText('🔄 選手交代'));

        fireEvent.click(screen.getByText('東京中'));
        expect(onRequestSubstitution).toHaveBeenCalledWith('teamA');
    });

    it('「やめる」で初期状態に戻る', () => {
        const { onRequestTimeout } = renderFlow();
        goToFtResult();
        fireEvent.click(screen.getByText('⏱ タイムアウト'));
        fireEvent.click(screen.getByText('やめる'));

        expect(screen.getByText('⏱ タイムアウト')).toBeTruthy();
        expect(screen.queryByText('タイムアウトを記録するチーム')).toBeNull();
        expect(onRequestTimeout).not.toHaveBeenCalled();
    });

    it('チーム選択中のEscapeは、ステップを戻さずチーム選択だけを閉じる', () => {
        renderFlow();
        goToFtResult();
        fireEvent.click(screen.getByText('⏱ タイムアウト'));

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        // FT結果入力のまま。チーム選択だけが閉じる
        expect(screen.getByText('フリースロー結果を入力')).toBeTruthy();
        expect(screen.queryByText('タイムアウトを記録するチーム')).toBeNull();
        expect(screen.getByText('⏱ タイムアウト')).toBeTruthy();
    });

    it('チーム選択を閉じた後のEscapeは従来どおりシューター選択へ戻る', () => {
        renderFlow();
        goToFtResult();
        fireEvent.click(screen.getByText('⏱ タイムアウト'));
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        expect(screen.getByText('シューターを選択')).toBeTruthy();
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run:
```bash
npx vitest run src/components/FoulInputFlow/FoulInputFlow.interrupt.test.tsx -t "安全弁"
```
Expected: 「Escapeは、ステップを戻さずチーム選択だけを閉じる」が FAIL。Escape が `handleBack` に直結しているため、チーム選択を開いたままシューター選択へ戻ってしまう。使用済み・やめるの3件は Task 1 の実装で既に通る。

- [ ] **Step 3: handleBack にチーム選択の分岐を足す**

`src/components/FoulInputFlow/FoulInputFlow.tsx` の `handleBack` を変更する。関数の先頭に分岐を追加し、依存配列に `interruptChoice` を足す:

```ts
    // 戻るボタン
    const handleBack = useCallback(() => {
        // 中断のチーム選択を開いている間は、ステップを戻すより先にそれを閉じる。
        // Escape も端末の戻る操作も Modal 経由でここへ来るため、
        // 分岐を入れないとチーム選択を出したまま入力段階だけが巻き戻る
        if (interruptChoice !== null) {
            setInterruptChoice(null);
            return;
        }
        switch (step) {
```

（`switch` の中身は変更しない。）依存配列を変更:

```ts
    }, [step, foulType, freeThrows, shotSituation, benchFoulMode, onCancel, showThreePoint, interruptChoice]);
```

- [ ] **Step 4: テストが通ることを確認**

Run:
```bash
npx vitest run src/components/FoulInputFlow/FoulInputFlow.interrupt.test.tsx
```
Expected: PASS（16件）

- [ ] **Step 5: 戻る操作の既存テストが通ることを確認**

Run:
```bash
npx vitest run src/components/FoulInputFlow/FoulInputFlow.dialog.test.tsx src/components/FoulInputFlow/FoulInputFlow.keyboard.test.tsx
```
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/components/FoulInputFlow/FoulInputFlow.tsx src/components/FoulInputFlow/FoulInputFlow.interrupt.test.tsx
git commit -m "fix(foul): 中断のチーム選択中の戻る操作でステップが巻き戻らないようにする"
```

---

## Task 3: シューターがコートを離れた場合

**Files:**
- Modify: `src/components/FoulInputFlow/FoulInputFlow.tsx`
- Modify: `src/components/FoulInputFlow/FoulInputFlow.css`
- Test: `src/components/FoulInputFlow/FoulInputFlow.shooterLeft.test.tsx`（新規）

**Interfaces:**
- Consumes: Task 1 の中断ブロック（交代の入り口）
- Produces: `shooter`（`Player | null`）と `shooterLeftCourt`（`boolean`）をコンポーネント内の派生値として持つ。`ftResult` のシューター表示はこの `shooter` を使う

- [ ] **Step 1: 失敗するテストを書く**

`src/components/FoulInputFlow/FoulInputFlow.shooterLeft.test.tsx` を新規作成:

```tsx
// FTを打つ選手が負傷退場した場合。
//
// 規則では、シューターが負傷・失格でコートを離れたら、交代で入った選手が
// 残りのFTを打つ。ところが候補リストは isOnCourt から引き直すので、
// 選択済みのシューターが下がると候補から消える。
//
// 1本目を打った後に離れた場合、成功分は本人に残り、残りは交代選手が打つ。
// この記録が持てるシューターは1人だけ（FoulRecord.shooterPlayerId）なので、
// 正確には表せない。黙って寄せず、ずれることを画面に出す。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FoulInputFlow } from './FoulInputFlow';
import { createPlayer } from '../../types/game';
import type { Player } from '../../types/game';

afterEach(cleanup);

const onCourt = (id: string, number: number, name: string): Player =>
    ({ ...createPlayer(id, number, name), isOnCourt: true });

function flow(opponentPlayers: Player[]) {
    return (
        <FoulInputFlow
            hasSelectedPlayer
            playerName="佐藤 花子"
            playerNumber={5}
            teamFouls={4}
            opponentTeamId="teamB"
            opponentTeamName="相手"
            opponentPlayers={opponentPlayers}
            onComplete={vi.fn()}
            onCancel={vi.fn()}
        />
    );
}

function renderFlow(opponentPlayers: Player[]) {
    const { rerender } = render(flow(opponentPlayers));
    /** 交代が起きた後の再描画。App から新しい opponentPlayers が降ってくる想定 */
    const substitute = (next: Player[]) => rerender(flow(next));
    return { substitute };
}

function tapPFoul() {
    fireEvent.keyDown(screen.getByText('パーソナルファウル').closest('button')!, { key: 'Enter' });
}

describe('シューターがコートを離れたとき', () => {
    it('シューター選択の段階なら「次へ」が押せなくなり、選び直しを促す', () => {
        const injured = onCourt('b1', 10, '相手1');
        const bench = { ...createPlayer('b3', 12, '交代選手'), isOnCourt: false };
        const { substitute } = renderFlow([injured, onCourt('b2', 11, '相手2'), bench]);

        tapPFoul();
        fireEvent.click(screen.getByText('相手1').closest('button')!);
        expect((screen.getByText('次へ') as HTMLButtonElement).disabled).toBe(false);

        // 負傷交代: 相手1 が下がり、交代選手が入る
        substitute([
            { ...injured, isOnCourt: false },
            onCourt('b2', 11, '相手2'),
            { ...bench, isOnCourt: true },
        ]);

        expect(screen.getByText(/シューターが交代でコートを離れました/)).toBeTruthy();
        expect((screen.getByText('次へ') as HTMLButtonElement).disabled).toBe(true);
        // 交代で入った選手が候補に並ぶ
        expect(screen.getByText('交代選手')).toBeTruthy();
    });

    it('FT未入力なら「シューターを選び直す」でシューター選択へ戻る', () => {
        const injured = onCourt('b1', 10, '相手1');
        const bench = { ...createPlayer('b3', 12, '交代選手'), isOnCourt: false };
        const { substitute } = renderFlow([injured, onCourt('b2', 11, '相手2'), bench]);

        tapPFoul();
        fireEvent.click(screen.getByText('相手1').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));
        substitute([
            { ...injured, isOnCourt: false },
            onCourt('b2', 11, '相手2'),
            { ...bench, isOnCourt: true },
        ]);

        expect(screen.getByText('シューターを選び直す')).toBeTruthy();
        // 個人成績がずれる旨の注意は、まだ1本も打っていないので出さない
        expect(screen.queryByText(/個人の得点とFT%が実際とずれます/)).toBeNull();

        fireEvent.click(screen.getByText('シューターを選び直す'));
        expect(screen.getByText('シューターを選択')).toBeTruthy();
    });

    it('FT入力済みなら、ずれる旨を出したうえで「記録」は押せる', () => {
        const injured = onCourt('b1', 10, '相手1');
        const bench = { ...createPlayer('b3', 12, '交代選手'), isOnCourt: false };
        const { substitute } = renderFlow([injured, onCourt('b2', 11, '相手2'), bench]);

        tapPFoul();
        fireEvent.click(screen.getByText('相手1').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));
        // 2本とも入力しておく（記録が押せる状態にする）
        fireEvent.click(screen.getAllByText('○ 成功')[0]);
        fireEvent.click(screen.getAllByText('× 失敗')[1]);

        substitute([
            { ...injured, isOnCourt: false },
            onCourt('b2', 11, '相手2'),
            { ...bench, isOnCourt: true },
        ]);

        expect(screen.getByText(/個人の得点とFT%が実際とずれます/)).toBeTruthy();
        expect(screen.getByText('シューターを変更')).toBeTruthy();
        expect((screen.getByText('記録') as HTMLButtonElement).disabled).toBe(false);
    });

    it('「シューターを変更」で戻っても、入力済みのFT結果が消えない', () => {
        const injured = onCourt('b1', 10, '相手1');
        const bench = { ...createPlayer('b3', 12, '交代選手'), isOnCourt: false };
        const { substitute } = renderFlow([injured, onCourt('b2', 11, '相手2'), bench]);

        tapPFoul();
        fireEvent.click(screen.getByText('相手1').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));
        fireEvent.click(screen.getAllByText('○ 成功')[0]);
        substitute([
            { ...injured, isOnCourt: false },
            onCourt('b2', 11, '相手2'),
            { ...bench, isOnCourt: true },
        ]);

        fireEvent.click(screen.getByText('シューターを変更'));
        fireEvent.click(screen.getByText('交代選手').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));

        // 1本目の成功が残っている（handleBack と違い結果を初期化しない）
        expect(screen.getByText('結果: 1/2 成功 (+1点)')).toBeTruthy();
        expect(screen.getByText('シューター: #12 交代選手')).toBeTruthy();
    });

    it('コートを離れてもシューター表示が空欄にならない', () => {
        const injured = onCourt('b1', 10, '相手1');
        const { substitute } = renderFlow([injured, onCourt('b2', 11, '相手2')]);

        tapPFoul();
        fireEvent.click(screen.getByText('相手1').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));
        expect(screen.getByText('シューター: #10 相手1')).toBeTruthy();

        substitute([{ ...injured, isOnCourt: false }, onCourt('b2', 11, '相手2')]);

        expect(screen.getByText('シューター: #10 相手1')).toBeTruthy();
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run:
```bash
npx vitest run src/components/FoulInputFlow/FoulInputFlow.shooterLeft.test.tsx
```
Expected: FAIL。警告文が存在せず、シューター表示は `availableShooters`（`isOnCourt` で絞った配列）から探しているため「シューター: #10 相手1」も見つからない。

- [ ] **Step 3: 派生値を足す**

`src/components/FoulInputFlow/FoulInputFlow.tsx`、`const availableShooters = opponentPlayers.filter(p => p.isOnCourt);` の直後に追加:

```ts
    // 選択済みのシューターは、交代で下がっても opponentPlayers 全体から引く。
    // availableShooters（isOnCourt で絞った配列）から探すと、負傷交代の瞬間に
    // 「シューター: #」だけが残って誰なのか読めなくなる
    const shooter = shooterPlayerId
        ? opponentPlayers.find(p => p.id === shooterPlayerId) ?? null
        : null;
    // 負傷・失格で下がった場合、残りのFTは交代で入った選手が打つ
    const shooterLeftCourt = shooter !== null && !shooter.isOnCourt;
    const ftAnyEntered = freeThrowResults.some(r => r !== null);
```

- [ ] **Step 4: シューター選択ステップに警告を出し、「次へ」を止める**

`{step === 'shooter' && (` のブロック内、`<div className="shooter-team-name">` の直前に追加:

```tsx
                        {shooterLeftCourt && (
                            <div className="shooter-left-warning">
                                ⚠️ シューターが交代でコートを離れました。FTを打つ選手を選び直してください。
                            </div>
                        )}
```

同じブロックの「次へ」ボタンの `disabled` を変更:

```tsx
                        <button
                            className="btn btn-primary shooter-complete"
                            onClick={handleShooterComplete}
                            disabled={!shooterPlayerId || shooterLeftCourt}
                        >
                            次へ
                        </button>
```

- [ ] **Step 5: FT結果ステップの表示を直し、警告を出す**

`{step === 'ftResult' && (` のブロック内、先頭の IIFE を置き換える。

置き換え前:

```tsx
                        {(() => {
                            const shooter = availableShooters.find(p => p.id === shooterPlayerId);
                            return (
                                <div className="shooter-info">
                                    シューター: #{shooter ? formatPlayerNumber(shooter.number) : ''} {shooter?.courtName || shooter?.name}
                                </div>
                            );
                        })()}
```

置き換え後:

```tsx
                        <div className="shooter-info">
                            シューター: #{shooter ? formatPlayerNumber(shooter.number) : ''} {shooter?.courtName || shooter?.name}
                        </div>
                        {/*
                          規則では、シューターが負傷・失格で下がったら残りのFTは
                          交代で入った選手が打つ。ところがこの記録が持てるシューターは
                          1人だけ（FoulRecord.shooterPlayerId）なので、1本でも打った後だと
                          正確には表せない。どちらに寄せるかは記録者に委ねたうえで、
                          ずれることを画面に出す
                        */}
                        {shooterLeftCourt && (
                            <div className="shooter-left-warning">
                                <div>⚠️ シューターが交代でコートを離れました。</div>
                                {ftAnyEntered && (
                                    <div className="shooter-left-detail">
                                        すでに入力したFTがあります。この記録が持てるシューターは1人だけなので、
                                        残りを交代選手が打った場合、個人の得点とFT%が実際とずれます。
                                        チームの得点は正しく記録されます。
                                    </div>
                                )}
                                <button
                                    className="btn btn-secondary shooter-left-change"
                                    onClick={() => setStep('shooter')}
                                >
                                    {ftAnyEntered ? 'シューターを変更' : 'シューターを選び直す'}
                                </button>
                            </div>
                        )}
```

**注意:** ここは `handleBack` を呼ばず `setStep('shooter')` を直接呼ぶ。`handleBack` は `ftResult` から戻るときに `freeThrowResults` を全部 null に戻すため、入力済みの結果が消えてしまう。

- [ ] **Step 6: CSS を足す**

`src/components/FoulInputFlow/FoulInputFlow.css`、Task 1 で足した `.interrupt-section` ブロックの直前に追加:

```css
/* シューターが交代でコートを離れたときの注意。
   ファウルアウト警告(.foul-warning)ほど強くしない。記録を止める話ではなく、
   選び直しとずれの告知なので、点滅させず橙で出す */
.foul-input-flow .shooter-left-warning {
    background: var(--bg-tertiary);
    border: 1px solid var(--warning);
    border-radius: var(--radius-md);
    padding: var(--spacing-md);
    margin-bottom: var(--spacing-md);
    text-align: center;
    color: var(--warning);
    font-size: var(--font-size-sm);
    font-weight: 600;
}

.foul-input-flow .shooter-left-detail {
    margin-top: var(--spacing-sm);
    color: var(--text-primary);
    font-weight: 400;
    text-align: left;
    overflow-wrap: anywhere;
    word-break: normal;
}

.foul-input-flow .shooter-left-change {
    margin-top: var(--spacing-sm);
    width: 100%;
}
```

- [ ] **Step 7: テストが通ることを確認**

Run:
```bash
npx vitest run src/components/FoulInputFlow/FoulInputFlow.shooterLeft.test.tsx
```
Expected: PASS（5件）

- [ ] **Step 8: 既存テストの退行が無いことを確認**

Run:
```bash
npx vitest run src/components/FoulInputFlow
```
Expected: PASS

- [ ] **Step 9: コミット**

```bash
git add src/components/FoulInputFlow/FoulInputFlow.tsx src/components/FoulInputFlow/FoulInputFlow.css src/components/FoulInputFlow/FoulInputFlow.shooterLeft.test.tsx
git commit -m "fix(foul): FTシューターが交代で下がったときに表示が消えず選び直せるようにする"
```

---

## Task 4: App への結線とモーダルの重なり

**Files:**
- Modify: `src/App.tsx`（`handleSubstitute` の周辺 / 通常の `FoulInputFlow` 呼び出し / ベンチファウルの `FoulInputFlow` 呼び出し / `SubstitutionModal` ブロックの移動）
- Test: `src/App.ftInterrupt.test.tsx`（新規）

**Interfaces:**
- Consumes: Task 1 の `interruptTeams` / `onRequestTimeout` / `onRequestSubstitution`
- Produces: App 内の `interruptTeams`（`InterruptTeam[]`）と `handleRequestSubstitution(teamId: 'teamA' | 'teamB'): void`

- [ ] **Step 1: 失敗するテストを書く**

`src/App.ftInterrupt.test.tsx` を新規作成:

```tsx
// FT入力中の中断を通しで見る。
//
// 単体テストではコールバックが呼ばれることまでしか見えない。ここで見たいのは
// 「重なり順」と「入力が残ること」。オーバーレイの z-index は全て 1000 で、
// どちらが上かは DOM の並び順だけで決まるため、App の JSX の並びが崩れると
// 交代モーダルがファウル入力の下に潜って操作できなくなる。

import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import App from './App';
import { createInitialGame, createTeam, createPlayer } from './types/game';

const myTeam = {
    id: 'team-1',
    name: 'テストチーム',
    coachName: 'コーチ',
    assistantCoachName: '',
    players: [{ number: 4, name: '選手4', isCaptain: true }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

/** 進行中の試合。teamA は既に4チームファウル＝次のPからペナルティ（FT2本） */
function seedPlayingSession() {
    const game = createInitialGame();
    game.phase = 'playing';
    game.currentQuarter = 1;
    game.teamA = {
        ...createTeam('teamA', 'テストチーム', 'コーチ'),
        players: [{ ...createPlayer('teamA-player-0', 4, '選手4'), isOnCourt: true }],
        teamFouls: [4, 0, 0, 0],
    };
    game.teamB = {
        ...createTeam('teamB', '相手チーム', '相手コーチ'),
        players: [
            { ...createPlayer('teamB-player-0', 5, '選手5'), isOnCourt: true },
            { ...createPlayer('teamB-player-1', 6, '選手6'), isOnCourt: false },
        ],
    };
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game, gameName: '第1節', date: '2026-08-22', savedAt: new Date().toISOString(),
    }));
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    seedPlayingSession();
    window.history.replaceState(null, '');
});

afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    cleanup();
});

/** 試合を再開し、選手4のファウル→シューター選択→FT結果入力まで進める */
async function goToFtResult() {
    render(<App />);
    fireEvent.click(await screen.findByText('試合を再開'));
    fireEvent.click(await screen.findByLabelText(/#4 選手4/));
    fireEvent.click(await screen.findByText('ファウル'));
    fireEvent.keyDown(screen.getByText('パーソナルファウル').closest('button')!, { key: 'Enter' });
    fireEvent.click(await screen.findByText('選手5'));
    fireEvent.click(screen.getByText('次へ'));
    expect(screen.getByText('シューター: #5 選手5')).toBeTruthy();
}

describe('FT入力中の中断（App 通し）', () => {
    it('交代モーダルがファウル入力より後ろに描画される（上に重なる）', async () => {
        await goToFtResult();
        fireEvent.click(screen.getByText('🔄 選手交代'));
        fireEvent.click(screen.getByText('相手チーム'));

        const foulOverlay = document.querySelector('.foul-input-flow-overlay')!;
        const subModal = document.querySelector('.substitution-modal')!;
        expect(foulOverlay).toBeTruthy();
        expect(subModal).toBeTruthy();
        // 交代モーダルが DOM 上で後 ＝ 同じ z-index でも上に来る
        const position = foulOverlay.compareDocumentPosition(subModal);
        expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('タイムアウトモーダルもファウル入力より後ろに描画される', async () => {
        await goToFtResult();
        fireEvent.click(screen.getByText('⏱ タイムアウト'));
        fireEvent.click(screen.getByText('テストチーム'));

        const foulOverlay = document.querySelector('.foul-input-flow-overlay')!;
        const timeoutOverlay = document.querySelector('.timeout-modal-overlay')!;
        expect(timeoutOverlay).toBeTruthy();
        const position = foulOverlay.compareDocumentPosition(timeoutOverlay);
        expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('交代を実行して閉じた後、FT入力の状態が残りシューター候補が更新される', async () => {
        await goToFtResult();
        fireEvent.click(screen.getAllByText('○ 成功')[0]);
        expect(screen.getByText('結果: 1/2 成功 (+1点)')).toBeTruthy();

        fireEvent.click(screen.getByText('🔄 選手交代'));
        fireEvent.click(screen.getByText('相手チーム'));

        // 交代モーダルの中だけを見る。選手名は選手カードにも出るため、
        // 画面全体から探すと別の要素を掴む
        const modal = within(document.querySelector('.substitution-modal') as HTMLElement);
        fireEvent.click(modal.getByText('選手5'));  // OUT
        fireEvent.click(modal.getByText('選手6'));  // IN
        fireEvent.click(modal.getByText('交代実行'));
        // 交代してもモーダルは閉じない仕様なので、明示的に閉じる
        fireEvent.click(modal.getByLabelText('閉じる'));

        // FT結果入力に戻り、1本目の入力が残っている
        expect(screen.getByText('結果: 1/2 成功 (+1点)')).toBeTruthy();
        // シューターが下がったので注意が出る
        expect(screen.getByText(/シューターが交代でコートを離れました/)).toBeTruthy();
        expect(screen.getByText('シューター: #5 選手5')).toBeTruthy();
    });

    it('ベンチファウルの入力からでも交代モーダルが上に重なる', async () => {
        render(<App />);
        fireEvent.click(await screen.findByText('試合を再開'));
        // teamA（テストチーム）のベンチファウル
        fireEvent.click(screen.getAllByText('ベンチファウル')[0]);
        fireEvent.click(await screen.findByText('コーチ (C)'));
        // benchFoulMode はシューター選択から始まる（FT1本）
        fireEvent.click(await screen.findByText('選手5'));

        expect(screen.getByText('試合の中断')).toBeTruthy();
        fireEvent.click(screen.getByText('🔄 選手交代'));
        fireEvent.click(screen.getByText('相手チーム'));

        const foulOverlay = document.querySelector('.foul-input-flow-overlay')!;
        const subModal = document.querySelector('.substitution-modal')!;
        expect(subModal).toBeTruthy();
        // ここが Step 6 の並び替えで守りたいところ。
        // 並びが元のままだと交代モーダルがファウル入力の下に潜る
        const position = foulOverlay.compareDocumentPosition(subModal);
        expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run:
```bash
npx vitest run src/App.ftInterrupt.test.tsx
```
Expected: FAIL。App がまだ `interruptTeams` を渡していないため「🔄 選手交代」が見つからない。

- [ ] **Step 3: App にハンドラと中断チームを足す**

`src/App.tsx`、`handleSubstitute` の定義の直後に追加:

```ts
  // FoulInputFlow の中断ブロックから交代を要求されたとき。
  // フローは開いたままにする（入力途中の状態はフロー内部に残る）
  const handleRequestSubstitution = (teamId: 'teamA' | 'teamB') => {
    setSubstitutionTeamId(teamId);
    setShowSubstitutionModal(true);
  };

  // 中断（タイムアウト・交代）で選ばせるチーム。
  // タイムアウトは1クォーター1回なので、使用済みかどうかも渡す
  const interruptTeams = [
    {
      id: 'teamA' as const,
      name: state.teamA.name,
      timeoutUsed: state.teamA.timeouts.some(t => t.quarter === currentQuarter),
    },
    {
      id: 'teamB' as const,
      name: state.teamB.name,
      timeoutUsed: state.teamB.timeouts.some(t => t.quarter === currentQuarter),
    },
  ];
```

- [ ] **Step 4: 通常のファウル入力に渡す**

`src/App.tsx`、`{/* 通常時はFoulInputFlow（FT入力付き）を使用 */}` の `<FoulInputFlow>` に、`showThreePoint={state.showThreePoint}` の下へ追加:

```tsx
            interruptTeams={interruptTeams}
            onRequestTimeout={phase === 'playing' ? setTimeoutModalTeam : undefined}
            onRequestSubstitution={handleRequestSubstitution}
```

（`phase === 'playing'` の条件は `TeamPanel` のタイムアウトチップと同じ。試合終了後にタイムアウトを記録させない。）

**保留アクション解決側の `<FoulInputFlow>`（`if (resolvingFoulPending)` のブロック）には何も足さない。**

- [ ] **Step 5: ベンチファウルの入力にも渡す**

`src/App.tsx`、`{/* ベンチファウル - Step 2: FoulInputFlow（シューター選択・FT結果入力） */}` の `<FoulInputFlow>` に、`showThreePoint={state.showThreePoint}` の下へ追加:

```tsx
            interruptTeams={interruptTeams}
            onRequestTimeout={phase === 'playing' ? setTimeoutModalTeam : undefined}
            onRequestSubstitution={handleRequestSubstitution}
```

- [ ] **Step 6: SubstitutionModal のブロックを移動する**

オーバーレイの重なりは DOM 順で決まる。現在の並びは

```
通常の FoulInputFlow → SubstitutionModal → ... → ベンチファウルの FoulInputFlow → TimeoutInputModal
```

で、ベンチファウルのフローだけが `SubstitutionModal` より後ろにある。このままだと交代モーダルがベンチファウルのフローの**下**に潜って操作できない。

`{/* 交代モーダル */}` から始まる `{showSubstitutionModal && ( ... )}` ブロックを丸ごと切り取り、ベンチファウルの `FoulInputFlow` ブロック（`})()}` で閉じる部分）の直後、`{/* 履歴ポップアップ（両モード共通） */}` の直前へ貼り付ける。移動時にコメントも一緒に運び、次の一文を足す:

```tsx
      {/* 交代モーダル。
          オーバーレイの z-index は全て 1000 で、重なり順は DOM の並びで決まる。
          ベンチファウルの FoulInputFlow より後ろに置かないと、そこから交代を
          開いたときに暗幕の下へ潜る */}
```

`position: fixed` のオーバーレイ同士で、どちらも同じ階層の兄弟なので、移動による副作用は無い。`z-index` は触らない。

- [ ] **Step 7: テストが通ることを確認**

Run:
```bash
npx vitest run src/App.ftInterrupt.test.tsx
```
Expected: PASS（4件）

- [ ] **Step 8: 全体の退行確認**

Run:
```bash
npm test
```
Expected: PASS（全ファイル）

Run:
```bash
npm run lint
```
Expected: エラー0件

Run:
```bash
npm run typecheck:test
```
Expected: エラー0件

- [ ] **Step 9: コミット**

```bash
git add src/App.tsx src/App.ftInterrupt.test.tsx
git commit -m "feat(app): FT入力中の中断からタイムアウト・交代モーダルを開けるようにする"
```

---

## 完了条件

- [ ] `npm test` が通る
- [ ] `npm run lint` がエラー0件
- [ ] `npm run typecheck:test` がエラー0件
- [ ] `npm run build` が通る
- [ ] シューター確定前のどのステップにも中断ブロックが出ない
- [ ] 保留アクション解決のファウル入力に中断ブロックが出ない（Task 4 Step 4 で `interruptTeams` を渡さないこと。挙動は `FoulInputFlow.interrupt.test.tsx` の `interruptTeams: undefined` のケースが担保する）
- [ ] 通常・ベンチファウルのどちらからでも、交代モーダルがファウル入力の上に開く
- [ ] 中断して戻ったとき、入力途中のFT結果とステップが残っている
- [ ] シューターが交代で下がっても、FT結果画面のシューター表示が空欄にならない
