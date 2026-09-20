# 記録画面でマイチームが一目で分かるようにする Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** マイチームを常に左（シンプルモードでは上）に固定し、そのチーム名を虹色で表示して、試合中に「自分がどちらか」を考えずに済むようにする。

**Architecture:** 「どちらがマイチームか」の判定を `resolveMyTeamSide()` 1本に集約する。`TeamPanel` が持っていた `side`（`'team-a' | 'team-b'`）は場所とチームの識別が同居していたので、`'left' | 'right'` の純粋な場所へ切り離し、チームの識別は `data-team-id` 属性が担う。並び替えはCSSの `order` ではなくDOMの描画順で行い、読み上げ順とタブ順を見た目に一致させる。虹は文字色だけで完結させ、地色・枠色には一切触れない。

**Tech Stack:** React 19 / TypeScript / Vite / Vitest + @testing-library/react / 素のCSS（CSS Modulesなし・グローバルクラス名）

## Global Constraints

- 設計書: `docs/superpowers/specs/2026-09-20-my-team-visibility-design.md`
- 対象は試合中に見る3画面のみ。**`RunningScoresheet`（公式様式）・`TeamComparison`・`History` の並びは変更しない。**
- 虹の7色は `#ff8f8f, #ffb066, #ffe066, #7fe3a0, #7fd4f5, #a5b4fc, #e0a3f5`。この値をそのまま使う。教科書どおりの虹は `--bg-secondary` 上で青1.70:1・藍1.13:1・紫2.52:1となり使用禁止。
- `resolveMyTeamSide` が `null`（紅白戦・旧データ）を返すときは、位置固定も虹も行わず従来どおり teamA（白）が先。
- **地色・枠色は変えない。** 文字色と並び順だけで解決する。
- 色トークンの `--team-a` / `--team-b`（`src/index.css:64`, `:68`）は改名しない。タブと選択ボタンで使われており、記録画面の左右とは無関係。
- コメントは日本語。既存コードのコメント密度に合わせ、「なぜそうしたか」を書く。
- テスト実行は `npx vitest run <path>`。全体は `npm test`。

---

### Task 1: マイチーム側を判定する関数

**Files:**
- Create: `src/utils/myTeamSide.ts`
- Test: `src/utils/myTeamSide.test.ts`

**Interfaces:**
- Consumes: `Team`（`src/types/game.ts`）
- Produces: `resolveMyTeamSide(teamA: Team, teamB: Team): 'teamA' | 'teamB' | null`

- [ ] **Step 1: Write the failing test**

`src/utils/myTeamSide.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTeam } from '../types/game';
import { resolveMyTeamSide } from './myTeamSide';

/** isMyTeam だけを差し替えた2チームを作る */
function pair(aIsMine: boolean | undefined, bIsMine: boolean | undefined) {
    const teamA = createTeam('teamA', 'ホーム', 'コーチA');
    const teamB = createTeam('teamB', 'ビジター', 'コーチB');
    teamA.isMyTeam = aIsMine;
    teamB.isMyTeam = bIsMine;
    return { teamA, teamB };
}

describe('resolveMyTeamSide', () => {
    it('teamA だけが自分なら teamA', () => {
        const { teamA, teamB } = pair(true, false);
        expect(resolveMyTeamSide(teamA, teamB)).toBe('teamA');
    });

    it('teamB だけが自分なら teamB', () => {
        const { teamA, teamB } = pair(false, true);
        expect(resolveMyTeamSide(teamA, teamB)).toBe('teamB');
    });

    it('両方が自分（紅白戦）なら null', () => {
        const { teamA, teamB } = pair(true, true);
        expect(resolveMyTeamSide(teamA, teamB)).toBeNull();
    });

    it('どちらにも印が無い（旧データ）なら null', () => {
        const { teamA, teamB } = pair(undefined, undefined);
        expect(resolveMyTeamSide(teamA, teamB)).toBeNull();
    });

    it('false と undefined が混ざっても「印が無い」として null', () => {
        const { teamA, teamB } = pair(false, undefined);
        expect(resolveMyTeamSide(teamA, teamB)).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/myTeamSide.test.ts`
Expected: FAIL — `Failed to resolve import "./myTeamSide"`

- [ ] **Step 3: Write minimal implementation**

`src/utils/myTeamSide.ts`:

```ts
// 「どちらがマイチームか」の判定。
//
// 記録画面・スコアボード・スタメン選択の3画面が、この1本だけを見る。
// 画面ごとに判定を書くと、片方だけ左右が入れ替わって食い違う。その状態は
// 「どちらが自分か分からない」という元の問題より悪い。
//
// 判定条件は gameHistoryStorage.ts の backfillSavedTeamIds と揃えてある
// （あちらも aIsMine === bIsMine を「自分側を決められない」として扱う）。
// 同じ意味の判定がリポジトリ内で2つの規則を持つのを避ける。

import type { Team } from '../types/game';

/**
 * マイチームがどちら側かを返す。決められないときは null。
 *
 * null になるのは2通り:
 *   - 両方に isMyTeam が立っている（紅白戦。どちらも自分なので片方を際立たせる意味が無い）
 *   - どちらにも立っていない（isMyTeam を持つ前の旧データ。手掛かりが無い）
 * どちらも、推測して間違った側を強調するより何もしないほうが安全である。
 */
export function resolveMyTeamSide(teamA: Team, teamB: Team): 'teamA' | 'teamB' | null {
    const aIsMine = teamA?.isMyTeam === true;
    const bIsMine = teamB?.isMyTeam === true;
    if (aIsMine === bIsMine) return null;
    return aIsMine ? 'teamA' : 'teamB';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/myTeamSide.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add src/utils/myTeamSide.ts src/utils/myTeamSide.test.ts
git commit -m "feat: マイチーム側を判定する resolveMyTeamSide を追加"
```

---

### Task 2: 虹のトークンと .sr-only ユーティリティ

CSSの土台だけを先に置く。この時点ではまだどの要素にも `.is-my-team` は付かないので、画面の見た目は変わらない。

**Files:**
- Modify: `src/index.css`（`:root` 内にトークン1本、末尾付近に `.sr-only`）
- Test: `src/myTeamRainbow.contrast.test.ts`（新規）

**Interfaces:**
- Produces: CSS変数 `--my-team-rainbow`、CSSクラス `.sr-only`

- [ ] **Step 1: Write the failing test**

`src/index.contrast.test.ts` の輝度計算をそのまま写すのではなく、虹はグラデーション値のため専用に取り出す。`readTokens()` は `#rrggbb` の単色トークンしか拾わないので使えない。

