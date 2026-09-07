# 複数人の一括交代 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交代モーダルで、ベンチとコートから同数の選手を選んでまとめて交代できるようにする。

**Architecture:** `SubstitutionModal` の選択状態を単数から配列に変え、確定時に既存の `onSubstitute(playerInId, playerOutId)` を人数分呼ぶ。`SUBSTITUTE_PLAYER` アクション・reducer・`App.tsx` は無改修。あわせて表示をコートネーム優先に揃え、見出しを選手カードと見分けられるラベルにし、スマホではベンチも2列にする。

**Tech Stack:** React 19 + TypeScript + Vite / Vitest + @testing-library/react / プレーンCSS（`src/index.css` のデザイントークン）

**設計書:** [docs/superpowers/specs/2026-09-07-bulk-substitution-design.md](../specs/2026-09-07-bulk-substitution-design.md)

## Global Constraints

- 選手の表示名は `player.courtName || player.name`。アプリ全体の既定の書き方（`Scoreboard` `TeamPanel` `ActionHistory` `FoulInputFlow` `EditActionModal` `useFoulOutNotice` `App.tsx`）。フォールバックを外さない（対戦相手には `courtName` が無い）
- 背番号の表示は必ず `formatPlayerNumber()`。並べ替えは `comparePlayerNumbers()`。独自ソートを書かない
- **`onSubstitute` の型を変えない**: `(playerInId: string, playerOutId: string) => void`。`App.tsx` と reducer は無改修
- **確定ボタンのラベルは `交代実行` のまま**。既存テストが `getByRole('button', { name: '交代実行' })` で引いている
- 交代は履歴に残らない（`handleSubstitutePlayer` は `isOnCourt` と `quartersPlayed` だけ書き換える）。組み合わせはどこにも保存されないので、順序は表示を安定させるためだけに決める
- CSSは `src/index.css` に実在するトークンのみ。`--font-size-base` は**無い**（`--font-size-sm` / `--font-size-md` / `--font-size-lg` / `--font-size-xl` はある）
- 退場バッジ（`.sub-player-fouled-out`）はどの幅でも消さない。失格者をIN候補から外さない代わりに併記する既存方針の要
- コメントは日本語で「なぜ」を書く。周囲の流儀に合わせる
- インデントは4スペース
- テストの実行: `npx vitest run <path>`

---

### Task 1: 表示をコートネーム優先にする

**Files:**
- Modify: `src/components/SubstitutionModal/SubstitutionModal.tsx`
- Test: `src/components/SubstitutionModal/SubstitutionModal.test.tsx`

**Interfaces:**
- Consumes: `Player` 型の `courtName?: string`
- Produces: `displayName(player: Player): string` — このファイル内のモジュールスコープ関数。以降のタスクが実行結果の表示でも使う

- [ ] **Step 1: 失敗するテストを書く**

`src/components/SubstitutionModal/SubstitutionModal.test.tsx` の末尾に追記する:

```tsx
// 交代は背番号で認識する。氏名（フルネーム）ではなくコートネームを出す。
// courtName || name はアプリ全体の既定（Scoreboard / TeamPanel / ActionHistory ほか）で、
// 素の name を出していたのはこのモーダルだけだった
describe('SubstitutionModal 表示名', () => {
    const named = (id: string, number: number, name: string, courtName: string | undefined, isOnCourt: boolean): Player => ({
        ...player(id, number, name, isOnCourt),
        courtName,
    });

    it('コートネームがあればコートネームを出す（コート・ベンチとも）', () => {
        renderModal([
            named('a', 4, '山田太郎', 'タロウ', true),
            named('x', 10, '鈴木一郎', 'イチ', false),
        ]);

        expect(screen.getByRole('button', { name: /タロウ/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /イチ/ })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /山田太郎/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /鈴木一郎/ })).toBeNull();
    });

    it('コートネームが無ければ氏名に落ちる（対戦相手には courtName が無い）', () => {
        renderModal([
            named('a', 4, '山田太郎', undefined, true),
            named('x', 10, '鈴木一郎', undefined, false),
        ]);

        expect(screen.getByRole('button', { name: /山田太郎/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /鈴木一郎/ })).toBeTruthy();
    });

    it('実行結果の表示もコートネームを使う', () => {
        renderModal([
            named('a', 4, '山田太郎', 'タロウ', true),
            named('x', 10, '鈴木一郎', 'イチ', false),
        ]);

        fireEvent.click(screen.getByRole('button', { name: /タロウ/ }));
        fireEvent.click(screen.getByRole('button', { name: /イチ/ }));
        fireEvent.click(screen.getByRole('button', { name: '交代実行' }));

        expect(document.querySelector('.substitution-note-pair')?.textContent)
            .toBe('#4 タロウ → #10 イチ');
    });
});
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx vitest run src/components/SubstitutionModal/SubstitutionModal.test.tsx
```

