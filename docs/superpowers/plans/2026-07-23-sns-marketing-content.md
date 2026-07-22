# SNS機能紹介シリーズ（投稿カード＋文面集）実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** X/Instagram向けの機能紹介シリーズ全7投稿分の「1080×1080カード画像ギャラリー（`public/SNS_CARDS.html`）」と「投稿文面集（`docs/marketing/sns-posts.md`）」を作成する。

**Architecture:** FLYER.htmlと同じ設計思想（単一HTML・ローカル完結・外部リソースなし）で、7枚のカードを縦に並べたギャラリーページを作る。カードは実寸1080×1080でレンダリングし、画面上はCSS transformで50%縮小表示（トグルで実寸切替）。文面はMarkdown 1ファイルに集約。

**Tech Stack:** 素のHTML/CSS（＋表示切替用の最小JS）。ビルド不要、`public/` 配下の静的ファイルのみ。

## Global Constraints

- 外部CDN・外部フォント・外部画像・外部APIへの参照は一切禁止（ローカル完結）。スペック準拠。
- カードの実寸レンダリング領域は 1080×1080px を厳守。
- カード本文の最小フォントサイズは 28px（1080px実寸基準）。
- アプリURLは `https://boningori.github.io/MBCscore_pr/` 固定。
- デザイントークンは FLYER.html のものを使用: `--primary-bg: #0a1628`, `--secondary-bg: #111d35`, `--accent-blue: #3b82f6`, `--accent-green: #10b981`, `--accent-orange: #f59e0b`, `--accent-red: #ef4444`, `--text-white: #f1f5f9`, `--text-muted: #94a3b8`, `--glass-bg: rgba(255,255,255,0.04)`, `--glass-border: rgba(255,255,255,0.08)`。
- フォントスタック: `'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Helvetica Neue', Arial, sans-serif`（システムフォント、外部読み込みなし）。
- X本文はX計量（ASCII=1, 非ASCII=2, URL=23、上限280）以内に収める。
- コミットメッセージ末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` を付ける。
- 検証用devサーバー: `.claude/launch.json` の `dev`（`npm run dev`、port 5173）。ページURLは `http://localhost:5173/MBCscore_pr/SNS_CARDS.html`（Viteのbaseが `/MBCscore_pr/`）。

---

### Task 1: SNS_CARDS.html の骨格（トークン・カードフレーム・縮小表示トグル）

**Files:**
- Create: `public/SNS_CARDS.html`

**Interfaces:**
- Produces: `.card-frame > .card` 構造、共通クラス `.card-kicker` `.card-title` `.card-lead` `.card-visual` `.card-footer` `.glass-panel` `.badge`。Task 2〜4 はこのクラス群と `<!-- CARD_SLOT -->` コメント位置にカードを追記する。

- [ ] **Step 1: 骨格HTMLを書く**

`public/SNS_CARDS.html` を以下の内容で新規作成する:

```html
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MBCscore SNS投稿カード</title>
    <style>
        :root {
            --primary-bg: #0a1628;
            --secondary-bg: #111d35;
            --accent-blue: #3b82f6;
            --accent-blue-dark: #2563eb;
            --accent-green: #10b981;
            --accent-orange: #f59e0b;
            --accent-red: #ef4444;
            --text-white: #f1f5f9;
            --text-muted: #94a3b8;
            --glass-bg: rgba(255, 255, 255, 0.04);
            --glass-border: rgba(255, 255, 255, 0.08);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            background: #000;
            font-family: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Helvetica Neue', Arial, sans-serif;
            color: var(--text-white);
            padding: 40px 20px 80px;
        }

        .page-header {
            max-width: 1080px;
            margin: 0 auto 32px;
            text-align: center;
        }
        .page-header h1 { font-size: 24px; margin-bottom: 8px; }
        .page-header p { font-size: 14px; color: var(--text-muted); line-height: 1.7; }

        /* ====== カードフレーム（画面上は50%縮小、トグルで実寸） ====== */
        .card-frame {
            width: 540px;
            height: 540px;
            margin: 0 auto 48px;
            overflow: hidden;
            border-radius: 8px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
        }
        .card {
            width: 1080px;
            height: 1080px;
            transform: scale(0.5);
            transform-origin: top left;
            background: var(--primary-bg);
            position: relative;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        body.fullsize .card-frame { width: 1080px; height: 1080px; }
        body.fullsize .card { transform: none; }

        /* ====== カード背景装飾 ====== */
        .card::before {
            content: '';
            position: absolute;
            inset: 0;
            background-image: radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px);
            background-size: 24px 24px;
            pointer-events: none;
        }
        .orb {
            position: absolute;
            border-radius: 50%;
            pointer-events: none;
        }
        .orb--blue {
            width: 700px; height: 700px; top: -260px; right: -220px;
            background: radial-gradient(circle, rgba(59, 130, 246, 0.30) 0%, transparent 70%);
        }
        .orb--green {
            width: 560px; height: 560px; bottom: -220px; left: -180px;
            background: radial-gradient(circle, rgba(16, 185, 129, 0.22) 0%, transparent 70%);
        }

        /* ====== カード内共通パーツ ====== */
        .card-body {
            position: relative;
            z-index: 1;
            flex: 1;
            display: flex;
            flex-direction: column;
            padding: 72px 80px 0;
        }
        .card-kicker {
            font-size: 30px;
            font-weight: 700;
            letter-spacing: 0.08em;
            color: var(--accent-orange);
            margin-bottom: 20px;
        }
        .card-title {
            font-size: 72px;
            font-weight: 900;
            line-height: 1.25;
            margin-bottom: 24px;
        }
        .card-title .accent { color: var(--accent-blue); }
        .card-lead {
            font-size: 34px;
            line-height: 1.6;
            color: var(--text-muted);
        }
        .card-visual {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 40px;
        }
        .card-footer {
            position: relative;
            z-index: 1;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 80px 56px;
        }
        .footer-brand {
            display: flex;
            align-items: center;
            gap: 16px;
            font-size: 34px;
            font-weight: 900;
        }
        .footer-brand img { width: 56px; height: 56px; border-radius: 12px; }
        .footer-url {
            font-size: 28px;
            color: var(--accent-blue);
            font-weight: 700;
        }

        .glass-panel {
            background: var(--glass-bg);
            border: 2px solid var(--glass-border);
            border-radius: 28px;
            padding: 40px;
        }
        .badge {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            background: var(--glass-bg);
            border: 2px solid var(--glass-border);
            border-radius: 999px;
            padding: 16px 36px;
            font-size: 32px;
            font-weight: 700;
        }

        /* ====== 表示切替ボタン ====== */
        #sizeToggle {
            position: fixed;
            top: 16px;
            right: 16px;
            z-index: 10;
            background: var(--accent-blue);
            color: #fff;
            border: none;
            border-radius: 8px;
            padding: 10px 18px;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            font-family: inherit;
        }
    </style>
</head>
<body>
    <button id="sizeToggle" onclick="document.body.classList.toggle('fullsize'); this.textContent = document.body.classList.contains('fullsize') ? '縮小表示に戻す' : '実寸表示 (1080px)';">実寸表示 (1080px)</button>

    <div class="page-header">
        <h1>🏀 MBCscore SNS投稿カード</h1>
        <p>各カードは実寸1080×1080pxです。「実寸表示」に切り替えてカード単位でスクリーンショットを撮り、<br>X / Instagram の投稿画像として使用してください。文面は docs/marketing/sns-posts.md 参照。</p>
    </div>

    <!-- CARD_SLOT -->

</body>
</html>
```

- [ ] **Step 2: ブラウザで検証**

devサーバー（`.claude/launch.json` の `dev`）を起動し、`http://localhost:5173/MBCscore_pr/SNS_CARDS.html` を開く。
Expected: ヘッダーとトグルボタンが表示され、コンソールエラーがない。トグルで `fullsize` クラスが付け外しされる。

- [ ] **Step 3: コミット**

```bash
git add public/SNS_CARDS.html
git commit -m "feat(sns): SNS投稿カードギャラリーの骨格を追加"
```

---

### Task 2: カード1「告知」（QRコード入り）

**Files:**
- Modify: `public/SNS_CARDS.html`（`<!-- CARD_SLOT -->` の直前にカードを追加。以降のタスクも同様に追記し、`<!-- CARD_SLOT -->` は残す）

**Interfaces:**
- Consumes: Task 1 の共通クラス群。
- Produces: `id="card-1"` のカード。QRコードのdata URIは `public/FLYER.html` の945行目付近（`<img src="data:image/png;base64,iVBOR...` で始まる行）から**そのまま全文コピー**して使う（新規生成しない）。