`src/myTeamRainbow.contrast.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// マイチームのチーム名に使う虹の契約。
//
// 教科書どおりの虹（#0000ff / #4b0082 / #8f00ff）は --bg-secondary の上で
// 1.13〜2.52:1 しか出ず、チーム名の後半が地に溶ける。チーム名は「どちらの
// パネルか」を確かめる唯一の文字なので、そこが読めなくなるのは目的と逆行する。
// 明度を引き上げた7色を使っており、将来「もっと鮮やかに」と触られたときに
// ここで止まる。
// jsdom環境では import.meta.url が file: にならないため cwd 基準で読む
const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8');

function channelLuminance(v: number): number {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrast(fg: string, bg: string): number {
    const a = luminance(fg);
    const b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** 宣言の値部分を取り出す（見つからなければ失敗させる） */
function declaration(name: string): string {
    const matched = indexCss.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
    if (!matched) throw new Error(`${name} が src/index.css に無い`);
    return matched[1];
}

const rainbow = declaration('--my-team-rainbow').match(/#[0-9a-fA-F]{6}/g) ?? [];
const bgSecondary = declaration('--bg-secondary').trim();

const AA = 4.5;

describe('--my-team-rainbow', () => {
    it('7色ある', () => {
        expect(rainbow).toHaveLength(7);
    });

    it.each(rainbow)('%s はパネル地(--bg-secondary)の上でAAを満たす', hex => {
        expect(contrast(hex, bgSecondary)).toBeGreaterThanOrEqual(AA);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/myTeamRainbow.contrast.test.ts`
Expected: FAIL — `--my-team-rainbow が src/index.css に無い`

- [ ] **Step 3: Write minimal implementation**

`src/index.css` の `:root` 内、チームカラー（`--team-blue-bg` の直後、現在の `src/index.css:56` 付近）に追加：

```css
  /* マイチームのチーム名に敷く虹。記録画面のパネルヘッダーとスコアボードのラベルだけで使う。
     教科書どおりの虹（#0000ff 1.70:1 / #4b0082 1.13:1 / #8f00ff 2.52:1）は
     --bg-secondary の上でチーム名の後半が読めなくなるため使わない。
     ここは明度を白文字寄りに引き上げた7色で、全色 6.67〜11.22:1 を満たす。
     契約は src/myTeamRainbow.contrast.test.ts が縛っている */
  --my-team-rainbow: linear-gradient(90deg,
    #ff8f8f, #ffb066, #ffe066, #7fe3a0, #7fd4f5, #a5b4fc, #e0a3f5);
```

同じく `src/index.css` の末尾に `.sr-only` を追加：

```css
/* 読み上げ専用テキスト。
   マイチームの印は虹（色）と位置（見た目）だけで伝えており、どちらも
   目で見えない人には届かない。色に依存しない手掛かりをここで足す。
   地色も枠も持たないので「押せるものだけが箱を持つ」規則にも収まる */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/myTeamRainbow.contrast.test.ts`
Expected: PASS（8 tests: 7色 + 個数）

- [ ] **Step 5: 既存のコントラスト契約が壊れていないことを確認**

Run: `npx vitest run src/index.contrast.test.ts`
Expected: PASS（`readTokens()` は `#rrggbb` だけを拾うため、グラデーションのトークンは無視される）

- [ ] **Step 6: Commit**

```bash
git add src/index.css src/myTeamRainbow.contrast.test.ts
git commit -m "feat: マイチーム用の虹トークンと sr-only ユーティリティを追加"
```

---

### Task 3: TeamPanel の side を「場所」へ切り離し、マイチームの印を付ける

**Files:**
- Modify: `src/components/TeamPanel/TeamPanel.tsx`
- Modify: `src/App.css`（16ルールの改名 + `.is-my-team`）
- Modify: `src/components/TeamPanel/pendingSlot.test.tsx:90`
- Test: `src/components/TeamPanel/myTeamMarker.test.tsx`（新規）

**Interfaces:**
- Consumes: `resolveMyTeamSide`（Task 1 — ここでは呼ばず、呼び出し側から結果を受け取る）
- Produces: `TeamPanelProps` に `side: 'left' | 'right'` と `isMyTeam?: boolean` が増える。`teamId` プロップは残る（`data-team-id` になる）。`side` は必須なので、Task 4 で App 側を直すまで型エラーになる（想定どおり）

- [ ] **Step 1: Write the failing test**

`src/components/TeamPanel/myTeamMarker.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { createPlayer } from '../../types/game';
import { TeamPanel } from './TeamPanel';

afterEach(cleanup);

const handlers = {
    onRemoveScore: vi.fn(), onRemoveStat: vi.fn(), onRemoveFoul: vi.fn(),
    onEditScore: vi.fn(), onEditStat: vi.fn(), onEditFoul: vi.fn(),
    onEditFoulFreeThrows: vi.fn(), onConvertScoreToMiss: vi.fn(),
    onConvertMissToScore: vi.fn(), onToggleOwnGoal: vi.fn(),
};

function renderPanel(overrides: Partial<React.ComponentProps<typeof TeamPanel>> = {}) {
    return render(
        <TeamPanel
            teamId="teamB"
            side="left"
            teamName="港北ミニバス"
            teamColor="blue"
            players={[{ ...createPlayer('b1', 4, '選手B1', false), isOnCourt: true }]}
            isActive={false}
            selectedPlayerId={null}
            gameMode="full"
            scoreHistory={[]}
            statHistory={[]}
            foulHistory={[]}
            onPlayerSelect={vi.fn()}
            onSubstitute={vi.fn()}
            onCoachFoul={vi.fn()}
            actionHistoryHandlers={handlers}
            {...overrides}
        />,
    );
}

describe('TeamPanel: 場所とチームの識別を分ける', () => {
    it('side が場所のクラスになる（teamId には依存しない）', () => {
        const { container } = renderPanel({ teamId: 'teamB', side: 'left' });

        const panel = container.querySelector('.team-panel')!;
        // teamB でも左に置かれていれば panel-left。ここが teamId 由来だった頃は
        // カラーラインが画面の外側を向き、保留パネルが逆の端へ飛んでいた
        expect(panel.className).toContain('panel-left');
        expect(panel.className).not.toContain('panel-right');
    });

    it('チームの識別は data-team-id が持つ', () => {
        const { container } = renderPanel({ teamId: 'teamB', side: 'left' });

        expect(container.querySelector('.team-panel')!.getAttribute('data-team-id')).toBe('teamB');
    });
});

describe('TeamPanel: マイチームの印', () => {
    it('マイチームならチーム名に虹のクラスが付く', () => {
        renderPanel({ isMyTeam: true });

        expect(screen.getByText('港北ミニバス').className).toContain('is-my-team');
    });

    it('マイチームなら読み上げ専用の「マイチーム」を添える', () => {
        renderPanel({ isMyTeam: true });

        const label = screen.getByText('マイチーム');
        expect(label.className).toContain('sr-only');
        // 虹のかかる要素の外に置く（中に入れると transparent の巻き添えになる）
        expect(label.closest('.is-my-team')).toBeNull();
    });

    it('マイチームでなければどちらも出ない', () => {
        renderPanel({ isMyTeam: false });

        expect(screen.getByText('港北ミニバス').className).not.toContain('is-my-team');
        expect(screen.queryByText('マイチーム')).toBeNull();
    });

    it('指定が無ければ印は出ない（紅白戦・旧データで null が来る場合）', () => {
        renderPanel();

        expect(screen.getByText('港北ミニバス').className).not.toContain('is-my-team');
        expect(screen.queryByText('マイチーム')).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/TeamPanel/myTeamMarker.test.tsx`
