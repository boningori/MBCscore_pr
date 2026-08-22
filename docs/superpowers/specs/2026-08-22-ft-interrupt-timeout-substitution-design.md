# FT入力中のタイムアウト・選手交代 — 設計

- 日付: 2026-08-22
- ステータス: 設計承認済み（実装計画待ち）

## 背景・目的

ファウル → フリースローの入力中、記録者は `FoulInputFlow` のモーダルに閉じ込められる。このモーダルは試合中いちばん深い階層のオーバーレイで、`closeOnOverlayClick={false}` とフォーカストラップにより背後の選手カード・スコアボードを一切触らせない（`src/components/FoulInputFlow/FoulInputFlow.tsx`）。

一方、タイムアウトと選手交代の入り口は左右の `TeamPanel` の上にしか無い（`src/App.tsx` の `onTimeoutRequest` / `onSubstitute`）。つまり**暗幕の下にある**。

ところが規則上、FTシークエンスの途中でタイムアウトと交代は認められる。記録者に残る手は2つしか無い。

| 現在できること | 問題 |
|---|---|
| FTを最後まで記録してから入力する | 操作としては遠回りだが、記録は正しくなる |
| 「キャンセル」で抜ける | 入力途中のファウルが全部消える |

記録の正しさは今も保たれている（後述「順序が問題にならない理由」）。したがってこれは**データの不具合ではなく動線の問題**であり、対処もその範囲に収める。

### 順序が問題にならない理由（今回変えないこと）

- タイムアウトは残り時間を手入力して「経過何分」で保存する（`src/components/TimeoutInputModal/TimeoutInputModal.tsx`）。入力した順ではなく入力した時刻で様式に載る。
- 交代は当該クォーターの出場種別（`sub` / `both`）と `isOnCourt` を更新するだけ（`src/context/reducers/gameFlowHandlers.ts` の `handleSubstitutePlayer`）。クォーター内の前後関係は様式に出ない。

## スコープ

### やること

- `FoulInputFlow` の中に「試合の中断」ブロックを置き、タイムアウト・選手交代のモーダルを**フローを開いたまま**呼び出せるようにする
- 中断ブロックを出すのは**シューターが確定して以降**に限る
- 交代でシューターがコートを離れた場合の扱いを決める（警告と選び直し）
- FT結果画面のシューター表示が、交代で下がった瞬間に空欄になる不具合を直す

### やらないこと（YAGNI・今回のスコープ外）

- **データモデルの変更**。1ファウル＝1シューター（`FoulRecord.shooterPlayerId`、`FoulWithFreeThrowsBase`）のまま。FT1本ごとにシューターを持たせる拡張はしない
- **reducer の変更**。`ADD_TIMEOUT` / `SUBSTITUTE_PLAYER` / `ADD_FOUL_WITH_FREE_THROWS` はいずれも現状のまま
- **`RunningScoresheet` の変更**（様式・PDF/JPEG出力の見た目は変えない）
- **`TeamPanel` の変更**。既存のタイムアウトチップ・交代ボタンはそのまま
- 保留アクション解決のフローへの中断ブロック追加（後述「保留解決フローを対象外にする理由」）
- タイムアウトの取り消しをフロー内から行うこと。既存のチップ（フローを閉じた後）に任せる

## 設計判断（ユーザー合意事項）

| 論点 | 決定 |
|---|---|
| 中断ブロックを出す条件 | **シューターが確定して以降**（`shooterPlayerId !== null`） |
| モーダルの開き方 | `FoulInputFlow` をマウントしたまま、上に重ねる |
| チームの選ばせ方 | ボタン2つ（タイムアウト／交代）→ 押すと同じ行がチーム選択に入れ替わる |
| FT入力後にシューターが負傷退場した場合 | 記録は1人分のシューターに寄せる。ずれることを画面で明示する（案A） |

### 不採用にした案