- [ ] **Step 1: カード1のマークアップを追加**

`<!-- CARD_SLOT -->` の直前に以下を挿入する。`【QR_DATA_URI】` の箇所は `public/FLYER.html` のQR `<img>` の `src` 属性値（`data:image/png;base64,` から始まる文字列全体）で置き換えること:

```html
    <!-- カード1: 告知 -->
    <div class="card-frame">
        <div class="card" id="card-1">
            <div class="orb orb--blue"></div>
            <div class="orb orb--green"></div>
            <div class="card-body" style="align-items: center; text-align: center; padding-top: 88px;">
                <img src="./icon-512.png" alt="MBCscore" style="width: 160px; height: 160px; border-radius: 36px; margin-bottom: 36px; box-shadow: 0 12px 40px rgba(59, 130, 246, 0.35);">
                <h2 class="card-title" style="font-size: 76px;">ミニバスのスコア記録、<br><span class="accent">スマホ1台</span>で。</h2>
                <p class="card-lead">ミニバス専用デジタルスコアシート「MBCscore」</p>
                <div style="display: flex; gap: 24px; margin-top: 44px;">
                    <span class="badge">✅ 完全無料</span>
                    <span class="badge">✅ 登録不要</span>
                    <span class="badge">✅ オフラインOK</span>
                </div>
                <div style="display: flex; align-items: center; gap: 28px; margin-top: 48px;">
                    <div style="background: #fff; border-radius: 20px; padding: 14px;">
                        <img src="【QR_DATA_URI】" alt="QRコード" style="width: 190px; height: 190px; display: block;">
                    </div>
                    <p style="font-size: 30px; color: var(--text-muted); text-align: left; line-height: 1.6;">📷 スキャンして<br>今すぐ使える</p>
                </div>
            </div>
            <div class="card-footer">
                <div class="footer-brand"><img src="./icon-512.png" alt="">MBCscore</div>
                <div class="footer-url">boningori.github.io/MBCscore_pr</div>
            </div>
        </div>
    </div>
```

- [ ] **Step 2: ブラウザで検証**

`http://localhost:5173/MBCscore_pr/SNS_CARDS.html` を再読み込み。
Expected: カード1が表示され、アイコン・QRとも表示される（壊れ画像アイコンがない）。実寸表示でタイトル・バッジ・QRがカード内に収まり文字切れがない。

- [ ] **Step 3: コミット**

```bash
git add public/SNS_CARDS.html
git commit -m "feat(sns): カード1(告知)を追加 - QRコードはFLYERからローカル埋め込みを流用"
```

---

### Task 3: カード2〜4（フリック入力・保留機能・JBAスコアシート）

**Files:**
- Modify: `public/SNS_CARDS.html`（`<!-- CARD_SLOT -->` の直前に3枚追加）

**Interfaces:**
- Consumes: Task 1 の共通クラス群。
- Produces: `id="card-2"` 〜 `id="card-4"`。

- [ ] **Step 1: カード2（フリック入力）を追加**

```html
    <!-- カード2: フリック入力 -->
    <div class="card-frame">
        <div class="card" id="card-2">
            <div class="orb orb--blue"></div>
            <div class="orb orb--green"></div>
            <div class="card-body">
                <p class="card-kicker">MBCscore 機能紹介 #1</p>
                <h2 class="card-title">コートから目を離さない。<br><span class="accent">フリック</span>で高速入力</h2>
                <div class="card-visual">
                    <div class="glass-panel" style="text-align: center; width: 380px;">
                        <div style="font-size: 110px; color: var(--accent-green);">⬆️</div>
                        <p style="font-size: 44px; font-weight: 900; color: var(--accent-green); margin-top: 12px;">上フリック</p>
                        <p style="font-size: 34px; margin-top: 8px;">得点（成功）</p>
                    </div>
                    <div class="glass-panel" style="text-align: center; width: 380px;">
                        <div style="font-size: 110px; color: var(--accent-red);">⬇️</div>
                        <p style="font-size: 44px; font-weight: 900; color: var(--accent-red); margin-top: 12px;">下フリック</p>
                        <p style="font-size: 34px; margin-top: 8px;">シュートミス</p>
                    </div>
                </div>
                <p class="card-lead" style="text-align: center; padding-bottom: 40px;">試合のテンポを崩さず、プレーを見ながら記録。</p>
            </div>
            <div class="card-footer">
                <div class="footer-brand"><img src="./icon-512.png" alt="">MBCscore</div>
                <div class="footer-url">boningori.github.io/MBCscore_pr</div>
            </div>
        </div>
    </div>
```