Expected: FAIL — `panel-left` が見つからない（現在は `team-b` が付く）

- [ ] **Step 3: Write minimal implementation**

`src/components/TeamPanel/TeamPanel.tsx` のプロップ定義（現在の `TeamPanel.tsx:23-25` 付近）を差し替え：

```tsx
interface TeamPanelProps {
  teamId: 'teamA' | 'teamB';
  /**
   * 画面上の場所。teamId からは導かない。
   *
   * 以前は `teamId === 'teamA' ? 'team-a' : 'team-b'` で決めていたが、この
   * クラスがCSS側で意味していたのは場所だった（.team-a はカラーラインを
   * 右＝内側に引く指定、.pending-slot-team-a は保留パネルを画面の左端へ
   * 寄せる指定）。チームの識別と場所が1つの名前に同居していたため、
   * マイチームを左へ固定した瞬間に teamB のパネルでラインが外を向き、
   * 保留パネルが逆の端へ飛ぶ。場所は場所として受け取る。
   *
   * シンプルモードでは縦積みになるため 'left' は上のパネルを指す。
   */
  side: 'left' | 'right';
  teamName: string;
  teamColor: 'white' | 'blue';
  /**
   * マイチーム側か。チーム名を虹にし、読み上げ用の「マイチーム」を添える。
   *
   * 判定は resolveMyTeamSide が一手に引き受ける（utils/myTeamSide.ts）。
   * ここは結果を受け取るだけで、自分では決めない。紅白戦・旧データでは
   * どちらにも付かない（未指定で来る）。
   */
  isMyTeam?: boolean;
  players: Player[];
```

（`isMyTeam はここにあったが…` の古いコメント `TeamPanel.tsx:27-28` は削除する。プロップが復活したため事実と合わなくなる）

分割代入（現在の `TeamPanel.tsx:100-104` 付近）に `side` と `isMyTeam` を足し、`side` を算出していた行（`TeamPanel.tsx:133`）を削除：

```tsx
export function TeamPanel({
  teamId,
  side,
  teamName,
  teamColor,
  isMyTeam = false,
  players,
  // …以下は現状のまま
```

```tsx
  // const side = teamId === 'teamA' ? 'team-a' : 'team-b';  ← 削除
```

描画部（現在の `TeamPanel.tsx:135-138`）を差し替え：

```tsx
    <div
      className={`team-panel panel-${side} color-${teamColor} ${isActive ? 'active' : ''}`}
      data-team-id={teamId}
    >
      <div className="team-panel-header">
        <span className={`team-name${isMyTeam ? ' is-my-team' : ''}`}>{teamName}</span>
        {/* 虹も位置も目で見える人にしか届かない。色に依存しない手掛かりを添える。
            虹のかかる span の外に置く（中だと color:transparent の巻き添えになる） */}
        {isMyTeam && <span className="sr-only">マイチーム</span>}
```

保留スロット（現在の `TeamPanel.tsx:157`）：

```tsx
            <div className={`pending-slot pending-slot-${side}`}>{pendingSlot}</div>
```

（`side` が `'left' | 'right'` になったので、クラス名は自動的に `pending-slot-left` / `pending-slot-right` になる）

- [ ] **Step 4: CSSのクラス名を改名する**

`src/App.css` の以下16ルール。`.team-panel.team-a` → `.team-panel.panel-left`、`.team-panel.team-b` → `.team-panel.panel-right`、`.pending-slot-team-a` → `.pending-slot-left`、`.pending-slot-team-b` → `.pending-slot-right` に機械的に置換する。

| 行 | 現在のセレクタ |
| --- | --- |
| `src/App.css:417` | `.app-container .team-panel.team-a` |
| `src/App.css:422` | `.app-container .team-panel.team-b` |
| `src/App.css:428` | `.app-container .team-panel.team-a.color-white` |
| `src/App.css:433` | `.app-container .team-panel.team-a.color-blue` |
| `src/App.css:438` | `.app-container .team-panel.team-b.color-white` |
| `src/App.css:443` | `.app-container .team-panel.team-b.color-blue` |
| `src/App.css:449` | `.app-container .game-main-area.full-mode .team-panel.team-a` |
| `src/App.css:454` | `… .team-panel.team-a.color-white` |
| `src/App.css:459` | `… .team-panel.team-a.color-blue` |
| `src/App.css:944` | `.app-container .pending-slot-team-a .pending-action-panel` |
| `src/App.css:948` | `.app-container .pending-slot-team-b .pending-action-panel` |
| `src/App.css:969` | `.app-container .pending-slot-team-a .pending-action-panel`（`max-width:600px` 内） |
| `src/App.css:973` | `.app-container .pending-slot-team-b .pending-action-panel`（同上） |
| `src/App.css:1333` | `.app-container .game-main-area.simple-mode .team-panel.team-a` |
| `src/App.css:1339` | `… .simple-mode .team-panel.team-a.color-white` |
| `src/App.css:1343` | `… .simple-mode .team-panel.team-a.color-blue` |

**改名しないもの**（記録画面のパネルとは無関係）：`src/App.css:134` `.team-tab.active.team-a`、`src/App.css:138` `.team-tab.active.team-b`、`src/App.css:808` `.team-select-btn.team-a`、`src/App.css:818` `.team-select-btn.team-b`、および `src/index.css:64`,`:68` の色トークン `--team-a` / `--team-b`。

