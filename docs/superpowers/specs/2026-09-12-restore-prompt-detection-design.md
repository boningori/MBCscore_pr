# データ消失の検知を、アプリが自分で書き戻すキーに惑わされないようにする — 設計

- 日付: 2026-09-12
- ステータス: 設計承認済み（2026-09-12）
- 対象: `src/utils/mirrorBackup.ts`, `src/App.tsx`

## 背景

起動時の復元プロンプトは `!hasAppData()` のときだけ出る（`App.tsx:263`）。

```ts
if (!hasAppData() && !sessionStorage.getItem('mbc-restore-dismissed')) {
    const snapshot = await getLatestSnapshot();
    ...
}
```

その `hasAppData()` は「`minibasket-` / `mbc_` / `mbc-` で始まるキーが1つでもあるか」である（`mirrorBackup.ts:103-118`）。

```ts
export function hasAppData(): boolean {
    return Object.keys(collectAppData()).length > 0;
}
```

ところが、**アプリ自身が利用者の操作なしに書き戻すキーが3つある**。

| キー | 書く契機 |
|---|---|
| `minibasket-game-session` | `useGameAutoSave` の自動保存。リロード時は `pagehide` のフラッシュでも書く |
| `minibasket-session-owner` | `useSessionOwnership` の5秒ごとの心拍（v1.14） |
| `mbc_error_log` | `window.error` / `unhandledrejection` の恒久ハンドラ |

どれか1つでも復活すれば `hasAppData()` は真になり、**プロンプトは二度と出ない**。

実測（Playwright・本番ビルド）:

```
1) 記録中のキー = ["minibasket-game-session","minibasket-session-owner","minibasket-my-teams"]
2) 消去直後     = []
3) 6.5秒後      = ["minibasket-session-owner"]        ← 心拍だけが復活
4) 復元プロンプト = 出ない
```

心拍を止めた版でも同じ結果になる（`pagehide` のフラッシュが `minibasket-game-session` を書き戻す）。**v1.14 で入った心拍が原因ではなく、以前からある欠陥で、心拍は経路を1本増やしただけ**である。

起きる場面は、まさにミラーバックアップが救うつもりの場面——ブラウザが記録中にサイトデータを追い出す——である。利用者は履歴もチームも設定も失ったうえ、IndexedDB に完全な控えがあるのにアプリからは何も案内されない。設定 →「端末内の自動バックアップ」から手で戻せるが、そこを知らない人には届かない。

コードベース自身がこの危うさを書いている（`mirrorBackup.restore.test.ts:6-7`）。

> 一部だけ書けた状態が残るため、次回起動では hasAppData() が真になり復元プロンプト自体が二度と出ない（やり直せなくなる）

復元の巻き戻し経路は塞いだが、「アプリが自分のキーを書き戻す」経路は見落とされていた。

## 決めたこと

**「アプリのキーがあるか」ではなく「失ったら困るデータがあるか」で判定する。**

自動で書き戻る3つを除外する形（ブラックリスト）は採らない。今回の事故は「新しいキーを黙って数えてしまう規則」から起きた。除外を並べる形では、4つ目の自動キーが増えたときに同じ見落としが起きる——まさに v1.14 の心拍がそうなった。

列挙（ホワイトリスト）なら、**入れ忘れても「プロンプトが余計に出る」側に倒れる**。利用者は断れる。逆向きの失敗——本当に消えているのに黙っている——には倒れない。

### 守るべきデータ

| キー | 中身 |
|---|---|
| `minibasket-game-history` | 試合記録 |
| `minibasket-my-teams` | マイチーム |
| `minibasket-opponent-teams` | 対戦チーム |
| `minibasket-saved-opponents` | 最近の対戦相手 |
| `minibasket-hidden-players` | 非表示にした選手 |
| `minibasket-merged-players` | 選手の統合設定 |
| `minibasket-app-settings` | アプリ設定 |
| `mbc_gemini_api_key` | 利用者が入力したAPIキー |

### 数えないもの

| キー | 理由 |
|---|---|
| `minibasket-game-session` | 自動保存が書き戻す |
| `minibasket-session-owner` | 心拍が書き戻す |
| `mbc_error_log` | エラーハンドラが書き戻す |
| `minibasket-install-guide-dismissed` | UIの旗。失っても困らない |
| `minibasket-last-backup` | 最終バックアップ時刻。これだけ残っても戻すものが無い |

`minibasket-tab-id` と `mbc-restore-dismissed` は sessionStorage、`mbc-mirror-backup` は IndexedDB の名前、`mbc-storage-error` は CustomEvent の名前なので、そもそも対象外。

## 作り

`hasAppData()` を **`hasRestorableUserData()` に置き換える**。並立させない——似た判定が2つあると、次に書く人がどちらを呼ぶべきか迷い、今回と同じ取り違えが起きる。呼び出し元は `App.tsx:263` の1箇所だけなので、置き換えは閉じている。

```ts
/**
 * 失ったら困るデータが localStorage に残っているか。
 *
 * 「アプリのキーがあるか」では駄目だった。…（理由）
 *
 * 新しいキーを足したら、ここで「失ったら困るか」を決める。迷ったら入れない
 * ——入れ忘れてもプロンプトが余計に出るだけで、失う側へは倒れない。
 */
export function hasRestorableUserData(): boolean;
```

判定は「一覧のいずれかのキーが存在し、かつ中身が空でない」。空配列 `[]` や空オブジェクト `{}` だけが残っている状態を「データあり」と数えない——取り込みの巻き戻しで空が書かれることがあり、それでプロンプトが塞がれては元の木阿弥である。

`collectAppData()` は**変えない**。控えには全部入れる（セッションも含めて丸ごと戻せることに意味がある）。

## やらないこと

- **`useGameAutoSave` の `pagehide` フラッシュは触らない。** 「落とされる前に書き切る」判断は正しい
- **心拍も触らない。** v1.14 の守りはそのまま
- **`mbc_error_log` の書き込みも触らない。** エラーの記録は残すべきもの
- **手動の復元導線（設定 → 端末内の自動バックアップ）は変えない**

## テスト

`src/utils/mirrorBackup.restorable.test.ts`（新規）

- 何も無ければ偽
- `minibasket-game-history` があれば真
- `mbc_gemini_api_key` があれば真
- **セッション・心拍の印・エラーログの3つだけなら偽**（今回の事故そのもの）
- UIの旗（`install-guide-dismissed`）と最終バックアップ時刻だけなら偽
- 中身が空（`[]` / `{}`）のキーだけなら偽

`src/App.restorePrompt.test.tsx`（新規）

- セッションと心拍の印だけが残っていて、控えがあるとき、復元プロンプトが出る
- 試合履歴が残っているときは出ない

`e2e/restorePromptAfterWipe.spec.ts`（新規）

実測に使った手順をそのまま固定する。`pagehide` のフラッシュも心拍も実ブラウザでしか回らないので、jsdom のテストだけでは守りにならない。

## 影響範囲

- 控えの中身は変わらない（`collectAppData` 不変）
- 復元そのものの動き（`restoreSnapshot`）は変わらない
- データが本当に残っている利用者には、いままでどおりプロンプトは出ない
