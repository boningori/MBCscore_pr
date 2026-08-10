# スタメン選択画面のチームタブ化 Implementation Plan

> **状態: 実装完了** — main に取り込み済み。実装は本計画の追加コミット `a7919c1`（2026-07-27）以降のコミット群にあたる。
> 以下のチェックボックスは実行時に更新していないため未チェックのまま残っている。**残作業の指標として読まないこと。**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** クォーター開始時のスタメン選択を白→青の固定順から、タブでどちらからでも登録できる形に変える。

**Architecture:** 現在 `QuarterLineup` が持つ「1チーム分の選択UI」を表示専用の `LineupTeamPanel` に切り出し、`QuarterLineup` は白・青**両方**の選択状態とタブを管理するコンテナにする。`App` は2ステップ進行（`lineupTeamId`）をやめ、表示中タブ（`lineupTab`）を保持するだけにして、開始時に両チームを1回の `SET_TEAMS` で反映する。

**Tech Stack:** React 19 + TypeScript + Vite / Vitest + @testing-library/react / 素のCSS（CSS変数）

## Global Constraints

- 白チーム = `teamA`、青チーム = `teamB` の固定割り当ては変更しない（`App.tsx:161` 付近）。
- チームの色ラベルは `team.color`（`'white' | 'blue'`）から決める。`'white'` → 「白」、`'blue'` → 「青」。
- ミニバス出場ルールの目安（最低2Q・最大3Q・全員出場）は**非強制**。警告表示のみで開始をブロックしない。
- 1チームのコート上人数は `PLAYERS_ON_COURT`（= 5）。ハードコードせず定数を使う。
- 5ファウル退場者（`p.fouls.length >= 5`）は選択候補に出さない。
- `src/context/reducers/gameFlowHandlers.ts` は変更しない。一括dispatchにより「片方だけ確定済み」の中間状態は発生しなくなるが、`gameFlowHandlers.ts:104` の打ち消し処理は他のUndo経路の保険としてそのまま残す。
- インデントは4スペース（`src/components/` の既存ファイルに合わせる）。`App.tsx` は2スペース。
- CSSは `.quarter-lineup` を先頭に付けた詳細度で書く（既存ファイルの慣習）。
- 検証コマンド: `npm test` / `npm run lint` / `npm run build`

## File Structure

| ファイル | 責務 |
|---|---|
| `src/components/QuarterLineup/LineupTeamPanel.tsx`（新規） | 1チーム分の選手カードグリッドと出場ルールの目安表示。状態を持たない表示専用 |
| `src/components/QuarterLineup/QuarterLineup.tsx`（改修） | 両チームの選択状態、タブ、ヘッダー、開始ボタンを持つコンテナ |
| `src/components/QuarterLineup/QuarterLineup.css`（追記） | タブバーと未完了ヒントのスタイル |
| `src/components/QuarterLineup/QuarterLineup.test.tsx`（書き換え） | コンテナ経由の振る舞いテスト |
| `src/App.tsx`（改修） | `lineupTab` の保持、両チーム一括反映、画面配線 |

---

### Task 1: LineupTeamPanel の切り出し（挙動不変のリファクタ）

`QuarterLineup.tsx` の96〜189行目（選択件数表示・前Q出場・選手カードグリッド・出場ルールの目安）を、状態を持たない `LineupTeamPanel` に移す。この時点では `QuarterLineup` の props も画面の見た目も一切変えない。既存テストがそのまま通ることが完了の証拠になる。

**Files:**
- Create: `src/components/QuarterLineup/LineupTeamPanel.tsx`
- Modify: `src/components/QuarterLineup/QuarterLineup.tsx`
- Test: `src/components/QuarterLineup/QuarterLineup.test.tsx`（変更しない）

**Interfaces:**
- Consumes: `Player`, `PLAYERS_ON_COURT`（`src/types/game.ts`）、`formatPlayerNumber`（`src/utils/playerNumber.ts`）
- Produces: `LineupTeamPanel(props: { quarter: number; players: Player[]; selectedIds: string[]; onToggle: (playerId: string) => void }): JSX.Element` — Task 2 が使う

- [ ] **Step 1: 既存テストが緑であることを先に確認する**

Run: `npm test -- src/components/QuarterLineup/QuarterLineup.test.tsx`
Expected: PASS（5テスト）。リファクタ前の基準点なので、ここが赤なら先に原因を調べる。

- [ ] **Step 2: `LineupTeamPanel.tsx` を新規作成する**

`src/components/QuarterLineup/LineupTeamPanel.tsx`:

