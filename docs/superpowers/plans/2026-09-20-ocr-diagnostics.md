# 写真読込の生の応答を画面で見られるようにする 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 読み取りがおかしかったとき、Geminiが実際に何を返したかと、どのモデルが答えたかを画面で確認できるようにする。

**Architecture:** 診断情報は `recognizePlayerList` が持つオブジェクトに `recognizeWithGemini` が書き込む形で集める。例外の形をいじらずに、Tesseractへフォールバックしても Gemini の応答が残る。収集は常に行い、設定は表示だけを制御する。表示の前に、`OpponentSelect` が成功経路で通知を描画していない不具合を直す。

**Tech Stack:** TypeScript, React 19, Vite, Vitest, @testing-library/react, Gemini REST API (`v1beta`)

設計書: `docs/superpowers/specs/2026-09-20-ocr-diagnostics-design.md`

## Global Constraints

- コメント・テスト名は日本語。コメントは**なぜそうしたか**を書く（既存の `src/utils/imageOCR.ts` / `src/utils/mergedPlayers.ts` の書きぶりに合わせる）。何をしているかの説明は書かない
- 既存テストを1つも壊さない
- Tesseract経路（`parseOcrText` / `normalizeOcrLine` / `recognizeWithTesseract`）は変更しない
- **診断情報は保存しない。** メモリ上の直近1回ぶんだけ。`dataBackup.ts` / `mirrorBackup.ts` は触らない
- **収集は設定に関係なく常に行う。設定は表示だけを制御する**
- 設定の既定は `false`
- 応答には選手の氏名が含まれる。設定UIの説明文にそれを明記する
- 角丸の面はボタン専用。情報表示は素の文字にする（このプロジェクトのUI作法）
- テスト実行: `npm test`（= `vitest run`、watch ではないので自走して終わる。全件約4分なので `timeout: 600000` を渡す）。絞るときは `npx vitest run <path> -t "<名前>"`
- 型検査: `npm run typecheck:test`、lint: `npm run lint`
- コミットメッセージ末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を付ける

---

## File Structure

| ファイル | 役割 | 変更 |
|---|---|---|
| `src/components/OpponentSelect/ocrNotice.test.tsx` | **新規**。成功経路で通知が描画されることを固定する | Create |
| `src/components/OpponentSelect/OpponentSelect.tsx` | `OpponentEditor` に通知と診断を渡す。早期リターンで通知が消えるのを直す | Modify |
| `src/utils/appSettings.ts` | 設定 `aiOcrDiagnosticsEnabled` | Modify |
| `src/utils/appSettings.diagnostics.test.ts` | **新規**。設定の既定・往復・サニタイザ | Create |
| `src/utils/imageOCR.ts` | `OcrDiagnostics` 型と収集の配線 | Modify |
| `src/utils/imageOCR.diagnostics.test.ts` | **新規**。収集とフォールバック越しの保持 | Create |
| `src/components/Settings/AppSettingsModal.tsx` | 設定トグル | Modify |
| `src/components/TeamShared/OcrDiagnosticsPanel.tsx` | **新規**。折りたたみの表示。2画面で共有する | Create |
| `src/components/TeamShared/OcrDiagnosticsPanel.test.tsx` | **新規**。上のテスト | Create |
| `src/components/OpponentManager/OpponentManager.tsx` | パネルを置く | Modify |

折りたたみは2画面に出すので、`src/components/TeamShared/` に共有コンポーネントとして置く。
同ディレクトリには既に `playerLimit`（両画面が使う上限の規則）があり、
「対戦チーム関連の2画面で共有するもの」の置き場として既に使われている。

---

### Task 1: `OpponentSelect` が成功経路で通知を描画していないのを直す

**Files:**
- Create: `src/components/OpponentSelect/ocrNotice.test.tsx`
- Modify: `src/components/OpponentSelect/OpponentSelect.tsx`（`OpponentEditorProps`、`OpponentEditor` 本体、`<OpponentEditor>` の呼び出し）

**Interfaces:**
- Consumes: なし
- Produces: `OpponentEditorProps.ocrError?: string | null`

これは既存の不具合の修正で、この計画の後続タスクの前提でもある。

`OpponentSelect` は読み取りに成功すると `setIsCreating(true)` し、render が
`<OpponentEditor>` を返して**早期リターンする**（`OpponentSelect.tsx:131-141`）。
`ocrError` を描画するのはその手前を抜けた先の `OpponentSelect.tsx:193` なので、
成功経路でセットされた通知は誰にも見えない。

| メッセージ | セット | 表示 |
|---|---|---|
| `${dropped}人は取り込みませんでした`（上限超過・既存） | される | されない |
| `${invalidNumberCount}人は背番号を読み取れなかった` | される | されない |

