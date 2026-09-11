# ミラーバックアップの世代保持を作り直す — 設計

- 日付: 2026-09-11
- ステータス: 設計承認済み（2026-09-11）
- 対象: `src/utils/mirrorBackup.ts`, `src/components/Settings/MirrorBackupList.tsx`, `src/App.tsx`（呼び出し4か所）

## 背景

`mirrorBackup` は localStorage のアプリデータを IndexedDB へ複製し、ブラウザによるデータ消去から復旧する手段を提供する。保持則は「新しい順に10世代」だけである。

```ts
const MAX_GENERATIONS = 10;
const MIN_SNAPSHOT_INTERVAL_MS = 30_000;
```

`maybeSnapshot()` は `useGameAutoSave` から呼ばれ、試合中は自動保存のたびに（最短30秒間隔で）走る。つまり **1試合録るだけで10世代すべてがその試合の最後の5分で埋まり、それ以前は全部押し出される**。

一方 `MirrorBackupList` は、この機能が救うつもりだった場面を自分でこう書いている。

> 誤って削除した・不正なデータを取り込んで上書きした・保存に失敗した、といった場合はどれも救えないままだった。

この3つは気づくのが数時間〜数日後である。5分しか遡れない保持則とは噛み合っていない。

あわせて、一覧の読み出しにも問題がある。`getAllSnapshots()` は `store.getAll()` で**全世代の `entries` を丸ごとメモリへ載せる**。一覧が使うのは日時と項目数だけで、履歴が 3MB ある利用者なら 10世代で 30MB を読むことになる。世代を増やすとそのまま倍になるため、保持則と一緒に直す。

## スコープ

### やること

- スナップショットに `reason` を持たせ、**定期（回転）** と **区切り（保護）** の2枠に分ける
- 区切りの世代が、試合中の定期スナップショットに追い出されないようにする
- 起動時の世代は同じ暦日に1つまでに絞る
- `gameEnd` を「履歴に保存できた直後」で取る（いまは未保存の状態を写している）
- 復元を実行する直前に `beforeRestore` を取る（誤った世代へ戻したときの戻り道）
- 保持則を IndexedDB から切り離し、純関数として検査できるようにする
- 一覧が全世代の中身を読み込むのをやめる
- 一覧と確認ダイアログに「何の時点か」を出す

### やらないこと（YAGNI・今回のスコープ外）

- **時間帯で薄める保持（直近◯件・1時間ごと・1日ごと）。** それが余分に救うのは「試合中でもない、区切りでもない、3時間前の状態」で、救う場面として挙がっていない。区切りが自然に数日〜数週間へ散らばるので、時間軸の網羅は結果としてついてくる
- **差分保存・内容の重複排除。** 試合中の連続する世代は `minibasket-game-session` しか違わないので理屈の上では効くが、内容アドレス方式の保存に作り替えることになる。保持則を直せば枠の浪費は止まるので、いま要らない
- **保存量に応じた保持数の自動調整。** localStorage の無制限増加は別の課題（未着手のG）として立っている。そちらの結論が出る前にここで先回りしない
- **古い世代の書き換えを伴う移行。** 既存の世代は `reason` を持たないまま読めるようにする
- 世代の手動削除UI、世代への手動の名前付け

## 調査で分かった制約

### 1. `saveSnapshot` の呼び出しは4か所ある

| 場所 | いつ | 与える `reason` |
|---|---|---|
| `App.tsx` 起動時の effect | アプリを開いたとき（復元候補が無ければ） | `startup` |
| `App.tsx` `phase === 'finished'` の effect | 試合終了の画面が出たとき | `periodic` |
| `App.tsx` `RestorePrompt` の `onDismiss` | 「復元せずに始める」を押したとき | `startup` |
| `useGameAutoSave` の `maybeSnapshot()` ×3 | 自動保存・画面離脱・フラッシュ | `periodic` |

`phase === 'finished'` を `periodic` にするのは、それが写すのが**まだ履歴に保存していない状態**だからである。区切り＝確定した状態、定期＝進行中の保護、と意味を揃える。

`RestorePrompt` の `onDismiss` は、`restoreCandidate` が立つ条件が `!hasAppData()` であるため `collectAppData()` が空になり、`saveSnapshot` の早期 return で実際には何も書かれないことが多い。到達しうる経路として `reason` は与えるが、挙動は変えない。

