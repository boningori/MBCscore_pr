# AI写真読込を様式に依存しないようにする 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gemini経路の写真読込が、様式の違うメンバー表でも背番号とライセンスNo.を取り違えないようにする。

**Architecture:** 判別の土台は桁数の不変条件（`背番号 ≤ 2桁` / `licenseNo ≥ 3桁`）。これをプロンプトと受け側の検証の両方に同じ形で書く。応答は `responseSchema` で `{ teams: [...] }` に固定し、複数チームが写っていたら撮り直しを促す。識別キーはライセンスNo.の下3桁で揃え、保存済みの手動統合は読み込み時に矯正する。

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Gemini REST API (`v1beta`)

設計書: `docs/superpowers/specs/2026-09-20-ai-ocr-format-agnostic-design.md`

## Global Constraints

- コメントは日本語。**なぜそうしたか**を書く（既存の `imageOCR.ts` / `mergedPlayers.ts` の書きぶりに合わせる）。何をしているかの説明は書かない
- 既存テストを1つも壊さない。特に `imageOCR.fallback.test.ts` は Gemini 応答を**素の配列** `[{...}]` で与えている。後方互換はこのテストが守る
- Tesseract経路（`parseOcrText` / `normalizeOcrLine` / `recognizeWithTesseract`）は変更しない
- 桁数の不変条件: 背番号は 0〜99（`00` は `DOUBLE_ZERO_INTERNAL`）、`licenseNo` は3桁以上
- `licenseNo` の桁数は統一しない。3桁（下3桁）と10桁（JBA登録番号）の両方を保存したまま受ける
- テスト実行: `npm test`。単体で絞るときは `npx vitest run <path> -t "<名前>"`
- 型検査: `npm run typecheck:test`、lint: `npm run lint`
- 各タスクの最後に必ずコミットする。コミットメッセージ末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を付ける

---

## File Structure

| ファイル | 役割 | 変更 |
|---|---|---|
| `src/utils/geminiRosterResponse.ts` | **新規**。Gemini応答のJSONを解いて `RawTeam[]` にする。`imageOCR.ts` から切り出す純関数だけを置く | Create |
| `src/utils/geminiRosterResponse.test.ts` | **新規**。上のテスト | Create |
| `src/utils/imageOCR.ts` | プロンプト・`responseSchema`・検証・例外・フォールバック制御 | Modify |
| `src/utils/imageOCR.format.test.ts` | **新規**。様式まわりの新しい振る舞いのテスト | Create |
| `src/components/OpponentManager/OpponentManager.tsx` | 捨てた選手の件数を画面に出す | Modify |
| `src/utils/playerStatsAnalysis.ts` | `generatePlayerKey` の正規化 | Modify |
| `src/utils/mergedPlayers.ts` | 読み込み時のキー矯正 | Modify |
| `src/utils/mergedPlayers.migration.test.ts` | **新規**。矯正のテスト | Create |
| `src/utils/teamStorage.ts`, `src/types/game.ts` | コメントの不一致を直す | Modify |

`imageOCR.ts` は441行あり、プロンプト・HTTP・検証・フォールバックを1つに抱えている。今回さらに増やすので、**純粋なJSON解釈だけ** `geminiRosterResponse.ts` へ切り出す。テストからHTTPやTesseractのモックなしに触れるようになるのが主目的で、それ以上の分割はしない。

---

### Task 1: Gemini応答を `teams` 形式でも素の配列でも受ける

**Files:**
- Create: `src/utils/geminiRosterResponse.ts`
- Create: `src/utils/geminiRosterResponse.test.ts`
- Modify: `src/utils/imageOCR.ts:305-322`（JSON抽出と `Array.isArray` の判定）

**Interfaces:**
- Consumes: なし
- Produces:
  - `export interface RawPlayer { number?: unknown; name?: unknown; licenseNo?: unknown; }`
  - `export interface RawTeam { teamName?: string; players: RawPlayer[]; }`
  - `export function parseGeminiRosterResponse(text: string): RawTeam[]`（解けなければ `[]`）

`responseSchema`（Task 6）で応答は `{"teams":[...]}` になるが、旧形式の素の配列と、スキーマ非対応モデルの応答も受け続ける必要がある。現在の抽出は `textResponse.match(/\[[\s\S]*\]/)` で、`{"teams":[...]}` に当てると内側の配列だけが取れて `teamName` と複数チームの情報が落ちる。先に土台を入れ替える。

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/geminiRosterResponse.test.ts` を新規作成：

```ts
// Geminiの応答形式は1つに固定できない。
//   - responseSchema を付けた応答は {"teams":[...]}
//   - 旧プロンプト・スキーマ非対応モデルは素の配列 [...]
//   - モデルによっては ```json のフェンスで包む
// どれで来ても同じ RawTeam[] に均す。ここを外すと、後続の検証が
// 「選手0人」と判断して黙って Tesseract へ落ちる

import { describe, it, expect } from 'vitest';
import { parseGeminiRosterResponse } from './geminiRosterResponse';

describe('parseGeminiRosterResponse', () => {
    it('teams形式をそのまま読む', () => {
        const teams = parseGeminiRosterResponse(
            '{"teams":[{"teamName":"A小","players":[{"number":4,"name":"田中"}]}]}',
        );
        expect(teams).toHaveLength(1);
        expect(teams[0].teamName).toBe('A小');
        expect(teams[0].players).toEqual([{ number: 4, name: '田中' }]);
    });

    it('複数チームをそのまま返す（判断は呼び出し側）', () => {
        const teams = parseGeminiRosterResponse(
            '{"teams":[{"players":[{"number":4,"name":"甲"}]},{"players":[{"number":5,"name":"乙"}]}]}',
        );
        expect(teams).toHaveLength(2);
    });

    it('素の配列は1チーム分として受ける（後方互換）', () => {
        const teams = parseGeminiRosterResponse('[{"number":4,"name":"田中"}]');
        expect(teams).toEqual([{ players: [{ number: 4, name: '田中' }] }]);
    });

    it('コードフェンスで包まれていても読む', () => {
        const teams = parseGeminiRosterResponse('```json\n{"teams":[{"players":[]}]}\n```');
        expect(teams).toHaveLength(1);
    });

    it('説明文が前後に付いていても読む', () => {
        const teams = parseGeminiRosterResponse('はい、読み取りました。\n[{"number":4,"name":"田中"}]\n以上です。');
        expect(teams[0].players).toHaveLength(1);
    });

    it('JSONでなければ空を返す', () => {
        expect(parseGeminiRosterResponse('申し訳ありませんが読み取れませんでした。')).toEqual([]);
    });

    it('playersが配列でないチームは捨てる', () => {
        const teams = parseGeminiRosterResponse('{"teams":[{"players":"なし"},{"players":[{"number":4,"name":"田中"}]}]}');
        expect(teams).toHaveLength(1);
    });
});
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `npx vitest run src/utils/geminiRosterResponse.test.ts`
Expected: FAIL — `Failed to resolve import "./geminiRosterResponse"`