`src/App.css:415` のコメント「チームパネルのカラーライン（内側に配置：左チームは右側、右チームは左側）」の直後に、シンプルモードでの意味を1行足す：

```css
/* チームパネルのカラーライン（内側に配置：左チームは右側、右チームは左側）。
   panel-left / panel-right は「画面上の場所」であってチームの識別ではない
   （識別は data-team-id）。シンプルモードは縦積みなので panel-left は上のパネル */
```

- [ ] **Step 5: 虹のCSSを足す**

`src/App.css` の `.app-container .team-panel-header .team-name`（`src/App.css:472`）の直後に追加：

```css
/* マイチームのチーム名。
   グラデーション文字は color:transparent で作るため、効かない環境では文字が
   丸ごと消える。@supports で囲い、効かないときは現在の文字色に戻す。
   そのとき虹は出ないが、位置の固定は生きているので「左が自分」は保たれる。
   虹に単独で背負わせない。

   このルールを index.css の共通部へ寄せない。地色ではなく文字色を上書きする
   規則であり、.team-label 側（Scoreboard.css）は color:var(--text-primary) を
   明示しているため、読み込み順に依存しない位置に別々に置くほうが安全。 */
@supports (background-clip: text) or (-webkit-background-clip: text) {
  .app-container .team-panel-header .team-name.is-my-team {
    background-image: var(--my-team-rainbow);
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
  }
}

/* Windowsのハイコントラストではグラデーションが描かれず文字が消える */
@media (forced-colors: active) {
  .app-container .team-panel-header .team-name.is-my-team {
    background-image: none;
    color: CanvasText;
  }
}
```

- [ ] **Step 6: 既存テストの参照を直す**

`src/components/TeamPanel/pendingSlot.test.tsx` を開く。`renderWithPending` が `TeamPanel` に渡すプロップに `side="left"` を足し（`teamId` が `teamA` のままなら `side="left"` が対応する）、`:90` の期待値を変える：

```tsx
        expect(slot!.className).toContain('pending-slot-left');
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/components/TeamPanel/`
Expected: PASS（`myTeamMarker.test.tsx` 6件、`pendingSlot.test.tsx`、`TeamPanel.test.tsx` すべて）

型チェック Run: `npx tsc -b --noEmit`
Expected: `src/App.tsx` で `side` が無いという型エラー2件。Task 4 で解消する（この時点では想定内）

- [ ] **Step 8: Commit**

```bash
git add src/components/TeamPanel/TeamPanel.tsx src/components/TeamPanel/myTeamMarker.test.tsx src/components/TeamPanel/pendingSlot.test.tsx src/App.css
git commit -m "refactor: TeamPanel の side を場所へ切り離し、マイチームの印を足す"
```

---

### Task 4: 記録画面でマイチームを左に固定する

**Files:**
- Modify: `src/App.tsx:1460-1570`（2つの `<TeamPanel>` を関数へ抽出し、順序を算出）
- Modify: `src/App.bulkSubstitution.test.tsx:72,107,109`
- Modify: `src/App.quarterLineup.test.tsx:95,97,186,190`
- Modify: `src/App.wakeLock.test.tsx:81,90`
- Modify: `src/App.ftInterrupt.test.tsx:111-114`
- Test: `src/App.myTeamSideOrder.test.tsx`（新規）

**Interfaces:**
- Consumes: `resolveMyTeamSide(teamA, teamB)`（Task 1）、`TeamPanel` の `side` / `isMyTeam` / `data-team-id`（Task 3）
- Produces: 記録画面のDOMで、マイチーム側の `.team-panel` が先に現れる

- [ ] **Step 1: Write the failing test**

試合設定ウィザードを実際に通す。設定確認ステップに「⇄ チームカラー入れ替え」ボタンがあり（`src/components/GameSetup/GameSetup.tsx:657`）、これを押すとマイチームが青＝teamB になる。`buildMatchTeams` は必ず片側だけに `isMyTeam` を立てるので、**紅白戦（両方）と旧データ（どちらも無し）はこの経路では作れない。** それらは `resolveMyTeamSide` の単体テスト（Task 1）、`TeamPanel` の `isMyTeam` 未指定（Task 3）、`Scoreboard` の `renderWith(true, true)`（Task 5）で押さえる。

セットアップは `src/App.quarterLineup.test.tsx:8-36` と同じ形を使う。このリポジトリは各 App テストが自前のセットアップを持つ書き方なので、共通ヘルパーへ切り出さず同じ流儀に合わせる。

`src/App.myTeamSideOrder.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import App from './App';
import type { SavedTeam } from './utils/teamStorage';

function makeTeam(id: string, name: string, label: string, startNumber: number): SavedTeam {
    return {
        id,
        name,
        coachName: 'コーチ',
        assistantCoachName: '',
        players: Array.from({ length: 5 }, (_, i) => ({
            number: startNumber + i,
            name: `${label}${i + 1}`,
            isCaptain: i === 0,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

const myTeam = makeTeam('team-1', 'ホームチーム', 'ホーム', 4);
const opponentTeam = makeTeam('team-2', 'アウェイチーム', 'アウェイ', 11);

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    localStorage.setItem('minibasket-opponent-teams', JSON.stringify([opponentTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
});

afterEach(cleanup);

/** タブ名で選んで5名登録する（色ではなくチーム名で引く。色は入れ替わるため） */
function selectFiveOn(teamName: string, label: string) {
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(teamName) }));
    for (let n = 1; n <= 5; n++) {
        fireEvent.click(screen.getByRole('button', { name: new RegExp(`${label}${n}`) }));
    }
}

/**
 * ウィザードを通して記録画面まで進める。
 * swapColors=true でマイチームが青（＝teamB）になる。
 */
async function startGame(swapColors: boolean) {
    fireEvent.click(await screen.findByText('新規試合開始'));

    await screen.findByText('基本情報');
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));

    await screen.findByText('マイチーム選択');
    fireEvent.click(screen.getByText('ホームチーム'));

    await screen.findByText('出場選手確認');
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));

    await screen.findByText('対戦チームを選択');
    fireEvent.click(screen.getByText('アウェイチーム'));

    await screen.findByText('設定確認');
    if (swapColors) {
        fireEvent.click(screen.getByRole('button', { name: /チームカラー入れ替え/ }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'スタメン選択へ' }));

    await screen.findByText('スタメン選択');
    selectFiveOn('ホームチーム', 'ホーム');
    selectFiveOn('アウェイチーム', 'アウェイ');
    fireEvent.click(screen.getByRole('button', { name: '試合開始' }));

    await waitFor(() => {
        expect(document.querySelectorAll('.team-panel').length).toBe(2);
    });
}

/** 記録画面の2つのチームパネルを、DOMに現れる順で返す */
function panelsInOrder(): string[] {
    return Array.from(document.querySelectorAll('.team-panel'))
        .map(el => el.getAttribute('data-team-id')!);
}

describe('記録画面: マイチームを左に固定する', () => {
    it('マイチームが青(teamB)でも先に描かれる', async () => {
        render(<App />);
        await startGame(true);

        expect(panelsInOrder()).toEqual(['teamB', 'teamA']);
        expect(document.querySelector('.team-panel')!.className).toContain('panel-left');
    });

    it('マイチームが白(teamA)なら従来どおり teamA が先', async () => {
        render(<App />);
        await startGame(false);

        expect(panelsInOrder()).toEqual(['teamA', 'teamB']);
        expect(document.querySelector('.team-panel')!.className).toContain('panel-left');
    });

    it('マイチーム側にだけ虹と読み上げラベルが付く', async () => {
        render(<App />);
        await startGame(true);

        const rainbow = document.querySelectorAll('.team-name.is-my-team');
        expect(rainbow).toHaveLength(1);
        expect(rainbow[0].textContent).toBe('ホームチーム');
        expect(rainbow[0].closest('.team-panel')!.getAttribute('data-team-id')).toBe('teamB');

        const srLabels = screen.getAllByText('マイチーム');
        // パネルヘッダーとスコアボードの2か所
        expect(srLabels).toHaveLength(2);
        srLabels.forEach(el => expect(el.className).toContain('sr-only'));
    });

    it('相手チーム側には虹が付かない', async () => {
        render(<App />);
        await startGame(true);

        const opponentPanel = document.querySelector('.team-panel[data-team-id="teamA"]')!;
        expect(opponentPanel.querySelector('.is-my-team')).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.myTeamSideOrder.test.tsx`