Expected: 「コートネームがあればコートネームを出す」と「実行結果の表示もコートネームを使う」が FAIL（`山田太郎` が出てしまう / 案内が `#4 山田太郎 → #10 鈴木一郎` になる）。「コートネームが無ければ氏名に落ちる」は PASS。

- [ ] **Step 3: 実装する**

`SubstitutionModal.tsx` の `interface SubstitutionModalProps` の直前に、モジュールスコープの関数を足す:

```tsx
/**
 * 画面に出す名前。コートネームがあればそれを使う。
 *
 * 交代は背番号で認識するので、要るのはフルネームではなく呼び名。
 * `courtName || name` はアプリ全体の既定（Scoreboard / TeamPanel /
 * ActionHistory / FoulInputFlow ほか）で、素の name を出していたのは
 * このモーダルだけだった。
 * フォールバックは外さない。courtName はマイチーム管理でしか設定できず、
 * 対戦相手の選手には無いため、消すと番号だけのカードが並ぶ。
 */
const displayName = (player: Player) => player.courtName || player.name;
```

つづいて3か所を差し替える。

コート側の一覧（`.sub-player-name`）:

```tsx
                                    <span className="sub-player-name">{displayName(player)}</span>
```

ベンチ側の一覧（`.sub-player-name`）も同じ形に差し替える。

`handleConfirm` の中の `setLastDone(...)` を差し替える:

```tsx
        if (out && into) {
            setLastDone(
                `#${formatPlayerNumber(out.number)} ${displayName(out)} → #${formatPlayerNumber(into.number)} ${displayName(into)}`,
            );
        }
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/components/SubstitutionModal/
```

Expected: PASS。既存テストも全て緑（既存テストの選手には `courtName` が無いので氏名にフォールバックし、`getByRole('button', { name: /コートA/ })` などはそのまま通る）。

- [ ] **Step 5: コミット**

```bash
git add src/components/SubstitutionModal/
git commit -m "fix(substitution): 交代モーダルの表示をコートネーム優先にする

交代は背番号で認識するので、要るのはフルネームではなく呼び名。
courtName || name はアプリ全体の既定で、素の name を出していたのは
このモーダルだけだった。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 複数選択と一括実行

**Files:**
- Modify: `src/components/SubstitutionModal/SubstitutionModal.tsx`
- Test: `src/components/SubstitutionModal/SubstitutionModal.test.tsx`

**Interfaces:**
- Consumes: Task 1 の `displayName`
- Produces: コンポーネント内の以下。Task 3 の見出しが参照する
  - `playersOut: string[]` / `playersIn: string[]` — 選択中の選手ID
  - `canSubstitute: boolean` — 実行できるか（両方1人以上かつ同数）
  - `countsMatch: boolean` — `playersOut.length === playersIn.length`
- 公開 props は変更なし（`onSubstitute` の型も呼ばれ方も同じ。人数分呼ばれる点だけが変わる）

- [ ] **Step 1: 失敗するテストを書く**

`SubstitutionModal.test.tsx` の末尾に追記する:

```tsx
// バスケではタイムアウト明けに複数人まとめて替えるのが普通で、コーチの指示も
// 「4番と5番を下げて9番と10番を入れて」とまとめて来る。1組ずつに分解させない
describe('SubstitutionModal 一括交代', () => {
    const roster5 = () => [
        player('a', 4, 'コートA', true),
        player('b', 5, 'コートB', true),
        player('c', 6, 'コートC', true),
        player('x', 10, 'ベンチX', false),
        player('y', 11, 'ベンチY', false),
        player('z', 12, 'ベンチZ', false),
    ];

    const confirmBtn = () => screen.getByRole('button', { name: '交代実行' }) as HTMLButtonElement;
    const card = (name: string) => screen.getByRole('button', { name: new RegExp(name) });

    it('コート・ベンチとも複数選べ、もう一度タップで外れる', () => {
        renderModal(roster5());

        fireEvent.click(card('コートA'));
        fireEvent.click(card('コートB'));
        expect(card('コートA').getAttribute('aria-pressed')).toBe('true');
        expect(card('コートB').getAttribute('aria-pressed')).toBe('true');

        fireEvent.click(card('コートA'));
        expect(card('コートA').getAttribute('aria-pressed')).toBe('false');
        expect(card('コートB').getAttribute('aria-pressed')).toBe('true');
    });

    it('人数が違うあいだは実行できない（コートが多い場合）', () => {
        renderModal(roster5());

        fireEvent.click(card('コートA'));
        fireEvent.click(card('コートB'));
        fireEvent.click(card('ベンチX'));

        expect(confirmBtn().disabled).toBe(true);
    });

    it('人数が違うあいだは実行できない（ベンチが多い場合）', () => {
        renderModal(roster5());

        fireEvent.click(card('コートA'));
        fireEvent.click(card('ベンチX'));
        fireEvent.click(card('ベンチY'));

        expect(confirmBtn().disabled).toBe(true);
    });

    it('同数にすると実行できるようになる', () => {
        renderModal(roster5());

        fireEvent.click(card('コートA'));
        fireEvent.click(card('コートB'));
        fireEvent.click(card('ベンチX'));
        expect(confirmBtn().disabled).toBe(true);

        fireEvent.click(card('ベンチY'));
        expect(confirmBtn().disabled).toBe(false);
    });

    it('3人まとめて実行すると onSubstitute が背番号順に3回呼ばれる', () => {
        const onSubstitute = renderModal(roster5());

        // わざとばらばらの順にタップする
        fireEvent.click(card('コートC'));
        fireEvent.click(card('コートA'));
        fireEvent.click(card('コートB'));
        fireEvent.click(card('ベンチZ'));
        fireEvent.click(card('ベンチX'));
        fireEvent.click(card('ベンチY'));

        fireEvent.click(confirmBtn());

        expect(onSubstitute.mock.calls).toEqual([
            ['x', 'a'],
            ['y', 'b'],
            ['z', 'c'],
        ]);
    });

    it('実行後は選択が解除され、モーダルは閉じない', () => {
        renderModal(roster5());

        fireEvent.click(card('コートA'));
        fireEvent.click(card('ベンチX'));
        fireEvent.click(confirmBtn());

        expect(screen.queryAllByRole('button', { pressed: true }).length).toBe(0);
        expect(confirmBtn().disabled).toBe(true);
    });

    it('複数のときの案内は背番号だけを並べる', () => {
        renderModal(roster5());

        fireEvent.click(card('コートA'));
        fireEvent.click(card('コートB'));
        fireEvent.click(card('ベンチX'));
        fireEvent.click(card('ベンチY'));
        fireEvent.click(confirmBtn());

        expect(document.querySelector('.substitution-note-pair')?.textContent)
            .toBe('#4 #5 ⇄ #10 #11');
        expect(document.querySelector('.substitution-note-sub')?.textContent)
            .toContain('2人交代しました');
    });

    it('1組のときの案内は今までどおり氏名まで出す', () => {
        renderModal(roster5());

        fireEvent.click(card('コートA'));
        fireEvent.click(card('ベンチX'));
        fireEvent.click(confirmBtn());

        expect(document.querySelector('.substitution-note-pair')?.textContent)
            .toBe('#4 コートA → #10 ベンチX');
        expect(document.querySelector('.substitution-note-sub')?.textContent)
            .toContain('交代しました');
    });

    it('人数が食い違うと、その理由を出す', () => {
        renderModal(roster5());

        fireEvent.click(card('コートA'));
        fireEvent.click(card('コートB'));
        expect(document.querySelector('.substitution-note')?.textContent)
            .toContain('ベンチから2人選んでください');

        fireEvent.click(card('ベンチX'));
        expect(document.querySelector('.substitution-note')?.textContent)
            .toContain('コート2人・ベンチ1人を選んでいます');
    });

    it('何も選んでいないときは理由ではなく既存の案内を出す', () => {
        renderModal(roster5());

        const note = document.querySelector('.substitution-note')?.textContent ?? '';
        expect(note).toContain('続けて');
        expect(note).not.toContain('選んでください');
    });
});
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx vitest run src/components/SubstitutionModal/SubstitutionModal.test.tsx
```

Expected: 一括交代の describe が軒並み FAIL（2人目をタップすると1人目の選択が外れる、`onSubstitute` が1回しか呼ばれない、理由が出ない）。

- [ ] **Step 3: 実装する**

`SubstitutionModal.tsx` を直す。

(1) import に `comparePlayerNumbers` を足す。既存の import 文を差し替える:

```tsx
import {
    formatPlayerNumber,
    parsePlayerNumber,
    isValidPlayerNumber,
    comparePlayerNumbers,
} from '../../utils/playerNumber';
```

(2) 選択の state を差し替える。既存の2行:

```tsx
    const [playerOut, setPlayerOut] = useState<string | null>(null);
    const [playerIn, setPlayerIn] = useState<string | null>(null);
```

を次に差し替える:

```tsx
    // 交代は複数人まとめて行う。単数だと「4番と5番を下げて9番と10番」という
    // コーチの指示を1組ずつに分解してタップし直すことになる
    const [playersOut, setPlayersOut] = useState<string[]>([]);
    const [playersIn, setPlayersIn] = useState<string[]>([]);
    // 直前の実行で何人替えたか（案内の文言に使う）
    const [lastCount, setLastCount] = useState(0);
```

(3) `handleConfirm` の定義（`const handleConfirm = () => { ... };` の全体）を差し替える:

```tsx
    const toggleOut = (id: string) =>
        setPlayersOut(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    const toggleIn = (id: string) =>
        setPlayersIn(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

    // コート上は5人固定なので、IN と OUT の数が違う交代は成立しない
    const countsMatch = playersOut.length === playersIn.length;
    const canSubstitute = playersOut.length > 0 && countsMatch;

    /** 選択中のIDを背番号順の Player 配列にする */
    const orderedBySelection = (ids: string[]) =>
        ids
            .map(id => players.find(p => p.id === id))
            .filter((p): p is Player => p !== undefined)
            .sort((a, b) => comparePlayerNumbers(a.number, b.number));

    // 交代は1組ずつ確定するが、モーダルは閉じない。
    // バスケではタイムアウト明けなどに複数人まとめて替えるのが普通で、
    // 1組ごとに閉じると「交代ボタン→選択→実行」を人数分やり直すことになり、
    // 試合が止まっている短い時間に間に合わない
    const handleConfirm = () => {
        if (!canSubstitute) return;

        const outs = orderedBySelection(playersOut);
        const ins = orderedBySelection(playersIn);

        // 組み合わせはどこにも保存されない（handleSubstitutePlayer が書くのは
        // isOnCourt と quartersPlayed だけ）ので、どう組んでも結果は同じ。
        // 背番号順で組むのは表示を安定させるため。1組ずつ送ることで
        // コート上の人数が途中でも5人に保たれる
        outs.forEach((out, i) => onSubstitute(ins[i].id, out.id));

        setLastDone(
            outs.length === 1
                ? `#${formatPlayerNumber(outs[0].number)} ${displayName(outs[0])} → #${formatPlayerNumber(ins[0].number)} ${displayName(ins[0])}`
                // 複数は背番号だけ。氏名まで並べると375px幅の枠に収まらない
                : `${outs.map(p => `#${formatPlayerNumber(p.number)}`).join(' ')} ⇄ ${ins.map(p => `#${formatPlayerNumber(p.number)}`).join(' ')}`,
        );
        setLastCount(outs.length);
        setDoneCount(count => count + 1);
        setPlayersOut([]);
        setPlayersIn([]);
    };

    /**
     * 実行できない理由。まだ何も選んでいないときは出さない
     * （間違いではないので、既存の連続交代の案内をそのまま見せる）
     */
    const mismatchMessage = (): string | null => {
        if (playersOut.length === 0 && playersIn.length === 0) return null;
        if (countsMatch) return null;
        if (playersIn.length === 0) return `ベンチから${playersOut.length}人選んでください`;
        if (playersOut.length === 0) return `コートから${playersIn.length}人選んでください`;
        return `コート${playersOut.length}人・ベンチ${playersIn.length}人を選んでいます。同じ人数にしてください`;
    };
```

(4) コート側のカードを差し替える:

```tsx
                                <button
                                    type="button"
                                    key={player.id}
                                    className={`sub-player-card ${playersOut.includes(player.id) ? 'selected out' : ''}`}
                                    onClick={() => toggleOut(player.id)}
                                    aria-pressed={playersOut.includes(player.id)}
                                >
```

(5) 矢印を差し替える:

```tsx
                    <div className="substitution-arrow">
                        {playersOut.length > 0 && playersIn.length > 0 ? '⇄' : '→'}
                    </div>
```

(6) ベンチ側のカードを差し替える:

```tsx
                                    <button
                                        type="button"
                                        key={player.id}
                                        className={`sub-player-card ${playersIn.includes(player.id) ? 'selected in' : ''} ${fouledOut ? 'fouled-out' : ''}`}
                                        onClick={() => toggleIn(player.id)}
                                        aria-pressed={playersIn.includes(player.id)}
                                    >
```

(7) 案内の枠（`{doneCount > 0 ? ( ... ) : ( ... )}` の全体）を差し替える。理由・結果・既定の案内の3通りを同じ枠で入れ替える:

```tsx
                    {/*
                      実行前の案内と実行後の結果を同じ高さの枠で入れ替える。
                      結果を後から差し込むとボタンが下にずれ、直前に「交代実行」が
                      あった位置に「完了」が来る。連続でタップした指がモーダルを
                      閉じてしまうため、枠は最初から場所を取っておく
                    */}
                    {mismatchMessage() !== null ? (
                        <div className="substitution-note" role="status">
                            <span className="substitution-note-sub">{mismatchMessage()}</span>
                        </div>
                    ) : doneCount > 0 ? (
                        <div className="substitution-note done" role="status">
                            <span className="substitution-note-pair">{lastDone}</span>
                            <span className="substitution-note-sub">
                                {lastCount > 1 ? `${lastCount}人交代しました` : '交代しました'}
                                {doneCount > 1 ? `（この画面で${doneCount}件）` : ''}
                            </span>
                        </div>
                    ) : (
                        <div className="substitution-note">
                            <span className="substitution-note-sub">
                                交代実行してもこの画面は閉じません。続けて何人でも交代できます
                            </span>
                        </div>
                    )}
