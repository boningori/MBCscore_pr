# 音声メモを読みながら入力できるようにする 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 音声メモの文字が読めるようにし、スコアボードの上にフローティングする帯で1件ずつ消化しながらスタッツを手入力できるようにする。

**Architecture:** 既存の `useVoiceMemo` に Undo 用の `restoreMemo` だけを足し、表示専用の `VoiceMemoStrip` を新設する。帯は中央列に `position: absolute` で重ね、レイアウトを一切押し出さない。CSSは実在するデザイントークンを参照するよう直し、再発防止のテストで縛る。

**Tech Stack:** React 19 / TypeScript / Vite / vitest + @testing-library/react

## Global Constraints

- 設計書: `docs/superpowers/specs/2026-08-25-voice-memo-inline-reading-design.md`。判断に迷ったらこれが優先
- 前提の設計書: `docs/superpowers/specs/2026-08-24-voice-memo-design.md`（v1.5.0 でリリース済み）
- 休眠中の `src/components/VoiceInput/*` / `src/hooks/useVoiceInput.ts` / `src/utils/voiceCommands.ts` / `src/types/speech.d.ts` は**一切触らない**。`App.tsx` の `header-center` にある `VoiceInput` のコメント2行もそのまま残す
- 録音・文字起こし・プライバシー・寿命の挙動は変えない。音声は端末にもバックアップにも残さず、文字起こしは sessionStorage のみ
- 文字起こし結果をスタッツへ自動反映しない
- メモの「済」状態を永続化しない（済＝削除）
- テストは vitest の明示 import（`import { describe, it, expect } from 'vitest'`）。globals は無効
- **jest-dom は導入していない。** `toBeInTheDocument` / `toBeDisabled` / `toHaveAttribute` などは使えない。素のDOMプロパティと `toBeTruthy()` / `toBeNull()` で書く
- インデント: `src/App.tsx` は2スペース、`src/hooks/` `src/utils/` `src/components/` は4スペース
- 検証は `npm test`（約241ファイル／1728テスト）・`npm run lint`・`npm run build` の3つ。フォアグラウンドで実行し、実際の出力を報告に貼る
- 作業ツリーを汚さない。スクラッチのテストや出力ファイルを残さないこと

---

### Task 1: CSSトークンの修正と再発防止テスト

`VoiceMemo.css` はこのプロジェクトに存在しない変数（`--color-surface` 等）を参照しており、フォールバックの明るい色に落ちて「白地に白文字」になっていた。実在するトークンへ差し替え、二度と起きないようテストで縛る。

**Files:**
- Modify: `src/components/VoiceMemo/VoiceMemo.css`
- Create: `src/components/VoiceMemo/voiceMemoTokens.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: なし（CSSのみ）

- [ ] **Step 1: 失敗するテストを書く**

`src/components/VoiceMemo/voiceMemoTokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// VoiceMemo.css は一度、このプロジェクトに存在しない変数名
// （--color-surface / --color-text / --color-text-muted / --color-border / --color-danger）を
// 参照していた。未定義の var() はフォールバック値に落ちるだけでエラーにならないため、
// ダークテーマのアプリに明るいテーマ用の色が描画され、カード背景 #fff の上に
// 本文 #f8fafc という「白地に白文字」になっていた（実測コントラスト比 約1.03:1）。
// CSSを読むだけでは気づけなかったので、参照と定義の突き合わせをテストで縛る。

const root = process.cwd();
const componentCss = readFileSync(resolve(root, 'src/components/VoiceMemo/VoiceMemo.css'), 'utf8');
const globalCss = readFileSync(resolve(root, 'src/index.css'), 'utf8');