```tsx
import type { Player } from '../../types/game';
import { PLAYERS_ON_COURT } from '../../types/game';
import { formatPlayerNumber } from '../../utils/playerNumber';

interface LineupTeamPanelProps {
    quarter: number;
    players: Player[];
    selectedIds: string[];
    onToggle: (playerId: string) => void;
}

/** 1チーム分のスタメン選択パネル。状態を持たない表示専用コンポーネント */
export function LineupTeamPanel({ quarter, players, selectedIds, onToggle }: LineupTeamPanelProps) {
    // 出場可能な選手（5ファウル退場していない）
    const availablePlayers = players.filter(p => p.fouls.length < 5);

    // 前クォーター出場者
    const previousQuarterPlayers = players.filter(
        p => !!p.quartersPlayed[quarter - 2] && quarter > 1
    );

    // ミニバス出場ルールの「目安」（Q1〜Q4が対象・非強制）
    const isRegularQuarter = quarter <= 4;
    // 各選手がこれまでに出場した通常クォーター数（OTは除外）
    const regularQuartersPlayed = (p: Player) =>
        p.quartersPlayed.slice(0, 4).filter(Boolean).length;
    // 全員出場の目安: まだ1度も出場していない選手（背番号）
    const unplayedNumbers = players
        .filter(p => regularQuartersPlayed(p) === 0)
        .map(p => p.number);

    return (
        <>
            <div className="lineup-status">
                <span className={selectedIds.length === PLAYERS_ON_COURT ? 'complete' : 'incomplete'}>
                    {selectedIds.length} / {PLAYERS_ON_COURT} 名選択
                </span>
            </div>

            {quarter > 1 && previousQuarterPlayers.length > 0 && (
                <div className="previous-quarter-info">
                    <span className="text-muted">前Q出場: </span>
                    {previousQuarterPlayers.map(p => `#${formatPlayerNumber(p.number)}`).join(', ')}
                </div>
            )}

            <div className="player-selection-grid">
                {availablePlayers.map(player => {
                    const isSelected = selectedIds.includes(player.id);
                    const wasOnCourt = player.isOnCourt;

                    // 出場ルールの目安（非強制の警告表示）
                    const rq = regularQuartersPlayed(player);
                    const projected = rq + (isSelected && isRegularQuarter ? 1 : 0);
                    // このQに出すと4Q目になる（最大3Q超過）
                    const overMax = isRegularQuarter && projected > 3;
                    // 残りの通常クォーターを全て出ても2Qに届かない（最低2Q未達）
                    const potentialMax = rq + (isRegularQuarter ? 5 - quarter : 0);
                    const cannotReachMin = isRegularQuarter && potentialMax < 2;

                    return (
                        <button
                            type="button"
                            key={player.id}
                            className={`lineup-player-card ${isSelected ? 'selected' : ''} ${wasOnCourt ? 'was-on-court' : ''} ${overMax ? 'rule-over-max' : ''}`}
                            onClick={() => onToggle(player.id)}
                            aria-pressed={isSelected}
                        >
                            <div className="lineup-player-number">#{formatPlayerNumber(player.number)}</div>
                            <div className="lineup-player-name">
                                {player.name}
                                {player.isCaptain && <span className="captain-badge">C</span>}
                            </div>
                            <div className="lineup-player-stats">
                                <span className="stat-points">{player.stats.points}pts</span>
                                {player.fouls.length > 0 && (
                                    <span className={`stat-fouls ${player.fouls.length >= 4 ? 'warning' : ''}`}>
                                        F{player.fouls.length}
                                    </span>
                                )}
                            </div>
                            <div className="lineup-player-quarters">
                                {player.quartersPlayed.map((played, i) => {
                                    const q = i + 1;
                                    const label = q <= 4 ? `${q}` : (q === 5 ? 'OT' : `OT${q - 4}`);
                                    return (
                                        <span
                                            key={q}
                                            className={`quarter-dot ${played ? 'played' : ''} ${q === quarter ? 'current' : ''}`}
                                        >
                                            {label}
                                        </span>
                                    );
                                })}
                            </div>
                            {(overMax || cannotReachMin) && (
                                <div className="lineup-rule-chips">
                                    {overMax && <span className="lineup-rule-chip over-max">3Q超</span>}
                                    {cannotReachMin && <span className="lineup-rule-chip min-risk">2Q未達</span>}
                                </div>
                            )}
                            {isSelected && <div className="selection-check">✓</div>}
                        </button>
                    );
                })}
            </div>

            <div className="quarter-rule-hint">
                {isRegularQuarter && quarter >= 2 && unplayedNumbers.length > 0 && (
                    <p className="rule-warn">
                        ⚠ 未出場（全員出場の目安）: {unplayedNumbers.map(n => `#${formatPlayerNumber(n)}`).join(', ')}
                    </p>
                )}
                <p className="text-muted text-sm">
                    ※ ミニバスの目安: 各選手 最低2Q・最大3Q・全員出場（強制ではありません）
                </p>
            </div>
        </>
    );
}
```

- [ ] **Step 3: `QuarterLineup.tsx` から移した部分を削除し、`LineupTeamPanel` を呼ぶ形にする**

`src/components/QuarterLineup/QuarterLineup.tsx` を丸ごと以下に置き換える（props は現行のまま）:

```tsx
import { useState } from 'react';
import type { Player } from '../../types/game';
import { PLAYERS_ON_COURT } from '../../types/game';
import { LineupTeamPanel } from './LineupTeamPanel';
import './QuarterLineup.css';