Expected: FAIL — 1件目が `['teamA', 'teamB']` を返す（まだ並び替えていない）。3件目は `data-team-id` も `.is-my-team` もまだ無いため失敗する

- [ ] **Step 3: App.tsx を直す**

`src/App.tsx` の `<TeamPanel teamId="teamA" …>`（`src/App.tsx:1462-1485`）と `<TeamPanel teamId="teamB" …>`（`src/App.tsx:1546-1569`）は、`teamId` の文字列以外まったく同じ24プロップを2度書いている。関数へ抽出する。

ゲーム画面を返す `return` の手前（`renderPendingSlot` などのヘルパーが定義されている場所の近く）に置く：

```tsx
  // マイチームを左（シンプルモードでは上）に固定する。
  //
  // teamA は必ず白チームで、以前はそのまま左に描いていた（matchTeams.ts）。
  // つまりマイチームの場所は、その試合で白を着たか青を着たかで毎回変わっていた。
  // 「自分は左」と体で覚えられないのが、記録中に手が止まる原因だった。
  //
  // 決められないとき（紅白戦・旧データ）は null が返るので、従来どおり teamA が先。
  const myTeamSide = resolveMyTeamSide(state.teamA, state.teamB);
  const panelOrder: ('teamA' | 'teamB')[] =
    myTeamSide === 'teamB' ? ['teamB', 'teamA'] : ['teamA', 'teamB'];

  // 2つのチームパネルは teamId 以外まったく同じだったので、ここ1か所にする。
  // 並び替えのたびに24プロップを書き写す状態だと、片側だけ直し忘れる
  const renderTeamPanel = (teamId: 'teamA' | 'teamB', side: 'left' | 'right') => {
    const team = state[teamId];
    return (
      <TeamPanel
        key={teamId}
        teamId={teamId}
        side={side}
        isMyTeam={myTeamSide === teamId}
        teamName={team.name}
        teamColor={team.color}
        players={team.players}
        isActive={selectedTeamId === teamId}
        selectedPlayerId={selectedPlayerId}
        gameMode={gameMode}
        disabled={phase === 'finished'}
        scoreHistory={state.scoreHistory}
        statHistory={state.statHistory}
        foulHistory={state.foulHistory}
        showThreePoint={state.showThreePoint}
        onPlayerSelect={handlePlayerSelect}
        onSubstitute={() => { setSubstitutionTeamId(teamId); setShowSubstitutionModal(true); }}
        onCoachFoul={() => handleCoachFoul(teamId)}
        actionHistoryHandlers={actionHistoryHandlers}
        teamFouls={effectiveTeamFouls(teamId, currentQuarter)}
        timeoutUsed={timeoutUsedFor(team)}
        timeoutQuarterLabel={timeoutQuarterLabel}
        pendingSlot={renderPendingSlot(teamId)}
        onTimeoutRequest={phase === 'playing' ? () => setTimeoutModalTeam(teamId) : undefined}
        onTimeoutCancel={() => setTimeoutCancelTeam(teamId)}
      />
    );
  };
```

インポートを追加（`src/App.tsx` の utils 群のインポートに並べる）：

```tsx
import { resolveMyTeamSide } from './utils/myTeamSide';
```

`src/App.tsx:1462-1485` の `<TeamPanel teamId="teamA" … />` をまるごと次の1行に置換：

```tsx
              {renderTeamPanel(panelOrder[0], 'left')}
```

`src/App.tsx:1546-1569` の `<TeamPanel teamId="teamB" … />` をまるごと次の1行に置換：

```tsx
              {renderTeamPanel(panelOrder[1], 'right')}
```

`src/App.tsx:1457` のコメント `{/* 3列メインエリア: Team A | Center (Scoreboard + Actions) | Team B */}` と `{/* Left: Team A */}`（`src/App.tsx:1460`）、`{/* Right: Team B */}`（`src/App.tsx:1544`）を書き換える：

```tsx
              {/* 3列メインエリア: マイチーム | Center (Scoreboard + Actions) | 相手 */}
              {/* 左右はマイチーム基準（panelOrder）。決められないときは白が左 */}
```

```tsx
              {/* Left */}
```

```tsx
              {/* Right */}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/App.myTeamSideOrder.test.tsx`
Expected: PASS（5 tests）

- [ ] **Step 5: 既存テストの参照を直す**

`.team-panel.team-a` を「そのチームのパネル」の意味で使っている箇所は、場所ではなくチームを指しているので `data-team-id` へ移す。`.panel-left` には置き換えない（テストの意図は「teamA のパネル」であって「左のパネル」ではない）。