失敗経路（`setIsCreating` を呼ばない）では表示される。出ないのは成功経路だけ。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/OpponentSelect/ocrNotice.test.tsx` を新規作成：

```tsx
// 写真読込の結果の通知が、成功したときにも画面に出ること。
//
// 読み取りに成功すると setIsCreating(true) で OpponentEditor を返して
// 早期リターンするため、その手前にある ocrError の描画に辿り着かなかった。
// 「15人まで」で溢れた分も「背番号が読めなかった」分も、セットはされるのに
// 誰にも見えない状態だった。失敗したときだけ見えるので気づきにくい。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { OpponentSelect } from './OpponentSelect';
import { recognizePlayerList } from '../../utils/imageOCR';
import { MAX_PLAYERS_PER_TEAM } from '../TeamShared/playerLimit';
import type { SavedPlayer } from '../../utils/teamStorage';

vi.mock('../../utils/imageOCR', () => ({
    recognizePlayerList: vi.fn(),
    isOCRAvailable: () => true,
}));
vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

const mockRecognize = vi.mocked(recognizePlayerList);

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
});

function players(count: number): SavedPlayer[] {
    return Array.from({ length: count }, (_, i) => ({
        number: i + 1,
        name: `選手${i + 1}`,
        isCaptain: false,
    }));
}

/** 写真を1枚読み込ませる。input は隠してあるので直接 change を起こす */
function importPhoto(container: HTMLElement) {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
        target: { files: [new File([new Uint8Array(10)], 'roster.jpg', { type: 'image/jpeg' })] },
    });
}