- [ ] **Step 2: カード3（保留機能）を追加**

```html
    <!-- カード3: 保留機能 -->
    <div class="card-frame">
        <div class="card" id="card-3">
            <div class="orb orb--blue"></div>
            <div class="orb orb--green"></div>
            <div class="card-body">
                <p class="card-kicker">MBCscore 機能紹介 #2</p>
                <h2 class="card-title">「今の、<span class="accent">誰！？</span>」<br>でも慌てない。</h2>
                <div class="card-visual" style="flex-direction: column; gap: 24px;">
                    <div class="glass-panel" style="display: flex; align-items: center; gap: 28px; width: 820px; padding: 28px 40px;">
                        <span style="font-size: 40px; font-weight: 900; color: var(--accent-blue);">STEP 1</span>
                        <span style="font-size: 36px;">まず<b>得点だけ</b>記録（保留）</span>
                    </div>
                    <div style="font-size: 48px; color: var(--text-muted);">⬇️</div>
                    <div class="glass-panel" style="display: flex; align-items: center; gap: 28px; width: 820px; padding: 28px 40px; border-color: rgba(16, 185, 129, 0.4);">
                        <span style="font-size: 40px; font-weight: 900; color: var(--accent-green);">STEP 2</span>
                        <span style="font-size: 36px;">選手が分かったら<b>後から紐付け</b></span>
                    </div>
                </div>
                <p class="card-lead" style="text-align: center; padding-bottom: 40px;">背番号を見逃しても、記録漏れゼロ。</p>
            </div>
            <div class="card-footer">
                <div class="footer-brand"><img src="./icon-512.png" alt="">MBCscore</div>
                <div class="footer-url">boningori.github.io/MBCscore_pr</div>
            </div>
        </div>
    </div>
```

- [ ] **Step 3: カード4（JBA準拠スコアシート）を追加**

```html
    <!-- カード4: JBA準拠スコアシート -->
    <div class="card-frame">
        <div class="card" id="card-4">
            <div class="orb orb--blue"></div>
            <div class="orb orb--green"></div>
            <div class="card-body">
                <p class="card-kicker">MBCscore 機能紹介 #3</p>
                <h2 class="card-title">ワンタップで完成。<br><span class="accent">JBA準拠</span>スコアシート</h2>
                <div class="card-visual">
                    <div style="background: #f8fafc; color: #0a1628; border-radius: 16px; width: 460px; padding: 32px; box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);">
                        <p style="font-size: 30px; font-weight: 900; text-align: center; letter-spacing: 0.1em;">SCORE SHEET</p>
                        <div style="border-top: 3px solid #0a1628; margin: 16px 0;"></div>
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">
                            <div style="height: 44px; background: #e2e8f0; border-radius: 4px;"></div>
                            <div style="height: 44px; background: #e2e8f0; border-radius: 4px;"></div>
                            <div style="height: 44px; background: #e2e8f0; border-radius: 4px;"></div>
                            <div style="height: 44px; background: #e2e8f0; border-radius: 4px;"></div>
                            <div style="height: 44px; background: #e2e8f0; border-radius: 4px;"></div>
                            <div style="height: 44px; background: #e2e8f0; border-radius: 4px;"></div>
                            <div style="height: 44px; background: #e2e8f0; border-radius: 4px;"></div>
                            <div style="height: 44px; background: #e2e8f0; border-radius: 4px;"></div>
                        </div>
                        <p style="font-size: 28px; color: #64748b; text-align: center; margin-top: 16px;">集計・斜線もぜんぶ自動</p>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 20px;">
                        <span class="badge">📄 PDF出力</span>
                        <span class="badge">🖼️ 画像出力</span>
                        <span class="badge">💬 LINEで共有</span>
                    </div>
                </div>
                <p class="card-lead" style="text-align: center; padding-bottom: 40px;">試合記録から公式様式を自動生成。</p>
            </div>
            <div class="card-footer">
                <div class="footer-brand"><img src="./icon-512.png" alt="">MBCscore</div>
                <div class="footer-url">boningori.github.io/MBCscore_pr</div>
            </div>
        </div>
    </div>
```

- [ ] **Step 4: ブラウザで検証**