- [ ] **Step 3: 最小の実装を書く**

`src/utils/geminiRosterResponse.ts` を新規作成：

```ts
// Geminiが返した名簿JSONを解く。HTTPもTesseractも知らない純関数だけを置く。
//
// imageOCR.ts から切り出したのは、応答形式が1つに固定できないため。
// responseSchema を付けた応答は {"teams":[...]}、旧プロンプトとスキーマ非対応
// モデルは素の配列で返す。両方を受ける分岐はモックなしで確かめたい。

/** Geminiが返した選手1人分。値の妥当性は呼び出し側（imageOCR）が見る */
export interface RawPlayer {
    number?: unknown;
    name?: unknown;
    licenseNo?: unknown;
}

/** Geminiが返したチーム1つ分 */
export interface RawTeam {
    teamName?: string;
    players: RawPlayer[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * 応答テキストからJSON値を取り出す。
 *
 * そのままパースできるならそれでよい（responseMimeType を付けた応答はこの経路）。
 * 説明文やコードフェンスが混じる場合に備え、最初の { から最後の } 、
 * 次に最初の [ から最後の ] の順で拾い直す。オブジェクトを先に見るのは、
 * {"teams":[...]} に配列の正規表現を当てると内側の配列だけが取れてしまい、
 * teamName と複数チームの情報が黙って落ちるため。
 */
function extractJson(text: string): unknown {
    const stripped = text.replace(/```(?:json)?/gi, '').trim();
    try {
        return JSON.parse(stripped);
    } catch {
        // 説明文が混じっている。下で拾い直す
    }
    for (const pattern of [/\{[\s\S]*\}/, /\[[\s\S]*\]/]) {
        const match = stripped.match(pattern);
        if (!match) continue;
        try {
            return JSON.parse(match[0]);
        } catch {
            // 次の形を試す
        }
    }
    return null;
}

/** 応答テキストを RawTeam[] に均す。解けなければ空配列 */
export function parseGeminiRosterResponse(text: string): RawTeam[] {
    const parsed = extractJson(text);

    // 素の配列＝1チーム分の選手一覧（旧プロンプト互換）
    if (Array.isArray(parsed)) return [{ players: parsed as RawPlayer[] }];

    if (isObject(parsed) && Array.isArray(parsed.teams)) {
        return parsed.teams
            .filter(isObject)
            .filter((team): team is Record<string, unknown> & { players: RawPlayer[] } =>
                Array.isArray(team.players))
            .map(team => ({
                teamName: typeof team.teamName === 'string' ? team.teamName : undefined,
                players: team.players,
            }));
    }

    return [];
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run src/utils/geminiRosterResponse.test.ts`
Expected: PASS（7件）

- [ ] **Step 5: `imageOCR.ts` を新しい解釈に差し替える**

`imageOCR.ts` の冒頭の import に足す：

```ts
import { parseGeminiRosterResponse } from './geminiRosterResponse';
```

`imageOCR.ts:305-322` の以下を——

```ts
            // JSONを抽出
            const jsonMatch = textResponse.match(/\[[\s\S]*\]/);
            // 例外にする（return しない）。return すると recognizePlayerList の
            // catch を通らず、Tesseract を試さないまま失敗が返る。実測では
            // APIキーを入れている利用者だけが、キー無しなら読めた写真で
            // 「応答形式が正しくありませんでした」を受け取っていた
            if (!jsonMatch) {
                throw new Error('Geminiからの応答形式が正しくありませんでした');
            }

            const parsed: unknown = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(parsed)) throw new Error('Geminiの応答が選手の配列ではありませんでした');
```

——こう置き換える：

```ts
            // 例外にする（return しない）。return すると recognizePlayerList の
            // catch を通らず、Tesseract を試さないまま失敗が返る。実測では
            // APIキーを入れている利用者だけが、キー無しなら読めた写真で
            // 「応答形式が正しくありませんでした」を受け取っていた
            const teams = parseGeminiRosterResponse(textResponse);
            if (teams.length === 0) {
                throw new Error('Geminiからの応答形式が正しくありませんでした');
            }