interface QuarterLineupProps {
    quarter: number;
    teamName: string;
    players: Player[];
    onConfirm: (startingPlayerIds: string[]) => void;
    onBack?: () => void;
    /** 確定ボタンの文言（未指定時: Q1=試合開始 / Q2以降=Qx 開始）。
        1チーム目のスタメン選択では「次へ」系を渡し、実際の開始と区別する */
    confirmLabel?: string;
}

export function QuarterLineup({
    quarter,
    teamName,
    players,
    onConfirm,
    onBack,
    confirmLabel,
}: QuarterLineupProps) {
    const computeInitialSelected = () =>
        players
            .filter(p => p.isOnCourt && p.fouls.length < 5)
            .map(p => p.id);

    const [selectedIds, setSelectedIds] = useState<string[]>(computeInitialSelected);

    // チームまたはクォーターが変わったら選択をリセット
    // （レンダー中の状態調整。useEffectでのcascading render警告を避けるため）
    const [prevLineupKey, setPrevLineupKey] = useState({ teamName, quarter });
    if (teamName !== prevLineupKey.teamName || quarter !== prevLineupKey.quarter) {
        setPrevLineupKey({ teamName, quarter });
        setSelectedIds(computeInitialSelected());
    }

    const handlePlayerToggle = (playerId: string) => {
        if (selectedIds.includes(playerId)) {
            setSelectedIds(selectedIds.filter(id => id !== playerId));
        } else if (selectedIds.length < PLAYERS_ON_COURT) {
            setSelectedIds([...selectedIds, playerId]);
        }
    };

    const handleConfirm = () => {
        if (selectedIds.length === PLAYERS_ON_COURT) {
            onConfirm(selectedIds);
        }
    };

    const isValid = selectedIds.length === PLAYERS_ON_COURT;

    // クォーター色（1Q/3Qは赤、2Q/4Q/OTは黒）
    const isOT = quarter > 4;
    const quarterClass = isOT ? 'q-even' : (quarter === 1 || quarter === 3 ? 'q-odd' : 'q-even');
    const quarterLabel = isOT
        ? (quarter === 5 ? 'OT' : `OT${quarter - 4}`)
        : `Q${quarter}`;

    return (
        <div className="quarter-lineup">
            <div className="quarter-lineup-header">
                {onBack && (
                    <button className="btn btn-secondary" onClick={onBack}>
                        ← 戻る
                    </button>
                )}
                <div className={`quarter-badge ${quarterClass}`}>
                    {quarterLabel}
                </div>
                <h2>{teamName} スタメン選択</h2>
            </div>

            <LineupTeamPanel
                quarter={quarter}
                players={players}
                selectedIds={selectedIds}
                onToggle={handlePlayerToggle}
            />

            <div className="quarter-lineup-actions">
                <button
                    className="btn btn-success btn-large"
                    onClick={handleConfirm}
                    disabled={!isValid}
                >
                    {confirmLabel ?? (quarter === 1 ? '試合開始' : `${quarterLabel} 開始`)}
                </button>
            </div>
        </div>
    );
}
```

注意: 元ファイルでは開始ボタンが `quarter-rule-hint` より**上**にあったが、`quarter-rule-hint` はパネル側に移ったため、開始ボタンはパネルの後ろに来る。DOM順が変わるだけで既存テストの検証内容には影響しない。

- [ ] **Step 4: 既存テストが変わらず通ることを確認する**

Run: `npm test -- src/components/QuarterLineup/QuarterLineup.test.tsx`
Expected: PASS（5テスト。Step 1 と同じ結果）

- [ ] **Step 5: lint を通す**

Run: `npm run lint`
Expected: エラー 0件

- [ ] **Step 6: コミット**

```bash
git add src/components/QuarterLineup/LineupTeamPanel.tsx src/components/QuarterLineup/QuarterLineup.tsx && git commit -m "refactor(lineup): 1チーム分の選択UIをLineupTeamPanelに切り出し"
```

---

### Task 2: QuarterLineup のタブ式コンテナ化と App の配線

`QuarterLineup` の props を「1チーム」から「両チーム＋タブ」に変える。`App.tsx` の呼び出し側も同じタスクで直す（props が変わるため、分けると型エラーが残る）。

**Files:**
- Modify: `src/components/QuarterLineup/QuarterLineup.tsx`（全面書き換え）
- Modify: `src/App.tsx:83`, `src/App.tsx:188-189`, `src/App.tsx:605-645`, `src/App.tsx:656`, `src/App.tsx:918-936`
- Test: `src/components/QuarterLineup/QuarterLineup.test.tsx`（全面書き換え）

**Interfaces:**
- Consumes: `LineupTeamPanel`（Task 1）、`Team` / `Player` / `PLAYERS_ON_COURT`（`src/types/game.ts`）
- Produces:
  - `export type LineupTabId = 'teamA' | 'teamB'`
  - `QuarterLineup(props: { quarter: number; teamA: Team; teamB: Team; initialTab?: LineupTabId; onTabChange?: (tab: LineupTabId) => void; onStart: (selected: { teamA: string[]; teamB: string[] }) => void; onBack?: () => void }): JSX.Element`
  - `confirmLabel` / `teamName` / `players` / `onConfirm` props は**廃止**する

- [ ] **Step 1: テストを新しい仕様で書き換える**

`src/components/QuarterLineup/QuarterLineup.test.tsx` を丸ごと以下に置き換える:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QuarterLineup } from './QuarterLineup';
import { createPlayer, createTeam } from '../../types/game';
import type { Player, Team } from '../../types/game';

afterEach(cleanup);

function player(
    id: string,
    number: number,
    name: string,
    quartersPlayed: Player['quartersPlayed'],
    isOnCourt = false,
): Player {
    return { ...createPlayer(id, number, name), quartersPlayed, isOnCourt };
}

/** 未出場の5名を作る。選手名は `${label}1`〜`${label}5` */
function fivePlayers(label: string): Player[] {
    return [1, 2, 3, 4, 5].map(n =>
        player(`${label}${n}`, n, `${label}${n}`, [false, false, false, false]),
    );
}

function team(id: string, name: string, color: 'white' | 'blue', players: Player[]): Team {
    return { ...createTeam(id, name, ''), color, players };
}

const whiteTeam = (players: Player[] = fivePlayers('白')) =>
    team('teamA', '白チーム', 'white', players);
const blueTeam = (players: Player[] = fivePlayers('青')) =>
    team('teamB', '青チーム', 'blue', players);

/** 選手カード（role=button）をクリックして5名選ぶ */
function selectFive(label: string) {
    for (let n = 1; n <= 5; n++) {
        fireEvent.click(screen.getByRole('button', { name: new RegExp(`${label}${n}`) }));
    }
}

describe('QuarterLineup チームタブ', () => {
    it('青タブから先に5名選んでも、白を選び終えれば開始でき、両チームのIDが1回で渡る', () => {
        const onStart = vi.fn();
        render(
            <QuarterLineup quarter={1} teamA={whiteTeam()} teamB={blueTeam()} onStart={onStart} />,
        );

        // 先に青から登録する
        fireEvent.click(screen.getByRole('tab', { name: /青/ }));
        selectFive('青');
        // 片方だけでは開始できない
        expect((screen.getByRole('button', { name: '試合開始' }) as HTMLButtonElement).disabled).toBe(true);

        fireEvent.click(screen.getByRole('tab', { name: /白/ }));
        selectFive('白');

        const startBtn = screen.getByRole('button', { name: '試合開始' }) as HTMLButtonElement;
        expect(startBtn.disabled).toBe(false);
        fireEvent.click(startBtn);

        expect(onStart).toHaveBeenCalledTimes(1);
        expect(onStart.mock.calls[0][0]).toEqual({
            teamA: ['白1', '白2', '白3', '白4', '白5'],
            teamB: ['青1', '青2', '青3', '青4', '青5'],
        });
    });

    it('タブを往復しても選択は保持される', () => {
        render(
            <QuarterLineup quarter={1} teamA={whiteTeam()} teamB={blueTeam()} onStart={() => {}} />,
        );

        fireEvent.click(screen.getByRole('button', { name: /白1/ }));
        expect(screen.getByRole('button', { name: /白1/ }).getAttribute('aria-pressed')).toBe('true');

        fireEvent.click(screen.getByRole('tab', { name: /青/ }));
        fireEvent.click(screen.getByRole('tab', { name: /白/ }));

        expect(screen.getByRole('button', { name: /白1/ }).getAttribute('aria-pressed')).toBe('true');
    });

    it('片方だけ5名のときは開始できず、未完了チームの色ラベルと人数を表示する', () => {
        render(
            <QuarterLineup quarter={2} teamA={whiteTeam()} teamB={blueTeam()} onStart={() => {}} />,
        );

        selectFive('白');

        expect((screen.getByRole('button', { name: 'Q2 開始' }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText('青のスタメンが未選択です（0/5）')).toBeTruthy();
        expect(screen.queryByText(/白のスタメンが未選択です/)).toBeNull();
    });

    it('initialTab に teamB を渡すと青タブが選択された状態で始まる', () => {
        render(
            <QuarterLineup
                quarter={1}
                teamA={whiteTeam()}
                teamB={blueTeam()}
                initialTab="teamB"
                onStart={() => {}}
            />,
        );

        expect(screen.getByRole('tab', { name: /青/ }).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByRole('tab', { name: /白/ }).getAttribute('aria-selected')).toBe('false');
        // 青チームの選手が表示されている
        expect(screen.getByRole('button', { name: /青1/ })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /白1/ })).toBeNull();
    });

    it('タブ切替で onTabChange が新しいタブIDで呼ばれる', () => {
        const onTabChange = vi.fn();
        render(
            <QuarterLineup
                quarter={1}
                teamA={whiteTeam()}
                teamB={blueTeam()}
                onTabChange={onTabChange}
                onStart={() => {}}
            />,
        );

        fireEvent.click(screen.getByRole('tab', { name: /青/ }));
        expect(onTabChange).toHaveBeenCalledWith('teamB');
    });

    it('タブに各チームの選択状況を表示する', () => {
        render(
            <QuarterLineup quarter={1} teamA={whiteTeam()} teamB={blueTeam()} onStart={() => {}} />,
        );

        selectFive('白');

        expect(screen.getByRole('tab', { name: /白/ }).textContent).toContain('5/5');
        expect(screen.getByRole('tab', { name: /青/ }).textContent).toContain('0/5');
    });
});

describe('QuarterLineup 出場ルールの目安（非強制の警告表示）', () => {
    it('Q1では警告チップも未出場バナーも表示しない', () => {
        render(
            <QuarterLineup quarter={1} teamA={whiteTeam()} teamB={blueTeam()} onStart={() => {}} />,
        );

        expect(screen.queryByText('3Q超')).toBeNull();
        expect(screen.queryByText('2Q未達')).toBeNull();
        expect(screen.queryByText(/未出場（全員出場の目安）/)).toBeNull();
    });

    it('Q4: 既に3Q出場済みの選手を出そうとすると「3Q超」、未出場の選手は「2Q未達」＋未出場バナー', () => {
        const players = [
            // Q1-Q3出場済み・コート上（初期選択される）→ 4Q目で最大3Q超過
            player('heavy', 5, '白5', [true, true, true, false], true),
            // 2Q出場済み → 違反なし（誤検知しないこと）
            player('normal', 6, '白6', [true, true, false, false], true),
            // 未出場 → 残り1Qでは2Qに届かない ＋ 全員出場の目安に該当
            player('bench', 9, '白9', [false, false, false, false], false),
        ];
        render(
            <QuarterLineup
                quarter={4}
                teamA={whiteTeam(players)}
                teamB={blueTeam()}
                onStart={() => {}}
            />,
        );

        // 「3Q超」はheavyの1件のみ
        expect(screen.getAllByText('3Q超')).toHaveLength(1);
        // 「2Q未達」はbenchの1件のみ
        expect(screen.getAllByText('2Q未達')).toHaveLength(1);
        // 全員出場の目安バナーに #9 が含まれる
        expect(screen.getByText(/未出場（全員出場の目安）/).textContent).toContain('#9');
    });

    it('警告があっても開始ボタンはブロックしない（強制しない）', () => {
        // 5名ちょうどでスタメンが揃えば、ルール警告に関わらず開始可能
        const heavyPlayers = [
            player('heavy', 5, '白5', [true, true, true, false], true),
            player('p6', 6, '白6', [true, false, false, false], true),
            player('p7', 7, '白7', [false, true, false, false], true),
            player('p8', 8, '白8', [true, false, false, false], true),
            player('p9', 9, '白9', [false, true, false, false], true),
        ];
        const bluePlayers = fivePlayers('青').map(p => ({ ...p, isOnCourt: true }));
        render(
            <QuarterLineup
                quarter={4}
                teamA={whiteTeam(heavyPlayers)}
                teamB={blueTeam(bluePlayers)}
                onStart={() => {}}
            />,
        );

        // 「3Q超」の警告は出るが…
        expect(screen.getByText('3Q超')).toBeTruthy();
        // 開始ボタンは押下可能（disabledでない）
        const startBtn = screen.getByRole('button', { name: 'Q4 開始' }) as HTMLButtonElement;
        expect(startBtn.disabled).toBe(false);
    });
});

describe('QuarterLineup 開始ボタンのラベル', () => {
    it('Q1は「試合開始」、Q3以降は「Qx 開始」、OTは「OT 開始」', () => {
        const { unmount } = render(
            <QuarterLineup quarter={1} teamA={whiteTeam()} teamB={blueTeam()} onStart={() => {}} />,
        );
        expect(screen.getByRole('button', { name: '試合開始' })).toBeTruthy();
        unmount();

        const q3 = render(
            <QuarterLineup quarter={3} teamA={whiteTeam()} teamB={blueTeam()} onStart={() => {}} />,
        );
        expect(screen.getByRole('button', { name: 'Q3 開始' })).toBeTruthy();
        q3.unmount();

        render(
            <QuarterLineup quarter={5} teamA={whiteTeam()} teamB={blueTeam()} onStart={() => {}} />,
        );
        expect(screen.getByRole('button', { name: 'OT 開始' })).toBeTruthy();
    });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- src/components/QuarterLineup/QuarterLineup.test.tsx`