describe('読み取りに成功したとき', () => {
    it('上限で入り切らなかった人数が画面に出る', async () => {
        mockRecognize.mockResolvedValue({
            success: true,
            players: players(MAX_PLAYERS_PER_TEAM + 3),
            usedEngine: 'Gemini',
        });

        const { container } = render(<OpponentSelect onSelect={vi.fn()} />);
        importPhoto(container);

        expect(await screen.findByText(/3人は取り込みませんでした/)).toBeTruthy();
    });

    it('背番号を読み取れなかった人数が画面に出る', async () => {
        mockRecognize.mockResolvedValue({
            success: true,
            players: players(5),
            usedEngine: 'Gemini',
            invalidNumberCount: 2,
        });

        const { container } = render(<OpponentSelect onSelect={vi.fn()} />);
        importPhoto(container);

        expect(await screen.findByText(/2人は背番号を読み取れなかった/)).toBeTruthy();
    });

    it('通知が無いときは何も出さない', async () => {
        mockRecognize.mockResolvedValue({
            success: true,
            players: players(5),
            usedEngine: 'Gemini',
        });

        const { container } = render(<OpponentSelect onSelect={vi.fn()} />);
        importPhoto(container);

        // 編集画面へ進んだことを確かめてから、通知が無いことを見る。
        // 選手はチップで出るので、取り消しボタンの読み上げ名で待つ
        expect(await screen.findByRole('button', { name: /#1 選手1 を削除/ })).toBeTruthy();
        expect(screen.queryByText(/取り込みませんでした/)).toBeNull();
        expect(screen.queryByText(/読み取れなかった/)).toBeNull();
    });
});

describe('読み取りに失敗したとき', () => {
    it('従来どおり一覧の画面に理由が出る（回帰）', async () => {
        mockRecognize.mockResolvedValue({
            success: false,
            players: [],
            error: '選手情報を認識できませんでした',
            usedEngine: 'Tesseract',
        });

        const { container } = render(<OpponentSelect onSelect={vi.fn()} />);
        importPhoto(container);

        expect(await screen.findByText(/選手情報を認識できませんでした/)).toBeTruthy();
    });
});
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `npx vitest run src/components/OpponentSelect/ocrNotice.test.tsx`
Expected: FAIL — 成功経路の2件で `findByText` が見つからずタイムアウトする。
失敗経路の1件と「通知が無いとき」の1件は通る（これが「出ないのは成功経路だけ」の証拠）

- [ ] **Step 3: `OpponentEditorProps` に `ocrError` を足す**

`OpponentSelect.tsx:266-272` を置き換える：

```tsx
// 簡易エディタ（使い捨て、または履歴保存用）
interface OpponentEditorProps {
    team: SavedTeam;
    onSave: (team: SavedTeam, saveToRegistry: boolean) => void;
    onCancel: () => void;
    onImageImport: (file: File) => void;
    isLoading: boolean;
    /**
     * 読み取り結果の通知（上限超過・背番号を読めなかった件数）。
     *
     * 読み取りに成功するとこのエディタを返して早期リターンするため、
     * 呼び出し側の描画箇所には辿り着かない。ここで受けないと、
     * セットされた通知が誰にも見えないまま消える
     */
    ocrError?: string | null;
}

function OpponentEditor({ team, onSave, onCancel, onImageImport, isLoading, ocrError }: OpponentEditorProps) {
```

- [ ] **Step 4: エディタ内に通知を描画する**

`OpponentEditor` の JSX で、読み込み中の表示（`isLoading` を見ている箇所）の直後に追加する。
一覧側（`OpponentSelect.tsx:193-197`）と同じ見た目にそろえる：

```tsx
            {ocrError && (
                <div className="alert alert-danger">
                    {ocrError}
                </div>
            )}
```

- [ ] **Step 5: 呼び出し側から渡す**

`OpponentSelect.tsx:131-141` の `<OpponentEditor>` に `ocrError` を足す：

```tsx
    if (isCreating && editingTeam) {
        return (
            <OpponentEditor
                team={editingTeam}
                onSave={handleSaveNew}
                onCancel={closeEditor}
                onImageImport={handleImageImport}
                isLoading={isLoading}
                ocrError={ocrError}
            />
        );
    }
```

- [ ] **Step 6: テストが通ることを確かめる**

Run: `npx vitest run src/components/OpponentSelect/ocrNotice.test.tsx`
Expected: PASS（4件）

- [ ] **Step 7: 全体の回帰を確かめる**

Run: `npm test && npm run typecheck:test && npm run lint`
Expected: PASS、エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/components/OpponentSelect/OpponentSelect.tsx src/components/OpponentSelect/ocrNotice.test.tsx
git commit -m "$(cat <<'MSG'
fix: 写真読込の通知が成功したときに画面へ出ないのを直す

読み取りに成功すると setIsCreating(true) で OpponentEditor を返して
早期リターンするため、その手前にある ocrError の描画に辿り着かなかった。
「15人まで」で溢れた分も「背番号が読めなかった」分も、セットはされるのに
誰にも見えない。失敗したときだけ見えるので気づきにくかった。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: 診断表示の設定を足す

**Files:**
- Modify: `src/utils/appSettings.ts`（`AppSettings`、`DEFAULT_SETTINGS`、`readStoredSettings`、アクセサ）
- Create: `src/utils/appSettings.diagnostics.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `AppSettings.aiOcrDiagnosticsEnabled: boolean`
  - `export function isAiOcrDiagnosticsEnabled(): boolean`
  - `export function setAiOcrDiagnosticsEnabled(enabled: boolean): void`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/appSettings.diagnostics.test.ts` を新規作成：

```ts
// 読み取り結果の詳細表示の設定。
//
// 生の応答には選手の氏名がそのまま入るので、既定はOFF。
// 保存値が壊れていても既定に戻せること（他の設定と同じ約束）を固定する。

import { describe, it, expect, beforeEach } from 'vitest';
import { isAiOcrDiagnosticsEnabled, setAiOcrDiagnosticsEnabled } from './appSettings';

const SETTINGS_KEY = 'minibasket-app-settings';

beforeEach(() => {
    localStorage.clear();
});

describe('読み取り結果の詳細表示の設定', () => {
    it('既定はOFF（応答に氏名が含まれるため）', () => {
        expect(isAiOcrDiagnosticsEnabled()).toBe(false);
    });

    it('ONにして読み直せる', () => {
        setAiOcrDiagnosticsEnabled(true);
        expect(isAiOcrDiagnosticsEnabled()).toBe(true);
    });

    it('OFFに戻せる', () => {
        setAiOcrDiagnosticsEnabled(true);
        setAiOcrDiagnosticsEnabled(false);
        expect(isAiOcrDiagnosticsEnabled()).toBe(false);
    });

    it('boolean以外が保存されていたら既定に戻す', () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ aiOcrDiagnosticsEnabled: 'yes' }));
        expect(isAiOcrDiagnosticsEnabled()).toBe(false);
    });

    it('他の設定を巻き込まない', () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ aiOcrEnabled: true }));
        setAiOcrDiagnosticsEnabled(true);
        expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) as string).aiOcrEnabled).toBe(true);
    });
});
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `npx vitest run src/utils/appSettings.diagnostics.test.ts`
Expected: FAIL — `isAiOcrDiagnosticsEnabled` が `appSettings` に存在しない

- [ ] **Step 3: 型と既定値を足す**

`appSettings.ts` の `AppSettings` インターフェース、`aiOcrConsented` の直後に追加：

```ts
    /**
     * 読み取り結果の詳細（Geminiの生の応答と、応答したモデル名）を画面に出すか。
     *
     * 既定はOFF。生の応答には選手の氏名がそのまま入るので、普段の画面に
     * 出したままにはしない。読み取りがおかしかったときだけ、利用者が自分で開く
     */
    aiOcrDiagnosticsEnabled: boolean;
```

`DEFAULT_SETTINGS` に追加：

```ts
    aiOcrDiagnosticsEnabled: false,
```

- [ ] **Step 4: サニタイザに足す**

`appSettings.ts` の `readStoredSettings`、`aiOcrConsented` の行の直後に追加：

```ts
    if (typeof raw.aiOcrDiagnosticsEnabled === 'boolean') clean.aiOcrDiagnosticsEnabled = raw.aiOcrDiagnosticsEnabled;
```

- [ ] **Step 5: アクセサを足す**

`appSettings.ts` の `setAiOcrEnabled` の直後に追加：

```ts
export function isAiOcrDiagnosticsEnabled(): boolean {
    return loadAppSettings().aiOcrDiagnosticsEnabled;
}

export function setAiOcrDiagnosticsEnabled(enabled: boolean): void {
    saveAppSettings({ aiOcrDiagnosticsEnabled: enabled });
}
```

- [ ] **Step 6: テストが通ることを確かめる**

Run: `npx vitest run src/utils/appSettings.diagnostics.test.ts`
Expected: PASS（5件）

- [ ] **Step 7: 全体の回帰を確かめる**

Run: `npm test && npm run typecheck:test && npm run lint`
Expected: PASS、エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/utils/appSettings.ts src/utils/appSettings.diagnostics.test.ts
git commit -m "$(cat <<'MSG'
feat: 読み取り結果の詳細表示の設定を足す

生の応答には選手の氏名がそのまま入るので、既定はOFF。
読み取りがおかしかったときだけ利用者が自分で開く。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: Geminiの生の応答とモデル名を集める

**Files:**
- Modify: `src/utils/imageOCR.ts`（`OcrDiagnostics` 型、`ImageOCRResult`、`recognizeWithGemini` の引数と書き込み、`recognizePlayerList` の各リターン）
- Create: `src/utils/imageOCR.diagnostics.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `export interface OcrDiagnostics { geminiModel?: string; geminiRawText?: string; }`
  - `ImageOCRResult.diagnostics?: OcrDiagnostics`

`recognizeWithGemini` は失敗時に throw するので、その中で生応答が消える。
**例外に情報を積むのではなく、`recognizePlayerList` が `diagnostics` オブジェクトを持って渡し、
`recognizeWithGemini` がそれを埋める。** こうすると、どの経路で返っても中身が残り、
例外の形（`GeminiFatalError` / `ImageFormatError` の使い分け）をいじらずに済む。

**収集は設定に関係なく常に行う。** メモリ上で完結するので費用が無く、
分岐を増やすほうが穴を作る。設定が制御するのは表示だけ（Task 5）。

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/imageOCR.diagnostics.test.ts` を新規作成：

```ts
// 読み取りがおかしかったときに、何が返ってきたかを後から見られること。
//
// 生の応答は rawText に入っていたが、Tesseractへフォールバックすると
// rawText は Tesseract の文字列に置き換わり、Gemini が何を返したかは
// エラー文言しか残らなかった。いちばん見たい経路で消えていた。
//
// どのモデルが答えたかも残っていなかった。FALLBACK_MODELS の先頭は
// 最軽量の flash-lite なので、「flash-lite が雑に読んだ」のか
// 「pro でも間違えた」のかで打つ手が正反対になる。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const recognizeMock = vi.hoisted(() => vi.fn());
const terminateMock = vi.hoisted(() => vi.fn());
vi.mock('tesseract.js', () => ({
    createWorker: vi.fn(async () => ({ recognize: recognizeMock, terminate: terminateMock })),
}));

import { recognizePlayerList } from './imageOCR';
import { setAiOcrEnabled } from './appSettings';
import { FALLBACK_MODELS } from './geminiClient';

function geminiReply(text: string) {
    return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    } as unknown as Response;
}

function imageFile(bytes = 10): File {
    return new File([new Uint8Array(bytes)], 'roster.jpg', { type: 'image/jpeg' });
}

const ONE_TEAM = '{"teams":[{"players":[{"number":"4","name":"田中太郎"}]}]}';

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mbc_gemini_api_key', 'test-key');
    setAiOcrEnabled(true);
    recognizeMock.mockReset();
    recognizeMock.mockResolvedValue({ data: { text: '4 田中太郎\n5 佐藤花子' } });
    vi.stubGlobal('FileReader', class {
        result = 'data:image/jpeg;base64,AAAA';
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL() { setTimeout(() => this.onload?.(), 0); }
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('読み取りに成功したとき', () => {
    it('応答したモデル名が残る', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(ONE_TEAM)));

        const result = await recognizePlayerList(imageFile());

        expect(result.diagnostics?.geminiModel).toBe(FALLBACK_MODELS[0]);
    });

    it('生の応答がそのまま残る', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(ONE_TEAM)));

        const result = await recognizePlayerList(imageFile());

        expect(result.diagnostics?.geminiRawText).toBe(ONE_TEAM);
    });
});