### 2. 「履歴に保存できた直後」の世代は、いまどこでも取られていない

`handleGameFinished`（`App.tsx`）は `saveGameResult` の成功後に `clearGameSession()` してホームへ移るだけで、スナップショットを取らない。「試合単位で戻る」が求めるのはまさにこの時点なので、ここに `gameEnd` を足す。

### 3. 復元の直前にも世代は取られていない

`MirrorBackupList` は `restoreSnapshot(pending)` をいきなり呼ぶ。誤った世代を選ぶと現在のデータが上書きされ、**戻る手段が無い**。一覧に理由が出て選びやすくなるぶん復元の敷居は下がるので、その手前に `beforeRestore` を置く。

### 4. 旧世代は `reason` を持たない

IndexedDB のインデックスは、キーパスの値が `undefined` のレコードを載せない。よって `reason` にインデックスを張れば、**「どのインデックスにも載っていない主キー」がそのまま旧世代の判別になる**。値を書き直す移行は要らない。

### 5. 暦日の判定は現地時刻で行う

`localDate.ts` の `formatInputDate(date)` が現地時刻の `YYYY-MM-DD` を返す。UTC で切ると朝9時前が前日になる（ミニバスは9時開始・8時台受付が普通、という同ファイルの既出の理由がそのまま当てはまる）。起動世代の「1日1つ」判定にこれを使う。

## 設計

### 型

```ts
export type SnapshotReason = 'periodic' | 'gameEnd' | 'startup' | 'beforeRestore';

export interface MirrorSnapshot {
    timestamp: number;
    entries: Record<string, string>;
    /** なぜこの世代が取られたか。v1 が書いた世代は持たない（未設定＝periodic 扱い） */
    reason?: SnapshotReason;
}

/** 一覧のための軽い情報。entries を読まずに得られるものだけ */
export interface SnapshotMeta {
    timestamp: number;
    reason?: SnapshotReason;
}
```

`DB_VERSION` を 1→2 へ。`onupgradeneeded` でストアが無ければ作り（従来どおり）、`reason` のインデックスを張る。

### 保持数

```ts
/** 定期（回転）。試合中の消失で実際に使うのは最新1件で、残りは保険 */
const MAX_PERIODIC = 3;
/** 区切り（保護）。週2試合＋週3日起動で約2.4週間分 */
const MAX_MILESTONES = 12;
```

最大15世代。いまの10から 1.5倍になる。履歴が 5MB（容量警告が出る水準）の利用者で IndexedDB 約75MB。

### 保持則は純関数に出す

```ts
/** 消すべき世代の timestamp を返す。定期と区切りを別々に数える */
export function selectExpiredSnapshots(metas: SnapshotMeta[]): number[];

/** 同じ暦日の startup が既にあるか（現地時刻で判定） */
export function hasStartupSnapshotToday(metas: SnapshotMeta[], now: number): boolean;
```

いまの保持則は `saveSnapshot` の中の IndexedDB トランザクションに埋まっていて、`fake-indexeddb` を経由しないと確かめられない。切り出して、保持の判断だけを直接検査できるようにする。

`reason` が未設定の世代は `periodic` として数える。

### `saveSnapshot` の流れ

```
saveSnapshot(reason, now):
  1. entries を集める。空なら何もしない（既存世代を空で潰さないための既存の守り）
  2. reason === 'startup' で、同じ暦日の startup が既にあれば何もしない
  3. { timestamp: now, entries, reason } を put
  4. selectExpiredSnapshots の結果を delete
```

シグネチャは `saveSnapshot(reason: SnapshotReason, now?: number)` に変わる。`now` はテストのための引数で、位置が第1→第2へ移る（既存テストの呼び出しは書き換える）。

`maybeSnapshot()` は `saveSnapshot('periodic', now)` を呼ぶ。最短間隔30秒は変えない。

### 一覧の読み出し

```ts
/** 日時と理由だけを返す。entries は読まない */
export async function getSnapshotMetas(): Promise<SnapshotMeta[]>;

/** 復元する1件だけを読む */
export async function getSnapshot(timestamp: number): Promise<MirrorSnapshot | null>;
```

`getSnapshotMetas` は主キーの一覧（`store.getAllKeys()`）と、`reason` ごとのインデックスの主キー一覧（`index.getAllKeys(reason)`）を突き合わせて組み立てる。どちらもレコード本体を読まない。どのインデックスにも載っていない主キーは旧世代なので `reason` を未設定のままにする。

