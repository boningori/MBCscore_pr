# スタメン選択画面からの選手追加（番号グリッド一括登録） 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Q開始のスタメン選択画面から、名簿に漏れていた選手を番号グリッドでまとめて登録できるようにする。

**Architecture:** 新しいモーダル `AddPlayersPanel` が番号グリッド（0〜99＋00）と確定リストを持ち、確定するまでは自身のローカル state に下書きを溜める。確定すると `QuarterLineup` 経由で `App` に配列が渡り、`App` が既存の `ADD_PLAYER_TO_TEAM` を選手ごとに dispatch する。reducer と `Player` 型は無改修。溢れ判定は `playerLimit.ts` に複数人版を足して1か所に集約する。

**Tech Stack:** React 19 + TypeScript + Vite / Vitest + @testing-library/react / プレーンCSS（`src/index.css` のデザイントークン）

**設計書:** [docs/superpowers/specs/2026-09-06-quarter-lineup-add-players-design.md](../specs/2026-09-06-quarter-lineup-add-players-design.md)

## Global Constraints

- 背番号の内部表現: `00` は `DOUBLE_ZERO_INTERNAL = 100`（`src/utils/playerNumber.ts`）。表示は必ず `formatPlayerNumber()` を通す
- 並べ替えは必ず `sortPlayersByNumber()` / `comparePlayerNumbers()` を使う。独自のソートを書かない（様式に載る15人を決めるのは reducer 側のソートなので、別実装だと案内と結果がずれる）
- 公式様式の選手欄は15人（`MAX_PLAYERS_PER_TEAM = 15`）。**超えても追加を止めない**。誰が外れるかを案内するだけ
- 氏名が空欄のときの自動命名は `選手${formatPlayerNumber(number)}`（`SubstitutionModal` と同じ規則）
- 試合中に選手を削除する action は存在しない。削除・取り消しの導線を作らない
- CSSの色・余白・角丸・文字サイズは `src/index.css` のトークンのみを使う（`--bg-tertiary` / `--text-muted` / `--spacing-sm` / `--radius-sm` / `--font-size-sm` / `--font-size-md` / `--warning` など）。存在しないトークン名を書かない（`--font-size-base` は**無い**）
- コメントは日本語。「なぜそうしたか」を書く（周囲のコードの流儀に合わせる）
- テストの実行: `npx vitest run <path>`

---

### Task 1: 複数人追加に対応した溢れ判定

**Files:**
- Modify: `src/components/TeamShared/playerLimit.ts:44-52`
- Modify: `src/components/TeamShared/index.ts`
- Test: `src/components/TeamShared/overflowPlayer.test.ts`

**Interfaces:**
- Consumes: なし（既存の `sortPlayersByNumber` / `MAX_PLAYERS_PER_TEAM` / `NumberedPlayer` のみ）
- Produces:
  - `findOverflowPlayers(players: readonly NumberedPlayer[], newPlayers: readonly NumberedPlayer[]): NumberedPlayer[]` — 追加後に様式（15人分）から外れる選手を背番号順で全て返す。溢れないなら `[]`
  - `findOverflowPlayer` は既存シグネチャのまま（戻り値も変わらない）
  - `NumberedPlayer` を `src/components/TeamShared/index.ts` から再エクスポート

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TeamShared/overflowPlayer.test.ts` の末尾に追記する。ファイル冒頭の import 行を差し替えること:

```ts
import { findOverflowPlayer, findOverflowPlayers } from './playerLimit';
```

末尾に追記:

```ts
describe('findOverflowPlayers（複数人まとめて追加する場合）', () => {
    it('溢れないなら空配列', () => {
        expect(findOverflowPlayers(full.slice(0, 12), [p(4), p(5)])).toEqual([]);
    });

    it('ちょうど15人に収まるなら空配列', () => {
        expect(findOverflowPlayers(full.slice(0, 13), [p(4), p(5)])).toEqual([]);
    });

    it('若い番号を2人足すと、番号の大きい既存選手が2人押し出される', () => {
        expect(findOverflowPlayers(full, [p(4), p(5)])).toEqual([p(23), p(24)]);
    });

    it('大きい番号を足すと、追加した本人が外れる', () => {
        expect(findOverflowPlayers(full, [p(98), p(99)])).toEqual([p(98), p(99)]);
    });

    it('既存と追加が混ざって外れることもある', () => {
        // 10〜24 の15人 + #4（若い）と #99（大きい）→ 17人。外れるのは #24 と #99
        expect(findOverflowPlayers(full, [p(4), p(99)])).toEqual([p(24), p(99)]);
    });

    it('00 は最後に並ぶので、00 を足すと本人が外れる', () => {
        expect(findOverflowPlayers(full, [p(100, 'ダブルゼロ')])).toEqual([p(100, 'ダブルゼロ')]);
    });

    it('追加が0人なら、既に16人いても空配列（追加操作をしていないので案内しない）', () => {
        expect(findOverflowPlayers([...full, p(30)], [])).toEqual([]);
    });
});
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx vitest run src/components/TeamShared/overflowPlayer.test.ts
```

Expected: FAIL — `findOverflowPlayers is not a function`（または import エラー）。既存の `findOverflowPlayer` の6件は PASS のまま。

- [ ] **Step 3: 実装する**

`src/components/TeamShared/playerLimit.ts` の `findOverflowPlayer` 関数（ファイル末尾）を、以下でまるごと置き換える。上のJSDocコメント（`/** 追加したときに公式様式（15人分）から外れる選手を返す。…` で始まるブロック）はそのまま残し、その下の関数定義から差し替える:

```ts
export function findOverflowPlayer(
    players: readonly NumberedPlayer[],
    newPlayer: NumberedPlayer,
): NumberedPlayer | null {
    return findOverflowPlayers(players, [newPlayer])[0] ?? null;
}

/**
 * まとめて追加したときに公式様式（15人分）から外れる選手を、背番号順で全て返す。
 * 溢れないなら空配列。
 *
 * スタメン選択画面の一括登録では複数人を同時に足すため、単数版では
 * 「1人目しか案内できない」。並べ替えを別実装で書くと案内と実際の結果が
 * ずれるので、判定はこの関数に集約し、単数版もここを通す。
 *
 * 追加が0人のときは、既に16人以上いても空配列を返す。追加操作をしていない
 * のに「載らなくなります」と出すと、いま何をしたせいなのかが伝わらない。
 */