```

(8) 確定ボタンの `disabled` を差し替える:

```tsx
                        <button
                            className="btn btn-success btn-large"
                            onClick={handleConfirm}
                            disabled={!canSubstitute}
                        >
                            交代実行
                        </button>
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/components/SubstitutionModal/
```

Expected: PASS。既存の「連続交代」テスト（`substitute()` ヘルパが1組ずつ実行する）もそのまま通ること。

- [ ] **Step 5: コミット**

```bash
git add src/components/SubstitutionModal/
git commit -m "feat(substitution): 複数人をまとめて交代できるようにする

コーチの指示は「4番と5番を下げて9番と10番」とまとめて来るのに、
1組ずつに分解してタップし直す必要があった。

人数が揃わないと実行できない。誤って2人目を選んでも、数が合わなくなって
ボタンが押せなくなるだけで、意図しない交代は起きない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 見出しをラベルにして選択数を出す

**Files:**
- Modify: `src/components/SubstitutionModal/SubstitutionModal.tsx`
- Modify: `src/components/SubstitutionModal/SubstitutionModal.css`
- Test: `src/components/SubstitutionModal/SubstitutionModal.test.tsx`

**Interfaces:**
- Consumes: Task 2 の `playersOut` / `playersIn` / `countsMatch`
- Produces: CSSクラス `.sub-column-label` / `.sub-column-count`（`.match` / `.mismatch` 付き）

- [ ] **Step 1: 失敗するテストを書く**

`SubstitutionModal.test.tsx` の末尾に追記する:

```tsx
// 見出しの <h3> が選手カードの <button> と同じ背景色・同じ角丸で、
// 押せるように見えて押せなかった（スマホのメディアクエリの上書きが原因）
describe('SubstitutionModal 見出し', () => {
    const roster = () => [
        player('a', 4, 'コートA', true),
        player('b', 5, 'コートB', true),
        player('x', 10, 'ベンチX', false),
    ];

    const counts = () => [...document.querySelectorAll('.sub-column-count')].map(e => ({
        text: e.textContent,
        match: e.classList.contains('match'),
        mismatch: e.classList.contains('mismatch'),
    }));

    it('何も選んでいないときは選択数を出さない', () => {
        renderModal(roster());
        expect(counts()).toEqual([]);
    });

    it('人数が食い違うあいだは「足りない」側の色になる', () => {
        renderModal(roster());

        fireEvent.click(screen.getByRole('button', { name: /コートA/ }));

        expect(counts()).toEqual([
            { text: '1人選択', match: false, mismatch: true },
        ]);
    });

    it('同数になると「揃った」側の色になる', () => {
        renderModal(roster());

        fireEvent.click(screen.getByRole('button', { name: /コートA/ }));
        fireEvent.click(screen.getByRole('button', { name: /ベンチX/ }));

        expect(counts()).toEqual([
            { text: '1人選択', match: true, mismatch: false },
            { text: '1人選択', match: true, mismatch: false },
        ]);
    });

    it('見出しに選手カードと同じ背景色を敷かない（押せる要素と見分けられる）', () => {
        const css = readFileSync(
            resolve(process.cwd(), 'src/components/SubstitutionModal/SubstitutionModal.css'),
            'utf-8',
        );
        // スマホの上書きで .sub-column-title に --bg-tertiary（選手カードの地）を
        // 敷いていた。同じ地を敷き直したらこのテストで気づける
        const titleRules = [...css.matchAll(/\.sub-column-title\s*\{([^}]*)\}/g)].map(m => m[1]);
        expect(titleRules.length).toBeGreaterThan(0);
        for (const body of titleRules) {
            expect(body).not.toMatch(/background\s*:\s*var\(--bg-tertiary\)/);
        }
    });
});
```

このテストはファイル冒頭に import を足す必要がある。既存の import 群の下に追加する:

```tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx vitest run src/components/SubstitutionModal/SubstitutionModal.test.tsx
```

Expected: 「見出し」の4件のうち3件が FAIL（`.sub-column-count` が無い、CSSに `--bg-tertiary` が残っている）。「何も選んでいないときは選択数を出さない」だけ PASS。

- [ ] **Step 3: 実装する**

`SubstitutionModal.tsx` の見出し2か所を差し替える。

コート側:

```tsx
                        <h3 className="sub-column-title">
                            <span className="sub-column-label">コート (OUT)</span>
                            {playersOut.length > 0 && (
                                <span className={`sub-column-count ${countsMatch ? 'match' : 'mismatch'}`}>
                                    {playersOut.length}人選択
                                </span>
                            )}
                        </h3>
```

ベンチ側:

```tsx
                        <h3 className="sub-column-title">
                            <span className="sub-column-label">ベンチ (IN)</span>
                            {playersIn.length > 0 && (
                                <span className={`sub-column-count ${countsMatch ? 'match' : 'mismatch'}`}>
                                    {playersIn.length}人選択
                                </span>
                            )}
                        </h3>
```