Expected: FAIL。`teamA` / `onStart` などの props が現行の型に無いため、`teamName` 未定義由来のエラーや `Unable to find an accessible element with the role "tab"` が出る。

- [ ] **Step 3: `QuarterLineup.tsx` をタブ式コンテナに書き換える**

`src/components/QuarterLineup/QuarterLineup.tsx` を丸ごと以下に置き換える:

```tsx
import { useState } from 'react';
import type { Player, Team } from '../../types/game';
import { PLAYERS_ON_COURT } from '../../types/game';
import { LineupTeamPanel } from './LineupTeamPanel';
import './QuarterLineup.css';

export type LineupTabId = 'teamA' | 'teamB';

interface QuarterLineupProps {
    quarter: number;
    /** 白チーム（App側で teamA=白 に固定されている） */
    teamA: Team;
    /** 青チーム */
    teamB: Team;
    /** 初期表示タブ（省略時は teamA） */
    initialTab?: LineupTabId;
    /** タブ切替時に呼ばれる。App側が次回の初期タブとして保持する */
    onTabChange?: (tab: LineupTabId) => void;
    /** 両チーム5名揃った状態で開始したときに1回だけ呼ばれる */
    onStart: (selected: { teamA: string[]; teamB: string[] }) => void;
    onBack?: () => void;
}

/** コート上かつ5ファウル未満の選手を初期選択にする */
const initialSelection = (players: Player[]) =>
    players.filter(p => p.isOnCourt && p.fouls.length < 5).map(p => p.id);

const TAB_IDS: LineupTabId[] = ['teamA', 'teamB'];

export function QuarterLineup({
    quarter,
    teamA,
    teamB,
    initialTab = 'teamA',
    onTabChange,
    onStart,
    onBack,
}: QuarterLineupProps) {
    const computeInitialSelected = () => ({
        teamA: initialSelection(teamA.players),
        teamB: initialSelection(teamB.players),
    });

    const [activeTab, setActiveTab] = useState<LineupTabId>(initialTab);
    const [selected, setSelected] = useState<Record<LineupTabId, string[]>>(computeInitialSelected);

    // クォーターが変わったら両チームの選択をリセット
    // （レンダー中の状態調整。useEffectでのcascading render警告を避けるため）
    const [prevQuarter, setPrevQuarter] = useState(quarter);
    if (quarter !== prevQuarter) {
        setPrevQuarter(quarter);
        setSelected(computeInitialSelected());
    }

    const teams: Record<LineupTabId, Team> = { teamA, teamB };
    const colorLabel = (team: Team) => (team.color === 'white' ? '白' : '青');
    const isComplete = (tab: LineupTabId) => selected[tab].length === PLAYERS_ON_COURT;

    const handleToggle = (playerId: string) => {
        setSelected(prev => {
            const ids = prev[activeTab];
            if (ids.includes(playerId)) {
                return { ...prev, [activeTab]: ids.filter(id => id !== playerId) };
            }
            if (ids.length >= PLAYERS_ON_COURT) {
                return prev;
            }
            return { ...prev, [activeTab]: [...ids, playerId] };
        });
    };

    const handleTabClick = (tab: LineupTabId) => {
        setActiveTab(tab);
        onTabChange?.(tab);
    };

    const isValid = isComplete('teamA') && isComplete('teamB');

    const handleStart = () => {
        if (isValid) {
            onStart({ teamA: selected.teamA, teamB: selected.teamB });
        }
    };

    // 未完了チームの案内（開始ボタンが無効な理由）
    const incompleteMessage = TAB_IDS
        .filter(tab => !isComplete(tab))
        .map(tab => `${colorLabel(teams[tab])}のスタメンが未選択です（${selected[tab].length}/${PLAYERS_ON_COURT}）`)
        .join(' / ');

    // クォーター色（1Q/3Qは赤、2Q/4Q/OTは黒）
    const isOT = quarter > 4;
    const quarterClass = isOT ? 'q-even' : (quarter === 1 || quarter === 3 ? 'q-odd' : 'q-even');
    const quarterLabel = isOT
        ? (quarter === 5 ? 'OT' : `OT${quarter - 4}`)
        : `Q${quarter}`;

    return (
        <div className="quarter-lineup">
            <div className="quarter-lineup-header">
                {onBack && (
                    <button className="btn btn-secondary" onClick={onBack}>
                        ← 戻る
                    </button>
                )}
                <div className={`quarter-badge ${quarterClass}`}>
                    {quarterLabel}
                </div>
                <h2>スタメン選択</h2>
            </div>

            {/* 白（teamA）が左・青（teamB）が右で固定。どちらからでも登録できる */}
            <div className="lineup-team-tabs" role="tablist">
                {TAB_IDS.map(tab => {
                    const team = teams[tab];
                    const count = selected[tab].length;
                    const done = isComplete(tab);
                    return (
                        <button
                            key={tab}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tab}
                            className={`lineup-team-tab ${team.color} ${activeTab === tab ? 'active' : ''} ${done ? 'complete' : ''}`}
                            onClick={() => handleTabClick(tab)}
                        >
                            <span className="lineup-team-tab-name">
                                <span className="lineup-team-tab-color">{colorLabel(team)}</span>
                                {team.name}
                            </span>
                            <span className="lineup-team-tab-count">
                                {count}/{PLAYERS_ON_COURT}{done ? ' ✓' : ''}
                            </span>
                        </button>
                    );
                })}
            </div>

            <LineupTeamPanel
                quarter={quarter}
                players={teams[activeTab].players}
                selectedIds={selected[activeTab]}
                onToggle={handleToggle}
            />

            <div className="quarter-lineup-actions">
                <button
                    className="btn btn-success btn-large"
                    onClick={handleStart}
                    disabled={!isValid}
                >
                    {quarter === 1 ? '試合開始' : `${quarterLabel} 開始`}
                </button>
            </div>

            {!isValid && <p className="lineup-incomplete-hint">{incompleteMessage}</p>}
        </div>
    );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/components/QuarterLineup/QuarterLineup.test.tsx`
