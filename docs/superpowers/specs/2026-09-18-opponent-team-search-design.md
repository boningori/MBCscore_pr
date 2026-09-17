# 対戦チーム管理に、チーム名で引く検索を付ける — 設計

- 日付: 2026-09-18
- ステータス: 設計承認済み（2026-09-18）
- 対象: `src/components/OpponentManager/OpponentManager.tsx`, `src/components/History/historyFilter.ts`, 新規 `src/utils/matchesQuery.ts`, 新規 `src/components/OpponentManager/teamFilter.ts`

## 背景

対戦チーム管理は、登録されているチームを全件そのまま縦に並べるだけで、絞り込む手段が無い（`OpponentManager.tsx:817`）。

```tsx
<div className="teams-list">
    {teams.map(team => (
        <div key={team.id} className="team-card">
```

並び順は**登録した順**である。`saveOpponent` は新しいチームを配列の末尾に push するだけで、名前順にも対戦日順にも並べ替えていない（`teamStorage.ts:168-179`）。

```ts
if (existingIndex >= 0) {
    teams[existingIndex] = { ...team, updatedAt: new Date().toISOString() };
} else {
    teams.push(team);
}
```

件数の上限も無い。したがって登録が増えるほど、後から足したチームが下に積み上がり、目当てのチームは目で探すことになる。編集も削除もこの一覧からしか辿れないので、探せないことがそのまま操作できないことになる。

同じ問題は試合履歴で先に解かれている。`historyFilter.ts` の冒頭にその経緯がある。

> 履歴には手がかりが何も無く、1シーズン分（数十件）を延々スクロールして目当ての試合を探すしかなかった。

対戦チーム管理は、履歴ほど件数が増えないとしても、同じ形の不便を抱えている。

## 決めたこと

**チーム名だけを対象に、部分一致で絞り込む検索を一覧画面に付ける。**

対象を名前に限るのは利用者の指定による。コーチ名や選手名まで拾うと、名前で引いたつもりの結果に理由の分からない1件が混ざる。引っかけたい対象が増えたときに広げればよく、先回りしない。

並び順は変えない。今回入れるのは「探す手段」であって「並べ直す手段」ではない。登録順という現行の規則は残す。

### 範囲

- **対戦チーム管理（一覧画面）だけ**に付ける。
- 試合設定の対戦相手選択（`OpponentSelect.tsx`）には**付けない**。あちらは「登録済み対戦チーム」と「最近の対戦チーム」の2列で、片方だけ絞ると残りの列との関係が分からなくなる。レイアウトの検討が要るので、必要になったときに別途決める。
- マイチーム管理にも付けない。自チームは数が少なく、同じ不便が起きていない。

### 照合の規則

試合履歴の検索と**同じ振る舞い**にする。具体的には:

- 検索語は前後の空白を落とす（`trim`）
- 英字の大文字小文字を区別しない（両辺 `toLowerCase`）
- 部分一致（`includes`）。前方一致ではない
- 空の検索語は「絞り込みなし」。全件を返す

全角・半角の同一視や、ひらがな・カタカナの同一視は**しない**。履歴の検索がそこまで見ていないため、片方だけ賢くすると「履歴では引けるのにチーム管理では引けない（またはその逆）」という食い違いが利用者に見える。揃えるなら両方を同時に直す話になる。

名前が未設定のチーム（一覧では `(未設定)` と表示される）は、検索対象の文字列が空になる。検索語が入っている間は一覧から外れる。空の検索語のときは従来どおり表示される。

## 構造

### `src/utils/matchesQuery.ts`（新規）

照合の規則そのもの。3行で済むが、これを共有することに意味がある。

```ts
export function matchesQuery(haystack: string, query: string): boolean
```

「履歴と同じ振る舞いにする」と決めた以上、両者が別々に `trim().toLowerCase().includes()` を書けば、片方だけ直したときに静かにずれる。判定を1か所に置き、`historyFilter.ts` と `teamFilter.ts` の両方がこれを呼ぶ。

`historyFilter.ts` は既存の `searchableText(record)` の結果をこの関数へ渡す形に**書き換える**。入出力は変わらないので、既存の `historyFilter.test.ts` がそのまま通ることが移行の検査になる。