`SubstitutionModal.css` の `.sub-column-title` の基本ルールを差し替える:

```css
/* 見出しはラベル。選手カード（button）と同じ地・同じ角丸にすると
   押せるように見えて押せない要素になる。左にラベル・右に選択数の1行にする */
.substitution-modal .sub-column-title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--spacing-sm);
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--text-secondary);
    padding-bottom: var(--spacing-sm);
    border-bottom: 1px solid var(--border);
}

/* 選択数の色で実行できるかを示す。スタメン選択（QuarterLineup の
   .lineup-status）が使っている「揃った=緑 / 足りない=橙」に揃える。
   モーダル地(--bg-secondary)の上で緑5.77:1・橙6.81:1、どちらもAA */
.substitution-modal .sub-column-count {
    font-size: var(--font-size-sm);
    font-weight: 700;
}

.substitution-modal .sub-column-count.match {
    color: var(--secondary-light);
}

.substitution-modal .sub-column-count.mismatch {
    color: var(--warning);
}
```

そして `@media (max-width: 600px)` の中にある `.sub-column-title` の上書きブロックを**まるごと削除する**:

```css
    .substitution-modal .sub-column-title {
        font-size: var(--font-size-lg);
        padding: var(--spacing-sm);
        background: var(--bg-tertiary);
        border-radius: var(--radius-sm);
    }
```

（基本ルールがそのまま効くようになる。これがスマホで見出しがボタンに見えていた原因）

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/components/SubstitutionModal/
```

Expected: PASS。

- [ ] **Step 5: コミット**

```bash
git add src/components/SubstitutionModal/
git commit -m "fix(substitution): 見出しを選手カードと見分けられるようにする

スマホの上書きで見出しが選手カードと同じ地・同じ角丸になっており、
押せるように見えて押せなかった。上書きを外してラベルに戻し、
右に選択数を出す。色は QuarterLineup の「揃った/足りない」に揃え、
色だけで実行できるかが分かるようにする。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: スマホのベンチ2列化と列幅の不具合修正

**Files:**
- Modify: `src/components/SubstitutionModal/SubstitutionModal.css`
- Test: `src/components/SubstitutionModal/substitutionGrid.test.ts`（新規）

**Interfaces:**
- Consumes: Task 2・3 で入った構造（`.substitution-column.court` / `.bench`）
- Produces: なし（CSSのみ）

- [ ] **Step 1: 失敗するテストを書く**

Create `src/components/SubstitutionModal/substitutionGrid.test.ts`:

```ts
// スマホの2列表示で列を `1fr` にすると、`1fr` は `minmax(auto, 1fr)` と同義で
// 最小幅が中身で決まるため、長い氏名がカードごとモーダルの外へ押し出される。
// 実測で `佐々木健太郎` を入れたところ実際に枠外へ飛び出した。
// jsdom はレイアウトを計算しないので、CSSの記述そのものを縛る。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// コメントを先に落とす。落とさないとルール直前の日本語コメントが
// セレクタ側の捕捉に混ざり、完全一致が成立しない
// （lineupContrast.test.ts と同じ前処理）
const css = readFileSync(
    resolve(process.cwd(), 'src/components/SubstitutionModal/SubstitutionModal.css'),
    'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** セレクタに完全一致するルールの中身を返す */
function ruleBody(selector: string): string {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const rule = rules.find(m => m[1].replace(/\s+/g, ' ').trim() === selector);
    if (!rule) throw new Error(`ルールが無い: ${selector}`);
    return rule[2];
}

describe('交代モーダルの2列表示', () => {
    for (const side of ['court', 'bench']) {
        it(`${side} の列は minmax(0, 1fr)（1fr だと長い氏名で枠外へ飛び出す）`, () => {
            const body = ruleBody(`.substitution-modal .substitution-column.${side} .sub-player-list`);
            expect(body).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/);
        });
    }

    it('名前は折り返さず1行で切り詰める（番号の位置が行ごとに動かないように）', () => {
        const body = ruleBody('.substitution-modal .sub-player-name');
        expect(body).toMatch(/white-space:\s*nowrap/);
        expect(body).toMatch(/text-overflow:\s*ellipsis/);
    });

    it('退場バッジはどの幅でも消さない', () => {
        // 失格者をIN候補から外さない代わりに併記する既存方針の要
        expect(css).not.toMatch(/\.sub-player-fouled-out\s*\{[^}]*display:\s*none/);
    });
});
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx vitest run src/components/SubstitutionModal/substitutionGrid.test.ts
```

Expected: FAIL。`court` は `grid-template-columns: 1fr 1fr` のまま、`bench` のルール自体が存在しない、`.sub-player-name` のルールも無い。

- [ ] **Step 3: 実装する**

`SubstitutionModal.css` の `@media (max-width: 600px)` の中を直す。

既存のコート側のルールを差し替える:

```css
    /* コート(OUT)は必ず5人。2列に折り返して全員を出す。
       1列のままだと281px使ってベンチがほぼ映らない（実測で残り14px）。
       列は minmax(0, 1fr)。`1fr` は `minmax(auto, 1fr)` と同義で最小幅が
       中身で決まるため、長い氏名がカードごとモーダルの外へ押し出される */
    .substitution-modal .substitution-column.court .sub-player-list {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: var(--spacing-xs);
        max-height: none;
        overflow-y: visible;
    }
```

既存の `.substitution-column.court .sub-player-stats { display: none; }` はそのまま残す。

既存の `.substitution-column.court .sub-player-card` の上書きは**削除**し（下の共通ルールに寄せる）、ベンチ側のルールを足す:

```css
    /* ベンチ(IN)も2列にする。複数人を選ぶには一覧性が要る
       （実測: 一度に見える人数が 2.7人 → 5.6人）。
       align-content: start が無いと、人数が少ないとき行が縦に間延びする */
    .substitution-modal .substitution-column.bench .sub-player-list {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: var(--spacing-xs);
        align-content: start;
        flex: 1;
        min-height: 0;
        max-height: none;
    }

    /* 出場Qは2列に入らない。出場ルールの目安はスタメン選択画面も担っている。
       タブレット・PCでは残す。退場バッジは消さない */
    .substitution-modal .substitution-column.bench .sub-player-quarters {
        display: none;
    }
```

既存のベンチ側のルール（`.substitution-column.bench .sub-player-list { flex: 1; min-height: 0; max-height: none; }`）は上の新しいルールに統合されるので削除する。

カードの共通ルールを差し替える:

```css
    /* 2列なのでカード幅は約160px。縦横とも余白を詰める。
       min-height 50px は残すので、指で押す的の大きさは変えていない */
    .substitution-modal .sub-player-card {
        padding: var(--spacing-xs) var(--spacing-sm);
        gap: var(--spacing-xs);
        min-height: 50px;
    }

    /* 背番号は識別子なので文字は大きいまま。ただし min-width は外す。
       1列で桁を揃えるための指定で、2列では23pxの無駄になる
       （実測: 名前に使える幅が 61px → 84px に増える） */
    .substitution-modal .sub-player-number {
        font-size: var(--font-size-xl);
        min-width: 0;
    }
```

（既存の `.sub-player-number { font-size: var(--font-size-xl); min-width: 50px; }` を上のもので差し替える）

名前のルールを足す:

```css
    /* 名前は折り返させず1行で切り詰める。折り返すと番号の位置が行ごとに動き、
       番号で拾う読み方が成立しない。コートネームは短いので、実際に切れるのは
       コートネーム未設定でフルネームに落ちた選手だけ */
    .substitution-modal .sub-player-name {
        font-size: var(--font-size-sm);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
    }
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/components/SubstitutionModal/
```

Expected: PASS。

- [ ] **Step 5: コミット**

```bash
git add src/components/SubstitutionModal/
git commit -m "fix(substitution): スマホでベンチも2列にし、列幅の不具合を直す

複数人を選ぶには一覧性が要る（一度に見える人数が2.7人→5.6人）。
あわせて列を minmax(0, 1fr) にする。1fr は minmax(auto, 1fr) と同義で
最小幅が中身で決まるため、長い氏名がカードごと枠外へ飛び出していた
（コート側の既存の2列表示も同じ問題を抱えていた）。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: App 統合テストと全体検証

**Files:**
- Create: `src/App.bulkSubstitution.test.tsx`

**Interfaces:**
- Consumes: Task 1〜4 の全て。`App.tsx` と reducer は変更しない
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

Create `src/App.bulkSubstitution.test.tsx`:

```tsx
// App レベルで交代そのものを主題にしたテストが無かった。
// 一括交代は onSubstitute を人数分呼ぶ作りなので、その展開が
// 実際に reducer まで届いてコート上の5人が入れ替わることを通しで確かめる
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import type { SavedTeam } from './utils/teamStorage';