```

続く検証ループの `for (const [index, raw] of parsed.entries())` を、当面は1チーム目だけ見る形にする（複数チームの扱いは Task 2）：

```ts
            const validatedPlayers: SavedPlayer[] = [];
            for (const [index, raw] of teams[0].players.entries()) {
                const p = raw as Partial<SavedPlayer>;
```

- [ ] **Step 6: 既存テストが壊れていないことを確かめる**

Run: `npm test`
Expected: PASS（全件）。特に `imageOCR.fallback.test.ts` の「Tesseractへフォールバックして読み取る」が通ること（素の配列と非JSONの両方を扱えている証拠）

- [ ] **Step 7: 型検査と lint**

Run: `npm run typecheck:test && npm run lint`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/utils/geminiRosterResponse.ts src/utils/geminiRosterResponse.test.ts src/utils/imageOCR.ts
git commit -m "$(cat <<'MSG'
refactor: Gemini応答の解釈をteams形式と素の配列の両方に対応させる

responseSchemaを入れると応答は{"teams":[...]}になるが、旧形式の
素の配列とスキーマ非対応モデルの応答も受け続ける必要がある。
既存の/\[[\s\S]*\]/はオブジェクトに当てると内側の配列だけを拾い、
teamNameと複数チームの情報が黙って落ちる。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: 1枚に複数チームが写っていたら撮り直しを促す

**Files:**
- Modify: `src/utils/imageOCR.ts`（`ImageFormatError` の追加、`recognizeWithGemini` の分岐、`recognizePlayerList` の特別扱い）
- Create: `src/utils/imageOCR.format.test.ts`

**Interfaces:**
- Consumes: `parseGeminiRosterResponse`, `RawTeam`（Task 1）
- Produces: `class ImageFormatError extends Error`（`imageOCR.ts` 内部。export しない）

大会プログラムを撮ると4チーム分が1枚に入る。ここでTesseractへ回すと `parseOcrText` が行単位で拾い、**4チーム分が混ざった名簿がもっともらしく返って利用者が誤りに気づけない**。既存の `GeminiFatalError` は「モデルを変えても同じ」を意味するだけで、`recognizePlayerList` の `catch`（`imageOCR.ts:390-396`）は種類を問わずTesseractへ回すため、これでは表現できない。

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/imageOCR.format.test.ts` を新規作成：

```ts
// 様式そのものが読み取りに向いていないときの振る舞いを固定する。
//
// 1枚に複数チームが写っている写真は、端末内OCRに回しても正しい1チームは
// 出てこない。それどころか parseOcrText は行単位で拾うので、4チーム分の
// 選手が混ざった名簿がもっともらしく返り、利用者が誤りに気づけない。
// 撮り方の問題は撮り方で直してもらう。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const recognizeMock = vi.hoisted(() => vi.fn());
const terminateMock = vi.hoisted(() => vi.fn());
vi.mock('tesseract.js', () => ({
    createWorker: vi.fn(async () => ({ recognize: recognizeMock, terminate: terminateMock })),
}));

import { recognizePlayerList } from './imageOCR';
import { setAiOcrEnabled } from './appSettings';

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

describe('1枚に複数チームが写っていたとき', () => {
    const twoTeams = '{"teams":['
        + '{"teamName":"甲小","players":[{"number":4,"name":"甲太郎"}]},'
        + '{"teamName":"乙小","players":[{"number":5,"name":"乙次郎"}]}]}';

    it('Tesseractへ回さず、撮り直しを促す', async () => {
        const fetchMock = vi.fn(async () => geminiReply(twoTeams));
        vi.stubGlobal('fetch', fetchMock);

        const result = await recognizePlayerList(imageFile());

        expect(result.success).toBe(false);
        expect(result.players).toEqual([]);
        expect(result.error).toContain('複数のチーム');
        expect(result.error).toContain('1チーム');
        // 混ざった名簿を返さないことが要点。Tesseractは起動すらしない
        expect(recognizeMock).not.toHaveBeenCalled();
    });

    it('残りのモデルへ送り直さない（様式の問題はモデルを変えても直らない）', async () => {
        const fetchMock = vi.fn(async () => geminiReply(twoTeams));
        vi.stubGlobal('fetch', fetchMock);

        await recognizePlayerList(imageFile());

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe('1チームだけ写っているとき', () => {
    it('そのチームの選手を取り込む', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"teamName":"甲小","players":[{"number":4,"name":"甲太郎"},{"number":5,"name":"甲次郎"}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.usedEngine).toBe('Gemini');
        expect(result.players.map(p => p.number)).toEqual([4, 5]);
    });

    it('選手が0人ならTesseractへ回す（読めなかっただけで様式の問題ではない）', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply('{"teams":[{"players":[]}]}')));

        const result = await recognizePlayerList(imageFile());

        expect(result.usedEngine).toBe('Tesseract');
        expect(result.players.map(p => p.number)).toEqual([4, 5]);
    });
});
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `npx vitest run src/utils/imageOCR.format.test.ts`
Expected: FAIL — 「Tesseractへ回さず、撮り直しを促す」で `result.usedEngine` が `Tesseract` になり、`recognizeMock` が呼ばれている

- [ ] **Step 3: 例外型を足す**

`imageOCR.ts` の `class GeminiFatalError extends Error { }` の直後に追加：

```ts
/**
 * 写真そのものが読み取りに向いていない失敗。Tesseractへ回さず、撮り直しを促す。
 *
 * GeminiFatalError では表現できない。あちらは「モデルを変えても同じ」を
 * 意味するだけで、recognizePlayerList の catch は種類を問わず Tesseract へ回す。
 * 1枚に複数チームが写った写真をそこへ渡すと、parseOcrText は行単位で拾うので
 * 全チームの選手が混ざった名簿がもっともらしく返り、利用者が誤りに気づけない。
 * 「読めなかった」より「間違って読めた」ほうが害が大きい。
 */
class ImageFormatError extends Error { }
```

- [ ] **Step 4: 複数チームを弾く**

`recognizeWithGemini` の中、Step 1 で入れた `teams.length === 0` の判定の直後に追加：

```ts
            // モデルを変えても写真は変わらないので、ここで打ち切る（下の catch は
            // ImageFormatError を素通しする）
            if (teams.length > 1) {
                throw new ImageFormatError(
                    '1枚の画像に複数のチームが写っています。1チーム分だけが写るように切り取って、もう一度お試しください',
                );
            }
```

`catch` ブロックの `if (error instanceof GeminiFatalError) throw error;` の**直前**に追加：

```ts
            // 様式の問題。残りのモデルへ送り直しても同じ写真が返ってくるだけ
            if (error instanceof ImageFormatError) throw error;
```

- [ ] **Step 5: フォールバックを止める**

`recognizePlayerList`（`imageOCR.ts:377` 以降）の `catch` を置き換える：

```ts
    } else if (apiKey) {
        try {
            return await recognizeWithGemini(imageFile, apiKey);
        } catch (error) {
            // 写真の撮り方の問題は、端末内OCRに回しても直らない。
            // 回すとかえって「間違って読めた」結果が返るので、ここで返し切る
            if (error instanceof ImageFormatError) {
                return {
                    success: false,
                    players: [],
                    error: error.message,
                    usedEngine: 'Gemini',
                };
            }
            fallbackReason = error instanceof Error ? error.message : 'Unknown error';
            console.warn('Gemini API failed, falling back to Tesseract...', error);
            // Gemini失敗時はTesseractへフォールバック
        }
    }
```

- [ ] **Step 6: テストが通ることを確かめる**

Run: `npx vitest run src/utils/imageOCR.format.test.ts`
Expected: PASS（4件）

- [ ] **Step 7: 全体の回帰を確かめる**

Run: `npm test && npm run typecheck:test && npm run lint`
Expected: PASS、エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/utils/imageOCR.ts src/utils/imageOCR.format.test.ts
git commit -m "$(cat <<'MSG'
fix: 複数チームが写った写真をTesseractへ回さず撮り直しを促す

大会プログラムを撮ると4チーム分が1枚に入る。これをTesseractへ回すと
parseOcrTextが行単位で拾い、全チームの選手が混ざった名簿がもっともらしく
返って利用者が誤りに気づけない。「読めなかった」より「間違って読めた」
ほうが害が大きいので、撮り直しを促して返し切る。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: 1〜2桁の `licenseNo` を誤読として捨てる

**Files:**
- Modify: `src/utils/imageOCR.ts:340`（`licenseNo` の正規化）
- Modify: `src/utils/imageOCR.format.test.ts`（describe を追加）

**Interfaces:**
- Consumes: Task 1 の `RawTeam`
- Produces: `function normalizeGeminiLicenseNo(value: unknown): string | undefined`（`imageOCR.ts` 内部。export しない）

`licenseNo` に入り得るのは3桁の数字（下3桁）か10桁の英数字。取り違えの相手（背番号 0〜99、通し番号 1〜15、学年 1桁、出場時限・ファウル 1桁）は**すべて2桁以下**なので重ならない。4〜9桁や11桁以上は未知の様式があり得るので殺さない。

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/imageOCR.format.test.ts` の末尾に追加：