describe('Tesseractへフォールバックしたとき', () => {
    it('Geminiの生の応答が残る（ここが今まで消えていた）', async () => {
        const junk = '申し訳ありませんが読み取れませんでした。';
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(junk)));

        const result = await recognizePlayerList(imageFile());

        expect(result.usedEngine).toBe('Tesseract');
        expect(result.diagnostics?.geminiRawText).toBe(junk);
    });

    it('最後に試したモデル名が残る', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply('読めません')));

        const result = await recognizePlayerList(imageFile());

        expect(result.diagnostics?.geminiModel).toBe(FALLBACK_MODELS[FALLBACK_MODELS.length - 1]);
    });
});

describe('複数チームで返し切ったとき', () => {
    it('診断情報が付く', async () => {
        const twoTeams = '{"teams":['
            + '{"players":[{"number":"4","name":"甲太郎"}]},'
            + '{"players":[{"number":"5","name":"乙次郎"}]}]}';
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(twoTeams)));

        const result = await recognizePlayerList(imageFile());

        expect(result.success).toBe(false);
        expect(result.diagnostics?.geminiRawText).toBe(twoTeams);
    });
});

describe('Geminiを試していないとき', () => {
    it('AI経路がOFFなら診断情報は空', async () => {
        setAiOcrEnabled(false);

        const result = await recognizePlayerList(imageFile());

        expect(result.usedEngine).toBe('Tesseract');
        expect(result.diagnostics?.geminiRawText).toBeUndefined();
        expect(result.diagnostics?.geminiModel).toBeUndefined();
    });

    it('画像が大きすぎて送らなかったときも空', async () => {
        const result = await recognizePlayerList(imageFile(9 * 1024 * 1024));

        expect(result.usedEngine).toBe('Tesseract');
        expect(result.diagnostics?.geminiModel).toBeUndefined();
    });
});
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `npx vitest run src/utils/imageOCR.diagnostics.test.ts`
Expected: FAIL — `result.diagnostics` が `undefined`