### `src/components/OpponentManager/teamFilter.ts`（新規）

チーム一覧を絞る純粋関数。`historyFilter.ts` と同じ形（画面の隣に置く純粋関数＋単体テスト）にする。

```ts
export function filterTeamsByName(teams: SavedTeam[], query: string): SavedTeam[]
```

- 元の配列は変えない
- 並べ替えない（引数の順序を保つ）
- 空の検索語のときは新しい配列を返す（`historyFilter` の `[...records]` と同じく、呼び手が受け取る型を揃える）

`OpponentManager.tsx` は既に866行ある。判定をこちらへ出すことで、画面側に足すのは状態1つと `useMemo` 1つだけになる。

### `OpponentManager.tsx`（変更）

一覧画面は編集画面と早期 return で分かれている（編集中は `OpponentManager.tsx:708` 手前で return する）。したがって検索は一覧画面だけに閉じ、編集中の状態とは関わらない。

- `const [query, setQuery] = useState('')` を足す
- `const visibleTeams = useMemo(() => filterTeamsByName(teams, query), [teams, query])`
- 一覧の描画を `teams.map` から `visibleTeams.map` に変える
- 削除や再読み込みで `teams` が変わっても `query` は保持する（絞り込んだまま続けて消せるように）

## 画面

履歴の操作子（`History.tsx:333-368` の `.history-controls`）と同じ並び・同じ言葉にする。利用者が2つの画面で違う作法を覚えずに済む。

```
検索： [ チーム名            ] ✕        3 / 12件
```

- `検索：` のラベルと `type="search"` の入力。placeholder は `チーム名`
- ラベルは `htmlFor` で入力に結び付ける
- 入力があるときだけ ✕ ボタンを出す（`aria-label="検索条件を消す"`）
- 右端に `{visibleTeams.length} / {teams.length}件`

**操作子は、登録が1件以上あれば常に描画する。** 結果が0件でも消さない。条件を変える手段が消えると、その条件から抜け出せなくなる（履歴側のコメントと同じ理由）。

空のときの表示は2種類に分ける。

| 状態 | 表示 |
|---|---|
| 登録が無い | `登録された対戦チームはありません`（現行のまま） |
| 検索で消えた | `「〇〇」に一致するチームはありません` |

「そもそも登録が無い」と「検索で消えた」を同じ文面にすると、事実と違う案内になる。

スタイルは `History.css` の `.history-controls` 周りに対応するものを `OpponentManager.css` に置く。クラス名は画面に合わせて `opponent-search` 等とし、履歴のCSSを共有しない（片方の画面の都合で崩れるのを防ぐ）。

## テスト

### `src/utils/matchesQuery.test.ts`（新規）

- 部分一致で引ける（前方一致ではない）
- 英字の大文字小文字を区別しない
- 検索語の前後の空白を落とす
- 空文字・空白のみの検索語は常に true
- 対象が空文字なら、検索語があるとき false・無いとき true

### `src/components/OpponentManager/teamFilter.test.ts`（新規）

- 名前の一部で絞れる
- コーチ名・選手名では引けない（対象を名前に限る約束）
- 名前未設定のチームは、検索語があると外れる／無いと残る
- 空の検索語で全件返る
- 元の配列を書き換えない（参照と中身の両方を確認）
- 並び順が入力のまま保たれる

### `src/components/History/historyFilter.test.ts`（既存・変更しない）

`matchesQuery` への置き換えで振る舞いが変わっていないことの検査として、そのまま通ることを確認する。

### `src/components/OpponentManager/OpponentManager.test.tsx`（追記）

- 入力すると一覧が絞られる
- ✕ を押すと全件に戻る
- `n / m件` が実際の件数を示す
- 検索で0件になったとき、登録が無いときとは違う文面が出る
- 0件になっても検索窓と ✕ が消えない（条件から抜け出せることの保証）

## やらないこと

- 並べ替え（名前順・対戦日順）の追加
- 検索語の保存（画面を離れたら消える。localStorage に持たない）
- 対戦相手選択画面とマイチーム管理への展開
- 全角半角・かなカナの同一視