```ts
describe('licenseNoの桁数検証', () => {
    it('1〜2桁は誤読として捨てる（背番号・通し番号・学年が入り込む）', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"players":['
            + '{"number":4,"name":"学年混入","licenseNo":"6"},'
            + '{"number":5,"name":"背番号混入","licenseNo":"12"}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.players.map(p => p.licenseNo)).toEqual([undefined, undefined]);
        // 選手そのものは残す。捨てるのは誤読したライセンスNo.だけ
        expect(result.players.map(p => p.number)).toEqual([4, 5]);
    });

    it('3桁（下3桁）と10桁（JBA登録番号）はどちらも残す', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"players":['
            + '{"number":4,"name":"下3桁","licenseNo":"567"},'
            + '{"number":5,"name":"十桁","licenseNo":"ABC1234567"}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.players.map(p => p.licenseNo)).toEqual(['567', 'ABC1234567']);
    });

    it('記号を除いた結果が2桁以下なら捨てる', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"players":[{"number":4,"name":"記号混じり","licenseNo":"1-2"}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.players[0].licenseNo).toBeUndefined();
    });

    it('nullや空文字は未設定として扱う', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"players":[{"number":4,"name":"欄なし","licenseNo":null}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.players[0].licenseNo).toBeUndefined();
    });
});
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `npx vitest run src/utils/imageOCR.format.test.ts -t "licenseNoの桁数検証"`
Expected: FAIL — 1件目で `['6', '12']` が返る

- [ ] **Step 3: 正規化関数を足す**

`imageOCR.ts` の `normalizeGeminiNumber` の直後に追加：

```ts
/**
 * Geminiが返したライセンスNo.を、使える値だけに絞る（使えなければ undefined）。
 *
 * 欄に入り得るのは3桁の数字（JBA登録番号の下3桁。RunningScoresheet の注記）か、
 * 10桁の英数字（公式戦プログラムに載る登録番号そのもの）。一方で取り違えの相手は
 * すべて2桁以下である——背番号 0〜99、通し番号 1〜15、学年 1桁、出場時限・
 * ファウル 1桁。重ならないので、2桁以下なら誤読と断じてよい。
 *
 * 4〜9桁や11桁以上は弾かない。知らない様式を殺すより、そのまま残して
 * 人が直せるほうがよい（識別キーは下3桁で揃えるので実害も小さい）。
 */
function normalizeGeminiLicenseNo(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const cleaned = value.trim().replace(/[^a-zA-Z0-9]/g, '');
    if (cleaned.length < 3) return undefined;
    return cleaned;
}
```

- [ ] **Step 4: 呼び出し側を差し替える**

`imageOCR.ts:340` の——

```ts
                    licenseNo: typeof p.licenseNo === 'string' && p.licenseNo.trim() ? p.licenseNo.trim().replace(/[^a-zA-Z0-9]/g, '') : undefined,
```

——を、こう置き換える：

```ts
                    licenseNo: normalizeGeminiLicenseNo(p.licenseNo),
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npx vitest run src/utils/imageOCR.format.test.ts`
Expected: PASS（8件）

- [ ] **Step 6: 全体の回帰を確かめる**

Run: `npm test && npm run typecheck:test && npm run lint`
Expected: PASS、エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/utils/imageOCR.ts src/utils/imageOCR.format.test.ts
git commit -m "$(cat <<'MSG'
fix: 1〜2桁のライセンスNo.を誤読として捨てる

ライセンスNo.欄に入るのは3桁（下3桁）か10桁（JBA登録番号）。
取り違えの相手——背番号・通し番号・学年・出場時限・ファウル——は
すべて2桁以下で重ならないため、2桁以下なら誤読と断じてよい。
4〜9桁や11桁以上は未知の様式があり得るので残す。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: 背番号が読めずに捨てた選手の件数を伝える

**Files:**
- Modify: `src/utils/imageOCR.ts`（`ImageOCRResult` に件数、検証ループで数える）
- Modify: `src/components/OpponentManager/OpponentManager.tsx:364-427`
- Modify: `src/utils/imageOCR.format.test.ts`

**Interfaces:**
- Consumes: Task 3 までの `imageOCR.ts`
- Produces: `ImageOCRResult.invalidNumberCount?: number`

現在は `imageOCR.ts:334` の `if (number === null) continue;` で黙って捨てている。ライセンスNo.を背番号として読むと3桁になり範囲外で落ちるため、**選手が消えたことが誰にも分からない**。`OpponentManager` は上限超過を `overflowCount` で既に伝えているので、同じ形にそろえる。

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/imageOCR.format.test.ts` の末尾に追加：

```ts
describe('背番号を読み取れなかった選手', () => {
    it('捨てた件数を返す（黙って消さない）', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"players":['
            + '{"number":567,"name":"ライセンス誤読"},'
            + '{"number":7,"name":"正常"},'
            + '{"number":-3,"name":"負数"}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.players.map(p => p.name)).toEqual(['正常']);
        expect(result.invalidNumberCount).toBe(2);
    });

    it('全員読めていれば0', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"players":[{"number":4,"name":"甲"},{"number":5,"name":"乙"}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.invalidNumberCount).toBe(0);
    });
});
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `npx vitest run src/utils/imageOCR.format.test.ts -t "背番号を読み取れなかった選手"`
Expected: FAIL — `result.invalidNumberCount` が `undefined`

- [ ] **Step 3: 型に足す**

`imageOCR.ts:18-26` の `ImageOCRResult` に追加：

```ts
    /**
     * 背番号を読み取れず取り込めなかった行の数。
     *
     * ライセンスNo.を背番号として読むと3桁になり、0〜99の範囲外で落ちる。
     * 黙って continue していたため、選手が消えたことが誰にも分からなかった。
     * 上限超過（OpponentManager の overflowCount）と同じく、件数を画面へ出す
     */
    invalidNumberCount?: number;
```

- [ ] **Step 4: 数えて返す**

`recognizeWithGemini` の検証ループを書き換える：

```ts
            const validatedPlayers: SavedPlayer[] = [];
            let invalidNumberCount = 0;
            for (const [index, raw] of teams[0].players.entries()) {
                const p = raw as Partial<SavedPlayer>;
                const number = normalizeGeminiNumber(p.number);
                if (number === null) {
                    invalidNumberCount++;
                    continue;
                }
                validatedPlayers.push({
                    number,
                    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : `選手${index + 1}`,
                    licenseNo: normalizeGeminiLicenseNo(p.licenseNo),
                    isCaptain: false,
                });
            }
```

同じ関数の成功時の `return` に足す：

```ts
            return {
                success: true,
                players: validatedPlayers,
                rawText: textResponse,
                usedEngine: 'Gemini',
                invalidNumberCount,
            };
```

- [ ] **Step 5: 単体テストが通ることを確かめる**

Run: `npx vitest run src/utils/imageOCR.format.test.ts`
Expected: PASS（10件）

- [ ] **Step 6: 画面に出す**

`OpponentManager.tsx` の `handleImageImport`、`if (newPlayers.length > 0) { ... }` ブロックの中にある既存の——

```ts
                    // 上限で入らなかった分は、成功の通知に紛れないよう別に伝える
                    if (overflowCount > 0) {
                        setOcrError(`${overflowCount}人は追加できませんでした。${playerLimitMessage()}`);
                    }