- **シューター確定前でも中断できるようにする** — 2つの理由で採らない。第一に、確定前はシューターがアプリのどこにも入っていない（フローが持つのはファウル種類・シュート状況・FT本数だけ）ため、タイムアウトと交代を挟んだ後は記録者の記憶しか頼りが無い。第二に、より深刻なこととして**候補リストが壊れる**。シューター候補は `opponentPlayers.filter(p => p.isOnCourt)` で今のコート状況から毎回引き直しているので、確定前に交代が入ると、ファウル時点でコートにいなかった選手が候補に並び、ファウルされた本人が下がっていれば候補から消える。「思い出せない」ではなく「正しい選択肢が画面に無い」状態になる。

- **フローを閉じて App 側に入力状態を退避し、中断後に復元する** — 入力途中の状態は6つの state（`step` / `foulType` / `shotSituation` / `freeThrows` / `freeThrowResults` / `shooterPlayerId` / `shotMade`）に分かれている。持ち上げれば壊れやすくなるだけで、マウントし続ければ何もしなくても保持される。

- **シューターを本数分の配列に拡張する（FT途中の負傷退場を正確に記録する）** — 正確にはなるが、型・reducer・様式印字・統計集計・訂正機能・保存済みデータの移行まで波及する。FTシークエンス途中の負傷退場という発生頻度に対して見合わない。今回の主題からも外れる。

- **ファウル記録を2つに分けて2人のシューターを表現する** — ファウルが2個計上されるため不可。

- **中断ボタンをチーム名付きで4つ並べる** — 1タップで済むが、ただでさえ縦に長いFT結果画面をさらに4行押し下げる。チーム名が長いと折り返す（v1.3.14 で直したばかりの問題と同じ場所）。

- **対象チームを自動で決める** — タイムアウトはファウルされた側が取るとは限らず、交代は両チームで起きる。推定できない。

## 重ね方（アーキテクチャ）

`FoulInputFlow` はマウントしたままにして、既存のタイムアウト／交代モーダルをその上に重ねる。フローからはコールバックで要求を上げるだけで、モーダルの状態は従来どおり App が持つ（`timeoutModalTeam` / `showSubstitutionModal` + `substitutionTeamId`）。

確認済みの前提:

- オーバーレイの `z-index` はいずれも 1000 で、重なり順は DOM 順で決まる。App 内で `SubstitutionModal` と `TimeoutInputModal` は `FoulInputFlow` より後に置かれているため、追加の `z-index` 調整は要らない
- `Modal` のスタック登録（`modalStack`）は入れ子に対応しており、端末の戻る操作・Escape は LIFO で上のモーダルから閉じる。`FoulInputFlow` 自身が既に `ConfirmModal` を内側に重ねている
- `ADD_TIMEOUT` も `SUBSTITUTE_PLAYER` も `selectedPlayerId` / `selectedTeamId` に触らない。中断して戻ってもファウルの帰属先は保たれる（`handleFoulWithFreeThrows` は `selectedPlayerId` を見る）
- ファウルした選手自身が交代で下がっても、ファウル記録はその選手に正しく付く。ファウルの記録は `isOnCourt` を見ていない

### 保留解決フローを対象外にする理由

App には `FoulInputFlow` の呼び出しが3箇所ある。

| 呼び出し元 | 中断ブロック |
|---|---|
| 通常のファウル記録 | 出す |
| ベンチファウル（Step 2） | 出す |
| 保留アクションの解決 | **出さない** |

保留アクションは過去のクォーターの記録を後から解決する場合がある（`pendingAction.quarter`）。その画面でタイムアウトを記録すると `currentQuarter` に付き、実際に止まったクォーターと食い違う。交代も同様に、今のコート状況を過去の記録の文脈で操作させることになる。

実装上は、中断ブロック用のプロパティを渡さなければ出ない形にする。

## 中断ブロック（FoulInputFlow）

### 出す条件

```
shooterPlayerId !== null かつ step が 'shooter' または 'ftResult'
かつ 中断ブロック用のプロパティが渡されている
```

