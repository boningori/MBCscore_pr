# マイチーム改名で過去の試合が分析から消える問題

## 背景

コミット 2561bfa で `getMyTeamGames` の照合条件を「チーム名の一致 || `record.teamA.isMyTeam`」から「チーム名の一致」必須へ変更した。学年別・男女別に複数のマイチームを登録している環境で、別チームの試合が分析に混ざっていたためで、この変更自体は正しい。

副作用として、マイチームを改名した利用者の過去の試合が分析から抜ける。改名前に記録した `GameRecord` には旧チーム名が入っているため、現在の名前と一致せず対象外になる。試合履歴の一覧からは消えないが、選手スタッツ分析では試合数・平均・成長グラフから丸ごと欠ける。

根本原因は `GameRecord` が `SavedTeam` の id を持たないこと。`savedTeamToTeam` が `SavedTeam` を `Team` へ写す時点で id は `'teamA'` / `'teamB'` に置き換わるため、あとから「どのマイチームの試合か」を辿れず、名前でしか結び付けられない。

本件は 2561bfa を前提にした追加対応であり、revert ではない。複数マイチームの混入が再発しないことは維持する。

## 方針

### 1. `Team.savedTeamId`

`src/types/game.ts` の `Team` に `savedTeamId?: string` を追加する。元になった `SavedTeam.id` を指す。

`Game` は `GameSession`（中断セッション）にも `GameRecord`（試合履歴）にも丸ごと入るため、この位置に置けば中断→リロード→再開を挟んでも id が残り、App 側の state や `saveGameResult` の引数を増やさずに済む。バックアップの取り込み（`sanitizeImportedGame`）はスプレッドで未知フィールドを保つため、端末間でも維持される。

**マイチーム側にだけ入れる。相手チーム側には入れない。**

相手側にも入れると、自分の別チームを「相手チーム」として登録して記録した練習試合（例: 6年 vs 5年）が 5年 の分析から消える。この試合はいま 5年 側の名前照合で拾えており、相手側に相手レコードの id が入ると id 照合が外れて拾えなくなる。相手側を未設定のままにすれば名前照合にフォールバックし、現状の挙動が保たれる。

### 2. 保存経路

`src/App.tsx` の `handleGameStart` 内、`teamA.isMyTeam = isMyTeamWhite` / `teamB.isMyTeam = !isMyTeamWhite` の隣で、マイチーム側の `Team` に `setupData.myTeam.id` を入れる。`setupData.myTeam` は必ず `loadMyTeams()` から選ばれるため id は常に実在する。

`saveGameResult` のシグネチャは変更しない。

### 3. `getMyTeamGames` の照合

側ごとに「`savedTeamId` があれば id で照合、無ければ現在の名前で照合」とする。3分岐（両側一致＝紅白戦 / teamA のみ / teamB のみ）の形は変えない。

```ts
const sideIsMine = (team: Team) =>
    team.savedTeamId ? team.savedTeamId === myTeam.id : team.name === myTeam.name;
```

`savedTeamId` を持つ側で id が一致しなければ、名前が一致していても採らない。旧名を別のマイチームが引き継いだ場合に取り違えないため。

### 4. 旧データのバックフィル

バックフィルを入れない場合、この改修より前に記録した試合は改名で消えたままになる。ミニバスは学年進行で年度替わりに改名する動機が強く、対象が大きい。

安全側に倒したルール:

> 両側とも `savedTeamId` を持たないレコードについて、`isMyTeam === true` の側だけを見る。その側の名前に一致する登録マイチームが**ちょうど1つ**のときだけ id を書き戻す。それ以外（同名マイチームが複数 / `isMyTeam` がどちらの側にも無い旧レコード）は何も書かない。

このルールは**移行した瞬間の挙動を現状と完全に一致させる**。いま拾える試合は全部拾え、いま拾わない試合は拾わない。やっているのは「今日の名前による帰属を id に凍結する」ことだけで、その後の改名に強くなる。

- 紅白戦（両チーム同名）: `isMyTeam` 側にだけ id が付き、もう一方は名前照合。両側一致のまま分岐1に入り、従来どおり `isMyTeam` で側が決まる。
- 練習試合（相手が自分の別チーム）: マイチーム側だけ id が付く。相手側は名前照合のまま拾える。
- 同名マイチームが複数: 何も書かない。名前照合のままで、従来と同じ（どちらの分析にも出る）。

実装は `dedupeGameIds` と同じ形の純関数として `src/utils/gameHistoryStorage.ts` に置く:

```ts
export function backfillSavedTeamIds(
    records: GameRecord[],
    myTeams: { id: string; name: string }[],
): GameRecord[] | null   // 変化が無ければ null
```

`SavedTeam` 型ではなく `{ id, name }` を受けることで、`gameHistoryStorage` が `teamStorage` に依存せずに済む。

起動時の `useEffect`（`src/App.tsx`）から一度だけ実行する。`loadGameHistory` の中には入れない — 呼び出し回数が多く、毎回マイチーム一覧を読み直すことになるため。

### 限界

**すでに改名済みの利用者の過去の試合は復旧できない。** 旧チーム名がどこにも残っておらず、照合の手がかりが無い。バックフィルが守るのは「これから改名する人の既存データ」。

## テスト

既存の `src/utils/playerStatsAnalysis.multiTeam.test.ts` は無改変で通ること（`savedTeamId` を持たない記録は名前照合のまま）。

追加するもの:

- 改名しても `savedTeamId` 付きの試合が分析に残る
- 改名後も、別マイチームの試合は混ざらない
- `savedTeamId` を持つ側は、名前が一致しても id が違えば採らない
- バックフィル: `isMyTeam` 側だけに id を書く
- バックフィル: 同名マイチームが複数あるときは何も書かない
- バックフィル: 変化が無ければ `null` を返す（無用な保存を起こさない）
- バックフィル後も紅白戦の側判定が変わらない
- バックフィル後も、相手として登場する自分の別チームは名前で拾える
