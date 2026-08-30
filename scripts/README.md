# scripts/

アプリの画像アセットを作り直すためのスクリプト。**ビルドからは呼ばれない**（`npm run build` /
`deploy` に登録していない）。生成物は git にコミットしてあり、元絵やサイズ表を変えたときだけ
開発者が手で実行する。

| スクリプト | 生成物 | 実行 |
|---|---|---|
| `optimize-icons.mjs` | `public/icon-192.png` ほか（`icon-512.png` から縮小） | `node scripts/optimize-icons.mjs` |
| `generate-maskable-icon.mjs` | `public/icon-512-maskable.png` | `node scripts/generate-maskable-icon.mjs` |
| `generate-splash-screens.mjs` | `public/splash/*.png`（40枚・約4.2MB） | `node scripts/generate-splash-screens.mjs` |

入力はいずれも `public/icon-512.png` 1つ。各スクリプトの冒頭コメントに、なぜその加工が要るのか
（maskable のセーフゾーン、iOSが `background_color` を読まないこと）を書いてある。

---

## sharp を上げない判断（`npm audit` の high を残している）

`npm audit` は sharp に **GHSA-f88m-g3jw-g9cj**（libvips の CVE-2026-33327 / 33328 / 35590 /
35591）を high として報告し続けるが、**意図的に上げていない**。次に監査結果を見た人が同じ調査を
やり直さずに済むよう、根拠を残す（2026-08-30 調査）。

### なぜ踏めないか

libvips のこの種の脆弱性は「細工された画像を読み込ませる」ことで踏むもので、ここでは成立しない。

- sharp は **devDependencies** であり、**配布物に入らない**
  （`src/` からの参照なし・`dist/assets/` にも含まれない。利用者の端末には一切届かない）
- `npm run build` / `deploy` から呼ばれない。npm scripts に登録すらしていない
- 動くのは上の3本を開発者が手で叩いたときだけ
- その入力は `public/icon-512.png` ——リポジトリ内の自作ファイル1つ

成立させるには「攻撃者の用意した画像を自分で `public/icon-512.png` に置き、自分でスクリプトを
実行する」必要がある。

### 上げる場合の代償

修正版の 0.35.4 は semver-major だが、破壊的変更の主因は **Node の下限が `>=20.9.0` へ
上がったこと**で、使っている API（`resize` / `composite` / `png` / `toFile` / `metadata` /
`sharp({create})`）は 0.34→0.35 で形が変わっていない。上げること自体は難しくない。

問題は検証のほう。**「上げても同じ画像が出る」ことを確かめるには3本を実行して出力を比べる
必要があり、その時点で `public/splash/` の40枚・4.2MB が書き換わる。** libvips のバージョンが
変われば見た目が同じでも圧縮結果は変わるため、履歴に4MBのバイナリ差分が入り、同一性は目視でしか
確認できない。得られるのは監査ツールの表示だけなので、代償と釣り合わないと判断した。

### 外部スキャンで high 0件を求められた場合

上げるのではなく、**sharp を devDependencies から外し、アイコンを再生成するときだけ
`npm i -D sharp` する**ほうが早い。画像を作り直さずに監査から消えるうえ、常時 21MB
（sharp 本体 0.8MB + プラットフォーム別バイナリ `@img` 20MB）を全員の `node_modules` から
減らせる。その場合はこの表の「実行」列に `npm i -D sharp` を前置きすること。