`getAllSnapshots()` は消す。本番コードの利用は `MirrorBackupList`（→ `getSnapshotMetas` へ）と `getLatestSnapshot()` の2つだけで、後者は「最後の主キーを引いて1件読む」へ寄せる。`getLatestSnapshot()` は `RestorePrompt` が項目数を表示し `restoreSnapshot()` へ渡すため、**中身を含む完全な世代を返し続ける**。

`getAllSnapshots()` は `mirrorBackup.test.ts` が保持数の検査（`expect(all).toHaveLength(10)`）にも使っている。保持則の検査は `selectExpiredSnapshots` の単体テストと `getSnapshotMetas()` を使う統合テストへ移す。中身を読まないぶん、こちらのほうが検査としても素直になる。

### `MirrorBackupList`

- `getSnapshotMetas()` で一覧を作る
- 各行に**理由のラベル**を出す

  | `reason` | ラベル |
  |---|---|
  | `gameEnd` | 試合を保存した直後 |
  | `startup` | アプリを開いたとき |
  | `beforeRestore` | 復元を実行する直前 |
  | `periodic` / 未設定 | 記録中の自動保存 |

- 「この時点に戻す」で `getSnapshot(timestamp)` を読み、確認ダイアログに理由と項目数を出す
- 確認を通ったら、**まず `saveSnapshot('beforeRestore')` を取ってから** `restoreSnapshot()` を実行する
- 失敗時に案内を出す挙動（v1.10 で入れたもの）は維持する

## テスト

- `selectExpiredSnapshots` / `hasStartupSnapshotToday` の単体テスト（IndexedDB 不要）
  - 定期が3を超えたら古い定期だけが落ちる
  - **区切りは定期に押し出されない**（この設計の主眼）
  - 区切りが12を超えたら古い区切りが落ちる
  - `reason` 未設定の旧世代は定期として数える
  - 同じ暦日の `startup` を現地時刻で判定する（UTC 境界をまたぐ時刻で確かめる）
- `saveSnapshot` の統合テスト（`fake-indexeddb`）
  - 試合中の定期スナップショットを20回打っても、`gameEnd` の世代が残っている
  - 同じ日に2回目の `startup` を取らない
  - 旧スキーマ（`reason` 無し）の世代が読めて、削除対象の判定に入る
- `getSnapshotMetas` が `entries` を読まないこと。`getAll` を使っていないことを、ストアの `getAll` を差し替えて確認する
- `MirrorBackupList` の表示テスト（理由ラベル、確認ダイアログの文言、復元前の `beforeRestore`）
- 既存テストの手当て
  - `mirrorBackup.test.ts` … `saveSnapshot` の呼び出しを新シグネチャへ。「10世代を超えた古いスナップショットは削除される」は新しい保持則のテストへ置き換える（`getAllSnapshots` を使わず `getSnapshotMetas` で見る）
  - `mirrorBackup.restore.test.ts` / `.prefix.test.ts` … 保持則に触れないので、呼び出しのシグネチャだけ
  - `MirrorBackupList.test.tsx` … `getAllSnapshots` のモックを `getSnapshotMetas` + `getSnapshot` のモックへ。v1.10 で入れた「書き戻しに失敗したら、リロードせずに失敗を伝える」の2件は**挙動を変えずに通し続けること**

## リスク

| リスク | 対処 |
|---|---|
| 更新直後、旧世代10件がすべて定期扱いになり3件まで落ちる | 落ちるのは最後の試合の終盤5分ぶんで、価値が低い。かつ同じ起動で `startup` の区切りが1件入るので、遡れる範囲は更新前より広がる |
| 保存量が 1.5倍になる | 承認済みの判断。重ければ `MAX_MILESTONES` を下げるだけで効く（純関数なので影響範囲が閉じている） |
| `reason` インデックスの追加で `onupgradeneeded` が走る。失敗すると機能ごと無効化される | `saveSnapshot` / 読み出しはいずれも例外を握って `console.warn` する既存の作りのまま。アプリ本体は影響を受けない |
| `beforeRestore` の世代が保護枠を食う | 復元は稀な操作で、12枠の中で回る。頻繁に復元する人は、そもそも直近の状態に関心がある |