再読み込みし、カード2〜4を縮小・実寸の両方で確認。
Expected: 3枚とも1080×1080内に収まり、文字切れ・はみ出しがない。

- [ ] **Step 5: コミット**

```bash
git add public/SNS_CARDS.html
git commit -m "feat(sns): カード2-4(フリック入力・保留機能・JBAシート)を追加"
```

---

### Task 4: カード5〜7（OCR登録・2モード・オフライン&データ保護）

**Files:**
- Modify: `public/SNS_CARDS.html`（`<!-- CARD_SLOT -->` の直前に3枚追加）

**Interfaces:**
- Consumes: Task 1 の共通クラス群。
- Produces: `id="card-5"` 〜 `id="card-7"`。

- [ ] **Step 1: カード5（OCR選手登録）を追加**

```html
    <!-- カード5: OCR選手登録 -->
    <div class="card-frame">
        <div class="card" id="card-5">
            <div class="orb orb--blue"></div>
            <div class="orb orb--green"></div>
            <div class="card-body">
                <p class="card-kicker">MBCscore 機能紹介 #4</p>
                <h2 class="card-title">メンバー表を<br><span class="accent">パシャッ</span>と撮るだけ。</h2>
                <div class="card-visual">
                    <div class="glass-panel" style="text-align: center; width: 300px;">
                        <div style="font-size: 100px;">📋</div>
                        <p style="font-size: 32px; margin-top: 12px;">紙のメンバー表</p>
                    </div>
                    <div style="font-size: 56px; color: var(--accent-orange);">→ 📸 →</div>
                    <div class="glass-panel" style="text-align: center; width: 300px; border-color: rgba(16, 185, 129, 0.4);">
                        <div style="font-size: 100px;">✅</div>
                        <p style="font-size: 32px; margin-top: 12px;">選手登録 完了</p>
                    </div>
                </div>
                <p class="card-lead" style="text-align: center; padding-bottom: 40px;">OCRが背番号と名前を読み取り。手入力なしで一括登録。</p>
            </div>
            <div class="card-footer">
                <div class="footer-brand"><img src="./icon-512.png" alt="">MBCscore</div>
                <div class="footer-url">boningori.github.io/MBCscore_pr</div>
            </div>
        </div>
    </div>
```

- [ ] **Step 2: カード6（2つの表示モード）を追加**

```html
    <!-- カード6: 2つの表示モード -->
    <div class="card-frame">
        <div class="card" id="card-6">
            <div class="orb orb--blue"></div>
            <div class="orb orb--green"></div>
            <div class="card-body">
                <p class="card-kicker">MBCscore 機能紹介 #5</p>
                <h2 class="card-title">スマホでも、iPadでも。<br><span class="accent">2つのモード</span></h2>
                <div class="card-visual" style="align-items: flex-end;">
                    <div style="text-align: center;">
                        <div style="width: 460px; height: 320px; border: 5px solid var(--glass-border); border-radius: 24px; background: var(--secondary-bg); display: flex; gap: 10px; padding: 18px;">
                            <div style="flex: 1; background: var(--glass-bg); border-radius: 10px;"></div>
                            <div style="flex: 1.2; background: rgba(59, 130, 246, 0.18); border-radius: 10px;"></div>
                            <div style="flex: 1; background: var(--glass-bg); border-radius: 10px;"></div>
                        </div>
                        <p style="font-size: 36px; font-weight: 900; margin-top: 20px; color: var(--accent-blue);">フルモード</p>
                        <p style="font-size: 30px; color: var(--text-muted);">タブレットで詳細スタッツ</p>
                    </div>
                    <div style="text-align: center;">
                        <div style="width: 200px; height: 380px; border: 5px solid var(--glass-border); border-radius: 28px; background: var(--secondary-bg); display: flex; flex-direction: column; gap: 10px; padding: 18px;">
                            <div style="flex: 1; background: rgba(16, 185, 129, 0.18); border-radius: 10px;"></div>
                            <div style="flex: 2; background: var(--glass-bg); border-radius: 10px;"></div>
                        </div>
                        <p style="font-size: 36px; font-weight: 900; margin-top: 20px; color: var(--accent-green);">シンプルモード</p>
                        <p style="font-size: 30px; color: var(--text-muted);">スマホで片手操作</p>
                    </div>
                </div>
                <p class="card-lead" style="text-align: center; padding-bottom: 40px;">デバイスに合わせて、いつでも切替OK。</p>
            </div>
            <div class="card-footer">
                <div class="footer-brand"><img src="./icon-512.png" alt="">MBCscore</div>
                <div class="footer-url">boningori.github.io/MBCscore_pr</div>
            </div>
        </div>
    </div>
```