export function findOverflowPlayers(
    players: readonly NumberedPlayer[],
    newPlayers: readonly NumberedPlayer[],
): NumberedPlayer[] {
    if (newPlayers.length === 0) return [];
    const ordered = sortPlayersByNumber([...players, ...newPlayers]);
    return ordered.slice(MAX_PLAYERS_PER_TEAM);
}
```

`src/components/TeamShared/index.ts` の最終行を差し替える:

```ts
export { isPlayerLimitReached, playerLimitMessage, findOverflowPlayer, findOverflowPlayers, MAX_PLAYERS_PER_TEAM } from './playerLimit';
export type { NumberedPlayer } from './playerLimit';
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/components/TeamShared/ src/components/SubstitutionModal/
```

Expected: PASS。`findOverflowPlayer` の既存6件と `SubstitutionModal` の溢れ案内テスト（`overflowNotice.test.tsx`）が壊れていないこと。

- [ ] **Step 5: コミット**

```bash
git add src/components/TeamShared/playerLimit.ts src/components/TeamShared/index.ts src/components/TeamShared/overflowPlayer.test.ts
git commit -m "feat(team): 複数人追加時に様式から外れる選手を全て返す

一括登録では複数人を同時に足すため、単数版では1人目しか案内できない。
判定を findOverflowPlayers に集約し、単数版もそこを通す。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: AddPlayersPanel（番号グリッドと確定リスト）

**Files:**
- Create: `src/components/QuarterLineup/AddPlayersPanel.tsx`
- Create: `src/components/QuarterLineup/AddPlayersPanel.css`
- Test: `src/components/QuarterLineup/AddPlayersPanel.test.tsx`

**Interfaces:**
- Consumes: `NumberedPlayer`（Task 1 で `TeamShared` から再エクスポート済み）。既存の `Modal`、`formatPlayerNumber`、`sortPlayersByNumber`、`DOUBLE_ZERO_INTERNAL`、`src/styles/number-grid.css`
- Produces:
  - `export interface NewPlayerInput { number: number; name: string }`
  - `export function AddPlayersPanel(props: { teamName: string; teamColor: 'white' | 'blue'; players: readonly NumberedPlayer[]; onSubmit: (players: NewPlayerInput[]) => void; onClose: () => void }): JSX.Element`
  - `onSubmit` に渡る配列は**背番号順**で、`name` は必ず空でない（空欄は `選手7` に補完済み）
  - アクセシブル名: グリッドのボタン = `背番号7` / 登録済みは `背番号7（登録済み）`、氏名欄 = `背番号7の氏名`、行の削除 = `背番号7を外す`、確定 = `2人を追加`（0人のときは `追加`）

- [ ] **Step 1: 失敗するテストを書く**

Create `src/components/QuarterLineup/AddPlayersPanel.test.tsx`:

```tsx
// 番号グリッドは対戦チーム管理と見た目を共有するが、振る舞いが2点違う。
// (1) 試合中は選手を削除する action が無いため、登録済みの番号は押せない
// (2) 101マスの誤タップが取り消せない登録に直結しないよう、確定するまで登録しない
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AddPlayersPanel } from './AddPlayersPanel';

afterEach(cleanup);

/** 登録済みの名簿（背番号 4〜8 の5人） */
const registered = [4, 5, 6, 7, 8].map(n => ({ number: n, name: `既存${n}` }));

function setup(overrides: Partial<Parameters<typeof AddPlayersPanel>[0]> = {}) {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
        <AddPlayersPanel
            teamName="白チーム"
            teamColor="white"
            players={registered}
            onSubmit={onSubmit}
            onClose={onClose}
            {...overrides}
        />,
    );
    return { onSubmit, onClose };
}

const gridButton = (label: string) => screen.getByRole('button', { name: label }) as HTMLButtonElement;

describe('AddPlayersPanel: 番号グリッド', () => {
    it('登録済みの背番号は押せない（試合中は削除する手段が無いため）', () => {
        setup();
        expect(gridButton('背番号7（登録済み）').disabled).toBe(true);
        expect(gridButton('背番号9').disabled).toBe(false);
    });

    it('0〜99 と 00 の101マスが並ぶ', () => {
        setup();
        expect(gridButton('背番号0')).toBeTruthy();
        expect(gridButton('背番号99')).toBeTruthy();
        expect(gridButton('背番号00')).toBeTruthy();
    });

    it('タップすると確定リストに並び、もう一度タップで外れる', () => {
        setup();
        fireEvent.click(gridButton('背番号9'));
        expect(screen.getByLabelText('背番号9の氏名')).toBeTruthy();

        fireEvent.click(gridButton('背番号9'));
        expect(screen.queryByLabelText('背番号9の氏名')).toBeNull();
    });

    it('確定リストの「外す」でも取り消せる（グリッドまで戻らずに済む）', () => {
        setup();
        fireEvent.click(gridButton('背番号9'));
        fireEvent.click(screen.getByRole('button', { name: '背番号9を外す' }));
        expect(screen.queryByLabelText('背番号9の氏名')).toBeNull();
    });
});

describe('AddPlayersPanel: 確定', () => {
    it('選択が0人なら確定ボタンは押せない', () => {
        setup();
        expect((screen.getByRole('button', { name: '追加' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('確定すると背番号順の配列で onSubmit が1回だけ呼ばれる', () => {
        const { onSubmit } = setup();
        // わざと降順にタップする
        fireEvent.click(gridButton('背番号12'));
        fireEvent.click(gridButton('背番号9'));

        fireEvent.click(screen.getByRole('button', { name: '2人を追加' }));

        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onSubmit.mock.calls[0][0]).toEqual([
            { number: 9, name: '選手9' },
            { number: 12, name: '選手12' },
        ]);
    });

    it('00 は最後に並ぶ', () => {
        const { onSubmit } = setup();
        fireEvent.click(gridButton('背番号00'));
        fireEvent.click(gridButton('背番号9'));

        fireEvent.click(screen.getByRole('button', { name: '2人を追加' }));

        expect(onSubmit.mock.calls[0][0]).toEqual([
            { number: 9, name: '選手9' },
            { number: 100, name: '選手00' },
        ]);
    });

    it('入力した氏名はそのまま渡り、空欄・空白のみは自動命名になる', () => {
        const { onSubmit } = setup();
        fireEvent.click(gridButton('背番号9'));
        fireEvent.click(gridButton('背番号12'));

        fireEvent.change(screen.getByLabelText('背番号9の氏名'), { target: { value: ' 山田 ' } });
        fireEvent.change(screen.getByLabelText('背番号12の氏名'), { target: { value: '   ' } });

        fireEvent.click(screen.getByRole('button', { name: '2人を追加' }));

        expect(onSubmit.mock.calls[0][0]).toEqual([
            { number: 9, name: '山田' },
            { number: 12, name: '選手12' },
        ]);
    });

    it('キャンセルでは何も登録されない', () => {
        const { onSubmit, onClose } = setup();
        fireEvent.click(gridButton('背番号9'));
        fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

        expect(onSubmit).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('見出しに対象チームが出る（タブを取り違えたまま追加するのを防ぐ）', () => {
        setup({ teamName: '青チーム', teamColor: 'blue' });
        expect(screen.getByRole('heading', { name: '選手を追加 - 青チーム' })).toBeTruthy();
    });
});
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx vitest run src/components/QuarterLineup/AddPlayersPanel.test.tsx
```

Expected: FAIL — `Failed to resolve import "./AddPlayersPanel"`。

- [ ] **Step 3: 実装する**

Create `src/components/QuarterLineup/AddPlayersPanel.css`:

```css
/* スタメン選択画面の選手追加パネル */
/* 番号グリッドの見た目は styles/number-grid.css と共有する */

.add-players-modal {
    max-width: 560px;
    width: 100%;
}

.add-players-modal .add-players-team {
    font-weight: 700;
}

.add-players-modal .add-players-team.blue {
    color: var(--secondary-light);
}

/* 登録済みの番号は押せない。試合中は選手を削除する手段が無いため、
   対戦チーム管理のように「タップで外せる」見た目にすると嘘になる */
.add-players-modal .number-grid-item:disabled {
    background: var(--bg-primary);
    border-color: var(--border);
    color: var(--text-muted);
    opacity: 0.5;
    cursor: default;
}

.add-players-modal .add-players-draft {
    margin-top: var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    max-height: 34vh;
    overflow-y: auto;
}

.add-players-modal .add-players-draft-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
}

.add-players-modal .add-players-draft-number {
    flex: 0 0 auto;
    min-width: 3.5rem;
    font-weight: 700;
    color: var(--text-primary);
}

.add-players-modal .add-players-draft-name {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    padding: 8px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: var(--font-size-md);
}

.add-players-modal .add-players-draft-remove {
    flex: 0 0 auto;
    min-width: 44px;
    min-height: 44px;
}

.add-players-modal .add-players-empty {
    margin-top: var(--spacing-md);
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    text-align: center;
}

.add-players-modal .add-players-actions {
    display: flex;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-md);
}

.add-players-modal .add-players-actions .btn {
    flex: 1;
}
```

Create `src/components/QuarterLineup/AddPlayersPanel.tsx`:

```tsx
import { useState } from 'react';
import { Modal } from '../Modal';
import type { NumberedPlayer } from '../TeamShared';
import { DOUBLE_ZERO_INTERNAL, formatPlayerNumber, sortPlayersByNumber } from '../../utils/playerNumber';
import '../../styles/number-grid.css';
import './AddPlayersPanel.css';

/** 追加する選手1人分。氏名は確定時に補完済み（空にならない） */
export interface NewPlayerInput {
    number: number;
    name: string;
}

interface AddPlayersPanelProps {
    /** 追加先のチーム名（見出しに出して取り違えを防ぐ） */
    teamName: string;
    teamColor: 'white' | 'blue';
    /** 登録済みの名簿。重複を防ぐためだけに使う */
    players: readonly NumberedPlayer[];
    /** 確定。背番号順・氏名補完済みの配列が渡る */
    onSubmit: (players: NewPlayerInput[]) => void;
    onClose: () => void;
}

/** 0〜99 と 00。00 は内部表現が 100 なので最後に置く（対戦チーム管理と同じ並び） */
const GRID_NUMBERS = [...Array.from({ length: 100 }, (_, i) => i), DOUBLE_ZERO_INTERNAL];

/** 氏名が空なら自動命名する。SubstitutionModal の「+ 選手を追加」と同じ規則 */
const resolveName = (number: number, name: string) =>
    name.trim() || `選手${formatPlayerNumber(number)}`;

/**
 * 名簿から漏れた選手を、番号グリッドでまとめて登録するパネル。
 *
 * 対戦チーム管理（OpponentManager）の番号グリッドと見た目は同じだが、
 * 振る舞いを2点変えている。
 *
 * 1. 登録済みの番号は押せない。試合中は選手を削除する action が存在せず、
 *    タップで外せる見た目にすると「消せるのに消えない」ボタンになる
 * 2. グリッドで選んだ時点では登録しない。101マスの誤タップが取り消せない
 *    登録に直結するのを防ぐため、確定リストを見せてから一括で確定する
 */
export function AddPlayersPanel({
    teamName,
    teamColor,
    players,
    onSubmit,
    onClose,
}: AddPlayersPanelProps) {
    // 確定前の下書き。常に背番号順に保つので、確定時に並べ替え直す必要がない
    const [draft, setDraft] = useState<NewPlayerInput[]>([]);

    const registeredNumbers = new Set(players.map(p => p.number));
    const draftNumbers = new Set(draft.map(d => d.number));

    const toggleNumber = (num: number) => {
        setDraft(prev =>
            prev.some(d => d.number === num)
                ? prev.filter(d => d.number !== num)
                : sortPlayersByNumber([...prev, { number: num, name: '' }]),
        );
    };

    const changeName = (num: number, name: string) => {
        setDraft(prev => prev.map(d => (d.number === num ? { ...d, name } : d)));
    };

    const handleSubmit = () => {
        if (draft.length === 0) return;
        onSubmit(draft.map(d => ({ number: d.number, name: resolveName(d.number, d.name) })));
    };

    return (
        <Modal
            onClose={onClose}
            contentClassName="modal-content add-players-modal"
            labelledBy="add-players-title"
        >
            <div className="modal-header">
                <h2 className="modal-title" id="add-players-title">
                    選手を追加 - <span className={`add-players-team ${teamColor}`}>{teamName}</span>
                </h2>
                <button className="modal-close" onClick={onClose} aria-label="閉じる">✕</button>
            </div>

            <div className="number-grid-container">
                <p className="number-grid-hint">背番号をタップして選ぶ（登録済みの番号は選べません）</p>
                <div className="number-grid">
                    {GRID_NUMBERS.map(num => {
                        const registered = registeredNumbers.has(num);
                        const selected = draftNumbers.has(num);
                        const display = formatPlayerNumber(num);
                        return (
                            <button
                                key={num}
                                type="button"
                                className={`number-grid-item ${selected ? 'selected' : ''}`}
                                onClick={() => toggleNumber(num)}
                                disabled={registered}
                                aria-pressed={selected}
                                aria-label={registered ? `背番号${display}（登録済み）` : `背番号${display}`}
                            >
                                {display}
                            </button>
                        );
                    })}
                </div>
            </div>

            {draft.length === 0 ? (
                <p className="add-players-empty">
                    選んだ背番号がここに並びます。氏名は任意で、空欄なら「選手7」のように入ります
                </p>
            ) : (
                <div className="add-players-draft">
                    {draft.map(d => {
                        const display = formatPlayerNumber(d.number);
                        return (
                            <div key={d.number} className="add-players-draft-row">
                                <span className="add-players-draft-number">#{display}</span>
                                <input
                                    type="text"
                                    className="add-players-draft-name"
                                    aria-label={`背番号${display}の氏名`}
                                    value={d.name}
                                    onChange={e => changeName(d.number, e.target.value)}
                                    placeholder="氏名（任意）"
                                    autoComplete="off"
                                />
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-small add-players-draft-remove"
                                    onClick={() => toggleNumber(d.number)}
                                    aria-label={`背番号${display}を外す`}
                                >
                                    ✕
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="add-players-actions">
                <button className="btn btn-secondary btn-large" onClick={onClose}>
                    キャンセル
                </button>
                <button
                    className="btn btn-success btn-large"
                    onClick={handleSubmit}
                    disabled={draft.length === 0}
                >
                    {draft.length > 0 ? `${draft.length}人を追加` : '追加'}
                </button>
            </div>
        </Modal>
    );
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/components/QuarterLineup/AddPlayersPanel.test.tsx
```

Expected: PASS（11件）。

- [ ] **Step 5: コミット**

```bash
git add src/components/QuarterLineup/AddPlayersPanel.tsx src/components/QuarterLineup/AddPlayersPanel.css src/components/QuarterLineup/AddPlayersPanel.test.tsx
git commit -m "feat(lineup): 番号グリッドで選手をまとめて登録するパネル

登録済みの番号は押せない（試合中は削除する手段が無いため）。
確定するまで登録しないので、101マスの誤タップが取り返しのつかない
登録にならない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 15人あふれの案内

**Files:**
- Modify: `src/components/QuarterLineup/AddPlayersPanel.tsx`
- Modify: `src/components/QuarterLineup/AddPlayersPanel.css`
- Test: `src/components/QuarterLineup/AddPlayersPanel.test.tsx`

**Interfaces:**
- Consumes: `findOverflowPlayers`（Task 1）、`MAX_PLAYERS_PER_TEAM`、Task 2 の `AddPlayersPanel`
- Produces: 公開インターフェースの変更なし。確定リストの下に `role="status"` の案内が出るだけ

- [ ] **Step 1: 失敗するテストを書く**

`src/components/QuarterLineup/AddPlayersPanel.test.tsx` の末尾に追記する:

```tsx
/** 背番号 10〜24 の15人（様式の枠がちょうど埋まった状態） */
const fifteen = Array.from({ length: 15 }, (_, i) => ({ number: 10 + i, name: `既存${10 + i}` }));