const referencedTokens = [
    ...new Set([...componentCss.matchAll(/var\(\s*(--[\w-]+)/g)].map(m => m[1])),
];
const definedTokens = new Set(
    [...globalCss.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map(m => m[1]),
);

// 相対輝度（WCAG 2.x の定義）
function relativeLuminance(hex: string): number {
    const value = hex.replace('#', '');
    const channels = [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16) / 255);
    const linear = channels.map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(hexA: string, hexB: string): number {
    const a = relativeLuminance(hexA);
    const b = relativeLuminance(hexB);
    const [light, dark] = a > b ? [a, b] : [b, a];
    return (light + 0.05) / (dark + 0.05);
}

function tokenValue(name: string): string {
    const match = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`).exec(globalCss);
    if (!match) throw new Error(`${name} が src/index.css に見つからない`);
    return match[1];
}

describe('VoiceMemo.css: 参照しているCSS変数', () => {
    it('1つ以上のCSS変数を参照している（正規表現が壊れていないことの確認）', () => {
        expect(referencedTokens.length).toBeGreaterThan(0);
    });

    it('すべて src/index.css に定義されている', () => {
        const missing = referencedTokens.filter(t => !definedTokens.has(t));
        expect(missing).toEqual([]);
    });

    it('存在しない --color-* 系を参照していない', () => {
        expect(referencedTokens.filter(t => t.startsWith('--color-'))).toEqual([]);
    });
});

describe('VoiceMemo.css: 可読性', () => {
    it('メモ本文に明示的な文字色が指定されている（継承任せにしない）', () => {
        // 本文に色指定が無かったため、アプリのほぼ白い文字色を継承して白いカードに乗っていた
        const rule = /\.voice-memo-item-text\s*\{[^}]*\}/.exec(componentCss);
        expect(rule).not.toBeNull();
        expect(rule![0]).toMatch(/color\s*:/);
    });

    it('本文とカード背景のコントラスト比が WCAG AA (4.5:1) を満たす', () => {
        expect(contrastRatio(tokenValue('--text-primary'), tokenValue('--bg-card'))).toBeGreaterThanOrEqual(4.5);
    });

    it('見出し（Q・時刻）とカード背景のコントラスト比が WCAG AA を満たす', () => {
        expect(contrastRatio(tokenValue('--text-muted'), tokenValue('--bg-card'))).toBeGreaterThanOrEqual(4.5);
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

```bash
npx vitest run src/components/VoiceMemo/voiceMemoTokens.test.ts
```

Expected: FAIL — 「すべて src/index.css に定義されている」が `['--color-border', '--color-surface', '--color-text', '--color-danger', '--color-text-muted']` を報告し、「存在しない --color-* 系を参照していない」と「メモ本文に明示的な文字色」も失敗する

- [ ] **Step 3: VoiceMemo.css の変数を差し替える**

置き換えの対応表（フォールバック値もダーク側の実際の値にする。トークンが消えても明るい色に落ちないようにするため）:

| 旧 | 新 |
|---|---|
| `var(--color-border, #ccc)` | `var(--border, #334155)` |
| `var(--color-surface, #fff)` | `var(--bg-card, #1e293b)` |
| `var(--color-text, #222)` | `var(--text-primary, #f8fafc)` |
| `var(--color-text-muted, #666)` | `var(--text-muted, #8695ad)` |
| `var(--color-danger, #d32f2f)` | `var(--danger, #dc2626)` |

さらに `.voice-memo-item-text` に文字色を明示する（今回の根本原因）:

```css
.voice-memo-item-text {
    margin: 0;
    font-size: 1rem;
    line-height: 1.5;
    white-space: pre-wrap;
    color: var(--text-primary, #f8fafc);
}
```

`.voice-memo-btn.is-recording` の `color: #fff;` はそのまま残す（`--danger` の上に白文字で、コントラストは十分）。

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/components/VoiceMemo/voiceMemoTokens.test.ts
```

Expected: PASS（6件）

- [ ] **Step 5: 実際に描画された色を測る**

CSSの記述だけでなく、ブラウザが計算した色を確認する。これを省いたのが今回の見落としの原因。

```bash
npm run dev
```

開いたページのコンソールで次を実行し、`カード背景` が `rgb(30, 41, 59)`、`本文の色` が `rgb(248, 250, 252)` になることを確認する:

```js
(() => {
  const probe = document.createElement('div');
  probe.className = 'voice-memo-panel';
  probe.innerHTML = '<div class="voice-memo-item"><p class="voice-memo-item-text">テスト</p></div>';
  document.body.appendChild(probe);
  const item = probe.querySelector('.voice-memo-item');
  const text = probe.querySelector('.voice-memo-item-text');
  const r = {
    カード背景: getComputedStyle(item).backgroundColor,
    本文の色: getComputedStyle(text).color,
  };
  probe.remove();
  return r;
})()
```

- [ ] **Step 6: 全体テスト・lint・型を通す**

```bash
npm test && npm run lint && npm run build
```

Expected: 全PASS、エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/components/VoiceMemo/VoiceMemo.css src/components/VoiceMemo/voiceMemoTokens.test.ts
git commit -m "fix(voicememo): 存在しないCSS変数を参照して白地に白文字になっていたのを修正"
```

---

### Task 2: フックに restoreMemo を足す

「済にする」を取り消すには、消したメモを一覧へ戻す手段が要る。現在のフックには `removeMemoById`（消す）しか無い。

**Files:**
- Modify: `src/hooks/useVoiceMemo.ts`
- Modify: `src/hooks/useVoiceMemo.test.tsx`

**Interfaces:**
- Consumes: `VoiceMemo` 型と `appendMemo`（`src/utils/voiceMemo.ts`、既存）
- Produces: `UseVoiceMemoResult` に `restoreMemo: (memo: VoiceMemo) => void` を追加

- [ ] **Step 1: 失敗するテストを書く**

`src/hooks/useVoiceMemo.test.tsx` の末尾に追記する。既存の `render` ヘルパと `beforeEach` をそのまま使う:

```tsx
describe('useVoiceMemo: 済にしたメモを戻す', () => {
    it('戻したメモが一覧に現れる', async () => {
        const { result } = render();
        const memo = { id: 'vm-x', quarter: 2, createdAt: 5000, status: 'done' as const, text: '青5シュートミス' };

        act(() => {
            result.current.restoreMemo(memo);
        });

        expect(result.current.memos).toHaveLength(1);
        expect(result.current.memos[0].text).toBe('青5シュートミス');
    });

    it('createdAt の順で元の位置に戻る', () => {
        const { result } = render();
        const first = { id: 'a', quarter: 1, createdAt: 1000, status: 'done' as const, text: '先' };
        const third = { id: 'c', quarter: 1, createdAt: 3000, status: 'done' as const, text: '後' };
        const second = { id: 'b', quarter: 1, createdAt: 2000, status: 'done' as const, text: '間' };

        act(() => {
            result.current.restoreMemo(first);
            result.current.restoreMemo(third);
        });
        act(() => {
            // 後から戻しても、発話順で間に入る
            result.current.restoreMemo(second);
        });

        expect(result.current.memos.map(m => m.id)).toEqual(['a', 'b', 'c']);
    });

    it('失敗したメモを消してから戻すと、再送はできなくなる', () => {
        // removeMemoById は再送用の音声Blobも一緒に捨てる。音声を保持しない設計の帰結で、
        // 戻せるのは「読むための文字」だけという割り切り
        const { result } = render();
        const failed = { id: 'f1', quarter: 1, createdAt: 1000, status: 'failed' as const, error: '通信エラー' };

        act(() => {
            result.current.restoreMemo(failed);
        });

        expect(result.current.memos).toHaveLength(1);
        expect(result.current.canRetry('f1')).toBe(false);
    });

    it('sessionStorage にも反映される', async () => {
        const { result } = render();
        const memo = { id: 'vm-y', quarter: 3, createdAt: 7000, status: 'done' as const, text: '青4シュート成功' };

        act(() => {
            result.current.restoreMemo(memo);
        });

        await waitFor(() => expect(loadVoiceMemos()).toHaveLength(1));
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

```bash
npx vitest run src/hooks/useVoiceMemo.test.tsx
```

Expected: FAIL — `result.current.restoreMemo is not a function`

- [ ] **Step 3: フックに実装する**

`src/hooks/useVoiceMemo.ts` の `UseVoiceMemoResult` に追加:

```ts
    /** 済にしたメモを一覧へ戻す（Undo用）。createdAt を保つので元の並び位置に復帰する。
     *  音声Blobは removeMemoById の時点で捨てているため、戻しても再送はできない */
    restoreMemo: (memo: VoiceMemo) => void;
```

`removeMemoById` の直後に実装を追加:

```ts
    const restoreMemo = useCallback((memo: VoiceMemo) => {
        setMemos(prev => appendMemo(prev, memo));
    }, []);
```

`appendMemo` は既に import 済み。返り値のオブジェクトに `restoreMemo,` を加える。

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/hooks/useVoiceMemo.test.tsx
```

Expected: PASS（既存分＋新規4件）

- [ ] **Step 5: 全体テスト・lint・型を通す**

```bash
npm test && npm run lint && npm run build
```

Expected: 全PASS、エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/hooks/useVoiceMemo.ts src/hooks/useVoiceMemo.test.tsx
git commit -m "feat(voicememo): 済にしたメモを戻す restoreMemo を追加"
```

---

### Task 3: VoiceMemoStrip コンポーネント

1件だけを表示する帯。表示専用で、状態は props で受ける。Undo の猶予だけ内部に持つ。

**Files:**
- Create: `src/components/VoiceMemo/VoiceMemoStrip.tsx`
- Create: `src/components/VoiceMemo/VoiceMemoStrip.test.tsx`
- Modify: `src/components/VoiceMemo/VoiceMemo.css`
- Modify: `src/components/VoiceMemo/index.ts`

**Interfaces:**
- Consumes: `VoiceMemo` 型（`src/utils/voiceMemo.ts`）
- Produces:

```ts
export interface VoiceMemoStripProps {
    memo: VoiceMemo;
    total: number;
    position: number;      // 何件目か（1始まり）
    canRetry: boolean;
    onRetry: (id: string) => void;
    onDone: (id: string) => void;
    /** 猶予中に「元に戻す」対象として表示するメモ。null なら通常表示 */
    undoMemo: VoiceMemo | null;
    onUndo: () => void;
    onCollapse: () => void;
    onOpenList: () => void;
}
export function VoiceMemoStrip(props: VoiceMemoStripProps): JSX.Element;
```

**Undo の状態と猶予タイマーは App 側が持つ。**帯の内部に置くと、最後の1件を済にした瞬間に
App の描画条件（`memos.length > 0`）が偽になって帯ごとアンマウントされ、「元に戻す」が
出る前に消えてしまう。帯は `undoMemo` を受け取って表示を切り替えるだけの表示専用にする。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/VoiceMemo/VoiceMemoStrip.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { VoiceMemo } from '../../utils/voiceMemo';
import { VoiceMemoStrip } from './VoiceMemoStrip';

afterEach(cleanup);

const memo = (over: Partial<VoiceMemo> = {}): VoiceMemo => ({
    id: 'm1',
    quarter: 2,
    createdAt: 1000,
    status: 'done',
    text: '青5シュートミス、青6リバウンド、青6アシスト、青4シュート成功',
    ...over,
});

const setup = (
    over: Partial<VoiceMemo> = {},
    extra: Partial<{ canRetry: boolean; total: number; position: number; undoMemo: VoiceMemo | null }> = {},
) => {
    const onRetry = vi.fn();
    const onDone = vi.fn();
    const onUndo = vi.fn();
    const onCollapse = vi.fn();
    const onOpenList = vi.fn();
    render(
        <VoiceMemoStrip
            memo={memo(over)}
            total={extra.total ?? 2}
            position={extra.position ?? 1}
            canRetry={extra.canRetry ?? false}
            undoMemo={extra.undoMemo ?? null}
            onRetry={onRetry}
            onDone={onDone}
            onUndo={onUndo}
            onCollapse={onCollapse}
            onOpenList={onOpenList}
        />,
    );
    return { onRetry, onDone, onUndo, onCollapse, onOpenList };
};

describe('VoiceMemoStrip: 状態ごとの表示', () => {
    it('done は文字起こし本文を出す', () => {
        setup();
        expect(screen.getByText(/青5シュートミス、青6リバウンド/)).toBeTruthy();
    });

    it('sending は文字起こし中と分かる', () => {
        setup({ status: 'sending', text: undefined });
        expect(screen.getByText(/文字起こし中/)).toBeTruthy();
    });

    it('failed は理由を出す', () => {
        setup({ status: 'failed', text: undefined, error: '通信エラー' });
        expect(screen.getByText(/通信エラー/)).toBeTruthy();
    });

    it('何件目 / 全何件 が分かる', () => {
        setup({}, { total: 3, position: 2 });
        expect(screen.getByText(/2件目/)).toBeTruthy();
        expect(screen.getByText(/全3件/)).toBeTruthy();
    });

    it('クォーターを出す', () => {
        setup({ quarter: 4 });
        expect(screen.getByText(/Q4/)).toBeTruthy();
    });
});

describe('VoiceMemoStrip: 再送', () => {
    it('failed かつ canRetry なら再送ボタンが出る', () => {
        const { onRetry } = setup({ status: 'failed', text: undefined, error: '通信エラー' }, { canRetry: true });
        fireEvent.click(screen.getByRole('button', { name: /再送/ }));
        expect(onRetry).toHaveBeenCalledWith('m1');
    });

    it('failed でも canRetry が false なら再送ボタンを出さない', () => {
        setup({ status: 'failed', text: undefined, error: '通信エラー' }, { canRetry: false });
        expect(screen.queryByRole('button', { name: /再送/ })).toBeNull();
    });

    it('done には再送ボタンを出さない', () => {
        setup({}, { canRetry: true });
        expect(screen.queryByRole('button', { name: /再送/ })).toBeNull();
    });
});

describe('VoiceMemoStrip: 済にする と Undo', () => {
    it('済にすると onDone がそのIDで呼ばれる', () => {
        const { onDone } = setup();
        fireEvent.click(screen.getByRole('button', { name: /済にする/ }));
        expect(onDone).toHaveBeenCalledWith('m1');
    });

    it('undoMemo が渡ると本文の代わりに「元に戻す」が出る', () => {
        setup({}, { undoMemo: memo() });
        expect(screen.queryByText(/青5シュートミス、青6リバウンド/)).toBeNull();
        expect(screen.getByText(/済にしました/)).toBeTruthy();
        expect(screen.getByRole('button', { name: /元に戻す/ })).toBeTruthy();
    });

    it('undoMemo が無ければ「元に戻す」は出ない', () => {
        setup();
        expect(screen.queryByRole('button', { name: /元に戻す/ })).toBeNull();
    });

    it('元に戻すで onUndo が呼ばれる', () => {
        const { onUndo } = setup({}, { undoMemo: memo() });
        fireEvent.click(screen.getByRole('button', { name: /元に戻す/ }));
        expect(onUndo).toHaveBeenCalledTimes(1);
    });

    it('Undo 表示中は済にする・再送を出さない（二重操作を防ぐ）', () => {
        setup({ status: 'failed', text: undefined, error: '通信エラー' }, { undoMemo: memo(), canRetry: true });
        expect(screen.queryByRole('button', { name: /済にする/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /再送/ })).toBeNull();
    });
});

describe('VoiceMemoStrip: たたむ と 一覧', () => {
    it('たたむで onCollapse が呼ばれ、onDone は呼ばれない', () => {
        const { onCollapse, onDone } = setup();
        fireEvent.click(screen.getByRole('button', { name: /たたむ/ }));
        expect(onCollapse).toHaveBeenCalledTimes(1);
        expect(onDone).not.toHaveBeenCalled();
    });

    it('一覧で onOpenList が呼ばれる', () => {
        const { onOpenList } = setup();
        fireEvent.click(screen.getByRole('button', { name: /一覧/ }));
        expect(onOpenList).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

```bash
npx vitest run src/components/VoiceMemo/VoiceMemoStrip.test.tsx
```

Expected: FAIL — `Failed to resolve import "./VoiceMemoStrip"`

- [ ] **Step 3: VoiceMemoStrip.tsx を実装**

```tsx
// 音声メモを1件だけ表示する帯。スコアボードの上に重ねて、
// 入力ボタンを動かさずに読めるようにする。
//
// ボタンが「済にする」と「たたむ」に分かれているのは役割が違うため:
// - 済にする … 入力し終えたので捨てる。残すと二重入力の元になる
// - たたむ  … メモは残したまま引っ込める。この帯はスコアボードを覆っており、
//             その下にはクォーター操作ボタンがある。そこへ手を伸ばしたいときに
//             「済」しか無いと、どかすためにメモを捨てることになってしまう
//
// Undo の状態とタイマーは App が持つ。ここに持てないのは、最後の1件を済にすると
// App の描画条件（memos.length > 0）が偽になって帯ごとアンマウントされ、
// 「元に戻す」が出る前に消えてしまうため。この層は表示専用にしておく。

import type { VoiceMemo } from '../../utils/voiceMemo';
import './VoiceMemo.css';

export interface VoiceMemoStripProps {
    memo: VoiceMemo;
    /** 一覧の全件数 */
    total: number;
    /** 何件目か（1始まり） */
    position: number;
    canRetry: boolean;
    onRetry: (id: string) => void;
    onDone: (id: string) => void;
    /** 猶予中に「元に戻す」対象として表示するメモ。null なら通常表示 */
    undoMemo: VoiceMemo | null;
    onUndo: () => void;
    onCollapse: () => void;
    onOpenList: () => void;
}

const formatTime = (createdAt: number) =>
    new Date(createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

export function VoiceMemoStrip({
    memo,
    total,
    position,
    canRetry,
    onRetry,
    onDone,
    undoMemo,
    onUndo,
    onCollapse,
    onOpenList,
}: VoiceMemoStripProps) {
    // 猶予中は本文も操作も出さない。消したはずのメモに対して
    // 「済にする」「再送」が押せると、二重に操作できてしまう
    if (undoMemo) {
        return (
            <div className="voice-memo-strip" role="status">
                <div className="voice-memo-strip-body">済にしました</div>
                <div className="voice-memo-strip-actions">
                    <button type="button" className="btn btn-secondary btn-small" onClick={onUndo}>
                        元に戻す
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="voice-memo-strip">
            <div className="voice-memo-strip-head">
                <span>Q{memo.quarter} / {formatTime(memo.createdAt)} ・ {position}件目 / 全{total}件</span>
                <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={onCollapse}
                    aria-label="音声メモをたたむ（メモは残ります）"
                >
                    ✕ たたむ
                </button>
            </div>

            <div className="voice-memo-strip-body">
                {memo.status === 'sending' && '⏳ 文字起こし中…'}
                {memo.status === 'done' && memo.text}
                {memo.status === 'failed' && `⚠️ 文字起こしに失敗しました（${memo.error ?? '理由不明'}）`}
            </div>

            <div className="voice-memo-strip-actions">
                <button type="button" className="btn btn-primary btn-small" onClick={() => onDone(memo.id)}>
                    済にする
                </button>
                {memo.status === 'failed' && canRetry && (
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => onRetry(memo.id)}>
                        再送
                    </button>
                )}
                <button type="button" className="btn btn-secondary btn-small" onClick={onOpenList}>
                    一覧
                </button>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: VoiceMemo.css に帯のスタイルを追加**

ファイル末尾に追記する。Task 1 で直したのと同じ実在トークンだけを使うこと（`voiceMemoTokens.test.ts` が縛っている）:

```css
/* スコアボードの上に重ねる帯。中央列（.center-column）が position: relative */
.voice-memo-strip {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 5;
    padding: 10px 12px;
    border: 2px solid var(--warning-light, #fbbf24);
    border-radius: var(--radius-md, 8px);
    background: var(--bg-card, #1e293b);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.6);
}

.voice-memo-strip-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 0.8rem;
    color: var(--text-muted, #8695ad);
}

.voice-memo-strip-body {
    font-size: 1.05rem;
    line-height: 1.6;
    white-space: pre-wrap;
    color: var(--text-primary, #f8fafc);
}

.voice-memo-strip-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
}
```

- [ ] **Step 5: index.ts に追加**

```ts
export { VoiceMemoButton } from './VoiceMemoButton';
export { VoiceMemoPanel } from './VoiceMemoPanel';
export { VoiceMemoStrip } from './VoiceMemoStrip';
```

- [ ] **Step 6: テストが通ることを確認**

```bash
npx vitest run src/components/VoiceMemo/
```

Expected: PASS（既存分＋新規13件）。`voiceMemoTokens.test.ts` も引き続き通ること（帯のCSSが実在トークンだけを使っている確認になる）

- [ ] **Step 7: 全体テスト・lint・型を通す**

```bash
npm test && npm run lint && npm run build
```

Expected: 全PASS、エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/components/VoiceMemo/
git commit -m "feat(voicememo): 1件ずつ読む帯（VoiceMemoStrip）を追加"
```

---

### Task 4: App.tsx へ統合

ヘッダーのボタンを帯の開閉に変え、中央列に帯を重ねる。

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: Task 2 の `restoreMemo`、Task 3 の `VoiceMemoStrip`
- Produces: なし

> **テストについて:** このタスクは配線であり新しいロジックを足さない。帯の挙動は Task 3 の13件、
> フックの挙動は Task 2 の4件が既に担っている。`{cond && <Strip/>}` を確かめるテストを足しても
> Reactの挙動を測るだけなので書かない。App.tsx 側は Step 4 の手動検証で確認する。

- [ ] **Step 1: 中央列を配置の基準にする**

`src/App.css` の `.app-container .center-column`（265行付近）に1行足す:

```css
.app-container .center-column {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  height: 100%;
  /* 音声メモの帯（.voice-memo-strip）をスコアボードの上に重ねるための基準。
     帯は position: absolute で乗せるので、入力ボタンの位置は動かない */
  position: relative;
}
```

- [ ] **Step 2: ヘッダーのボタンを帯の開閉に変える**

`src/App.tsx` の `header-center` 内、`VoiceMemoButton` の隣にあるボタンを差し替える。`VoiceInput` のコメント2行はそのまま残すこと:

```tsx
              <button
                className="btn btn-secondary btn-small"
                onClick={() => setShowVoiceMemoStrip(v => !v)}
                style={{ marginLeft: '8px' }}
                aria-label={`音声メモを開く（${voiceMemo.memos.length}件）`}
                aria-pressed={showVoiceMemoStrip}
              >
                📝<span className="btn-label"> メモ</span>
                {voiceMemo.memos.length > 0 && ` ${voiceMemo.memos.length}`}
              </button>
```

state を追加する（既存の `showVoiceMemos` はそのまま残す。一覧モーダルは帯の「一覧」から開く）:

```ts
  const [showVoiceMemoStrip, setShowVoiceMemoStrip] = useState(false);
  // 「済にする」の取り消し猶予。得点・スタッツ用の undoInfo とは別枠にする。
  // 共用すると、メモを済にした瞬間に得点の取り消しが消えてしまう
  const [voiceMemoUndo, setVoiceMemoUndo] = useState<VoiceMemo | null>(null);
```

`VoiceMemo` 型を import する:

```ts
import type { VoiceMemo } from './utils/voiceMemo';
```

済にする・元に戻す・猶予切れの処理を足す:

```ts
  /** 済にする＝一覧から消す。数秒だけ戻せるように、消したメモを控えておく */
  const handleVoiceMemoDone = (id: string) => {
    const target = voiceMemo.memos.find(m => m.id === id);
    voiceMemo.removeMemoById(id);
    setVoiceMemoUndo(target ?? null);
  };

  const handleVoiceMemoUndo = () => {
    if (voiceMemoUndo) voiceMemo.restoreMemo(voiceMemoUndo);
    setVoiceMemoUndo(null);
  };

  // 猶予切れ。UndoSnackbar の既定値に合わせて5秒
  useEffect(() => {
    if (!voiceMemoUndo) return;
    const timer = setTimeout(() => setVoiceMemoUndo(null), 5000);
    return () => clearTimeout(timer);
  }, [voiceMemoUndo]);
```

- [ ] **Step 3: 中央列に帯を描画する**

`<div className="center-column">` の中、`Scoreboard` を描いている箇所の直前に置く。帯は `position: absolute` なので、DOM順はスコアボードの前でも後でもよいが、読み上げ順を自然にするため先に置く:

```tsx
              {voiceMemo.isFeatureEnabled && showVoiceMemoStrip &&
                (voiceMemo.memos.length > 0 || voiceMemoUndo) && (
                <VoiceMemoStrip
                  /* 猶予中は消したメモ自身を渡す。一覧が空になっていても
                     帯を描き続けるため、memo が undefined にならないようにする */
                  memo={voiceMemo.memos[0] ?? voiceMemoUndo!}
                  total={voiceMemo.memos.length}
                  position={1}
                  canRetry={voiceMemo.memos[0] ? voiceMemo.canRetry(voiceMemo.memos[0].id) : false}
                  onRetry={voiceMemo.retryMemo}
                  onDone={handleVoiceMemoDone}
                  undoMemo={voiceMemoUndo}
                  onUndo={handleVoiceMemoUndo}
                  onCollapse={() => {
                    // たたむと猶予は破棄する（戻せなくなる）
                    setVoiceMemoUndo(null);
                    setShowVoiceMemoStrip(false);
                  }}
                  onOpenList={() => setShowVoiceMemos(true)}
                />
              )}
```

`voiceMemo.memos` は常に `createdAt` 昇順なので `[0]` が最古＝次に処理すべき1件になる。`position` が常に 1 なのは「最古の1件だけを出す」設計だから（設計書「やらないこと」参照）。

描画条件に `|| voiceMemoUndo` が入っているのが要点。これが無いと、**最後の1件を済にした瞬間に
帯ごと消えて「元に戻す」が出ない**。`undoMemo` が渡っている間、帯は本文も操作も出さないので、
`memo` に何が入っていても表示には影響しない。

import に `VoiceMemoStrip` を足す:

```ts
import { VoiceMemoButton, VoiceMemoPanel, VoiceMemoStrip } from './components/VoiceMemo';
```

- [ ] **Step 4: 実機で動作を確認**

```bash
npm run dev
```

設定で音声メモをONにし、Gemini APIキーを入れて新規試合を開始したうえで、次を目視確認する:

1. ヘッダーに「📝 メモ」が出て、メモが無いうちは件数が付かない
2. メモがある状態で押すと、スコアボードの上に帯が重なる
3. **帯を開く前と後で、入力ボタン（2P/3P/FT/リバウンド/ファウル）の画面上の位置が1pxも動かない**
4. 「✕ たたむ」で帯が消え、ヘッダーの件数は減らない
5. 「済にする」で本文が「済にしました ／ 元に戻す」に変わり、ヘッダーの件数が1減る
6. 「元に戻す」で件数が戻り、次に開いたとき同じメモが出る
7. 5秒待つと「元に戻す」が消える
8. **最後の1件を済にしても帯は消えず、「元に戻す」が出る**（猶予が切れてから消える）
9. 帯の「一覧」でモーダルが開き、**モーダルが帯より手前に出る**（z-index の確認）
10. 一覧モーダルの本文が読める色になっている（Task 1 の確認）

3が満たされない場合は `.center-column` の `position: relative` が効いていない。9が満たされない場合は `.voice-memo-strip` の `z-index: 5` をモーダルより小さい値へ下げる。

- [ ] **Step 5: 全体テスト・lint・型を通す**

```bash
npm test && npm run lint && npm run build
```

Expected: 全PASS、エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/App.tsx src/App.css
git commit -m "feat(voicememo): 帯を記録画面へ統合し、読みながら入力できるようにする"
```

---

## 完了条件

- `npm test` / `npm run lint` / `npm run build` がすべて通る
- 一覧モーダルと帯の本文が、カード背景に対して WCAG AA (4.5:1) 以上のコントラストで読める
- 帯の開閉で入力ボタンの位置が動かない
- 「たたむ」ではメモが消えず、「済にする」では消えて直後に戻せる
- 設定OFF・APIキー未設定・シンプルモード・メモ0件のいずれでも帯が出ない
- 休眠中の `VoiceInput` 関連4ファイルと `App.tsx` のコメント2行が変更されていない（`git diff main --stat` で確認）