- [ ] **Step 3: カード7（オフライン&データ保護）を追加**

```html
    <!-- カード7: オフライン&データ保護 -->
    <div class="card-frame">
        <div class="card" id="card-7">
            <div class="orb orb--blue"></div>
            <div class="orb orb--green"></div>
            <div class="card-body">
                <p class="card-kicker">MBCscore 機能紹介 #6</p>
                <h2 class="card-title">電波の悪い体育館でも、<br><span class="accent">サクサク</span>動く。</h2>
                <div class="card-visual" style="flex-direction: column; gap: 24px;">
                    <div class="glass-panel" style="display: flex; align-items: center; gap: 24px; width: 800px; padding: 28px 40px;">
                        <span style="font-size: 56px;">📶</span>
                        <span style="font-size: 36px;"><b>オフライン対応</b> — 圏外でも全機能が動作</span>
                    </div>
                    <div class="glass-panel" style="display: flex; align-items: center; gap: 24px; width: 800px; padding: 28px 40px;">
                        <span style="font-size: 56px;">💾</span>
                        <span style="font-size: 36px;"><b>フルバックアップ</b> — 機種変更も安心</span>
                    </div>
                    <div class="glass-panel" style="display: flex; align-items: center; gap: 24px; width: 800px; padding: 28px 40px;">
                        <span style="font-size: 56px;">📊</span>
                        <span style="font-size: 36px;"><b>CSVエクスポート</b> — 後から分析できる</span>
                    </div>
                </div>
                <p class="card-lead" style="text-align: center; padding-bottom: 40px;">ホーム画面に追加すれば、アプリとして起動。</p>
            </div>
            <div class="card-footer">
                <div class="footer-brand"><img src="./icon-512.png" alt="">MBCscore</div>
                <div class="footer-url">boningori.github.io/MBCscore_pr</div>
            </div>
        </div>
    </div>
```

- [ ] **Step 4: ブラウザで全カード検証**

再読み込みし、全7カードを縮小・実寸の両方で確認。あわせてネットワークリクエスト一覧を確認する。
Expected: 全カード文字切れなし。リクエストは localhost のもの（HTML/icon-512.png/Vite関連）のみで、外部ドメインへのリクエストが**ゼロ**。

- [ ] **Step 5: コミット**

```bash
git add public/SNS_CARDS.html
git commit -m "feat(sns): カード5-7(OCR登録・2モード・オフライン)を追加しギャラリー完成"
```

---

### Task 5: 投稿文面集 `docs/marketing/sns-posts.md`

**Files:**
- Create: `docs/marketing/sns-posts.md`

**Interfaces:**
- Consumes: カード番号（card-1〜card-7）との対応。
- Produces: X本文は ` ```x-post ` フェンス、IGキャプションは ` ```ig-post ` フェンスで囲む（Step 2 の字数チェックスクリプトがこのフェンスを抽出する）。

- [ ] **Step 1: 文面集を作成**

`docs/marketing/sns-posts.md` を以下の内容で新規作成する:

````markdown
# MBCscore SNS投稿文面集（機能紹介シリーズ）

## 使い方

1. `public/SNS_CARDS.html` をブラウザで開き（公開後は `https://boningori.github.io/MBCscore_pr/SNS_CARDS.html`）、「実寸表示」に切り替えて対応するカードをスクリーンショット。
2. 下記の文面をコピーし、カード画像を添付して投稿する。
3. 推奨投稿順は番号どおり（1=告知 → 2〜7=機能紹介を数日おきに）。

共通ハッシュタグ軸: `#ミニバス` `#ミニバスケットボール` `#マイクロバスケ` `#MBCscore`

---

## 投稿1: 告知（card-1）

### X

```x-post
ミニバスのスコア記録、スマホ1台で。
無料・登録不要・オフラインOKのデジタルスコアシート「MBCscore」を公開しています🏀
電波の悪い体育館でもサクサク動きます。
https://boningori.github.io/MBCscore_pr/
#ミニバス #MBCscore
```

### Instagram

