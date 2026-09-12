# 記録中の復元が、進行中の試合を消さないようにする — 設計

- 日付: 2026-09-12
- ステータス: 設計承認済み（2026-09-12）
- 対象: `src/utils/gameSessionStorage.ts`, `src/utils/mirrorBackup.ts`, `src/utils/dataBackup.ts`, `src/components/Settings/MirrorBackupList.tsx`, `src/components/Settings/AppSettingsModal.tsx`

## 背景

記録中に設定 → データ管理 → 端末内の自動バックアップ → 「この時点に戻す」を実行すると、**復元した中断セッションが無言で元へ戻る**。試合履歴やチームは戻るので、利用者には区別が付かない。

仕組みはこうである。

1. `MirrorBackupList` は復元後に `onRestored()` を呼び、`AppSettingsModal.tsx:788` が `window.location.reload()` する
2. リロードは `pagehide` を発火させる
3. `useGameAutoSave.ts:73` の `flush()` が走り、**メモリ上の試合**を `saveGameSession` で書き戻す
4. 復元で書いた `minibasket-game-session` が、その書き戻しに上書きされる

`flush()` が見ているのは画面と phase だけで、直前に復元が走ったことを知らない。

```ts
const flush = () => {
    const current = latestRef.current;
    if (!isGameScreen(current.screen) || current.phase === 'setup') return;
    ...
    saveGameSession(current.state, current.gameName, current.date);
};
```

実測（Playwright・本番ビルド）:

```
復元直後  : name="復元された試合"        scoreHistory=0
リロード後: name="第40回 市民大会 予選"  scoreHistory=1  points=2
```

記録中に設定へ入る導線は意図して用意されている（`App.tsx:2125` に「保存失敗のトーストが設定画面を案内するため、記録中にも辿り着ける経路が要る」）。到達不能な経路ではない。

起動時の `RestorePrompt` は試合画面ではないため `flush()` が早期 return する。**あちらは安全**で、今回は触らない。

## これは非対称の問題である

同じ課題に復元経路が2つあり、**片方は既に解いている**。

`dataBackup.ts:1198`（全体バックアップの取り込み）:

```ts
// 進行中の試合セッションのインポート（端末に進行中セッションが無い場合のみ復元）
if (data.data.gameSession && !hasGameSession()) {
```

`mirrorBackup.restoreSnapshot`（`:259`）には、これに当たる判断が無い。控えに入っているキーを全部書く。

```ts
for (const [key, value] of entries) {
    localStorage.setItem(key, value);
    applied.push(key);
}
```

なお `restoreSnapshot` は**控えに無いキーには触らない**（全置換ではなく上書き）。そのため現状の挙動は控えを取った時刻に左右される。

- 控えが**試合中**に取られていた → セッションを含む → 書かれる → `flush` が取り消す
- 控えが**試合前**に取られていた → セッションを含まない → 進行中の試合はそのまま残る

つまり結果は正しいこともあるが、**それは事故で決まっている**。規則にする。

## 決めたこと

**復元は、守るべき試合があるあいだ `minibasket-game-session` を書き換えない。**

「守るべき試合」には「試合中」だけでなく「**終了したが未保存**」も含む。後者はまだ履歴に入っていない＝この世に1つしかない記録で、むしろ優先して守る。

進行中の試合を戻す道は用意しない。記録ミスの修正には操作履歴と付け替え（`EditActionModal`）が別にあり、そちらが正しい道具である。復元の確認画面で「試合も戻すか」を尋ねることもしない——記録者が一番追い詰められている場面で、取り返しのつかない選択を迫ることになる。

## 判定をどこに置くか

`gameSessionStorage.ts` に置く。キーを所有しているのがそこだからである。呼び出し側で弾く形にすると、将来3つ目の復元経路が増えたときに忘れられる（いま `mirrorBackup` が忘れているのと同じことが起きる）。

```ts
/** 中断セッションのキー。復元・取り込み側が「書き換えてはいけないもの」として参照する */
export const GAME_SESSION_KEY = 'minibasket-game-session';

/**
 * 復元・取り込みが中断セッションを書き換えてはいけないか。
 *
 * 記録中の試合と、終了したが未保存の試合を守る。読めないセッションは
 * 守らない——中身が壊れていて復元で上書きできるなら、そのほうがよい。
 */
export function isLiveSessionProtected(): boolean {
    return getGameSessionState() !== 'none';
}
```