`shooter` ステップは、選手をタップして `shooterPlayerId` が入った後に「決定」で `ftResult` へ進む二段構えになっている。タップ済みなら `shooter` ステップでも出す。FT前にタイムアウトが入る場面と、1本目の後に入る場面はどちらも実際に起きるため。

ベンチファウル（`benchFoulMode`）は `shooter` ステップから始まるが、同じ条件がそのまま使える。

### 置き場所

「キャンセル」ボタン（`foul-input-actions`）の直上に、区切り線と見出しを付けて独立させる。FT結果の入力ボタンと隣り合わせにすると誤タップする。

### 見た目と操作

初期状態:

```
── 試合の中断 ──────────────
[⏱ タイムアウト]  [🔄 選手交代]
```

どちらかを押すと、**同じ行がチーム選択に入れ替わる**（新しいモーダルは開かない。高さも増えない）:

```
── 試合の中断 ──────────────
タイムアウトを記録するチーム
[東京中]  [大阪中]  [やめる]
```

チームを押すとコールバックを呼び、入れ替えを元に戻す。App 側がその上にタイムアウト／交代のモーダルを開く。

- そのクォーターでタイムアウトを使用済みのチームは「東京中（済）」と表示し、押せなくする。取り消しは既存のチップ（フローを閉じた後）に任せる
- 「やめる」で初期状態に戻る
- チーム選択を開いている間の戻る操作・Escape は、ステップを戻すのではなく**チーム選択を閉じる**。`handleBack` の先頭で分岐する

### 追加するプロパティ

```ts
/** 試合中断（タイムアウト・交代）の対象チーム。省略時は中断ブロックを出さない */
interruptTeams?: { id: 'teamA' | 'teamB'; name: string; timeoutUsed: boolean }[];
/** タイムアウト記録の要求。省略時はタイムアウトのボタンを出さない */
onRequestTimeout?: (teamId: 'teamA' | 'teamB') => void;
/** 選手交代の要求。省略時は交代のボタンを出さない */
onRequestSubstitution?: (teamId: 'teamA' | 'teamB') => void;
```

`onRequestTimeout` は `phase === 'playing'` のときだけ渡す。`TeamPanel` のタイムアウトチップと同じ条件に揃える。

内部状態は1つだけ増やす:

```ts
const [interruptChoice, setInterruptChoice] = useState<'timeout' | 'substitution' | null>(null);
```

## 交代でシューターがコートを離れた場合

負傷退場した選手の代わりに、交代で入った選手がFTを打つ。これを扱う。

判定は派生値で持つ（レンダー中の状態更新はしない）:

```ts
const shooter = opponentPlayers.find(p => p.id === shooterPlayerId) ?? null;
const shooterLeftCourt = shooter !== null && !shooter.isOnCourt;
```

### `shooter` ステップの場合

警告を出し、選び直させる。

```
⚠️ シューターが交代でコートを離れました。FTを打つ選手を選び直してください。
```

- 「決定」は押せない状態にする（`shooterLeftCourt` の間は選択が未確定と同じ扱い）
- 候補リストは `isOnCourt` から引き直されるので、交代で入った選手がそのまま並ぶ。規則どおりの選択ができる

### `ftResult` ステップ・FT結果が1つも入っていない場合

まだ1本も打っていないので、素直に選び直せばよい。

```
⚠️ シューターが交代でコートを離れました。
[シューターを選び直す]
```

- ボタンで `shooter` ステップへ戻す
- 「記録」ボタンは `ftAllEntered` が false なので、もともと押せない。追加の制御は要らない

### `ftResult` ステップ・FT結果が入力済みの場合（ケース2）

規則上、成功した分は本人の得点として残り、残りは交代選手が打つ。**1つのファウル記録は1人分のシューターしか持てない**ため、どちらか一方に寄せるほか無い。黙って寄せず、ずれることを明示する。

```
⚠️ シューターが交代でコートを離れました。
すでに入力したFTがあります。この記録が持てるシューターは1人だけなので、
残りを交代選手が打った場合、個人の得点とFT%が実際とずれます。
チームの得点は正しく記録されます。
[シューターを変更]
```