- [ ] **Step 3: 型を足す**

`imageOCR.ts` の `ImageOCRResult` の**直前**に追加：

```ts
/**
 * 読み取りの診断情報。設定がONのときだけ画面に出す（appSettings の aiOcrDiagnosticsEnabled）。
 *
 * rawText とは意味が違う。rawText は「結果を出したエンジンの生出力」なので、
 * Tesseractへフォールバックすると Tesseract の文字列に置き換わる。
 * こちらは「Gemini が何を返したか」で、フォールバックしても残す ——
 * 読み取りがおかしかったときに、いちばん見たいのがその経路のため。
 */
export interface OcrDiagnostics {
    /** 応答した（＝最後に試した）Geminiモデル */
    geminiModel?: string;
    /** Geminiの生応答。Tesseractへフォールバックしても残す */
    geminiRawText?: string;
}
```

`ImageOCRResult` の `invalidNumberCount` の直後に追加：

```ts
    /** 診断情報。Geminiを試していなければ空のまま */
    diagnostics?: OcrDiagnostics;
```

- [ ] **Step 4: `recognizeWithGemini` が書き込めるようにする**

シグネチャを変える（`imageOCR.ts` の `async function recognizeWithGemini(...)`）：

```ts
/**
 * Gemini APIによるOCR処理。
 *
 * diagnostics は呼び出し側が持つ。ここは書き込むだけ。失敗時は throw するので、
 * 戻り値に載せると Tesseractへ回った経路で Gemini の応答が消える ——
 * それがいちばん見たい経路だった。例外に情報を積む手もあるが、
 * GeminiFatalError / ImageFormatError の使い分けを崩したくない
 */
async function recognizeWithGemini(
    imageFile: File,
    apiKey: string,
    diagnostics: OcrDiagnostics,
): Promise<ImageOCRResult> {
```

モデルのループの中、`const url = ...` の**直前**に追加（失敗したモデルも記録に残る）：

```ts
            diagnostics.geminiModel = model;
```

`const textResponse = data.candidates?...` の**直後**に追加
（検証で例外を投げる前に書くのが要点）：

```ts
            diagnostics.geminiRawText = textResponse;
```

成功時の `return` に足す：

```ts
                diagnostics,
```

- [ ] **Step 5: `recognizePlayerList` が持って配る**

`recognizePlayerList` の `let fallbackReason = '';` の直後に追加：

```ts
    // Geminiを試したかどうかに関わらず器は用意する。収集は設定に関係なく
    // 常に行い、設定が制御するのは表示だけ（分岐を増やすほうが穴を作る）
    const diagnostics: OcrDiagnostics = {};
```

`recognizeWithGemini(imageFile, apiKey)` の呼び出しを `recognizeWithGemini(imageFile, apiKey, diagnostics)` に変える。

`ImageFormatError` を返す箇所に `diagnostics` を足す：

```ts
            if (error instanceof ImageFormatError) {
                return {
                    success: false,
                    players: [],
                    error: error.message,
                    usedEngine: 'Gemini',
                    diagnostics,
                };
            }
```

Tesseract 成功時の戻り値にも足す（`if (fallbackReason) { ... }` の直後、`return tesseractResult;` の前）：

```ts
        tesseractResult.diagnostics = diagnostics;
```

Tesseract 失敗時の戻り値にも足す：

```ts
            diagnostics,
```

- [ ] **Step 6: テストが通ることを確かめる**

Run: `npx vitest run src/utils/imageOCR.diagnostics.test.ts`
Expected: PASS（7件）

- [ ] **Step 7: 全体の回帰を確かめる**