```

——を、これに置き換える（`setOcrError` は1つしか出せない。上限超過のほうが打つ手が明確なので、後勝ちにせず優先する）：

```ts
                    // 上限で入らなかった分は、成功の通知に紛れないよう別に伝える
                    if (overflowCount > 0) {
                        setOcrError(`${overflowCount}人は追加できませんでした。${playerLimitMessage()}`);
                    } else if (result.invalidNumberCount) {
                        // 背番号を読めなかった行があったことを伝える。黙って減らすと、
                        // 利用者は「写真に写っている人数と合わない」ことに後で気づく
                        setOcrError(`${result.invalidNumberCount}人は背番号を読み取れなかったため取り込めませんでした。手入力で追加してください。`);
                    }
```

- [ ] **Step 7: 全体の回帰を確かめる**

Run: `npm test && npm run typecheck:test && npm run lint`
Expected: PASS、エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/utils/imageOCR.ts src/utils/imageOCR.format.test.ts src/components/OpponentManager/OpponentManager.tsx
git commit -m "$(cat <<'MSG'
fix: 背番号を読み取れず捨てた選手の件数を画面に出す

ライセンスNo.を背番号として読むと3桁になり0〜99の範囲外で落ちる。
黙ってcontinueしていたため、選手が消えたことが誰にも分からなかった。
上限超過と同じ形で件数を伝える。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: Gemini経路の氏名から字間の空白を取り除く

**Files:**
- Modify: `src/utils/imageOCR.ts`（氏名の正規化）
- Modify: `src/utils/imageOCR.format.test.ts`

**Interfaces:**
- Consumes: Task 4 までの `imageOCR.ts`
- Produces: `function normalizeGeminiName(value: unknown, index: number): string`（`imageOCR.ts` 内部。export しない）

公式様式の氏名は均等割付で字間に全角スペースが入る。Gemini経路の氏名は `.trim()` だけで（`imageOCR.ts:339`）前後しか削らないため、「加 藤　旺 介」がそのまま保存される。氏名は選手識別の最後の砦（`buildIdentityAliases` は氏名で名簿を引く）なので、ここが揺れると寄せ直しが効かない。

`mergedPlayers.ts:45` の `normalizeNameForMerge` は**比較専用**で、保存する氏名には使われていない。ここでは保存する値を整えるので、同じ方針（空白だけを取り除く）を `imageOCR.ts` 側に持つ。

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/imageOCR.format.test.ts` の末尾に追加：

```ts
describe('氏名の空白', () => {
    it('均等割付の字間スペースを取り除く', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"players":[{"number":4,"name":"加 藤　旺 介"}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.players[0].name).toBe('加藤旺介');
    });

    it('姓名の区切りスペースも取り除く（識別キーを揃えるため）', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"players":[{"number":4,"name":"田中 太郎"}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.players[0].name).toBe('田中太郎');
    });

    it('空白だけの氏名は連番で補う（既存の挙動を保つ）', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"players":[{"number":4,"name":"　 "}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.players[0].name).toBe('選手1');
    });
});
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `npx vitest run src/utils/imageOCR.format.test.ts -t "氏名の空白"`
Expected: FAIL — `'加 藤　旺 介'` がそのまま返る

- [ ] **Step 3: 正規化関数を足す**

`imageOCR.ts` の `normalizeGeminiLicenseNo` の直後に追加：

```ts
/**
 * Geminiが返した氏名から空白を取り除く（空なら連番で補う）。
 *
 * 公式様式の氏名は均等割付で、字間に全角スペースが入る。`.trim()` は前後しか
 * 削らないので「加 藤　旺 介」がそのまま保存されていた。氏名は選手識別の
 * 最後の砦で、ライセンスNo.が動いたときの寄せ直し（playerStatsAnalysis の
 * buildIdentityAliases）は氏名で名簿を引く。ここが揺れると何も効かない。
 *
 * 取り除くのは空白だけにとどめる。正規化を強くするほど別人を同じ氏名と
 * 見なす危険が増える（mergedPlayers の normalizeNameForMerge と同じ判断）。
 */
function normalizeGeminiName(value: unknown, index: number): string {
    // \s は全角スペース(U+3000)も含む。文字クラスに直接書くと lint の
    // no-irregular-whitespace に掛かる（normalizeNameForMerge と同じ）
    const cleaned = typeof value === 'string' ? value.replace(/\s/g, '') : '';
    return cleaned || `選手${index + 1}`;
}
```

- [ ] **Step 4: 呼び出し側を差し替える**

Task 4 で書き換えた検証ループの `name:` の行を置き換える：

```ts
                    name: normalizeGeminiName(p.name, index),
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npx vitest run src/utils/imageOCR.format.test.ts`
Expected: PASS（13件）

- [ ] **Step 6: 全体の回帰を確かめる**

Run: `npm test && npm run typecheck:test && npm run lint`
Expected: PASS、エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/utils/imageOCR.ts src/utils/imageOCR.format.test.ts
git commit -m "$(cat <<'MSG'
fix: Gemini経路の氏名から字間の空白を取り除く

公式様式の氏名は均等割付で字間に全角スペースが入る。trim()は前後しか
削らないため「加 藤　旺 介」がそのまま保存されていた。氏名は
ライセンスNo.が動いたときの寄せ直しの手掛かりなので、揺れると効かない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: プロンプトを様式非依存に作り直し、`responseSchema` で型を固定する

**Files:**
- Modify: `src/utils/imageOCR.ts:238-250`（プロンプト）、`:276-279`（`generationConfig`）
- Modify: `src/utils/imageOCR.format.test.ts`

**Interfaces:**
- Consumes: Task 5 までの `imageOCR.ts`
- Produces: なし（送信内容の変更のみ）

プロンプトは10桁の英数字を例示しているが、10桁が載るのは公式戦プログラムだけで、主対象のメンバー表は3桁。**存在しない形式を探させている**ため、モデルは近くの数字で代用する。加えて「読めなければ0」「読めなければ選手+連番」という捏造指示があり、監督・コーチ行が背番号0の選手として入り得る。

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/imageOCR.format.test.ts` の末尾に追加：

