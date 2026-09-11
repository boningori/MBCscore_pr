# jsdom で踏めない経路を e2e で守る — 設計

- 日付: 2026-09-11
- ステータス: 設計承認済み（2026-09-11）
- 対象: `e2e/`（新規4ファイル）, `e2e/fixtures/seedGame.ts`, `.github/workflows/ci.yml`（コメントのみ）

## 背景

v1.10.0 時点で単体テストは 2319 件あり、jsdom で踏める範囲はかなり厚く守られている。一方 e2e は `scoresheet.spec.ts` の3件（PDF/JPEG 出力）だけで、**試合を記録するという中核の流れは実ブラウザで一度も通っていない**。

問題は件数ではなく、守られていない経路の性質にある。次のものは jsdom に実装が無いか、あっても本物ではないため、単体テストでは原理的に検証できない。

| 経路 | jsdom での状態 | コード側の状況 |
|---|---|---|
| Service Worker によるオフライン起動 | SW が存在しない | `vite.config.ts` に「1本でも落ちると SW の install ごと失敗し、オフライン記録まで道連れになる」という判断が書かれているが、それが守られているか確かめる手立てが無い |
| 端末の戻る操作（popstate） | history はあるが挙動が実物と違う | `useScreenHistorySync` は「実測(v1.6.14・実ブラウザ)」というコメントが並ぶ、手で確かめるしかなかった領域 |
| 自動保存の書き出し（`pagehide` / `visibilitychange`） | イベントを模すだけ | `useGameAutoSave` は 500ms デバウンス中に PWA が凍結される場合を想定して書かれている |
| IndexedDB ミラーバックアップ | `fake-indexeddb` で代替 | 「localStorage が空になったら復元を促す」流れを実物で通したことが無い |

実際、v1.10.0 の総点検で見つけた欠陥のうち「全画面ボタンが iOS で無反応」は、単体テストが全部通っている状態で残っていた類のものだった。

## スコープ

### やること

- 上表の4経路に対して e2e を1本ずつ足す（`e2e/` に4ファイル）
- ミラー復元の検証を成立させるため、フィクスチャに「初回読み込みだけ注入する」選択肢を足す
- 進行中の試合を仕込むフィクスチャを新設する
- `ci.yml` の `deploy` に関するコメントを現状に合わせて書き換える

### やらないこと（YAGNI・今回のスコープ外）

- **`deploy` を e2e のゲートにすること。** 昇格の条件は「次のマイナーリリース（v1.11）を切るときに判断する」と決め、コメントに書き残すに留める。今回4領域を足して安定性の前提が変わるため
- **WebKit / Firefox プロジェクトの追加。** iOS 固有経路（共有シート・`a[download]` の回避・起動画像）は WebKit でも headless では意味のある検証にならない。別途の課題として残す
- **見た目の回帰検査（スクリーンショット比較）。** 手元(Windows)とCI(Linux)でフォントが違い基準画像が食い違う。既存 e2e が避けている判断を踏襲する
- **中核の一本道（試合設定→記録→保存）のスモークテスト。** e2e の持ち場を「jsdom で踏めない経路」に限る方針を採ったため。記録ロジックそのものは単体テストが厚く守っている
- Wake Lock / Fullscreen / getUserMedia の検証。headless Chromium で意味のある表明ができない

## 調査で分かった制約

### 1. 初回読み込みではページが SW に制御されていない

`vite.config.ts` は `registerType: 'prompt'` で、`clientsClaim` を使わない（試合中に足元のチャンクが入れ替わるのを防ぐため）。そのため初回読み込みでは SW が install / activate されても**そのページは制御下に入らない**。

オフラインの検証は次の順を踏む必要がある。

1. 開く（SW が登録・有効化される）
2. `navigator.serviceWorker.ready` を待つ
3. 再読み込みする（ここで制御下に入る）
4. `context.setOffline(true)`
5. もう一度読み込む → precache から返る

precache には `index.html` と全アセットが入っていることを確認済み（15 entries）。ナビゲーションは `navigateFallback` で `index.html` に落ちる。

### 2. `seedRecordedGame` は読み込みのたびに再注入される

`page.addInitScript` は**毎回のページ読み込み前**に走る。ミラー復元の検証は「localStorage が消えた状態で開き直す」ことが前提なので、このままでは消した端から書き戻されて成立しない。

既存3件はこの再注入に依存していない（1回しか読み込まない）ので、既定の挙動は変えずに選択肢として足す。

### 3. ネットワーク遮断は `context.setOffline(true)` を使う

`route.abort()` だと SW 自身の fetch は迂回できてしまい、「本当にオフラインでも動くか」の検証にならない。

## 設計

### フィクスチャ（`e2e/fixtures/seedGame.ts`）

```ts
export interface SeedOptions {
    /** true なら初回読み込みのときだけ注入する（既定 false＝毎回） */
    once?: boolean;
}

export async function seedRecordedGame(
    page: Page,
    record?: GameRecord,
    options?: SeedOptions,
): Promise<void>
```