describe('AddPlayersPanel: 15人あふれの案内', () => {
    it('溢れないうちは案内を出さない', () => {
        setup({ players: fifteen.slice(0, 13) });
        fireEvent.click(gridButton('背番号4'));
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('若い番号を足すと、押し出される既存選手を名指しで出す', () => {
        setup({ players: fifteen });
        fireEvent.click(gridButton('背番号4'));

        const notice = screen.getByRole('status');
        expect(notice.textContent).toContain('#24 既存24');
        expect(notice.textContent).toContain('印刷・出力に載らなくなります');
    });

    it('大きい番号を足すと、載らないのは追加する本人だと伝える', () => {
        setup({ players: fifteen });
        fireEvent.click(gridButton('背番号99'));

        const notice = screen.getByRole('status');
        expect(notice.textContent).toContain('#99');
        expect(notice.textContent).toContain('印刷・出力に載りません');
    });

    it('複数人が外れるときは全員を挙げる', () => {
        setup({ players: fifteen });
        fireEvent.click(gridButton('背番号4'));
        fireEvent.click(gridButton('背番号5'));

        const notice = screen.getByRole('status');
        expect(notice.textContent).toContain('#23 既存23');
        expect(notice.textContent).toContain('#24 既存24');
    });

    it('溢れても追加そのものは止めない（練習試合では人数が読めないまま始まる）', () => {
        const { onSubmit } = setup({ players: fifteen });
        fireEvent.click(gridButton('背番号4'));

        const submit = screen.getByRole('button', { name: '1人を追加' }) as HTMLButtonElement;
        expect(submit.disabled).toBe(false);
        fireEvent.click(submit);
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('入力した氏名が案内にも反映される', () => {
        setup({ players: fifteen });
        fireEvent.click(gridButton('背番号99'));
        fireEvent.change(screen.getByLabelText('背番号99の氏名'), { target: { value: '山田' } });

        expect(screen.getByRole('status').textContent).toContain('#99 山田');
    });
});
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx vitest run src/components/QuarterLineup/AddPlayersPanel.test.tsx
```

Expected: 追加した6件のうち5件が FAIL（`Unable to find an accessible element with the role "status"`）。「溢れないうちは案内を出さない」だけは PASS。

- [ ] **Step 3: 実装する**

`src/components/QuarterLineup/AddPlayersPanel.tsx` を3か所直す。

(1) import に溢れ判定を足す。既存の import 行:

```tsx
import type { NumberedPlayer } from '../TeamShared';
```

を次に差し替える:

```tsx
import { findOverflowPlayers, MAX_PLAYERS_PER_TEAM, type NumberedPlayer } from '../TeamShared';
```

(2) `handleSubmit` の定義の直後に、案内の組み立てを足す:

```tsx
    // 追加後に公式様式（15人分）から外れる選手。
    //
    // 外れるのは「いま追加する選手」とは限らない。名簿は背番号順に並び
    // （handleAddPlayerToTeam）、様式は先頭15人しか描かない
    // （RunningScoresheet の players.slice(0, 15)）ため、若い番号を足すと
    // 番号の大きい既存選手が押し出される。得点を記録済みの選手が黙って
    // 様式から消えるので、誰が外れるかを確定前に名指しで伝える。
    //
    // 追加そのものは止めない。練習試合では人数が読めないまま始まることがあり、
    // 止めると記録できなくなる（退場者を一覧から外さないのと同じ方針）。
    const resolvedDraft = draft.map(d => ({ number: d.number, name: resolveName(d.number, d.name) }));
    const overflow = findOverflowPlayers(players, resolvedDraft);
    const overflowNew = overflow.filter(o => draftNumbers.has(o.number));
    const overflowExisting = overflow.filter(o => !draftNumbers.has(o.number));
    const listNames = (list: NumberedPlayer[]) =>
        list.map(o => `#${formatPlayerNumber(o.number)} ${o.name}`).join('、');
```

(3) 確定リストのブロック（`{draft.length === 0 ? ( … )}` の閉じ括弧）と `<div className="add-players-actions">` の間に、案内を差し込む:

```tsx
            {overflow.length > 0 && (
                <div className="add-players-notice" role="status">
                    スコアシートの選手欄は{MAX_PLAYERS_PER_TEAM}人分です。
                    {overflowExisting.length > 0 &&
                        `追加すると ${listNames(overflowExisting)} が印刷・出力に載らなくなります（記録は残ります）。`}
                    {overflowNew.length > 0 &&
                        `${listNames(overflowNew)} は印刷・出力に載りません（記録は残ります）。`}
                </div>
            )}
```

`src/components/QuarterLineup/AddPlayersPanel.css` の `.add-players-actions` ルールの直前に追記する:

```css
.add-players-modal .add-players-notice {
    margin-top: var(--spacing-sm);
    padding: var(--spacing-sm);
    background: var(--bg-tertiary);
    border: 1px solid var(--warning);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    line-height: 1.5;
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/components/QuarterLineup/AddPlayersPanel.test.tsx
```

Expected: PASS（17件）。

- [ ] **Step 5: コミット**

```bash
git add src/components/QuarterLineup/AddPlayersPanel.tsx src/components/QuarterLineup/AddPlayersPanel.css src/components/QuarterLineup/AddPlayersPanel.test.tsx
git commit -m "feat(lineup): 15人を超えるとき様式から外れる選手を名指しで案内

若い番号を足すと番号の大きい既存選手が押し出されるため、載らないのは
追加する本人とは限らない。追加は止めず、結果だけ先に伝える。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: スタメン選択画面への組み込み

**Files:**
- Modify: `src/components/QuarterLineup/LineupTeamPanel.tsx`
- Modify: `src/components/QuarterLineup/QuarterLineup.tsx`
- Modify: `src/components/QuarterLineup/QuarterLineup.css`
- Modify: `src/components/QuarterLineup/index.ts`
- Test: `src/components/QuarterLineup/QuarterLineup.test.tsx`

**Interfaces:**
- Consumes: `AddPlayersPanel` / `NewPlayerInput`（Task 2・3）
- Produces:
  - `QuarterLineup` の新しい任意 prop: `onAddPlayers?: (teamId: LineupTabId, players: NewPlayerInput[]) => void`。**省略すると追加ボタンを出さない**（既存のテストや呼び出し元を壊さないため）
  - `LineupTeamPanel` の新しい任意 prop: `onRequestAddPlayer?: () => void`
  - `src/components/QuarterLineup/index.ts` から `NewPlayerInput` 型を再エクスポート

- [ ] **Step 1: 失敗するテストを書く**

`src/components/QuarterLineup/QuarterLineup.test.tsx` の末尾に追記する:

```tsx
describe('QuarterLineup 選手の追加', () => {
    it('onAddPlayers が無ければ追加ボタンを出さない', () => {
        render(<QuarterLineup quarter={1} teamA={whiteTeam()} teamB={blueTeam()} onStart={vi.fn()} />);
        expect(screen.queryByRole('button', { name: '＋ 選手を追加' })).toBeNull();
    });

    it('開いているタブのチームが追加先になる', () => {
        const onAddPlayers = vi.fn();
        render(
            <QuarterLineup
                quarter={1}
                teamA={whiteTeam()}
                teamB={blueTeam()}
                onStart={vi.fn()}
                onAddPlayers={onAddPlayers}
            />,
        );

        // 青タブに切り替えてから追加する
        fireEvent.click(screen.getByRole('tab', { name: /青/ }));
        fireEvent.click(screen.getByRole('button', { name: '＋ 選手を追加' }));
        // タブにも「青チーム」の文字があるので、見出しを名指しで確かめる
        expect(screen.getByRole('heading', { name: '選手を追加 - 青チーム' })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: '背番号9' }));
        fireEvent.click(screen.getByRole('button', { name: '1人を追加' }));

        expect(onAddPlayers).toHaveBeenCalledTimes(1);
        expect(onAddPlayers.mock.calls[0][0]).toBe('teamB');
        expect(onAddPlayers.mock.calls[0][1]).toEqual([{ number: 9, name: '選手9' }]);
    });

    it('追加しても選択中の5人は解除されない', () => {
        const onAddPlayers = vi.fn();
        const { rerender } = render(
            <QuarterLineup
                quarter={1}
                teamA={whiteTeam()}
                teamB={blueTeam()}
                onStart={vi.fn()}
                onAddPlayers={onAddPlayers}
            />,
        );

        selectFive('白');
        fireEvent.click(screen.getByRole('button', { name: '＋ 選手を追加' }));
        fireEvent.click(screen.getByRole('button', { name: '背番号9' }));
        fireEvent.click(screen.getByRole('button', { name: '1人を追加' }));

        // App 側の dispatch を模して、選手が増えた名簿で再描画する
        const added = player('白9', 9, '白9', [false, false, false, false]);
        rerender(
            <QuarterLineup
                quarter={1}
                teamA={whiteTeam([...fivePlayers('白'), added])}
                teamB={blueTeam()}
                onStart={vi.fn()}
                onAddPlayers={onAddPlayers}
            />,
        );

        // 5人の選択は残っている（＝開始できる状態のまま）
        expect(screen.getByText('5 / 5 名選択')).toBeTruthy();
        // 追加した選手は自動選択されない
        expect(screen.getByRole('button', { name: /白9/ }).getAttribute('aria-pressed')).toBe('false');
    });

    it('追加した背番号を状況表示で知らせる', () => {
        const onAddPlayers = vi.fn();
        render(
            <QuarterLineup
                quarter={1}
                teamA={whiteTeam()}
                teamB={blueTeam()}
                onStart={vi.fn()}
                onAddPlayers={onAddPlayers}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '＋ 選手を追加' }));
        fireEvent.click(screen.getByRole('button', { name: '背番号9' }));
        fireEvent.click(screen.getByRole('button', { name: '背番号12' }));
        fireEvent.click(screen.getByRole('button', { name: '2人を追加' }));

        expect(screen.getByText('#9 #12 を追加しました')).toBeTruthy();
    });

    it('キャンセルすると onAddPlayers は呼ばれない', () => {
        const onAddPlayers = vi.fn();
        render(
            <QuarterLineup
                quarter={1}
                teamA={whiteTeam()}
                teamB={blueTeam()}
                onStart={vi.fn()}
                onAddPlayers={onAddPlayers}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '＋ 選手を追加' }));
        fireEvent.click(screen.getByRole('button', { name: '背番号9' }));
        fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

        expect(onAddPlayers).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: '背番号9' })).toBeNull();
    });
});
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx vitest run src/components/QuarterLineup/QuarterLineup.test.tsx
```

Expected: 「onAddPlayers が無ければ追加ボタンを出さない」は PASS、残り4件が FAIL（`Unable to find an accessible element with the role "button" and name "＋ 選手を追加"`）。TypeScript は `onAddPlayers` が未知の prop だとエラーになる。

- [ ] **Step 3: 実装する**

(1) `src/components/QuarterLineup/LineupTeamPanel.tsx` の props に追加ボタンの入口を足す。インターフェース定義を差し替える:

```tsx
interface LineupTeamPanelProps {
    quarter: number;
    players: Player[];
    selectedIds: string[];
    onToggle: (playerId: string) => void;
    /** 名簿から漏れた選手を足す入口。省略時はボタンを出さない */
    onRequestAddPlayer?: () => void;
}
```

関数シグネチャを差し替える:

```tsx
export function LineupTeamPanel({ quarter, players, selectedIds, onToggle, onRequestAddPlayer }: LineupTeamPanelProps) {
```

`</div>`（`player-selection-grid` の閉じ）と `<div className="quarter-rule-hint">` の間に、ボタンを差し込む:

```tsx
            {/* 「あの子のカードが無い」と気づく場所の直下に置く。
                試合設定まで戻らず、交代モーダルまで回り道せずに足せるようにする */}
            {onRequestAddPlayer && (
                <div className="lineup-add-player">
                    <button type="button" className="btn btn-secondary" onClick={onRequestAddPlayer}>
                        ＋ 選手を追加
                    </button>
                </div>
            )}
```

(2) `src/components/QuarterLineup/QuarterLineup.tsx` を直す。

import に追加する（`import { LineupTeamPanel } …` の直前）:

```tsx
import { AddPlayersPanel, type NewPlayerInput } from './AddPlayersPanel';
```

`formatPlayerNumber` も要るので、`import { quarterLabel } …` の下に追加する:

```tsx
import { formatPlayerNumber } from '../../utils/playerNumber';
```

`QuarterLineupProps` に prop を足す（`onBack?: () => void;` の直前）:

```tsx
    /** 名簿から漏れた選手を追加する。省略すると追加の入口を出さない */
    onAddPlayers?: (teamId: LineupTabId, players: NewPlayerInput[]) => void;
```

関数の引数リストに `onAddPlayers,` を `onBack,` の直前で足す。

state を2つ足す（`const [selected, setSelected] = useState…` の直後）:

```tsx
    // 追加パネルの開閉と、閉じた直後の状況表示。
    // 追加は取り消せないので、何を足したのかを画面に残す
    const [addingPlayers, setAddingPlayers] = useState(false);
    const [addedNotice, setAddedNotice] = useState<string | null>(null);
```

クォーター切替のリセットに状況表示のクリアを足す。既存のブロック:

```tsx
    if (quarter !== prevQuarter) {
        setPrevQuarter(quarter);
        setSelected(computeInitialSelected());
    }
```

を差し替える:

```tsx
    if (quarter !== prevQuarter) {
        setPrevQuarter(quarter);
        setSelected(computeInitialSelected());
        setAddedNotice(null);
    }
```

`handleTabClick` を差し替える（タブを移ったら前のチームの状況表示は消す。別チームの話だと誤読されるため）:

```tsx
    const handleTabClick = (tab: LineupTabId) => {
        setActiveTab(tab);
        setAddedNotice(null);
        onTabChange?.(tab);
    };
```

`handleStart` の直後に確定ハンドラを足す:

```tsx
    const handleAddPlayers = (added: NewPlayerInput[]) => {
        onAddPlayers?.(activeTab, added);
        setAddingPlayers(false);
        setAddedNotice(`${added.map(p => `#${formatPlayerNumber(p.number)}`).join(' ')} を追加しました`);
    };
```

`<LineupTeamPanel … />` の呼び出しを差し替え、その下に状況表示とパネルを足す:

```tsx
            <LineupTeamPanel
                quarter={quarter}
                players={teams[activeTab].players}
                selectedIds={selected[activeTab]}
                onToggle={handleToggle}
                onRequestAddPlayer={onAddPlayers ? () => setAddingPlayers(true) : undefined}
            />

            {addedNotice && (
                <p className="lineup-added-notice" role="status">{addedNotice}</p>
            )}

            {addingPlayers && (
                <AddPlayersPanel
                    teamName={teams[activeTab].name}
                    teamColor={teams[activeTab].color}
                    players={teams[activeTab].players}
                    onSubmit={handleAddPlayers}
                    onClose={() => setAddingPlayers(false)}
                />
            )}
```

(3) `src/components/QuarterLineup/QuarterLineup.css` の末尾に追記する:

```css
/* 名簿から漏れた選手を足す入口。選手カード一覧の直下に置く */
.quarter-lineup .lineup-add-player {
    display: flex;
    justify-content: center;
    margin: var(--spacing-sm) 0;
}

.quarter-lineup .lineup-added-notice {
    margin: var(--spacing-sm) 0 0;
    text-align: center;
    color: var(--secondary-light);
    font-size: var(--font-size-sm);
}
```

(4) `src/components/QuarterLineup/index.ts` を差し替える:

```ts
export { QuarterLineup } from './QuarterLineup';
export { AddPlayersPanel } from './AddPlayersPanel';
export type { NewPlayerInput } from './AddPlayersPanel';
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/components/QuarterLineup/
```

Expected: PASS。`QuarterLineup.test.tsx`（既存＋新規5件）、`AddPlayersPanel.test.tsx`、`disqualification.test.tsx`、`lineupContrast.test.ts` がすべて緑。

- [ ] **Step 5: コミット**

```bash
git add src/components/QuarterLineup/
git commit -m "feat(lineup): スタメン選択画面から選手を追加できるようにする

選手カード一覧の直下に入口を置き、開いているタブのチームに追加する。
追加した選手は自動選択せず、足した背番号を状況表示で残す。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: App への配線

**Files:**
- Modify: `src/App.tsx:1187-1198`
- Test: `src/App.quarterLineup.test.tsx`

**Interfaces:**
- Consumes: `QuarterLineup` の `onAddPlayers`（Task 4）、既存の `ADD_PLAYER_TO_TEAM` action
- Produces: なし（アプリ内で完結する配線）

- [ ] **Step 1: 失敗するテストを書く**

`src/App.quarterLineup.test.tsx` の末尾に追記する:

```tsx
describe('App: スタメン選択画面からの選手追加', () => {
    it('追加した選手が対象チームだけに入り、未出場・ベンチのまま並ぶ', async () => {
        render(<App />);

        await proceedToLineup();

        // 白（マイチーム）は背番号 4〜8 の5人。9番は空いている
        fireEvent.click(screen.getByRole('button', { name: '＋ 選手を追加' }));
        fireEvent.click(screen.getByRole('button', { name: '背番号9' }));
        fireEvent.change(screen.getByLabelText('背番号9の氏名'), { target: { value: '遅刻' } });
        fireEvent.click(screen.getByRole('button', { name: '1人を追加' }));

        // 白のカード一覧に増え、自動選択はされない
        const addedCard = await screen.findByRole('button', { name: /遅刻/ });
        expect(addedCard.getAttribute('aria-pressed')).toBe('false');
        // 未出場のまま入る（出場クォーターの印がどれも点いていない）
        expect(addedCard.querySelectorAll('.quarter-dot.played').length).toBe(0);
        // 既に5人選ばれているので、選択数は変わらない
        expect(screen.getByText('5 / 5 名選択')).toBeTruthy();

        // 青チームには入っていない
        fireEvent.click(screen.getByRole('tab', { name: /青/ }));
        expect(screen.queryByRole('button', { name: /遅刻/ })).toBeNull();
    });

    it('追加した選手を選び直してスタメンに入れられる', async () => {
        const { container } = render(<App />);

        await proceedToLineup();

        fireEvent.click(screen.getByRole('button', { name: '＋ 選手を追加' }));
        fireEvent.click(screen.getByRole('button', { name: '背番号9' }));
        fireEvent.change(screen.getByLabelText('背番号9の氏名'), { target: { value: '遅刻' } });
        fireEvent.click(screen.getByRole('button', { name: '1人を追加' }));

        // ホーム1 を外して、追加した選手を入れる
        fireEvent.click(await screen.findByRole('button', { name: /ホーム1/ }));
        fireEvent.click(screen.getByRole('button', { name: /遅刻/ }));
        expect(screen.getByText('5 / 5 名選択')).toBeTruthy();

        fireEvent.click(screen.getByRole('tab', { name: /青/ }));
        selectFive('アウェイ');
        fireEvent.click(screen.getByRole('button', { name: '試合開始' }));

        await waitFor(() => {
            expect(container.querySelectorAll('.team-panel.team-a .mini-player-card').length).toBe(5);
        });
        expect(screen.getByRole('button', { name: /遅刻/ })).toBeTruthy();
    });
});
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx vitest run src/App.quarterLineup.test.tsx
```

Expected: 新規2件が FAIL（`Unable to find an accessible element with the role "button" and name "＋ 選手を追加"`）。既存2件は PASS。

- [ ] **Step 3: 実装する**

`src/App.tsx` の `<QuarterLineup … />`（`screen === 'quarterLineup'` のブロック）に prop を1つ足す。`onStart={handleLineupStart}` の直後に挿入する:

```tsx
        // 名簿から漏れた選手をこの画面で登録する。
        // 交代モーダルの「+ 選手を追加」と同じ action を使うので、
        // 背番号順への並べ替えも様式あふれの扱いも1か所のまま
        onAddPlayers={(teamId, added) => {
          added.forEach(p =>
            dispatch({ type: 'ADD_PLAYER_TO_TEAM', payload: { teamId, number: p.number, name: p.name } }),
          );
        }}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/App.quarterLineup.test.tsx
```

Expected: PASS（4件）。

- [ ] **Step 5: 全体の検証**

```bash
npm run lint && npx tsc -b && npm test
```

Expected: lint エラーなし、型エラーなし、全テスト PASS。いずれかが落ちたら、その原因を直してから次へ進む（落ちたまま次に進まない）。

- [ ] **Step 6: コミット**

```bash
git add src/App.tsx src/App.quarterLineup.test.tsx
git commit -m "feat(lineup): 追加した選手をチームに反映する

既存の ADD_PLAYER_TO_TEAM を選手ごとに dispatch する。reducer は無改修。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 完了の条件

- `npm run lint` / `npx tsc -b` / `npm test` がすべて通る
- スタメン選択画面（Q1の試合前・Q2以降の途中とも）に「＋ 選手を追加」があり、開いているタブのチームに追加される
- 登録済みの背番号がグリッドで押せない
- 確定するまで名簿が変わらない
- 15人を超えるとき、様式から外れる選手が名指しで案内され、それでも追加できる
- 追加した選手は未出場・ベンチ・未選択の状態でカード一覧に並ぶ
- 追加しても、選択中の5人が解除されない