`src/App.bulkSubstitution.test.tsx`：`:72`, `:107`, `:109` の `.team-panel.team-a` を `.team-panel[data-team-id="teamA"]` に置換。

`src/App.quarterLineup.test.tsx`：`:95`, `:186`, `:190` の `.team-panel.team-a` を `.team-panel[data-team-id="teamA"]`、`:97` の `.team-panel.team-b` を `.team-panel[data-team-id="teamB"]` に置換。

`src/App.wakeLock.test.tsx`：`:81`, `:90` を同様に置換。

`src/App.ftInterrupt.test.tsx:111-114` のヘルパーを差し替え。ここは `teamId` から場所を導く、今回まさに切り離した対応関係をそのまま持っている：

```tsx
/** チームパネル（コート上の選手カードやタイムアウトチップを読む）。
    左右はマイチーム基準で入れ替わるため、場所ではなく data-team-id で引く */
function teamPanel(teamId: 'teamA' | 'teamB') {
    return within(document.querySelector(`.team-panel[data-team-id="${teamId}"]`) as HTMLElement);
}
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS（全件）

Run: `npx tsc -b --noEmit`
Expected: エラーなし

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.myTeamSideOrder.test.tsx src/App.bulkSubstitution.test.tsx src/App.quarterLineup.test.tsx src/App.wakeLock.test.tsx src/App.ftInterrupt.test.tsx
git commit -m "feat: 記録画面でマイチームを左に固定する"
```

---

### Task 5: スコアボードの並びと虹

**Files:**
- Modify: `src/components/Scoreboard/Scoreboard.tsx:192-210,240-250`
- Modify: `src/components/Scoreboard/Scoreboard.css:49-62`（`team-a-block` の改名）+ `.is-my-team`
- Test: `src/components/Scoreboard/myTeamOrder.test.tsx`（新規）

**Interfaces:**
- Consumes: `resolveMyTeamSide`（Task 1）、`--my-team-rainbow` と `.sr-only`（Task 2）
- Produces: スコアボードの得点ブロックが記録画面と同じ順で並ぶ

- [ ] **Step 1: Write the failing test**

`src/components/Scoreboard/Scoreboard.test.tsx` の `buildTeams` / `Harness` パターンをそのまま使う。

`src/components/Scoreboard/myTeamOrder.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useEffect } from 'react';
import { GameProvider, useGame } from '../../context/GameContext';
import type { Team, Player } from '../../types/game';
import { createTeam, createPlayer } from '../../types/game';
import { Scoreboard } from './Scoreboard';

afterEach(cleanup);

/** isMyTeam だけを変えた2チームで Scoreboard を描く */
function renderWith(aIsMine: boolean | undefined, bIsMine: boolean | undefined) {
    const withCourt = (p: Player) => ({ ...p, isOnCourt: true });
    const teamA: Team = createTeam('teamA', 'ホーム', 'コーチA');
    teamA.players = [createPlayer('a1', 4, '選手A1', true)].map(withCourt);
    teamA.color = 'white';
    teamA.isMyTeam = aIsMine;
    const teamB: Team = createTeam('teamB', 'ビジター', 'コーチB');
    teamB.players = [createPlayer('b1', 6, '選手B1', true)].map(withCourt);
    teamB.color = 'blue';
    teamB.isMyTeam = bIsMine;

    function Harness() {
        const { dispatch } = useGame();
        useEffect(() => {
            dispatch({ type: 'SET_TEAMS', payload: { teamA, teamB, showThreePoint: false, quarterMinutes: 6 } });
            // eslint-disable-next-line react-hooks/exhaustive-deps -- 初回のみ
        }, []);
        return <Scoreboard onQuarterEnd={() => {}} />;
    }

    return render(<GameProvider><Harness /></GameProvider>);
}

/** 得点ブロックに出ているチーム名を、DOMに現れる順で返す */
function labelsInOrder(): string[] {
    return Array.from(document.querySelectorAll('.team-score-block .team-label'))
        .map(el => el.textContent!.trim());
}

describe('スコアボード: マイチームを左に固定する', () => {
    it('マイチームが青(teamB)なら先に描かれる', () => {
        renderWith(false, true);
        expect(labelsInOrder()).toEqual(['ビジター', 'ホーム']);
    });

    it('マイチームが白(teamA)なら従来どおり', () => {
        renderWith(true, false);
        expect(labelsInOrder()).toEqual(['ホーム', 'ビジター']);
    });

    it('決められないときは従来どおりで虹も出さない', () => {
        renderWith(true, true);
        expect(labelsInOrder()).toEqual(['ホーム', 'ビジター']);
        expect(document.querySelector('.team-label.is-my-team')).toBeNull();
    });

    it('マイチーム側にだけ虹が付く', () => {
        renderWith(false, true);
        const rainbow = document.querySelectorAll('.team-label.is-my-team');
        expect(rainbow).toHaveLength(1);
        expect(rainbow[0].textContent!.trim()).toBe('ビジター');
    });

    it('先頭のブロックに場所のクラスが付く', () => {
        renderWith(false, true);
        expect(document.querySelector('.team-score-block')!.className).toContain('block-left');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/Scoreboard/myTeamOrder.test.tsx`
Expected: FAIL — 1件目が `['ホーム', 'ビジター']` を返す

- [ ] **Step 3: Write minimal implementation**

`src/components/Scoreboard/Scoreboard.tsx` にインポートを追加：

```tsx
import { resolveMyTeamSide } from '../../utils/myTeamSide';
```

`renderTeamBlock`（`src/components/Scoreboard/Scoreboard.tsx:194-209`）を差し替え：

```tsx
    // マイチームを左に固定する。記録画面のパネル（App.tsx の panelOrder）と同じ規則で
    // 並べる。ここだけ順序が違うと、得点を確かめるたびに視線が左右へ飛ぶ
    const myTeamSide = resolveMyTeamSide(state.teamA, state.teamB);
    const blockOrder: ('teamA' | 'teamB')[] =
        myTeamSide === 'teamB' ? ['teamB', 'teamA'] : ['teamA', 'teamB'];

    // チームスコアブロック（チーム名 + スコア。TF/タイムアウトはTeamPanel側に表示）
    const renderTeamBlock = (teamId: 'teamA' | 'teamB', side: 'left' | 'right') => {
        const team = teamId === 'teamA' ? state.teamA : state.teamB;
        const score = teamId === 'teamA' ? scoreA : scoreB;
        const isMyTeam = myTeamSide === teamId;
        return (
            <div
                key={teamId}
                className={`team-score-block block-${side} color-${team.color}`}
                data-team-id={teamId}
            >
                <div className="team-info">
                    <span className={`team-label${isMyTeam ? ' is-my-team' : ''}`}>{team.name}</span>
                    {isMyTeam && <span className="sr-only">マイチーム</span>}
                </div>
                <div className="score-display">{score}</div>
            </div>
        );
    };
```