Run: `npm test && npm run typecheck:test && npm run lint`
Expected: PASS、エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/utils/imageOCR.ts src/utils/imageOCR.diagnostics.test.ts
git commit -m "$(cat <<'MSG'
feat: 写真読込でGeminiの生の応答とモデル名を残す

生の応答は rawText に入っていたが、Tesseractへフォールバックすると
Tesseract の文字列に置き換わり、Gemini が何を返したかはエラー文言しか
残らなかった。いちばん見たい経路で消えていた。

呼び出し側が持つオブジェクトに書き込む形にして、どの経路で返っても
中身が残るようにする。例外の使い分けは変えない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: 設定画面にトグルを置く

**Files:**
- Modify: `src/components/Settings/AppSettingsModal.tsx`

**Interfaces:**
- Consumes: `isAiOcrDiagnosticsEnabled`, `setAiOcrDiagnosticsEnabled`（Task 2）
- Produces: なし

AI経路の診断なので、既存の `SettingsSection id="ai"`（`AppSettingsModal.tsx:448`）の中、
「写真をAIで読み取る」トグルの下に置く。

- [ ] **Step 1: import と state を足す**

`AppSettingsModal.tsx` の `appSettings` からの import に足す：

```ts
    isAiOcrDiagnosticsEnabled,
    setAiOcrDiagnosticsEnabled,
```

`const [aiOcrOn, setAiOcrOn] = useState(isAiOcrEnabled);` の直後に追加：

```ts
    const [diagnosticsOn, setDiagnosticsOn] = useState(isAiOcrDiagnosticsEnabled);
```

- [ ] **Step 2: ハンドラを足す**

`handleAiOcrToggle` の定義の直後に追加：

```ts
    // 同意は要らない。外へ送るものは増えず、端末内に既にある応答を表示するだけ
    const handleDiagnosticsToggle = () => {
        const next = !diagnosticsOn;
        setDiagnosticsOn(next);
        setAiOcrDiagnosticsEnabled(next);
    };
```

- [ ] **Step 3: トグルを置く**

`AppSettingsModal.tsx` の `{aiOcrOn && !hasApiKey && (...)}` ブロックの直後に追加：

```tsx
                        {/*
                          読み取りがおかしかったときに、Geminiが実際に何を返したかを
                          利用者自身が見られるようにする。既定OFFなのは、応答に
                          選手の氏名がそのまま入るため——体育館で誰かに画面を
                          見せる場面がある以上、常時表示にはしない
                        */}
                        <label className="settings-toggle">
                            <input
                                type="checkbox"
                                checked={diagnosticsOn}
                                onChange={handleDiagnosticsToggle}
                            />
                            <span>読み取り結果の詳細を表示する</span>
                        </label>
                        <p className="section-description">
                            うまく読み取れなかったときの原因調べに使います。
                            AIが返した内容をそのまま画面に出すため、<strong>選手の氏名が含まれます</strong>。
                            端末の外には送られません。
                        </p>
```

- [ ] **Step 4: 型検査と lint**

Run: `npm run typecheck:test && npm run lint`
Expected: エラーなし

- [ ] **Step 5: 全体の回帰を確かめる**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/components/Settings/AppSettingsModal.tsx
git commit -m "$(cat <<'MSG'
feat: 読み取り結果の詳細表示のトグルを設定画面に置く

AI経路の診断なのでAI機能の節に置く。応答に選手の氏名が
含まれることを説明文に明記する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: 折りたたみを2画面に出す

**Files:**
- Create: `src/components/TeamShared/OcrDiagnosticsPanel.tsx`
- Create: `src/components/TeamShared/OcrDiagnosticsPanel.test.tsx`
- Modify: `src/components/OpponentManager/OpponentManager.tsx`
- Modify: `src/components/OpponentSelect/OpponentSelect.tsx`

**Interfaces:**
- Consumes: `OcrDiagnostics`（Task 3）、`isAiOcrDiagnosticsEnabled`（Task 2）、`OpponentEditorProps.ocrError`（Task 1）
- Produces: `OcrDiagnosticsPanel`（default export なし、名前付き export）

`recognizePlayerList` の呼び出し元は `OpponentManager` と `OpponentSelect` の2つ。
前者だけに手を入れて後者を落とすのは直前の作業で実際にやった失敗なので、両方に出す。
共有コンポーネントは `TeamShared/` に置く（`playerLimit` と同じ置き場）。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TeamShared/OcrDiagnosticsPanel.test.tsx` を新規作成：

```tsx
// 読み取り結果の詳細の折りたたみ。
//
// 既定OFFなのは、生の応答に選手の氏名がそのまま入るため。
// 設定ONでも、Geminiを試していなければ出すものが無いので描画しない。

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { OcrDiagnosticsPanel } from './OcrDiagnosticsPanel';
import { setAiOcrDiagnosticsEnabled } from '../../utils/appSettings';

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

const DIAGNOSTICS = {
    geminiModel: 'gemini-2.5-flash-lite',
    geminiRawText: '{"teams":[{"players":[]}]}',
};