```ts
/** fetchに渡されたリクエスト本文を取り出す */
function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    return JSON.parse(init.body as string);
}

describe('Geminiへ送る内容', () => {
    async function capture() {
        const fetchMock = vi.fn(async () => geminiReply(
            '{"teams":[{"players":[{"number":4,"name":"甲"}]}]}',
        ));
        vi.stubGlobal('fetch', fetchMock);
        await recognizePlayerList(imageFile());
        return sentBody(fetchMock);
    }

    it('JSONスキーマで応答形式を固定する', async () => {
        const body = await capture();
        const config = body.generationConfig as Record<string, unknown>;

        expect(config.responseMimeType).toBe('application/json');
        expect(config.responseSchema).toBeDefined();
    });

    it('捏造を促す指示を含まない', async () => {
        const body = await capture();
        const prompt = JSON.stringify(body.contents);

        // 「読めなければ0」は監督・コーチ行を背番号0の選手に変えてしまう
        expect(prompt).not.toContain('読み取れない場合は0');
        expect(prompt).not.toContain('省略可');
    });

    it('背番号とライセンスNo.の見分け方を渡す', async () => {
        const body = await capture();
        const prompt = JSON.stringify(body.contents);

        // 公式様式は見出し「No.」の列が2つある（通し番号と背番号）
        expect(prompt).toContain('通し番号');
        // 桁数の不変条件が判別の土台
        expect(prompt).toContain('0〜99');
        expect(prompt).toContain('3桁');
        expect(prompt).toContain('10桁');
    });

    it('選手以外の行を除外するよう指示する', async () => {
        const body = await capture();
        const prompt = JSON.stringify(body.contents);

        expect(prompt).toContain('監督');
        expect(prompt).toContain('帯同審判');
    });
});
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `npx vitest run src/utils/imageOCR.format.test.ts -t "Geminiへ送る内容"`
Expected: FAIL — `responseMimeType` が `undefined`、`省略可` が含まれている

- [ ] **Step 3: プロンプトを差し替える**

`imageOCR.ts:238-250` の `const prompt = ...` を、まるごとこれに置き換える：

```ts
    // 様式は1つに定まらない。公式様式のメンバー表（見出し「No.」の列が2つ）、
    // ID欄の無い大会プログラム、チーム手製の表がどれも来る。列見出しの語彙に
    // 頼り切らず、桁数の不変条件——背番号は2桁以下、ライセンスNo.は3桁以上——を
    // 判別の土台にする。旧プロンプトは10桁の英数字だけを例示していたが、
    // 10桁が載るのは公式戦プログラムだけで、主対象のメンバー表は3桁だった。
    // 存在しない形式を探させていたので、モデルは近くの数字で代用していた
    const prompt = `この画像には、日本のミニバスケットボールの選手名簿（メンバー表）が写っています。
表を読み取り、指定のJSON形式で出力してください。

【背番号（number）】
- 0〜99の整数。「00」は 0 とは別の背番号なので、文字列 "00" として出力
- 見出しが「No.」の列が2つある様式があります。その場合、**選手名より右側の「No.」が背番号**です
- 欠番なしで 1, 2, 3, ... と順に並ぶ列は「通し番号」であって背番号ではありません。出力しないでください
- 学年・身長・年齢・出場時限・ファウル数を背番号として出力しないでください

【ライセンスNo.（licenseNo）】
- 見出しが「ライセンスNo.」「JBA登録番号」「メンバーID」「会員番号」のいずれかである列**からのみ**読み取ってください
- 値は3桁の数字（登録番号の下3桁）か、10桁の英数字（登録番号そのもの）です
- **1桁・2桁になることはありません。** 1〜2桁の値しか見当たらない場合、それはライセンスNo.ではありません
- 該当する列が画像に無ければ、必ず null にしてください。他の列の値で代用しないでください
- 通し番号・学年・学校・身長・年齢・出場時限・ファウル数を licenseNo に入れてはいけません

【選手名（name）】
- 字間に空白が入っていても詰めて出力してください（例：「加 藤　旺 介」→「加藤旺介」）

【出力しない行】
- 監督・コーチ・Aコーチ・マネージャー・帯同審判・チーム名・所在地などの欄
- 表の見出し行、空行
- 背番号または選手名が読み取れない行（推測で埋めず、その行ごと出力しないでください）

【複数のチーム】
- 1枚に複数チームの表が写っている場合は、teams 配列にチームごとに分けて出力してください
- 途中で見切れているチームも、読める範囲で1つのチームとして出力してください`;
```

- [ ] **Step 4: `responseSchema` を足す**

`imageOCR.ts` の `generationConfig` を置き換える：

```ts
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 2048,
                        // 応答の形を宣言して、JSON以外が混じる余地を無くす。
                        // 非対応のモデルは400を返すが、その本文はJSONなので
                        // 既存の「404以外は打ち切る」経路ではなく下の分岐で次モデルへ回す
                        responseMimeType: 'application/json',
                        responseSchema: {
                            type: 'object',
                            properties: {
                                teams: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            teamName: { type: 'string', nullable: true },
                                            players: {
                                                type: 'array',
                                                items: {
                                                    type: 'object',
                                                    properties: {
                                                        number: { type: 'string' },
                                                        name: { type: 'string' },
                                                        licenseNo: { type: 'string', nullable: true },
                                                    },
                                                    required: ['number', 'name'],
                                                },
                                            },
                                        },
                                        required: ['players'],
                                    },
                                },
                            },
                            required: ['teams'],
                        },
                    },
```

`number` を `string` にしているのは、JSONの数値では `"00"` を表せないため。`normalizeGeminiNumber` は文字列を `parsePlayerNumber` に通すので `00` が保てる（数値で来ても受ける）。

- [ ] **Step 5: スキーマ非対応モデルを次へ回す**

`imageOCR.ts` の `if (!response.ok)` ブロック、`if (response.status === 404 || errorMessage.includes('not found'))` の**直後**に追加：

```ts
                // responseSchema に対応しないモデルは400を返す。写真ではなく
                // 送り方の問題なので、次のモデルなら通る可能性がある
                if (response.status === 400 && /schema|response_schema|responseSchema/i.test(errorMessage)) {
                    console.warn(`Model ${model} rejected responseSchema (OCR), trying next...`);
                    lastError = new Error(errorMessage);
                    continue;
                }
```

- [ ] **Step 6: テストが通ることを確かめる**

Run: `npx vitest run src/utils/imageOCR.format.test.ts`
Expected: PASS（17件）

- [ ] **Step 7: 全体の回帰を確かめる**

Run: `npm test && npm run typecheck:test && npm run lint`
Expected: PASS、エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/utils/imageOCR.ts src/utils/imageOCR.format.test.ts
git commit -m "$(cat <<'MSG'
fix: 写真読込のプロンプトを様式非依存に作り直す

旧プロンプトは10桁の英数字だけを例示していたが、10桁が載るのは
公式戦プログラムだけで、主対象のメンバー表は3桁。存在しない形式を
探させていたため、モデルは近くの数字で代用していた。

桁数の不変条件（背番号は2桁以下、ライセンスNo.は3桁以上）と、
見出し「No.」が2つある様式での位置の規則を渡す。
「読めなければ0」「読めなければ選手+連番」の捏造指示を廃止し、
responseSchemaで応答の形を固定する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: 識別キーをライセンスNo.の下3桁で揃え、保存済みの手動統合を矯正する

**Files:**
- Modify: `src/utils/playerStatsAnalysis.ts:139-145`
- Modify: `src/utils/mergedPlayers.ts:51-60`
- Create: `src/utils/mergedPlayers.migration.test.ts`
- Modify: 既存の `src/utils/playerStatsAnalysis.sameName.test.ts` は変更しない（回帰確認に使う）

**Interfaces:**
- Consumes: なし
- Produces: `generatePlayerKey` の出力形式が `名前_下3桁` に変わる

この2つは**分けられない**。`generatePlayerKey` の出力はそのまま `MergeMap` のキーとして `localStorage` に保存され、バックアップにも入る（`mergedPlayers.ts:17`、`dataBackup.ts:118,131,1349`）。キーの作り方だけ変えると、`田中太郎_ABC1234567` で保存された統合が新キー `田中太郎_567` と一致せず、**利用者が手で行った統合が黙って効かなくなる**。同じコミットで塞ぐ。

矯正は読み込み時に行う。アプリの他の保存領域と同じ約束にそろえるため。

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/mergedPlayers.migration.test.ts` を新規作成：