Expected: PASS（10テスト）

- [ ] **Step 5: `App.tsx` の state 名を `lineupTab` に変える**

`src/App.tsx:83` を置き換える:

```tsx
  const [lineupTab, setLineupTab] = useState<'teamA' | 'teamB'>('teamA');
```

`src/App.tsx:188-189` を置き換える:

```tsx
    // Q1スタメン選択画面へ（新規試合は白タブから）
    setLineupTab('teamA');
```

`src/App.tsx:656`（`handleQuarterEnd` の中）から `setLineupTeamId('teamA');` の**1行を削除**する。削除後の `handleQuarterEnd` は次のようになる:

```tsx
  // クォーター終了時にスタメン選択へ
  const handleQuarterEnd = useCallback(() => {
    if (currentQuarter >= 4) {
      const scoreA = state.teamA.players.reduce((sum, p) => sum + p.stats.points, 0);
      const scoreB = state.teamB.players.reduce((sum, p) => sum + p.stats.points, 0);
      setEndGameConfirmType(scoreA === scoreB ? 'tied' : 'notTied');
      return;
    }
    dispatch({ type: 'END_QUARTER' });
    setScreen('quarterLineup');
  }, [currentQuarter, dispatch, state.teamA, state.teamB]);
```

- [ ] **Step 6: `handleLineupConfirm` を `handleLineupStart` に置き換える**