呼び出し側（`src/components/Scoreboard/Scoreboard.tsx:213` と `:239`）：

```tsx
                {renderTeamBlock(blockOrder[0], 'left')}
```

```tsx
                {renderTeamBlock(blockOrder[1], 'right')}
```

- [ ] **Step 4: CSSを直す**

`src/components/Scoreboard/Scoreboard.css:49-62` の3ルールで `.team-score-block.team-a-block` → `.team-score-block.block-left` に置換する。右側は基底の `.team-score-block`（`src/components/Scoreboard/Scoreboard.css:24`）が `border-left` を引いているためそのままでよく、`.block-right` のルールは作らない。

`src/components/Scoreboard/Scoreboard.css:47` のコメント `/* Team A (左パネル) はボーダーを右側に */` を書き換える：

```css
/* 左のブロックはボーダーを右＝内側に。どちらのチームが左に来るかは
   マイチーム基準で変わるため、チーム名ではなく場所で指定する */
```

同ファイルの `.team-label`（`src/components/Scoreboard/Scoreboard.css:74`）の直後に虹を追加。`color: var(--text-primary)` を上書きするため、同じスコープの `:is(...)` に `.is-my-team` を足して詳細度を上げる：

```css
/* マイチームのチーム名。理由と @supports の意図は App.css の同名クラスに書いてある。
   こちらは .team-label が color を明示しているため、同じスコープで上書きする */
@supports (background-clip: text) or (-webkit-background-clip: text) {
    :is(.scoreboard-new, .scoreboard-simple, .end-game-confirm-modal) .team-label.is-my-team {
        background-image: var(--my-team-rainbow);
        background-clip: text;
        -webkit-background-clip: text;
        color: transparent;
    }
}

@media (forced-colors: active) {
    :is(.scoreboard-new, .scoreboard-simple, .end-game-confirm-modal) .team-label.is-my-team {
        background-image: none;
        color: CanvasText;
    }
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components/Scoreboard/`
Expected: PASS（`myTeamOrder.test.tsx` 5件、`Scoreboard.test.tsx`、`disqualifiedLineup.test.tsx`）

- [ ] **Step 6: Commit**

```bash
git add src/components/Scoreboard/
git commit -m "feat: スコアボードもマイチームを左に固定し、チーム名を虹にする"
```

---

### Task 6: スタメン選択のタブ順

**Files:**
- Modify: `src/components/QuarterLineup/QuarterLineup.tsx:14-19,34,38-44,150`
- Modify: `src/App.tsx:127,339-340`
- Test: `src/components/QuarterLineup/myTeamTabOrder.test.tsx`（新規）

**Interfaces:**
- Consumes: `resolveMyTeamSide`（Task 1）
- Produces: `QuarterLineupProps.initialTab` が `LineupTabId | undefined`（`undefined` なら自前でマイチーム側を選ぶ）

- [ ] **Step 1: Write the failing test**

`src/components/QuarterLineup/QuarterLineup.test.tsx` のレンダリング手順に合わせる。

`src/components/QuarterLineup/myTeamTabOrder.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { Team } from '../../types/game';
import { createTeam, createPlayer } from '../../types/game';
import { QuarterLineup } from './QuarterLineup';

afterEach(cleanup);

function teams(aIsMine: boolean | undefined, bIsMine: boolean | undefined): { teamA: Team; teamB: Team } {
    const teamA = createTeam('teamA', 'ホーム', 'コーチA');
    teamA.players = [1, 2, 3, 4, 5, 6].map(n => createPlayer(`a${n}`, n, `選手A${n}`, false));
    teamA.color = 'white';
    teamA.isMyTeam = aIsMine;
    const teamB = createTeam('teamB', 'ビジター', 'コーチB');
    teamB.players = [1, 2, 3, 4, 5, 6].map(n => createPlayer(`b${n}`, n + 10, `選手B${n}`, false));
    teamB.color = 'blue';
    teamB.isMyTeam = bIsMine;
    return { teamA, teamB };
}

function renderLineup(aIsMine: boolean | undefined, bIsMine: boolean | undefined) {
    const { teamA, teamB } = teams(aIsMine, bIsMine);
    return render(
        <QuarterLineup quarter={1} teamA={teamA} teamB={teamB} onStart={vi.fn()} />,
    );
}

/** タブに出ているチーム名を、DOMに現れる順で返す */
function tabNames(): string[] {
    return Array.from(document.querySelectorAll('.lineup-team-tab .lineup-team-tab-name'))
        .map(el => el.textContent!.replace(/^[白青]/, '').trim());
}

describe('スタメン選択: マイチームのタブを先頭にする', () => {
    it('マイチームが青(teamB)なら青のタブが先頭', () => {
        renderLineup(false, true);
        expect(tabNames()).toEqual(['ビジター', 'ホーム']);
    });

    it('マイチームが白(teamA)なら従来どおり', () => {
        renderLineup(true, false);
        expect(tabNames()).toEqual(['ホーム', 'ビジター']);
    });

    it('決められないときは従来どおり白が先頭', () => {
        renderLineup(true, true);
        expect(tabNames()).toEqual(['ホーム', 'ビジター']);
    });

    it('initialTab 省略時はマイチームのタブが開いている', () => {
        renderLineup(false, true);
        const active = document.querySelector('.lineup-team-tab.active')!;
        expect(active.textContent).toContain('ビジター');
    });

    it('initialTab を渡せばそちらが優先される（タブ切替後の復帰）', () => {
        const { teamA, teamB } = teams(false, true);
        render(
            <QuarterLineup quarter={1} teamA={teamA} teamB={teamB} initialTab="teamA" onStart={vi.fn()} />,
        );
        const active = document.querySelector('.lineup-team-tab.active')!;
        expect(active.textContent).toContain('ホーム');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/QuarterLineup/myTeamTabOrder.test.tsx`
Expected: FAIL — 1件目が `['ホーム', 'ビジター']` を返す

- [ ] **Step 3: Write minimal implementation**

`src/components/QuarterLineup/QuarterLineup.tsx` にインポートを追加：

```tsx
import { resolveMyTeamSide } from '../../utils/myTeamSide';
```

プロップのコメント（`src/components/QuarterLineup/QuarterLineup.tsx:14-19`）を事実に合わせる：