```ts
// 識別キーの作り方を「名前_ライセンスNo.そのもの」から「名前_下3桁」に
// 変えた。キーはそのまま localStorage に保存されているので、変えただけだと
// 利用者が手で行った統合が黙って効かなくなる。読み込み時に矯正する。

import { describe, it, expect, beforeEach } from 'vitest';
import { loadMergedPlayers, loadAllMergedPlayers } from './mergedPlayers';
import { generatePlayerKey } from './playerStatsAnalysis';

const STORAGE_KEY = 'minibasket-merged-players';

beforeEach(() => {
    localStorage.clear();
});

describe('保存済みの手動統合の矯正', () => {
    it('10桁で保存されたキーが、下3桁の新キーで引ける', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            teamA: { '田中太郎_ABC1234567': '田中太郎_DEF9876543' },
        }));

        const map = loadMergedPlayers('teamA');

        expect(map[generatePlayerKey('田中太郎', 'ABC1234567')])
            .toBe(generatePlayerKey('田中太郎', 'DEF9876543'));
        expect(map['田中太郎_567']).toBe('田中太郎_543');
    });

    it('3桁で保存されたキーはそのまま引ける', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            teamA: { '佐藤花子_123': '佐藤花子_456' },
        }));

        expect(loadMergedPlayers('teamA')['佐藤花子_123']).toBe('佐藤花子_456');
    });

    it('ライセンスNo.が無いキー（名前のみ）を壊さない', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            teamA: { '鈴木一郎': '鈴木一郎_789' },
        }));

        expect(loadMergedPlayers('teamA')['鈴木一郎']).toBe('鈴木一郎_789');
    });

    it('氏名にアンダースコアが入っていても切り詰めない', () => {
        // 末尾が英数字でなければ区切りの `_` ではない。ライセンスNo.は
        // 保存前に英数字だけへ均されているので、この判定で切り分けられる
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            teamA: { '鈴木_一郎': '鈴木_一郎_789' },
        }));

        const map = loadMergedPlayers('teamA');

        expect(map['鈴木_一郎']).toBe('鈴木_一郎_789');
    });

    it('旧キーと新キーが両方あっても、読み込むたびに同じ結果になる', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            teamA: {
                '田中太郎_ABC1234567': '田中太郎_111',
                '田中太郎_567': '田中太郎_222',
            },
        }));

        const first = loadMergedPlayers('teamA');
        const second = loadMergedPlayers('teamA');

        expect(first).toEqual(second);
        // 先に現れたほうを残す
        expect(first['田中太郎_567']).toBe('田中太郎_111');
    });

    it('loadAllMergedPlayers も矯正する（バックアップ経由で入ったデータ）', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            teamA: { '田中太郎_ABC1234567': '田中太郎_DEF9876543' },
        }));

        expect(loadAllMergedPlayers().teamA['田中太郎_567']).toBe('田中太郎_543');
    });
});

describe('generatePlayerKey', () => {
    it('10桁と下3桁が同じキーになる', () => {
        expect(generatePlayerKey('田中太郎', 'ABC1234567'))
            .toBe(generatePlayerKey('田中太郎', '567'));
    });

    it('下3桁が違えば別キーのまま（同姓同名の区別を保つ）', () => {
        expect(generatePlayerKey('田中太郎', '123'))
            .not.toBe(generatePlayerKey('田中太郎', '567'));
    });

    it('ライセンスNo.未設定なら氏名のみ', () => {
        expect(generatePlayerKey('田中太郎')).toBe('田中太郎');
        expect(generatePlayerKey('田中太郎', '   ')).toBe('田中太郎');
    });

    it('3文字未満はそのまま使う（古い保存データを壊さない）', () => {
        expect(generatePlayerKey('田中太郎', '12')).toBe('田中太郎_12');
    });
});
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `npx vitest run src/utils/mergedPlayers.migration.test.ts`
Expected: FAIL — `generatePlayerKey('田中太郎','ABC1234567')` が `'田中太郎_ABC1234567'` を返す

- [ ] **Step 3: `generatePlayerKey` を書き換える**

`playerStatsAnalysis.ts:139-145` を置き換える：

```ts
/**
 * 選手の識別キー（氏名＋ライセンスNo.の下3桁）。
 *
 * 下3桁に揃えるのは、同じ選手が2つの桁数で登録されるため。公式戦のプログラムには
 * JBA登録番号が10桁の英数字で載り、それ以外の試合のメンバー表には下3桁だけが
 * 載る（RunningScoresheet の注記と同じ欄）。年間では後者が大半で、同じ選手が
 * 「ABC1234567」と「567」の両方で入る。
 *
 * 氏名を手掛かりにした寄せ直し（buildIdentityAliases）が大半は救うが、
 * 名簿に同姓同名が2人いる場合は意図的に寄せず、退団選手は寄せ先が無い。
 * その2ケースで同一人物が割れる。下3桁で揃えれば、どちらも割れない。
 *
 * 印字側は licenseDigits() が既に slice(-3) しているので、保存する値は
 * 読み取ったまま（10桁でも3桁でも）でよい。揃えるのは比較のときだけ。
 *
 * 注意: この戻り値は mergedPlayers の MergeMap のキーとしてそのまま保存される。
 * ここを変えるときは mergedPlayers 側の読み込み時の矯正も合わせて直すこと。
 */
export function generatePlayerKey(name: string, licenseNo?: string): string {
    const trimmed = (licenseNo ?? '').trim();
    // slice(-3) は3文字未満をそのまま返すので、1〜2桁が残っている
    // 古い保存データも壊さない（新規の読み取りでは imageOCR が2桁以下を捨てる）
    if (trimmed) return `${name}_${trimmed.slice(-3)}`;
    return name;
}
```

- [ ] **Step 4: `mergedPlayers` の読み込みを矯正する**

> **`generatePlayerKey` を import してはいけない。** `playerStatsAnalysis.ts:10` が `mergedPlayers` から `loadMergedPlayers` 等を import しているので、逆向きを足すと循環になる。キーを解釈する純関数を `mergedPlayers.ts` 側に持つ。

`mergedPlayers.ts:51-60`（`loadAllMergedPlayers` と `loadMergedPlayers`）を、まるごとこれに置き換える：

```ts
/**
 * 保存済みのキーを、今の identity キーの作り方へ合わせ直す。
 *
 * 識別キーは `氏名_ライセンスNo.の下3桁`（playerStatsAnalysis の
 * generatePlayerKey）。以前は下3桁ではなくライセンスNo.そのものを使っていたので、
 * 10桁の登録番号で保存された対応表は今のキーと一致しない。一致しないまま放置すると
 * 利用者が手で行った統合が黙って効かなくなるため、読み込むときに直す。
 *
 * generatePlayerKey を import しないのは循環になるため（あちらが
 * loadMergedPlayers を使っている）。キーの形が変わったらここも直すこと。
 */