```ig-post
ミニバスのスコア記録、スマホ1台で🏀

ミニバス専用のデジタルスコアシート「MBCscore」を公開しています。

✅ 完全無料・登録不要
✅ オフライン対応（体育館でもOK）
✅ ホーム画面に追加してアプリとして使える

スコアラー担当になったパパ・ママ、記録係のコーチのために作りました。
プロフィールのリンク、または「MBCscore」で検索してぜひ試してみてください！

#ミニバス #ミニバスケットボール #マイクロバスケ #バスケ #バスケットボール #バスケ保護者 #ミニバス保護者 #スコアシート #スコアラー #バスケ記録 #少年バスケ #ジュニアバスケ #バスケママ #バスケパパ #MBCscore
```

## 投稿2: フリック入力（card-2）

### X

```x-post
得点は上フリック、ミスは下フリック。
MBCscoreはコートから目を離さず記録できる「フリック入力」を搭載🏀
試合のテンポを崩さず、子どもたちのプレーをしっかり見届けられます。
#ミニバス #スコアシート #MBCscore
```

### Instagram

```ig-post
コートから目を離さない。「フリック」で高速入力🏀

MBCscoreの一番の特徴はフリック入力。
⬆️ 上フリック → 得点（成功）
⬇️ 下フリック → シュートミス

画面を見つめる時間を減らして、白熱する試合のテンポそのままに記録できます。
迷ったらタップで選択肢が出るので、初めてのスコアラーでも安心です。

#ミニバス #ミニバスケットボール #マイクロバスケ #スコアシート #スコアラー #バスケ記録 #バスケ保護者 #ミニバス保護者 #少年バスケ #ジュニアバスケ #MBCscore
```

## 投稿3: 保留機能（card-3）

### X

```x-post
「今のシュート、誰！？」
背番号を見逃しても大丈夫。MBCscoreの保留機能なら、先に得点だけ記録して、選手は分かってから紐付けOK。記録漏れを防ぎます🏀
#ミニバス #MBCscore
```

### Instagram

```ig-post
「今の、誰！？」でも慌てない。アクション保留機能🏀

試合中は「誰の得点か分からない」「番号を見逃した」が頻繁に起こります。
MBCscoreなら…

STEP1️⃣ まず得点だけ記録（保留）
STEP2️⃣ 選手が分かったら後から紐付け

連続プレーの複数保留にも対応。パニックにならず、記録漏れゼロを目指せます。

#ミニバス #ミニバスケットボール #マイクロバスケ #スコアシート #スコアラー #バスケ記録 #バスケ保護者 #ミニバス保護者 #少年バスケ #ジュニアバスケ #MBCscore
```

## 投稿4: JBA準拠スコアシート（card-4）

### X

```x-post
試合が終わればワンタップ。
MBCscoreはJBA準拠のスコアシートを自動生成📄
クォーター集計も斜線も自動。PDF/画像でエクスポートして、そのままチームLINEで共有できます。
#ミニバス #スコアシート #MBCscore
```

### Instagram

```ig-post
ワンタップで完成。JBA準拠スコアシート自動生成📄

試合中の記録から、日本バスケットボール協会(JBA)準拠の公式スコアシートを自動生成。

✅ クォーターごとの集計も自動
✅ 斜線の記入も自動
✅ PDF・画像でエクスポート
✅ チームのグループLINEですぐ共有

手書きの清書作業から解放されます。

#ミニバス #ミニバスケットボール #マイクロバスケ #スコアシート #スコアラー #JBA #バスケ記録 #バスケ保護者 #ミニバス保護者 #少年バスケ #MBCscore
```

## 投稿5: OCR選手登録（card-5）

### X

```x-post
メンバー表をパシャッと撮るだけ📸
MBCscoreのOCR選手登録なら、背番号と名前を自動で読み取って一括登録。試合前の手入力バタバタから解放されます。
#ミニバス #MBCscore
```

### Instagram

```ig-post
メンバー表をパシャッと撮るだけ📸 OCR選手登録

もらった紙のメンバー表をスマホで撮影すると、OCRが背番号と名前を読み取って自動で選手登録。

試合前のあわただしい時間に、ポチポチ手入力する必要はもうありません。
オフラインでも動くので、体育館の中でもそのまま使えます。

#ミニバス #ミニバスケットボール #マイクロバスケ #スコアシート #スコアラー #バスケ記録 #バスケ保護者 #ミニバス保護者 #少年バスケ #ジュニアバスケ #MBCscore
```