`src/App.tsx:605-645` の `handleLineupConfirm` 全体を以下に置き換える:

```tsx
  // クォーター開始時のスタメン確定（白・青まとめて1回で反映）
  const handleLineupStart = (selected: { teamA: string[]; teamB: string[] }) => {
    // 選択された選手をコート上に、それ以外をベンチに設定
    const updatePlayers = (team: Team, startingPlayerIds: string[]) => ({
      ...team,
      players: team.players.map(p => ({
        ...p,
        isOnCourt: startingPlayerIds.includes(p.id),
        // 出場クォーターを記録
        quartersPlayed: p.quartersPlayed.map((played, i) =>
          i === currentQuarter - 1 ? (startingPlayerIds.includes(p.id) ? true : played) : played
        ),
      })),
    });

    dispatch({
      type: 'SET_TEAMS',
      payload: {
        teamA: updatePlayers(state.teamA, selected.teamA),
        teamB: updatePlayers(state.teamB, selected.teamB),
      },
    });

    setScreen('game');
    // phase が 'setup' または 'quarterEnd' の場合、START_GAME を呼び出して playing に遷移
    if (phase === 'setup' || phase === 'quarterEnd') {
      dispatch({ type: 'START_GAME' });
    }
  };
```

- [ ] **Step 7: 画面のレンダリングを新しい props に合わせる**