`getGameSessionState()` を使うのは、`hasGameSession()`（鍵の有無）より意味が正確なためである。壊れて読めないセッションは `'none'` になるので、復元で上書きできる。

## 変更点

### 1. `mirrorBackup.restoreSnapshot`

書き込む `entries` からセッションキーを除く。

除くのは関数の内側で行う。呼び出し側に任せると忘れられるうえ、`restoreSnapshot` は「現在のデータを上書きする」唯一の入口であり、守りをここに置けば経路が増えても漏れない。

### 2. `dataBackup` の条件を揃える

`!hasGameSession()` を `!isLiveSessionProtected()` へ。

**これは挙動の変更である。** 壊れて読めないセッションが残っている端末では、いまは取り込みがセッションを復元できないが、変更後はできるようになる。壊れたものを守る理由が無いので改善だが、動いている経路に手を入れることには変わりないので、明示しておく。

同じ規則を2つの経路が別々の条件で表現している状態をここで解消する。片方だけが解いている、という今回の原因そのものを残さない。

### 3. リロードしない

`AppSettingsModal.tsx:788`:

```ts
<MirrorBackupList onRestored={() => window.location.reload()} />
```

守るべきセッションがあるときはリロードしない。設定を閉じれば試合画面に戻る。履歴もチームも開いた時点で読み直されるので、表示が古いまま残ることはない（`Home.tsx:25` が「描画のたびに読み直す」と書いている理由と同じ）。

リロードを残すと、記録者は試合画面から弾き出され、ホームの「試合を再開」を押し直すことになる。体育館でそれをさせる理由が無い。

**変更1だけでも正しさは回復する**（セッションキーを書かないので、`flush` が同じ内容を書き直すだけになる）。変更3は操作の質の話で、独立している。

### 4. 文言

復元の確認ダイアログに、守るべき試合があるときだけ1行足す。

> 進行中の試合はそのまま続きます。戻るのは試合履歴・チーム・設定です。

「戻せなかった」と読まれないよう、**戻るものを並べる**書き方にする。

## やらないこと

- **`useGameAutoSave` には手を入れない。** `flush` は「落とされる前に書き切る」ためのもので、その判断は正しい。直すべきは「復元が書いたものを、書き換えてよいと思っている」側である
- **起動時の `RestorePrompt` は触らない。** 試合画面ではないので `flush` が早期 return し、同じ事故は起きない
- **複数タブの排他（A-3）と、バックアップの `version` 比較（B）は範囲外。** 別に判断する

## テスト

### 単体

`src/utils/gameSessionStorage.protect.test.ts`（新規）

- 試合中（phase='playing'）→ `isLiveSessionProtected()` が true
- 終了・未保存（phase='finished'）→ true
- セッション無し → false
- 読めないセッション（壊れたJSON）→ false

`src/utils/mirrorBackup.restore.test.ts`（既存・追記）

- 守るべき試合があるとき、`restoreSnapshot` は他のキーを書き、セッションキーだけ元のまま残す
- 守るべき試合が無いとき、セッションキーも控えのとおりに書く
- 控えにセッションキーが無いときは、いまと同じく触らない

`src/components/Settings/AppSettingsModal.restoreUi.test.tsx`（既存・追記）

- 守るべき試合があるとき、復元後にリロードを呼ばない
- 守るべき試合が無いとき、復元後にリロードを呼ぶ

### e2e

`e2e/restoreDuringGame.spec.ts`（新規）を1本足す。

今回の事故は `pagehide` という**実ブラウザでしか踏めない経路**で起きた。jsdom のテストだけを足しても、同じ失敗をもう一度通す。既存の4本（オフライン起動・戻る操作・自動保存フラッシュ・ミラー復元）を足したときと同じ判断である。

内容: 記録中に控えから復元し、**進行中の試合がそのまま残る**ことと、**試合履歴のほうは戻っている**ことを両方確かめる。

## 影響範囲

- `restoreSnapshot` の戻り値の意味は変えない（書けたら true）
- 起動時の復元プロンプト（`RestorePrompt`）の挙動は変わらない
- 試合をしていないときの復元は、いまとまったく同じ