function makeTeam(id: string, name: string, label: string, startNumber: number, count: number): SavedTeam {
    return {
        id,
        name,
        coachName: 'コーチ',
        assistantCoachName: '',
        players: Array.from({ length: count }, (_, i) => ({
            number: startNumber + i,
            name: `${label}${i + 1}`,
            isCaptain: i === 0,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

// 9人にしておく。10人にすると `ホーム1` が `ホーム10` にも部分一致して
// getByRole が「複数見つかった」で落ちる
const myTeam = makeTeam('team-1', 'ホームチーム', 'ホーム', 4, 9);
const opponentTeam = makeTeam('team-2', 'アウェイチーム', 'アウェイ', 20, 5);

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    localStorage.setItem('minibasket-opponent-teams', JSON.stringify([opponentTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
});

afterEach(cleanup);

/** 試合設定ウィザードを進めてQ1を開始する */
async function startGame() {
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
    fireEvent.click(screen.getByRole('button', { name: 'スタメン選択へ' }));
    await screen.findByText('スタメン選択');

    // 白: ホーム1〜5、青: アウェイ1〜5 をスタメンにする
    for (const label of ['ホーム', 'アウェイ']) {
        if (label === 'アウェイ') {
            fireEvent.click(screen.getByRole('tab', { name: /青/ }));
        }
        for (let n = 1; n <= 5; n++) {
            fireEvent.click(screen.getByRole('button', { name: new RegExp(`${label}${n}`) }));
        }
    }
    fireEvent.click(screen.getByRole('button', { name: '試合開始' }));
    await waitFor(() => {
        expect(document.querySelector('.team-panel.team-a .mini-player-card')).toBeTruthy();
    });
}

describe('App: 複数人の一括交代', () => {
    it('3人まとめて交代すると、コート上の5人が正しく入れ替わる', async () => {
        const { container } = render(<App />);
        await startGame();

        // 自チームの交代モーダルを開く
        fireEvent.click(screen.getAllByRole('button', { name: /交代/ })[0]);
        await screen.findByText(/選手交代/);

        // コートから3人、ベンチから3人
        for (const name of ['ホーム1', 'ホーム2', 'ホーム3', 'ホーム6', 'ホーム7', 'ホーム8']) {
            fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
        }

        const confirm = screen.getByRole('button', { name: '交代実行' }) as HTMLButtonElement;
        expect(confirm.disabled).toBe(false);
        fireEvent.click(confirm);

        // 案内が3人分をまとめて伝える
        expect(document.querySelector('.substitution-note-sub')?.textContent)
            .toContain('3人交代しました');

        fireEvent.click(screen.getByRole('button', { name: '完了' }));

        // コート上は5人のまま。入った3人が居て、下がった3人は居ない
        await waitFor(() => {
            expect(container.querySelectorAll('.team-panel.team-a .mini-player-card').length).toBe(5);
        });
        const courtText = container.querySelector('.team-panel.team-a')!.textContent ?? '';
        for (const stillIn of ['ホーム4', 'ホーム5', 'ホーム6', 'ホーム7', 'ホーム8']) {
            expect(courtText).toContain(stillIn);
        }
        for (const out of ['ホーム1', 'ホーム2', 'ホーム3']) {
            expect(courtText).not.toContain(out);
        }
    });
});
```

- [ ] **Step 2: 失敗することを確認する**

```bash
npx vitest run src/App.bulkSubstitution.test.tsx
```

Expected: 実装前なら FAIL。Task 1〜4 が入っていれば PASS するはずだが、**まず落ちることを確かめずに通ってしまった場合は、テストが何も確かめていない可能性を疑うこと**。その場合は `src/App.tsx` の `handleSubstitute` を一時的に1回だけディスパッチする形に壊し、このテストが落ちることを確認してから戻す。実行結果を報告に残す。

- [ ] **Step 3: 通す**

Task 1〜4 が入っていればコード変更は不要。落ちる場合は原因を特定して直す（この段階で `App.tsx` や reducer を変える必要は無いはず。必要になったら設計とのずれなので報告する）。

- [ ] **Step 4: 全体を検証する**

```bash
npm run lint && npx tsc -b && npm test
```

Expected: lint エラーなし、型エラーなし、全テスト PASS。いずれかが落ちたら、その原因を直してから次へ進む。

- [ ] **Step 5: コミット**

```bash
git add src/App.bulkSubstitution.test.tsx
git commit -m "test(substitution): 一括交代がコート上の5人に届くことを通しで確かめる

App レベルで交代そのものを主題にしたテストが無かった。
onSubstitute を人数分呼ぶ展開が reducer まで届くことを固定する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 完了の条件

- `npm run lint` / `npx tsc -b` / `npm test` がすべて通る
- コート・ベンチとも複数選択でき、同数のときだけ「交代実行」が押せる
- 3人選んで実行すると3組が入れ替わり、案内が「3人交代しました」になる
- 1組だけの交代は、ラベルも案内も今までどおり
- 見出しが選手カードと見分けられ、選択数の色で実行できるかが分かる
- 選手の表示がコートネーム優先になっている（無ければ氏名）
- スマホでコート・ベンチとも2列で、長い氏名を入れてもカードが枠外へ出ない
- 退場バッジがどの幅でも出る

## 実機で確かめること（自動テストで見られない部分）

375×812 と 768×1024 の両方で、交代モーダルを開いて:

- 見出しが押せる要素に見えないこと
- スマホでコート5人が全員見え、ベンチが2列でスクロールすること
- 長いコートネーム／氏名を持つ選手を入れてもカードが枠外へ出ないこと
- タブレットでは得点と出場Qが出ていること
- 3人を選んで実行し、コート上が入れ替わること