`src/App.tsx:918-936` の `quarterLineup` ブロックを以下に置き換える:

```tsx
  // クォーターごとのスタメン選択画面
  if (screen === 'quarterLineup') {
    return (
      <QuarterLineup
        quarter={currentQuarter}
        teamA={state.teamA}
        teamB={state.teamB}
        initialTab={lineupTab}
        onTabChange={setLineupTab}
        onStart={handleLineupStart}
        // 戻る先: 試合前なら設定へ・試合中ならゲーム画面へ（Q終了の取り消しが可能）
        onBack={phase === 'setup' ? () => setScreen('gameSetup') : () => setScreen('game')}
      />
    );
  }
```

- [ ] **Step 8: `lineupTeamId` の残骸が無いことを確認する**

Run: `npx rg -n "lineupTeamId|confirmLabel|handleLineupConfirm" src/`
Expected: 出力なし（0件）。残っていれば削除する。

- [ ] **Step 9: 型チェックとテスト全体を通す**

Run: `npm run build`
Expected: 型エラーなしでビルド成功

Run: `npm test`
Expected: 全テスト PASS

Run: `npm run lint`
Expected: エラー 0件

- [ ] **Step 10: コミット**

```bash
git add src/components/QuarterLineup/QuarterLineup.tsx src/components/QuarterLineup/QuarterLineup.test.tsx src/App.tsx && git commit -m "feat(lineup): スタメン選択を白/青のタブ式にし登録順の制約を解消"
```