`once: true` のときは、注入スクリプトの中で sessionStorage の目印を見て1回だけ書く。sessionStorage はタブ内のリロードをまたいで残るので、これで「初回だけ」が成立する。目印のキーは `e2e-seeded` とする（アプリが使う `mbc-restore-dismissed` / `voicememo-session` のいずれとも衝突しない）。

新設:

```ts
/** 第1Q進行中・両チーム5人がコート上の中断セッションを仕込む */
export async function seedInProgressGame(page: Page): Promise<void>
```

`minibasket-game-session` に流し込む。既存の `buildRecord` と同じ考え方で、選手スタッツ・ランニングスコア・チームファウルを1つの並びから機械的に導く（手で書くと読み手の3経路が食い違ったままテストが通る）。

**マイチームも同時に仕込む。** ホームは登録マイチームが1件も無いとメニューを出さず登録案内だけを表示するため（`Home.tsx` の `hasMyTeams`）、セッションだけ入れても「試合を再開」に辿り着けない。`seedRecordedGame` が `toSavedTeam` で行っているのと同じ扱いにする。

### `e2e/offline.spec.ts`

一度開いたあと、通信を切って再読み込みしてもアプリが起動し、画面遷移まで通ること。

- 制約1の順序を踏む
- 仕込みは `seedRecordedGame`（履歴1件＋マイチーム1件）
- 表明は2点:
  1. オフラインのままホームが描画される（アプリ名とメニューが見える）
  2. オフラインのまま**試合履歴を開いて、仕込んだ試合が一覧に出る**

  1点目だけだと「index.html が返っただけ」でも通ってしまう。2点目でJSチャンクが実際に読めて React が動いていることまで見る
- SW の有効化待ちは固定時間ではなく `navigator.serviceWorker.ready` と `navigator.serviceWorker.controller` の有無で判定する

### `e2e/backNavigation.spec.ts`

- ホーム → 試合履歴 → 戻る → ホームに帰る
- 画面上でモーダルを開いて戻る → **モーダルだけ閉じ、画面は残る**（`modalStack` の LIFO が実物の popstate で成立すること）

`useScreenHistorySync` が「実測」コメントで支えている階層を固定する。

### `e2e/sessionResume.spec.ts`

中断試合を再開 → 1点記録 → 再読み込み → 「試合を再開」でその1点が残っていること。

仕込みは `seedInProgressGame`。記録は「選手カードをタップ → 2P → 成功」の経路を使う（得点ボタンはタップでセレクターが開く作り。スワイプは別経路なのでここでは使わない）。

500ms デバウンスと `pagehide` のフラッシュが効いていることを、記録の直後にリロードすることで踏む。**待ち時間は入れない** —— 入れるとデバウンスが満了してしまい、フラッシュ経路を通らずに通ってしまう。

### `e2e/mirrorRestore.spec.ts`

1. データのある状態で開く（`seedRecordedGame(page, FINISHED_GAME, { once: true })`）。起動時スナップショットが実 IndexedDB に入る
2. `localStorage.clear()`（ブラウザのサイトデータ消去を模す。IndexedDB は残る）
3. 開き直すと復元プロンプトが出る
4. 「復元する」を押すと履歴が戻る

スナップショットを取る側と書き戻す側の両方を1本で通す。IndexedDB に直接書き込む形にはしない（それでは「アプリが実際にスナップショットを取ったか」が検証されない）。

### `.github/workflows/ci.yml`

`deploy` の `needs` は `test-and-build` のまま。コメントを次の内容に書き換える。

- 「安定を確かめてから昇格」という当初の条件（フレーク無しの連続成功）は満たされた（10回連続成功）
- ただし今回4領域を足して前提が変わったので据え置く
- **昇格の判断は次のマイナーリリース（v1.11）を切るときに行う**

判断時期を明記するのは、前回「安定を確かめてから」とだけ書いた結果、条件が満たされても誰も動かさなかったため。

## テスト

このスペック自体がテストの追加なので、検証は次の形になる。

- 4本とも**ローカルで実際に通す**（`npm run test:e2e`）
- 各テストが「守るつもりのものが壊れたら落ちる」ことを確かめる。具体的には、実装側を一時的に壊して赤くなることを1本ずつ見る（例: `sw.js` の precache を空にする、`useBackHandler` の登録を外す）。TDD の RED に相当する手順で、これを踏まないと「何も検証していないテスト」が残る
- 既存3件が無変更で通ること（フィクスチャの既定挙動を変えていないことの確認）
- CI で1回通し、e2e ジョブの所要時間を記録する

## リスク

| リスク | 対処 |
|---|---|
| オフライン検証のフレーク（SW 有効化の待ち） | 固定時間で待たず `serviceWorker.ready` と `controller` で判定。CI には既に `retries: 1` がある |
| CI 時間の増加 | 現状 e2e ジョブは 1m2s。+1〜2分の見込み。超えるようなら `fullyParallel` の worker 数を CI でも上げる（現在は `workers: 1`） |
| フィクスチャ変更が既存3件を壊す | `once` は省略可能な追加引数にし、既定は現状の挙動。既存3件は無変更で通ることを確認する |
| テストが実装の写経になる | 上記「実装側を壊して赤くなることを確かめる」手順で防ぐ |