## 投稿6: 2つの表示モード（card-6）

### X

```x-post
iPadなら3カラムの「フルモード」、スマホなら片手で使える「シンプルモード」📱
MBCscoreはデバイスに合わせて表示モードをいつでも切り替えられます。
#ミニバス #スコアシート #MBCscore
```

### Instagram

```ig-post
スマホでも、iPadでも。2つの表示モード📱

MBCscoreはデバイスに合わせて2つのモードを切り替えられます。

🖥 フルモード（タブレット向け）
→ 3カラムで両チームの選手とアクションを同時表示。詳細スタッツ記録に。

📱 シンプルモード（スマホ向け）
→ 得点・ファウルに特化した縦型レイアウト。大きなボタンで片手操作OK。

#ミニバス #ミニバスケットボール #マイクロバスケ #スコアシート #スコアラー #バスケ記録 #バスケ保護者 #ミニバス保護者 #少年バスケ #ジュニアバスケ #MBCscore
```

## 投稿7: オフライン&データ保護（card-7）

### X

```x-post
電波の悪い体育館でも大丈夫。
MBCscoreはオフライン対応のPWA。ホーム画面に追加すればアプリとして起動し、フルバックアップ&CSV出力でデータも安心です💾
#ミニバス #MBCscore
```

### Instagram

```ig-post
電波の悪い体育館でも、サクサク動く💾

MBCscoreはPWA（プログレッシブウェブアプリ）。

📶 オフライン対応 — 圏外でも全機能が動く
💾 フルバックアップ — 機種変更しても記録を引き継げる
📊 CSVエクスポート — 表計算ソフトで後から分析できる

ホーム画面に追加するだけで、インストール不要・登録不要・完全無料。

#ミニバス #ミニバスケットボール #マイクロバスケ #スコアシート #スコアラー #バスケ記録 #バスケ保護者 #ミニバス保護者 #少年バスケ #ジュニアバスケ #PWA #MBCscore
```
````

- [ ] **Step 2: X本文の字数チェック**

以下を実行する（X計量: ASCII=1, 非ASCII=2, URL=23, 上限280）:

```bash
node -e "
const fs = require('fs');
const md = fs.readFileSync('docs/marketing/sns-posts.md', 'utf8');
const posts = [...md.matchAll(/\`\`\`x-post\n([\s\S]*?)\`\`\`/g)].map(m => m[1].trim());
if (posts.length !== 7) { console.error('x-post数が7でない: ' + posts.length); process.exit(1); }
let ng = 0;
posts.forEach((p, i) => {
  const noUrl = p.replace(/https?:\/\/\S+/g, '');
  const urls = (p.match(/https?:\/\/\S+/g) || []).length;
  let w = urls * 23;
  for (const ch of noUrl) w += ch.charCodeAt(0) < 128 ? 1 : 2;
  const ok = w <= 280;
  if (!ok) ng++;
  console.log('投稿' + (i + 1) + ': ' + w + '/280 ' + (ok ? 'OK' : 'NG'));
});
process.exit(ng ? 1 : 0);
"
```

Expected: 7件すべて `OK` で exit code 0。NGがあれば該当のX本文を短縮して再実行。

- [ ] **Step 3: コミット**

```bash
git add docs/marketing/sns-posts.md
git commit -m "docs(sns): X/Instagram投稿文面集(全7投稿)を追加"
```

---

### Task 6: 最終検証

**Files:**
- Modify（必要時のみ）: `public/SNS_CARDS.html`

- [ ] **Step 1: 全体をブラウザで最終確認**

devサーバーで `http://localhost:5173/MBCscore_pr/SNS_CARDS.html` を開き、以下を確認:

1. 全7カードが表示され、コンソールエラーがない
2. 実寸表示トグルが機能し、実寸でも文字切れ・はみ出しがない
3. ネットワークリクエストに外部ドメインが一切ない
4. 画像は `icon-512.png` とQR（data URI）のみで、壊れ画像がない

- [ ] **Step 2: ビルド影響がないことを確認**

```bash
npm run test
```

Expected: 既存テストがすべてPASS（静的ファイル追加のみなので影響なし）。

- [ ] **Step 3: 問題があれば修正してコミット**

修正が出た場合のみ:

```bash
git add public/SNS_CARDS.html docs/marketing/sns-posts.md
git commit -m "fix(sns): SNSカードの表示崩れを修正"
```