---

### Task 3: タブのスタイルと実機確認

タブと未完了ヒントの見た目を整える。ここまで動作は完成しているので、このタスクは表示のみを扱う。

**Files:**
- Modify: `src/components/QuarterLineup/QuarterLineup.css`（末尾に追記）

**Interfaces:**
- Consumes: Task 2 で導入したクラス名 — `lineup-team-tabs` / `lineup-team-tab`（修飾子 `white` `blue` `active` `complete`）/ `lineup-team-tab-name` / `lineup-team-tab-color` / `lineup-team-tab-count` / `lineup-incomplete-hint`
- Produces: なし（このタスクが最後）

- [ ] **Step 1: CSS を追記する**

`src/components/QuarterLineup/QuarterLineup.css` の**末尾**に以下を追記する:

```css
/* チームタブ（白/青のどちらからでも登録できる） */
.quarter-lineup .lineup-team-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-md);
}

.quarter-lineup .lineup-team-tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--bg-secondary);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font: inherit;
    color: inherit;
    transition: all var(--transition-fast);
}

.quarter-lineup .lineup-team-tab:active {
    transform: scale(0.98);
}

.quarter-lineup .lineup-team-tab.white.active {
    border-color: var(--team-white);
    background: var(--team-white-bg);
}

.quarter-lineup .lineup-team-tab.blue.active {
    border-color: var(--team-blue);
    background: var(--team-blue-bg);
}

.quarter-lineup .lineup-team-tab-name {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-weight: 700;
}

.quarter-lineup .lineup-team-tab-color {
    padding: 0 6px;
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    font-weight: 800;
}

.quarter-lineup .lineup-team-tab.white .lineup-team-tab-color {
    background: var(--team-white);
    color: #1f2937;
}

.quarter-lineup .lineup-team-tab.blue .lineup-team-tab-color {
    background: var(--team-blue);
    color: white;
}

.quarter-lineup .lineup-team-tab-count {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-muted);
}

.quarter-lineup .lineup-team-tab.complete .lineup-team-tab-count {
    color: var(--secondary-light);
}

.quarter-lineup .lineup-incomplete-hint {
    text-align: center;
    color: var(--warning);
    font-size: var(--font-size-sm);
    font-weight: 600;
    margin-bottom: var(--spacing-md);
}
```

- [ ] **Step 2: 開発サーバーで実機確認する**

`.claude/launch.json` には既に `dev`（`npm run dev` / port 5173）の設定がある。この `dev` でプレビューを起動する（`launch.json` は変更しない）。

確認する項目:
1. 試合設定を終えてスタメン選択画面に入ると、白タブが選択されている
2. 青タブを押すと青チームの選手が表示され、そのまま5名選べる
3. 白タブに戻って5名選ぶと「Q1 …」ではなく「試合開始」が有効になる
4. 片方だけのときボタン下に「青のスタメンが未選択です（0/5）」等が出る
5. タブに `5/5 ✓` と `0/5` が表示される
6. Q1を青タブで終えた後、Q2の選択画面が青タブで開く

- [ ] **Step 3: スクリーンショットを撮って共有する**

タブが2つ並び、片方が `5/5 ✓`、開始ボタンが無効で未完了ヒントが出ている状態を撮る。

- [ ] **Step 4: 最終確認**

Run: `npm test`
Expected: 全テスト PASS

Run: `npm run lint`
Expected: エラー 0件

Run: `npm run build`
Expected: 成功

- [ ] **Step 5: コミット**

```bash
git add src/components/QuarterLineup/QuarterLineup.css && git commit -m "style(lineup): チームタブと未完了ヒントのスタイルを追加"
```

---

## 完了条件

- 白・青どちらのタブからでもスタメンを登録でき、順序の制約がない
- 両チーム5名揃うまで開始できず、揃っていないチームが画面上で分かる
- 一度青タブを開いたら、以降のクォーターも青タブで開く
- `npm test` / `npm run lint` / `npm run build` がすべて通る