describe('設定がOFFのとき', () => {
    it('何も描画しない', () => {
        const { container } = render(
            <OcrDiagnosticsPanel diagnostics={DIAGNOSTICS} usedEngine="Gemini" />,
        );
        expect(container.firstChild).toBeNull();
    });
});

describe('設定がONのとき', () => {
    beforeEach(() => {
        setAiOcrDiagnosticsEnabled(true);
    });

    it('開くまで応答の中身は出さない', () => {
        render(<OcrDiagnosticsPanel diagnostics={DIAGNOSTICS} usedEngine="Gemini" />);

        expect(screen.getByRole('button', { name: /読み取り結果の詳細/ })).toBeTruthy();
        expect(screen.queryByText(/"teams"/)).toBeNull();
    });

    it('開くとモデル名と生の応答が出る', () => {
        render(<OcrDiagnosticsPanel diagnostics={DIAGNOSTICS} usedEngine="Gemini" />);

        fireEvent.click(screen.getByRole('button', { name: /読み取り結果の詳細/ }));

        expect(screen.getByText(/gemini-2.5-flash-lite/)).toBeTruthy();
        expect(screen.getByText(/"teams"/)).toBeTruthy();
    });

    it('Geminiを試していなければ描画しない', () => {
        const { container } = render(
            <OcrDiagnosticsPanel diagnostics={{}} usedEngine="Tesseract" />,
        );
        expect(container.firstChild).toBeNull();
    });

    it('diagnostics が無くても落ちない', () => {
        const { container } = render(<OcrDiagnosticsPanel usedEngine="Tesseract" />);
        expect(container.firstChild).toBeNull();
    });

    it('Tesseractが使われたときはその出力も出す', () => {
        render(
            <OcrDiagnosticsPanel
                diagnostics={DIAGNOSTICS}
                usedEngine="Tesseract"
                rawText="4 田中太郎"
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /読み取り結果の詳細/ }));

        expect(screen.getByText(/4 田中太郎/)).toBeTruthy();
    });
});
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `npx vitest run src/components/TeamShared/OcrDiagnosticsPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./OcrDiagnosticsPanel"`

- [ ] **Step 3: コンポーネントを書く**

`src/components/TeamShared/OcrDiagnosticsPanel.tsx` を新規作成：

```tsx
// 読み取り結果の詳細（Geminiの生の応答と、応答したモデル名）。
//
// プロンプトを直しても「直ったか」は実写でしか分からない。そのとき
// Geminiが実際に何を返したかを見られないと、推測で直すことになる。
//
// 既定OFFなのは、生の応答に選手の氏名がそのまま入るため。
// 体育館で画面を人に見せる場面がある以上、常時表示にはしない。

import { useState } from 'react';
import type { OcrDiagnostics } from '../../utils/imageOCR';
import { isAiOcrDiagnosticsEnabled } from '../../utils/appSettings';

interface OcrDiagnosticsPanelProps {
    diagnostics?: OcrDiagnostics;
    usedEngine?: 'Gemini' | 'Tesseract';
    /** 結果を出したエンジンの生出力。Tesseractが使われたときだけ意味がある */
    rawText?: string;
}

export function OcrDiagnosticsPanel({ diagnostics, usedEngine, rawText }: OcrDiagnosticsPanelProps) {
    const [open, setOpen] = useState(false);

    // Geminiを試していなければ出すものが無い。設定ONでも黙って何も出さない
    if (!isAiOcrDiagnosticsEnabled()) return null;
    if (!diagnostics?.geminiModel && !diagnostics?.geminiRawText) return null;

    return (
        <div className="ocr-diagnostics">
            {/* 角丸の面はボタンだけ。中身は素の文字にする */}
            <button
                type="button"
                className="btn btn-small btn-secondary"
                onClick={() => setOpen(!open)}
            >
                {open ? '▼' : '▶'} 読み取り結果の詳細
            </button>

            {open && (
                <div className="ocr-diagnostics-body">
                    <p>使ったエンジン: {usedEngine ?? '不明'}</p>
                    {diagnostics.geminiModel && <p>モデル: {diagnostics.geminiModel}</p>}
                    {diagnostics.geminiRawText && (
                        <>
                            <p>AIの応答:</p>
                            <pre className="ocr-diagnostics-raw">{diagnostics.geminiRawText}</pre>
                        </>
                    )}
                    {usedEngine === 'Tesseract' && rawText && (
                        <>
                            <p>標準OCRの読み取り:</p>
                            <pre className="ocr-diagnostics-raw">{rawText}</pre>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run src/components/TeamShared/OcrDiagnosticsPanel.test.tsx`
Expected: PASS（6件）

- [ ] **Step 5: `OpponentManager` に置く**

import を足す：

```ts
import { OcrDiagnosticsPanel } from '../TeamShared/OcrDiagnosticsPanel';
import type { ImageOCRResult } from '../../utils/imageOCR';
```

`const [ocrError, setOcrError] = useState<string | null>(null);`（`OpponentManager.tsx:55`）の直後に追加：