- 「シューターを変更」で `shooter` ステップへ戻す。入力済みの `freeThrowResults` は保持する（既存の `handleBack` と同じく `setStep` するだけ）
- 「記録」はそのまま押せる。どちらの選手で記録するかは記録者の判断に委ねる
- 画面で把握できていれば、試合後に手で補記する判断ができる。これが「黙って誤った記録を作らない」ことの意味

### シューター表示の不具合修正

`ftResult` ステップのシューター表示は、現在 `availableShooters.find(...)`（= `isOnCourt` で絞った配列）から引いている。交代で下がった瞬間に `シューター: #` が空欄になる。

`opponentPlayers` 全体から引くよう直す。離れている場合は上記の警告が併せて出るので、名前が消えるより状況が読める。

## 変えないもの

- `src/types/game.ts`（`FoulRecord` / `FoulWithFreeThrowsBase` のシューターは単数のまま）
- reducer 全般（`handleAddFoulWithFreeThrows` / `handleAddTimeout` / `handleSubstitutePlayer`）
- `RunningScoresheet`（様式・PDF/JPEG出力）
- `TeamPanel`（既存のタイムアウトチップ・交代ボタン）
- `TimeoutInputModal` / `SubstitutionModal` の中身

## テスト

新規テスト: `src/components/FoulInputFlow/FoulInputFlow.interrupt.test.tsx`

### 中断ブロックの表示条件

- `foulType` / `shotSituation` / `shotResult` / `ftCount` の各ステップでは出ない
- `shooter` ステップでシューター未選択のときは出ない
- `shooter` ステップでシューターをタップした後は出る
- `ftResult` ステップでは出る
- `interruptTeams` を渡さない場合はどのステップでも出ない（保留解決フロー相当）
- `onRequestTimeout` を渡さない場合、交代のボタンだけが出る

### チーム選択

- 「タイムアウト」を押すとチーム選択に入れ替わる
- チームを押すと `onRequestTimeout` がそのチームIDで呼ばれ、初期状態に戻る
- 「交代」も同様に `onRequestSubstitution` が呼ばれる
- `timeoutUsed: true` のチームは押せず、「済」が表示される
- 「やめる」で初期状態に戻る
- チーム選択中の Escape は、ステップを戻さずチーム選択だけを閉じる

### 入力状態の保持

- シューター選択後に中断ブロックからタイムアウトを要求しても、`step` と `shooterPlayerId` が保たれる
- FT結果を1本入力した後に交代を要求しても、入力済みの結果が保たれる

### シューターの離脱

- `ftResult` で FT未入力のままシューターが `isOnCourt: false` になる → 警告と「シューターを選び直す」が出る
- `ftResult` で FT入力済みのままシューターが `isOnCourt: false` になる → ずれる旨の警告が出て、「記録」は押せる
- 「シューターを変更」で `shooter` ステップへ戻り、入力済みの結果が消えていない
- `shooter` ステップでシューターが `isOnCourt: false` になる → 「決定」が押せない
- シューターが `isOnCourt: false` でも、`ftResult` のシューター表示に名前と背番号が出る（空欄にならない）

### App 側の結線

- 通常のファウル記録から中断ブロックを使い、タイムアウトモーダルが `FoulInputFlow` の上に開く
- タイムアウトを記録して閉じた後、フローの入力状態が残っている
- 交代を実行して閉じた後、シューター候補が更新されている
- 保留アクション解決のフローでは中断ブロックが出ない

### 退行防止

- 既存の `FoulInputFlow` テスト群（`FoulInputFlow.test.tsx`、`.penalty`、`.noFreeThrow`、`.dialog`、`.keyboard`、`.sixthFoul`、`.targetPlayer`）が通ること
- `App.backGameSubScreen.test.tsx`、`App.backPendingAction.test.tsx` が通ること（モーダルの重なりと戻る操作）