function migrateKey(key: string): string {
    const separator = key.lastIndexOf('_');
    // ライセンスNo.を持たないキー（氏名のみ）はそのまま
    if (separator <= 0) return key;
    const name = key.slice(0, separator);
    const license = key.slice(separator + 1);
    // 末尾が半角英数字でなければ、区切りの `_` ではなく氏名の一部である。
    // ライセンスNo.は保存前に英数字だけへ均されているので、この判定で切り分けられる
    if (!/^[a-zA-Z0-9]+$/.test(license)) return key;
    return `${name}_${license.slice(-3)}`;
}

function migrateMap(map: MergeMap): MergeMap {
    const migrated: MergeMap = {};
    for (const [from, to] of Object.entries(map)) {
        const key = migrateKey(from);
        // 旧キーと新キーが両方保存されていると1つに畳まれる。どちらも同じ人を
        // 指すのでどちらを採っても寄り先は同じだが、決めておかないと
        // 読み込むたびに結果が変わる。先に現れたほうを残す
        if (key in migrated) continue;
        migrated[key] = migrateKey(to);
    }
    return migrated;
}

export function loadAllMergedPlayers(): AllMergedPlayers {
    const all = mergedStorage.load();
    const migrated: AllMergedPlayers = {};
    for (const [teamId, map] of Object.entries(all)) {
        migrated[teamId] = isMergeMapRecord(map) ? migrateMap(map as MergeMap) : {};
    }
    return migrated;
}

export function loadMergedPlayers(teamId: string): MergeMap {
    const all = loadAllMergedPlayers();
    const map = all[teamId];
    // チーム単位の中身まで壊れている場合に備える（手で編集したバックアップ等）
    return isMergeMapRecord(map) ? (map as MergeMap) : {};
}
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npx vitest run src/utils/mergedPlayers.migration.test.ts`
Expected: PASS（10件）

- [ ] **Step 6: 識別キーに依存する既存テストの回帰を確かめる**

識別キーはこれらのテストの土台なので、先に絞って確かめる：

```bash
npx vitest run src/utils/playerStatsAnalysis.test.ts src/utils/playerStatsAnalysis.sameName.test.ts src/utils/playerStatsAnalysis.rename.test.ts src/utils/playerStatsAnalysis.merge.test.ts src/utils/playerStatsAnalysis.mergeSameGame.test.ts src/utils/playerStatsAnalysis.multiTeam.test.ts src/utils/mergedPlayers.test.ts src/utils/dataBackup.mergedPlayers.test.ts
```

Expected: PASS

既存テストが落ちた場合、**テストを直す前に理由を確かめること**。同姓同名の分離が壊れていれば設計の欠陥であり、キー文字列を直書きしているだけなら期待値の更新でよい。

- [ ] **Step 7: 全体の回帰を確かめる**

Run: `npm test && npm run typecheck:test && npm run lint`
Expected: PASS、エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/utils/playerStatsAnalysis.ts src/utils/mergedPlayers.ts src/utils/mergedPlayers.migration.test.ts
git commit -m "$(cat <<'MSG'
fix: 選手の識別キーをライセンスNo.の下3桁で揃える

公式戦のプログラムには10桁の登録番号が、それ以外の試合のメンバー表には
下3桁が載る。同じ選手が両方の桁数で登録されると、氏名での寄せ直しが
効かない2ケース——名簿に同姓同名が2人、退団選手——で通算成績が割れる。

識別キーはMergeMapのキーとしてそのまま保存されているため、
読み込み時に矯正しないと手動統合が黙って効かなくなる。同時に塞ぐ。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 8: `licenseNo` のコメントの不一致を直す

**Files:**
- Modify: `src/utils/teamStorage.ts:41`
- Modify: `src/types/game.ts:78`

**Interfaces:**
- Consumes: なし
- Produces: なし（コメントのみ）

`teamStorage.ts:41` は「JBA登録番号・半角英数10桁」、`game.ts:78` は「JBA登録番号の下3桁」と食い違っている。実態は**両方あり得る**（公式戦プログラム = 10桁、それ以外 = 3桁）。この食い違いが、プロンプトが10桁だけを例示していた原因でもある。

- [ ] **Step 1: `teamStorage.ts:41` を直す**

```ts
    /**
     * ライセンスNo.（JBA登録番号）。桁数は様式によって2通りある:
     *   - 3桁の数字 … 登録番号の下3桁。スコアシートのメンバー表はこちら（年間の大半）
     *   - 10桁の英数字 … 登録番号そのもの。公式戦のプログラムに載る
     * 統一しない。印字は licenseDigits() が slice(-3) するので3マスに収まり、
     * 選手の識別は generatePlayerKey が下3桁で揃える
     */
    licenseNo?: string;
```

- [ ] **Step 2: `game.ts:78` を直す**

```ts
    /** ライセンスNo.（JBA登録番号。下3桁の3桁、または10桁の登録番号そのもの。teamStorage.SavedPlayer を参照） */
    licenseNo?: string;
```

- [ ] **Step 3: 型検査と lint**

Run: `npm run typecheck:test && npm run lint`
Expected: エラーなし

- [ ] **Step 4: 全体の回帰を確かめる**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/utils/teamStorage.ts src/types/game.ts
git commit -m "$(cat <<'MSG'
docs: licenseNoの桁数の説明を実態に合わせる

teamStorageは「10桁」、game.tsは「下3桁」と食い違っていた。
実際は様式によって両方あり得る。この食い違いが、写真読込の
プロンプトが10桁だけを例示していた原因でもあった。

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
- [ ] 実機確認: APIキーを設定した状態で、公式様式のメンバー表の写真を読み込み、
      **背番号が通し番号（1,2,3…）になっていないこと**と、
      **ライセンスNo.欄に背番号や学年が入っていないこと**を目視する
- [ ] 実機確認: 大会プログラムの見開き写真を読み込み、撮り直しを促す案内が出ること

## この計画で直らないこと

- 背番号と通し番号は桁数が重なるので、位置（選手名の右）と連番判定という**経験則**で切り分ける。
  両方が外れる様式では当たらない
- 裏写り・湾曲・見切れのある写真は、どの規則でも読み違える
- Gemini の生応答は画面に出さないままなので、読み取りがおかしかったときの原因調査は
  開発ビルドの `console.log`（`imageOCR.ts:301`）に頼ることになる