```ts
    // 直近1回ぶんだけ持つ。保存はしない（応答に氏名が入る）
    const [lastOcr, setLastOcr] = useState<ImageOCRResult | null>(null);
```

`handleImageImport` の `const result = await recognizePlayerList(file);` の直後に追加：

```ts
            setLastOcr(result);
```

`ocrError` を描画している箇所（`OpponentManager.tsx:560-563`）の直後に追加：

```tsx
                        <OcrDiagnosticsPanel
                            diagnostics={lastOcr?.diagnostics}
                            usedEngine={lastOcr?.usedEngine}
                            rawText={lastOcr?.rawText}
                        />
```

- [ ] **Step 6: `OpponentSelect` に置く**

import を足す：

```ts
import { OcrDiagnosticsPanel } from '../TeamShared/OcrDiagnosticsPanel';
import type { ImageOCRResult } from '../../utils/imageOCR';
```

`const [ocrError, setOcrError] = useState<string | null>(null);`（`OpponentSelect.tsx:40`）の直後に追加：

```ts
    // 直近1回ぶんだけ持つ。保存はしない（応答に氏名が入る）
    const [lastOcr, setLastOcr] = useState<ImageOCRResult | null>(null);
```

`handleImageImport` の `const result = await recognizePlayerList(file);` の直後に追加：

```ts
            setLastOcr(result);
```

`OpponentEditorProps` に追加（Task 1 で足した `ocrError` の直後）：

```ts
    /** 直近の読み取り結果。詳細の折りたたみに使う */
    lastOcr?: ImageOCRResult | null;
```

`OpponentEditor` の引数に `lastOcr` を足し、Task 1 で足した `ocrError` の描画の直後に追加：

```tsx
            <OcrDiagnosticsPanel
                diagnostics={lastOcr?.diagnostics}
                usedEngine={lastOcr?.usedEngine}
                rawText={lastOcr?.rawText}
            />
```

`<OpponentEditor>` の呼び出しに `lastOcr={lastOcr}` を足す。

一覧側の `ocrError` 描画（`OpponentSelect.tsx:193-197`）の直後にも同じパネルを置く
（読み取りに失敗したときはこちらに留まるため）：

```tsx
            <OcrDiagnosticsPanel
                diagnostics={lastOcr?.diagnostics}
                usedEngine={lastOcr?.usedEngine}
                rawText={lastOcr?.rawText}
            />
```

- [ ] **Step 7: スタイルを足す**

`src/index.css` の末尾に追加：

```css
/* 読み取り結果の詳細。中身は素の文字にする（角丸の面はボタンだけ） */
.ocr-diagnostics {
    margin: 8px 0;
}

.ocr-diagnostics-body {
    margin-top: 8px;
    font-size: var(--font-size-sm);
}

.ocr-diagnostics-raw {
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 40vh;
    overflow-y: auto;
    font-family: monospace;
    font-size: var(--font-size-sm);
}
```

- [ ] **Step 8: 全体の回帰を確かめる**

Run: `npm test && npm run typecheck:test && npm run lint`
Expected: PASS、エラーなし

- [ ] **Step 9: コミット**

```bash
git add src/components/TeamShared/OcrDiagnosticsPanel.tsx src/components/TeamShared/OcrDiagnosticsPanel.test.tsx src/components/OpponentManager/OpponentManager.tsx src/components/OpponentSelect/OpponentSelect.tsx src/index.css
git commit -m "$(cat <<'MSG'
feat: 読み取り結果の詳細を2画面の折りたたみに出す

recognizePlayerListの呼び出し元は OpponentManager と OpponentSelect の
2つ。片方だけに手を入れて落とすのは直前の作業でやった失敗なので、
共有コンポーネントにして両方へ置く。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## 完了の確認

- [ ] `npm test` が全件通る
- [ ] `npm run typecheck:test` がエラーなし
- [ ] `npm run lint` がエラーなし
- [ ] `npm run build` が通る
- [ ] 実機確認: 設定OFFのまま写真を読み込み、**折りたたみが出ないこと**
- [ ] 実機確認: 設定をONにして写真を読み込み、**モデル名と生の応答が読めること**
- [ ] 実機確認: 対戦チームを選択 → 写真読込 で、**読み取り成功後の編集画面にも折りたたみが出ること**
- [ ] 実機確認: 16人以上写った写真で、**「N人は取り込みませんでした」が編集画面に出ること**（Task 1 が直した経路）

## この計画で分からないこと

- モデルごとの傾向は1回の読み取りでは分からない。同じ写真を複数モデルで読み比べる仕組みは作らない
- 生の応答が正しいのに登録結果が違う場合（＝受け側の検証の問題）は、この画面では切り分けられない。
  そのときは `invalidNumberCount` と突き合わせる
- `OpponentManager` 側の折りたたみにはコンポーネント単位のテストを置かない
  （`OcrDiagnosticsPanel` 自体のテストで挙動は固定されており、設置は1行のため）