```tsx
    /** 白チーム（データ上 teamA=白 に固定。画面での左右はマイチーム基準で入れ替わる） */
    teamA: Team;
    /** 青チーム */
    teamB: Team;
    /** 初期表示タブ（省略時はマイチーム側。決められないときは teamA） */
    initialTab?: LineupTabId;
```

モジュール定数 `TAB_IDS`（`src/components/QuarterLineup/QuarterLineup.tsx:34`）を削除し、コンポーネント内の算出に変える。分割代入から `initialTab = 'teamA'` の既定値を外す：

```tsx
export function QuarterLineup({
    quarter,
    teamA,
    teamB,
    initialTab,
    onTabChange,
    onStart,
    onAddPlayers,
    onBack,
}: QuarterLineupProps) {
```

`teams` を組み立てている場所（`src/components/QuarterLineup/QuarterLineup.tsx:68` の直前）に追加：

```tsx
    // マイチームのタブを先頭に置く。各クォーターの開始時に必ず通り、しかも
    // 「自分の5人を選ぶ」画面なので、記録画面と並びが食い違うと迷いが起きる。
    // 決められないとき（紅白戦・旧データ）は従来どおり白が先頭
    const myTeamSide = resolveMyTeamSide(teamA, teamB);
    const tabIds: LineupTabId[] =
        myTeamSide === 'teamB' ? ['teamB', 'teamA'] : ['teamA', 'teamB'];
```

`activeTab` の初期値を `tabIds[0]` へ。現在の `useState` 宣言（`initialTab` を使っている行）を次に変える：

```tsx
    const [activeTab, setActiveTab] = useState<LineupTabId>(initialTab ?? tabIds[0]);
```

タブの描画（`src/components/QuarterLineup/QuarterLineup.tsx:152`）で `TAB_IDS` を `tabIds` に変える：

```tsx
                {tabIds.map(tab => {
```

同 `:150` のコメントを書き換える：

```tsx
            {/* マイチームのタブが先頭。どちらからでも登録できる */}
```

- [ ] **Step 4: App 側の初期タブを外す**

`src/App.tsx:127` の状態を `null` 許容にする。どちらのタブが先頭かは `QuarterLineup` が `resolveMyTeamSide` で決めるので、App が `'teamA'` を押し付けない：

```tsx
  // 初期タブは QuarterLineup がマイチーム基準で決める。null は「まだ選んでいない」
  const [lineupTab, setLineupTab] = useState<'teamA' | 'teamB' | null>(null);
```

`src/App.tsx:1311` の受け渡し：

```tsx
        initialTab={lineupTab ?? undefined}
```

`src/App.tsx:339-340`：

```tsx
    // Q1スタメン選択画面へ（新規試合はマイチームのタブから。決めるのは QuarterLineup 側）
    setLineupTab(null);
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components/QuarterLineup/ src/App.quarterLineup.test.tsx`
Expected: PASS（`myTeamTabOrder.test.tsx` 5件を含む全件）

- [ ] **Step 6: Commit**

```bash
git add src/components/QuarterLineup/ src/App.tsx
git commit -m "feat: スタメン選択もマイチームのタブを先頭にする"
```

---

### Task 7: 全体確認と実機での見え方の確認

コードは揃っている。ここは壊れていないことの確認と、CSSの見た目だけ自動テストで測れない部分を実際に見る。

**Files:**
- Modify: `src/utils/matchTeams.ts:9`（コメントのみ）
- Modify: `docs/superpowers/specs/2026-09-20-my-team-visibility-design.md`（実機確認の結果を追記）

- [ ] **Step 1: 事実と合わなくなったコメントを直す**

`src/utils/matchTeams.ts:9` の「白=teamA（上段）・青=teamB（下段）に固定し」は、データの割り当てとしては正しいが、括弧内の画面位置が事実と合わなくなる：

```ts
 * 白=teamA・青=teamB に固定し、マイチームの色に応じて中身を割り当てる。
 * これはデータ上の割り当てで、画面のどちらに描くかとは別（記録画面・スコアボード・
 * スタメン選択はマイチームを先に置く。utils/myTeamSide.ts）。
```

- [ ] **Step 2: 全体テストと型・lint**

Run: `npm test`
Expected: PASS（全件）

Run: `npx tsc -b --noEmit`
Expected: エラーなし

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 3: 実機で見る**

`.claude/launch.json` の dev サーバを起動し、記録画面を開く。**マイチームを青にした試合**を1つ作って確認する（白のままだと並び替えが起きず、確認にならない）。

| 見るもの | 期待 |
| --- | --- |
| フルモードの記録画面 | マイチームが左。カラーライン（青）がパネルの右＝内側 |
| スコアボード | 左のブロックがマイチーム。虹のチーム名 |
| シンプルモード | マイチームが上 |
| 長いチーム名 | 省略の「…」の見え方。虹が乗るか、灰色になるか、消えないか |
| 保留アクションの展開 | マイチーム側のバッジを開くと画面の左端に寄る |
| スタメン選択 | マイチームのタブが先頭で、開いている |

**「…」の見え方は `text-overflow: ellipsis` と `background-clip: text` の併用でブラウザ差がある。** 消える・読めない場合は、`.is-my-team` に `text-overflow` を持たせず親要素へ移す、または長い名前では虹を諦めて `--text-primary` に落とすなどの対処を検討し、その判断を設計書へ追記する。

- [ ] **Step 4: 設計書に実機確認の結果を追記**

`docs/superpowers/specs/2026-09-20-my-team-visibility-design.md` の「虹色チーム名」節、`text-overflow: ellipsis` について「実機で確認してから確定する」と書いてある段落を、実際に見た結果へ置き換える。確認した端末・ブラウザ名と、「…」がどう見えたかを具体的に書く。

- [ ] **Step 5: Commit**

```bash
git add src/utils/matchTeams.ts docs/superpowers/specs/2026-09-20-my-team-visibility-design.md
git commit -m "docs: 位置固定にともなうコメント修正と実機確認の結果"
```

---

## 実装後に残る宿題

- **虹が出ない環境の実機確認はしていない。** `@supports` と `forced-colors` のフォールバックはコードとしては書くが、実際にその環境で見るのは別の機会になる。位置の固定が生きているので、出なくても致命的にはならない設計にしてある。
- **`TeamComparison` と `History` は様式どおりの並びのまま。** 試合後に「記録画面では左だったチームが、比較画面では右」という食い違いは残る。設計上の意図的な線引きであり、使ってみて不便なら別途扱う。
