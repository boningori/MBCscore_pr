# 音声メモ（口述による手入力補助） 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 記録者が数秒の口述を吹き込むと文字起こしされて一覧に積まれ、それを読みながらスタッツを手入力できるようにする。

**Architecture:** ボタンを押している間だけ `MediaRecorder` で録音し、離したら WAV へ正規化して Gemini API へ送る。結果は sessionStorage に持ち、試合終了で破棄する。スタッツには一切反映しない。データ層（純関数）・変換層・通信層・フック・UI を分離し、UIを描かずにテストできる範囲を最大化する。

**Tech Stack:** React 19 / TypeScript / Vite / vitest + @testing-library/react / Web Audio API / MediaRecorder API / Gemini REST API

## Global Constraints

- 設計書: `docs/superpowers/specs/2026-08-24-voice-memo-design.md`。判断に迷ったらこれが優先
- 休眠中の `VoiceInput.tsx` / `useVoiceInput.ts` / `voiceCommands.ts` / `types/speech.d.ts` は**一切触らない**（削除も改修もしない）
- 文字起こし結果からスタッツへ自動反映しない
- 音声データを永続化しない。localStorage・IndexedDB・バックアップ・エクスポートに一切載せない
- sessionStorage のキーは `minibasket-` / `mbc_` / `mbc-` のいずれでも始めない（`mirrorBackup.ts` の `APP_KEY_PREFIXES` と区別するため）
- 機能の既定は OFF。オンラインかつ Gemini APIキー設定済みかつフルモードのときだけ動く
- インデントはスペース4つ（既存 `src/utils` / `src/components` に合わせる）
- テストは vitest の明示 import（`import { describe, it, expect } from 'vitest'`）。globals は使わない
- テストファイルはソースの隣に `*.test.ts` / `*.test.tsx` で置く
- 各タスクの最後に `npm run lint` と `npm test` が通ることを確認してからコミットする

---

### Task 1: Gemini共通処理を geminiClient.ts へ抽出

音声側から `imageOCR` を import させないための純リファクタ。挙動は変えない。

**Files:**
- Create: `src/utils/geminiClient.ts`
- Create: `src/utils/geminiClient.test.ts`
- Modify: `src/utils/imageOCR.ts`
- Modify: `src/components/OpponentManager/OpponentManager.tsx:10`
- Modify: `src/components/OpponentSelect/OpponentSelect.tsx:12`
- Modify: `src/components/Settings/AppSettingsModal.tsx:3`

**Interfaces:**
- Consumes: なし
- Produces:
  - `GEMINI_API_BASE: string`
  - `FALLBACK_MODELS: readonly string[]`
  - `getStoredApiKey(): string`
  - `saveApiKey(key: string): void`
  - `testGeminiConnection(apiKey: string): Promise<{ success: boolean; message: string }>`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/geminiClient.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GEMINI_API_BASE, FALLBACK_MODELS, getStoredApiKey, saveApiKey } from './geminiClient';

beforeEach(() => {
    localStorage.clear();
});

describe('geminiClient: APIキーの保存', () => {
    it('保存したキーを読み出せる', () => {
        saveApiKey('test-key');
        expect(getStoredApiKey()).toBe('test-key');
    });

    it('空文字を渡すとキーを削除する', () => {
        saveApiKey('test-key');
        saveApiKey('');
        expect(localStorage.getItem('mbc_gemini_api_key')).toBeNull();
    });

    it('既存のOCRと同じlocalStorageキーを使う（設定済みの利用者が再入力せずに済む）', () => {
        saveApiKey('test-key');
        expect(localStorage.getItem('mbc_gemini_api_key')).toBe('test-key');
    });
});

describe('geminiClient: モデル一覧', () => {
    it('最速のflash-liteが先頭にある', () => {
        expect(FALLBACK_MODELS[0]).toBe('gemini-2.5-flash-lite');
    });

    it('APIベースURLはv1beta', () => {
        expect(GEMINI_API_BASE).toBe('https://generativelanguage.googleapis.com/v1beta/models/');
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

```bash
npx vitest run src/utils/geminiClient.test.ts
```

Expected: FAIL — `Failed to resolve import "./geminiClient"`

- [ ] **Step 3: geminiClient.ts を作る**

`src/utils/imageOCR.ts` の該当箇所（`GEMINI_API_BASE` / `STORAGE_KEY_GEMINI_API` / `FALLBACK_MODELS` / `getStoredApiKey` / `saveApiKey` / `testGeminiConnection`）を**そのまま**移す。ロジックは変更しない。

`src/utils/geminiClient.ts`:

```ts
// Gemini APIの共通設定。OCR・音声メモの両方から使う。
//
// 元は imageOCR.ts に同居していたが、APIキーとモデル一覧はOCR固有ではなく
// アプリ共通の設定なので切り出した。音声メモ側から imageOCR を import すると
// Tesseract を読む側のモジュールに巻き込まれるため、依存の向きとしても不適切だった。

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

const STORAGE_KEY_GEMINI_API = 'mbc_gemini_api_key';

export const FALLBACK_MODELS = [
    // --- 現行主力モデル (安定版) ---
    'gemini-2.5-flash-lite',    // 最速・最軽量モデル
    'gemini-2.5-flash',         // 高速・低コスト・多機能
    'gemini-2.5-pro',           // 高度な思考・論理推論 (Adaptive Thinking)
    // --- 次世代モデル (最新プレビュー) ---
    'gemini-3-flash-preview',   // 最もバランスの取れた次世代モデル
    'gemini-3-pro-preview',     // 最強のエージェント型・推論モデル
] as const;

export function getStoredApiKey(): string {
    return localStorage.getItem(STORAGE_KEY_GEMINI_API) || import.meta.env.VITE_GEMINI_API_KEY || '';
}

export function saveApiKey(key: string): void {
    if (key) {
        localStorage.setItem(STORAGE_KEY_GEMINI_API, key);
    } else {
        localStorage.removeItem(STORAGE_KEY_GEMINI_API);
    }
}

/**
 * Gemini APIの接続テスト。設定画面から呼ばれる。
 * 404のモデルは次の候補へ送り、それ以外のエラーは即座に返す。
 */
export async function testGeminiConnection(apiKey: string): Promise<{ success: boolean; message: string }> {
    let lastError = '';

    for (const model of FALLBACK_MODELS) {
        try {
            const url = `${GEMINI_API_BASE}${model}:generateContent`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey,
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'Hello' }] }],
                    generationConfig: { maxOutputTokens: 10 },
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.error?.message || response.statusText;

                // 404なら次のモデルへ
                if (response.status === 404 || errorMessage.includes('not found')) {
                    console.warn(`Model ${model} not found, trying next...`);
                    lastError = errorMessage;
                    continue;
                }

                return { success: false, message: errorMessage };
            }

            const data = await response.json();
            if (data.candidates && data.candidates.length > 0) {
                return { success: true, message: `接続成功 (${model})` };
            }
        } catch (error) {
            lastError = error instanceof Error ? error.message : 'Unknown error';
        }
    }

    return {
        success: false,
        message: `接続失敗: 全てのモデルでエラーが発生しました (${lastError})`,
    };
}
```

- [ ] **Step 4: imageOCR.ts から重複を消し、geminiClient を参照させる**

`imageOCR.ts` の先頭付近から `GEMINI_API_BASE` / `STORAGE_KEY_GEMINI_API` / `FALLBACK_MODELS` の定義と、`getStoredApiKey` / `saveApiKey` / `testGeminiConnection` の実装を削除し、代わりに import する:

```ts
import { GEMINI_API_BASE, FALLBACK_MODELS, getStoredApiKey } from './geminiClient';
```

`imageOCR.ts` 内で `getStoredApiKey()` を使っている箇所（`recognizePlayerList` / `isOCRAvailable`）はそのまま動く。

`imageOCR.ts` からの再エクスポートは**しない**。呼び出し側の import 元を直す（次のステップ）。中継させると、どちらが正なのか分からない状態が残るため。

- [ ] **Step 5: 呼び出し側3ファイルの import 元を直す**

`src/components/OpponentManager/OpponentManager.tsx:10`:

```ts
import { recognizePlayerList } from '../../utils/imageOCR';
import { getStoredApiKey } from '../../utils/geminiClient';
```

`src/components/OpponentSelect/OpponentSelect.tsx:12`:

```ts
import { recognizePlayerList, isOCRAvailable } from '../../utils/imageOCR';
import { getStoredApiKey } from '../../utils/geminiClient';
```

`src/components/Settings/AppSettingsModal.tsx:3`:

```ts
import { getStoredApiKey, saveApiKey, testGeminiConnection } from '../../utils/geminiClient';
```

- [ ] **Step 6: テストと型・lintを通す**

```bash
npm test
```

Expected: PASS（既存の全テスト＋新規5件）。既存のOCRテスト `imageOCR.parse.test.ts` / `dataBackup.secrets.test.ts` が落ちないこと。

```bash
npm run lint && npm run build
```

Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/utils/geminiClient.ts src/utils/geminiClient.test.ts src/utils/imageOCR.ts src/components/OpponentManager/OpponentManager.tsx src/components/OpponentSelect/OpponentSelect.tsx src/components/Settings/AppSettingsModal.tsx
git commit -m "refactor: Gemini共通処理をgeminiClient.tsへ抽出"
```

---

### Task 2: 音声メモのデータ層

型・純関数・sessionStorage I/O。UIも通信もまだ無い。

**Files:**
- Create: `src/utils/voiceMemo.ts`
- Create: `src/utils/voiceMemo.test.ts`
- Create: `src/utils/voiceMemoStorage.ts`
- Create: `src/utils/voiceMemoStorage.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `interface VoiceMemo { id: string; quarter: number; createdAt: number; status: 'sending' | 'done' | 'failed'; text?: string; error?: string }`
  - `sortMemos(memos: VoiceMemo[]): VoiceMemo[]`
  - `appendMemo(memos: VoiceMemo[], memo: VoiceMemo): VoiceMemo[]`
  - `applyTranscription(memos: VoiceMemo[], id: string, result: { success: boolean; text?: string; error?: string }): VoiceMemo[]`
  - `markSending(memos: VoiceMemo[], id: string): VoiceMemo[]`
  - `removeMemo(memos: VoiceMemo[], id: string): VoiceMemo[]`
  - `loadVoiceMemos(): VoiceMemo[]`
  - `saveVoiceMemos(memos: VoiceMemo[]): void`
  - `clearVoiceMemos(): void`

- [ ] **Step 1: 純関数の失敗するテストを書く**

`src/utils/voiceMemo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { VoiceMemo } from './voiceMemo';
import { appendMemo, applyTranscription, markSending, removeMemo, sortMemos } from './voiceMemo';

const memo = (id: string, createdAt: number): VoiceMemo => ({
    id,
    quarter: 1,
    createdAt,
    status: 'sending',
});

describe('voiceMemo: 発話順の保証', () => {
    it('createdAtの昇順で並ぶ', () => {
        const list = sortMemos([memo('c', 300), memo('a', 100), memo('b', 200)]);
        expect(list.map(m => m.id)).toEqual(['a', 'b', 'c']);
    });

    it('後から追加しても、先に喋ったものが前に来る', () => {
        // 通信状況によっては後の発話が先に返る。並びは応答順ではなく発話順で決める
        let list = appendMemo([], memo('later', 200));
        list = appendMemo(list, memo('earlier', 100));
        expect(list.map(m => m.id)).toEqual(['earlier', 'later']);
    });
});

describe('voiceMemo: 文字起こし結果の反映', () => {
    it('成功したらdoneとテキストが入る', () => {
        const list = applyTranscription([memo('a', 100)], 'a', { success: true, text: '青5シュートミス' });
        expect(list[0].status).toBe('done');
        expect(list[0].text).toBe('青5シュートミス');
        expect(list[0].error).toBeUndefined();
    });

    it('失敗したらfailedと理由が入る', () => {
        const list = applyTranscription([memo('a', 100)], 'a', { success: false, error: '通信エラー' });
        expect(list[0].status).toBe('failed');
        expect(list[0].error).toBe('通信エラー');
    });

    it('該当IDが無ければ何も変えない', () => {
        const before = [memo('a', 100)];
        expect(applyTranscription(before, 'zzz', { success: true, text: 'x' })).toEqual(before);
    });

    it('再送するとfailedからsendingに戻り、前回のエラーが消える', () => {
        const failed = applyTranscription([memo('a', 100)], 'a', { success: false, error: '通信エラー' });
        const retried = markSending(failed, 'a');
        expect(retried[0].status).toBe('sending');
        expect(retried[0].error).toBeUndefined();
    });
});

describe('voiceMemo: 削除', () => {
    it('指定したIDだけ消える', () => {
        const list = removeMemo([memo('a', 100), memo('b', 200)], 'a');
        expect(list.map(m => m.id)).toEqual(['b']);
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

```bash
npx vitest run src/utils/voiceMemo.test.ts
```

Expected: FAIL — `Failed to resolve import "./voiceMemo"`

- [ ] **Step 3: voiceMemo.ts を実装**

```ts
// 音声メモのデータ構造と、一覧に対する純粋な操作。
//
// 保存も通信もここでは行わない。特に「並び順」はこの層の責務にしている。
// 数秒の口述を連射すると送信は並列になり、通信状況次第で後の発話が先に返る。
// 応答順に積むとプレーの前後が入れ替わってメモとして使えなくなるため、
// 常に録音開始時刻(createdAt)の昇順で持つ。

export interface VoiceMemo {
    id: string;
    /** 記録時のクォーター */
    quarter: number;
    /** 録音開始時刻。発話順の並び替えキー */
    createdAt: number;
    status: 'sending' | 'done' | 'failed';
    /** status === 'done' のとき */
    text?: string;
    /** status === 'failed' のとき */
    error?: string;
}

export interface TranscriptionOutcome {
    success: boolean;
    text?: string;
    error?: string;
}

export function sortMemos(memos: VoiceMemo[]): VoiceMemo[] {
    return [...memos].sort((a, b) => a.createdAt - b.createdAt);
}

export function appendMemo(memos: VoiceMemo[], memo: VoiceMemo): VoiceMemo[] {
    return sortMemos([...memos, memo]);
}

export function applyTranscription(
    memos: VoiceMemo[],
    id: string,
    result: TranscriptionOutcome,
): VoiceMemo[] {
    return memos.map(m => {
        if (m.id !== id) return m;
        if (result.success) {
            return { ...m, status: 'done' as const, text: result.text, error: undefined };
        }
        return { ...m, status: 'failed' as const, error: result.error };
    });
}

export function markSending(memos: VoiceMemo[], id: string): VoiceMemo[] {
    return memos.map(m => (m.id === id ? { ...m, status: 'sending' as const, error: undefined } : m));
}

export function removeMemo(memos: VoiceMemo[], id: string): VoiceMemo[] {
    return memos.filter(m => m.id !== id);
}
```

- [ ] **Step 4: 純関数のテストが通ることを確認**

```bash
npx vitest run src/utils/voiceMemo.test.ts
```

Expected: PASS（7件）

- [ ] **Step 5: ストレージの失敗するテストを書く**

`src/utils/voiceMemoStorage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { collectAppData } from './mirrorBackup';
import type { VoiceMemo } from './voiceMemo';
import { VOICE_MEMO_STORAGE_KEY, clearVoiceMemos, loadVoiceMemos, saveVoiceMemos } from './voiceMemoStorage';

const memo = (id: string, createdAt: number): VoiceMemo => ({
    id,
    quarter: 2,
    createdAt,
    status: 'done',
    text: '青5シュートミス',
});

beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
});

describe('voiceMemoStorage: 保存と読み込み', () => {
    it('保存したメモを読み出せる', () => {
        saveVoiceMemos([memo('a', 100)]);
        expect(loadVoiceMemos()).toHaveLength(1);
        expect(loadVoiceMemos()[0].text).toBe('青5シュートミス');
    });

    it('読み込み時もcreatedAt昇順に整列する', () => {
        saveVoiceMemos([memo('b', 200), memo('a', 100)]);
        expect(loadVoiceMemos().map(m => m.id)).toEqual(['a', 'b']);
    });

    it('未保存なら空配列', () => {
        expect(loadVoiceMemos()).toEqual([]);
    });

    it('壊れたJSONは捨てて空配列を返す', () => {
        sessionStorage.setItem(VOICE_MEMO_STORAGE_KEY, '{壊れている');
        expect(loadVoiceMemos()).toEqual([]);
    });

    it('配列でない値は捨てて空配列を返す', () => {
        sessionStorage.setItem(VOICE_MEMO_STORAGE_KEY, '{"a":1}');
        expect(loadVoiceMemos()).toEqual([]);
    });

    it('clearで全件消える', () => {
        saveVoiceMemos([memo('a', 100)]);
        clearVoiceMemos();
        expect(loadVoiceMemos()).toEqual([]);
    });
});

describe('voiceMemoStorage: 端末外へ出さない', () => {
    it('localStorageには書かない', () => {
        saveVoiceMemos([memo('a', 100)]);
        expect(localStorage.getItem(VOICE_MEMO_STORAGE_KEY)).toBeNull();
        expect(localStorage.length).toBe(0);
    });

    it('ミラーバックアップの収集対象に現れない', () => {
        // バックアップとエクスポートに音声メモを載せない、が設計上の約束
        saveVoiceMemos([memo('a', 100)]);
        expect(Object.keys(collectAppData())).not.toContain(VOICE_MEMO_STORAGE_KEY);
    });

    it('キーはバックアップ対象の接頭辞で始まらない', () => {
        for (const prefix of ['minibasket-', 'mbc_', 'mbc-']) {
            expect(VOICE_MEMO_STORAGE_KEY.startsWith(prefix)).toBe(false);
        }
    });
});
```

- [ ] **Step 6: テストが落ちることを確認**

```bash
npx vitest run src/utils/voiceMemoStorage.test.ts
```

Expected: FAIL — `Failed to resolve import "./voiceMemoStorage"`

- [ ] **Step 7: voiceMemoStorage.ts を実装**

```ts
// 音声メモの保存。sessionStorage を使う。
//
// createStorage.ts (createJsonStorage) は localStorage 専用なので流用しない。
// sessionStorage を選ぶ理由は2つ:
//   1) mirrorBackup.collectAppData() は localStorage しか走査しないため、
//      バックアップにもエクスポートにも構造的に載らない
//   2) 試合中のリロードやPWA更新では消えない。口述した場面はもう二度と来ないので、
//      メモリ保持だと再起動で永久に失われる
// キーは APP_KEY_PREFIXES (minibasket- / mbc_ / mbc-) を避けて、
// 将来の取り違えを防ぐ。

import type { VoiceMemo } from './voiceMemo';
import { sortMemos } from './voiceMemo';

export const VOICE_MEMO_STORAGE_KEY = 'voicememo-session';

export function loadVoiceMemos(): VoiceMemo[] {
    try {
        const raw = sessionStorage.getItem(VOICE_MEMO_STORAGE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            console.warn('Discarded malformed voice memos in sessionStorage');
            return [];
        }
        return sortMemos(parsed as VoiceMemo[]);
    } catch (error) {
        console.error('Failed to load voice memos:', error);
        return [];
    }
}

export function saveVoiceMemos(memos: VoiceMemo[]): void {
    try {
        sessionStorage.setItem(VOICE_MEMO_STORAGE_KEY, JSON.stringify(memos));
    } catch (error) {
        // 保存できなくても記録本体には影響しない補助機能なので、握って続行する
        console.error('Failed to save voice memos:', error);
    }
}

export function clearVoiceMemos(): void {
    sessionStorage.removeItem(VOICE_MEMO_STORAGE_KEY);
}
```

- [ ] **Step 8: テスト・lint・型を通す**

```bash
npm test && npm run lint && npm run build
```

Expected: 全PASS、エラーなし

- [ ] **Step 9: コミット**

```bash
git add src/utils/voiceMemo.ts src/utils/voiceMemo.test.ts src/utils/voiceMemoStorage.ts src/utils/voiceMemoStorage.test.ts
git commit -m "feat(voicememo): データ層（発話順の保証とsessionStorage保存）"
```

---

### Task 3: 音声をWAVへ正規化

MediaRecorder の出力コンテナはブラウザで割れる（Chrome=WebM/Opus、Safari=MP4）。また Gemini の音声入力で公式に案内されている形式に WebM は含まれない。送信前に WAV へ揃える。

**Files:**
- Create: `src/utils/audioWav.ts`
- Create: `src/utils/audioWav.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `encodeWavBuffer(samples: Float32Array, sampleRate: number): ArrayBuffer`
  - `encodeWav(samples: Float32Array, sampleRate: number): Blob`
  - `blobToWav(blob: Blob, targetRate?: number): Promise<Blob>`（既定 16000）

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/audioWav.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { encodeWavBuffer } from './audioWav';

// WAVヘッダを読むための小さなヘルパ
const readAscii = (view: DataView, offset: number, length: number) =>
    Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join('');

describe('audioWav: WAVヘッダ', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const buffer = encodeWavBuffer(samples, 16000);
    const view = new DataView(buffer);

    it('RIFF/WAVEコンテナである', () => {
        expect(readAscii(view, 0, 4)).toBe('RIFF');
        expect(readAscii(view, 8, 4)).toBe('WAVE');
        expect(readAscii(view, 12, 4)).toBe('fmt ');
        expect(readAscii(view, 36, 4)).toBe('data');
    });

    it('16bit PCM・モノラル・16kHzである', () => {
        expect(view.getUint16(20, true)).toBe(1);      // フォーマット: PCM
        expect(view.getUint16(22, true)).toBe(1);      // チャンネル数: モノラル
        expect(view.getUint32(24, true)).toBe(16000);  // サンプリングレート
        expect(view.getUint32(28, true)).toBe(32000);  // バイト/秒 = 16000 * 2
        expect(view.getUint16(32, true)).toBe(2);      // ブロックアライン
        expect(view.getUint16(34, true)).toBe(16);     // ビット深度
    });

    it('サイズがサンプル数と一致する', () => {
        expect(buffer.byteLength).toBe(44 + samples.length * 2);
        expect(view.getUint32(4, true)).toBe(36 + samples.length * 2);
        expect(view.getUint32(40, true)).toBe(samples.length * 2);
    });
});

describe('audioWav: サンプル値の変換', () => {
    it('無音は0になる', () => {
        const view = new DataView(encodeWavBuffer(new Float32Array([0]), 16000));
        expect(view.getInt16(44, true)).toBe(0);
    });

    it('振幅の上下限が飽和せず範囲内に収まる', () => {
        const view = new DataView(encodeWavBuffer(new Float32Array([1, -1]), 16000));
        expect(view.getInt16(44, true)).toBe(32767);
        expect(view.getInt16(46, true)).toBe(-32768);
    });

    it('範囲外の値はクリップする', () => {
        // 音割れした入力で int16 が巻き戻って轟音になるのを防ぐ
        const view = new DataView(encodeWavBuffer(new Float32Array([2, -2]), 16000));
        expect(view.getInt16(44, true)).toBe(32767);
        expect(view.getInt16(46, true)).toBe(-32768);
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

```bash
npx vitest run src/utils/audioWav.test.ts
```

Expected: FAIL — `Failed to resolve import "./audioWav"`

- [ ] **Step 3: audioWav.ts を実装**

```ts
// 録音した音声を 16kHz モノラル 16bit PCM の WAV へ正規化する。
//
// MediaRecorder の出力は Chrome が WebM/Opus、Safari が MP4 と割れる。
// さらに Gemini の音声入力で公式に案内されている形式に WebM は含まれない。
// 送る前にここで揃えることで、ブラウザ差と対応形式の両方を一度に解消する。
// 音声用途に16kHzモノラルで十分（5秒で約160KB）。

/** WAVのヘッダ長（RIFF 12 + fmt 24 + data 8） */
const WAV_HEADER_BYTES = 44;

export function encodeWavBuffer(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const dataBytes = samples.length * 2;
    const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
    const view = new DataView(buffer);

    const writeAscii = (offset: number, text: string) => {
        for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };

    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    writeAscii(8, 'WAVE');

    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);               // fmtチャンクのサイズ
    view.setUint16(20, 1, true);                // PCM
    view.setUint16(22, 1, true);                // モノラル
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);   // バイト/秒
    view.setUint16(32, 2, true);                // ブロックアライン
    view.setUint16(34, 16, true);               // ビット深度

    writeAscii(36, 'data');
    view.setUint32(40, dataBytes, true);

    let offset = WAV_HEADER_BYTES;
    for (let i = 0; i < samples.length; i++) {
        // クリップしないと音割れした入力で int16 が巻き戻り、轟音になる
        const clamped = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
        offset += 2;
    }

    return buffer;
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
    return new Blob([encodeWavBuffer(samples, sampleRate)], { type: 'audio/wav' });
}

/**
 * 録音Blobをデコードし、モノラル・指定レートへリサンプルしてWAVにする。
 * ブラウザ実装（AudioContext / OfflineAudioContext）に依存するため、
 * このレイヤはテストせず実機で確認する。
 */
export async function blobToWav(blob: Blob, targetRate = 16000): Promise<Blob> {
    const arrayBuffer = await blob.arrayBuffer();

    const decodeContext = new AudioContext();
    let decoded: AudioBuffer;
    try {
        decoded = await decodeContext.decodeAudioData(arrayBuffer);
    } finally {
        await decodeContext.close();
    }

    const frames = Math.max(1, Math.ceil(decoded.duration * targetRate));
    const offline = new OfflineAudioContext(1, frames, targetRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();

    return encodeWav(rendered.getChannelData(0), targetRate);
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/utils/audioWav.test.ts
```

Expected: PASS（6件）

- [ ] **Step 5: lint・型を通す**

```bash
npm run lint && npm run build
```

Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/utils/audioWav.ts src/utils/audioWav.test.ts
git commit -m "feat(voicememo): 録音音声を16kHzモノラルWAVへ正規化"
```

---

### Task 4: Gemini による文字起こし

**Files:**
- Create: `src/utils/audioTranscribe.ts`
- Create: `src/utils/audioTranscribe.test.ts`

**Interfaces:**
- Consumes: `GEMINI_API_BASE`, `FALLBACK_MODELS`（Task 1）/ `TranscriptionOutcome`（Task 2）
- Produces:
  - `transcribeAudio(wav: Blob, apiKey: string): Promise<TranscriptionOutcome>`
  - `TRANSCRIBE_PROMPT: string`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/audioTranscribe.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { transcribeAudio } from './audioTranscribe';

// jsdom の Blob には arrayBuffer があるが、base64化の経路を固定するためスタブする
const wav = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' });

const okResponse = (text: string) => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
});

const errorResponse = (status: number, message: string) => ({
    ok: false,
    status,
    statusText: message,
    json: async () => ({ error: { message } }),
});

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('audioTranscribe: 成功時', () => {
    it('文字起こしされたテキストを返す', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(okResponse('青5シュートミス、青6リバウンド') as never);
        const result = await transcribeAudio(wav(), 'key');
        expect(result.success).toBe(true);
        expect(result.text).toBe('青5シュートミス、青6リバウンド');
    });

    it('前後の空白を落とす', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(okResponse('  青4シュート成功\n') as never);
        const result = await transcribeAudio(wav(), 'key');
        expect(result.text).toBe('青4シュート成功');
    });

    it('最速のflash-liteから試す', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(okResponse('あ') as never);
        await transcribeAudio(wav(), 'key');
        const url = vi.mocked(fetch).mock.calls[0][0] as string;
        expect(url).toContain('gemini-2.5-flash-lite');
    });

    it('APIキーをヘッダで送る（URLに載せない）', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(okResponse('あ') as never);
        await transcribeAudio(wav(), 'secret-key');
        const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
        expect(url).not.toContain('secret-key');
        expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    });
});

describe('audioTranscribe: 失敗時', () => {
    it('404なら次のモデルを試す', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(errorResponse(404, 'not found') as never)
            .mockResolvedValueOnce(okResponse('青6アシスト') as never);
        const result = await transcribeAudio(wav(), 'key');
        expect(result.success).toBe(true);
        expect(result.text).toBe('青6アシスト');
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    });

    it('404以外のAPIエラーは即座に返し、後続モデルを試さない', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(errorResponse(403, 'API key not valid') as never);
        const result = await transcribeAudio(wav(), 'bad-key');
        expect(result.success).toBe(false);
        expect(result.error).toContain('API key not valid');
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    });

    it('通信そのものが落ちたら失敗を返す', async () => {
        vi.mocked(fetch).mockRejectedValue(new Error('Network error') as never);
        const result = await transcribeAudio(wav(), 'key');
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    it('候補が空なら失敗を返す', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ candidates: [] }) } as never);
        const result = await transcribeAudio(wav(), 'key');
        expect(result.success).toBe(false);
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

```bash
npx vitest run src/utils/audioTranscribe.test.ts
```

Expected: FAIL — `Failed to resolve import "./audioTranscribe"`

- [ ] **Step 3: audioTranscribe.ts を実装**

```ts
// 録音した音声を Gemini API で文字起こしする。
//
// 用途は「記録者が数秒で吹き込んだメモを、読める形にする」ことだけ。
// 背番号やアクションの構造化はしない。誤って整形されると、
// 読み手が「そう言ったのか、モデルが補ったのか」を区別できなくなるため。

import { FALLBACK_MODELS, GEMINI_API_BASE } from './geminiClient';
import type { TranscriptionOutcome } from './voiceMemo';

export const TRANSCRIBE_PROMPT = `この音声は、バスケットボールの試合中に記録者が吹き込んだ日本語の短いメモです。
聞こえたとおりに文字起こししてください。

- 要約・補完・言い換えをしない
- 聞き取れない部分は「…」とする
- 文字起こしの結果だけを出力し、説明文を付けない`;

async function blobToBase64(blob: Blob): Promise<string> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    // 一度に渡すと引数が多すぎて落ちるため分割する
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

export async function transcribeAudio(wav: Blob, apiKey: string): Promise<TranscriptionOutcome> {
    const base64Audio = await blobToBase64(wav);
    let lastError = '';

    for (const model of FALLBACK_MODELS) {
        try {
            const url = `${GEMINI_API_BASE}${model}:generateContent`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey,
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                { text: TRANSCRIBE_PROMPT },
                                { inline_data: { mime_type: 'audio/wav', data: base64Audio } },
                            ],
                        },
                    ],
                    generationConfig: {
                        // 聞こえたままを出させたいので揺らぎを最小にする
                        temperature: 0,
                        maxOutputTokens: 256,
                    },
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.error?.message || response.statusText;

                // 404なら次のモデルへ。それ以外（キー不正・権限・課金）は
                // 全モデルで同じ結果になるので即座に返す
                if (response.status === 404 || errorMessage.includes('not found')) {
                    console.warn(`Model ${model} not found (transcribe), trying next...`);
                    lastError = errorMessage;
                    continue;
                }

                return { success: false, error: errorMessage };
            }

            const data = await response.json();
            const text: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                return { success: true, text: text.trim() };
            }
            lastError = '応答に文字起こし結果が含まれていませんでした';
        } catch (error) {
            lastError = error instanceof Error ? error.message : 'Unknown error';
        }
    }

    return { success: false, error: lastError || '文字起こしに失敗しました' };
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/utils/audioTranscribe.test.ts
```

Expected: PASS（8件）

- [ ] **Step 5: lint・型を通す**

```bash
npm run lint && npm run build
```

Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/utils/audioTranscribe.ts src/utils/audioTranscribe.test.ts
git commit -m "feat(voicememo): Gemini APIによる文字起こし"
```

---

### Task 5: 設定項目（既定OFF＋同意フラグ）

**Files:**
- Modify: `src/utils/appSettings.ts`
- Modify: `src/utils/appSettings.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `AppSettings` に `voiceMemoEnabled: boolean` と `voiceMemoConsented: boolean` を追加（既定はどちらも `false`）
  - `isVoiceMemoEnabled(): boolean`
  - `setVoiceMemoEnabled(enabled: boolean): void`
  - `hasVoiceMemoConsent(): boolean`
  - `grantVoiceMemoConsent(): void`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/appSettings.test.ts` の末尾に追記:

```ts
describe('appSettings: 音声メモ', () => {
    it('既定はOFF（音声の外部送信は明示的な選択の上でのみ行う）', () => {
        expect(isVoiceMemoEnabled()).toBe(false);
    });

    it('既定では同意していない', () => {
        expect(hasVoiceMemoConsent()).toBe(false);
    });

    it('ONにすると有効になる', () => {
        setVoiceMemoEnabled(true);
        expect(isVoiceMemoEnabled()).toBe(true);
    });

    it('OFFに戻せる', () => {
        setVoiceMemoEnabled(true);
        setVoiceMemoEnabled(false);
        expect(isVoiceMemoEnabled()).toBe(false);
    });

    it('同意は一度与えると残る', () => {
        grantVoiceMemoConsent();
        expect(hasVoiceMemoConsent()).toBe(true);
    });

    it('OFFに戻しても同意は取り消されない（再度ONで確認をやり直さない）', () => {
        grantVoiceMemoConsent();
        setVoiceMemoEnabled(true);
        setVoiceMemoEnabled(false);
        expect(hasVoiceMemoConsent()).toBe(true);
    });

    it('既定モードの設定を壊さない', () => {
        saveDefaultGameMode('simple');
        setVoiceMemoEnabled(true);
        expect(getDefaultGameMode()).toBe('simple');
    });
});
```

ファイル先頭の import に追加:

```ts
import {
    getDefaultGameMode,
    grantVoiceMemoConsent,
    hasStoredGameMode,
    hasVoiceMemoConsent,
    isVoiceMemoEnabled,
    saveDefaultGameMode,
    setVoiceMemoEnabled,
} from './appSettings';
```

- [ ] **Step 2: テストが落ちることを確認**

```bash
npx vitest run src/utils/appSettings.test.ts
```

Expected: FAIL — `isVoiceMemoEnabled is not a function`

- [ ] **Step 3: appSettings.ts を拡張**

`AppSettings` と `DEFAULT_SETTINGS` を変更:

```ts
export interface AppSettings {
    defaultGameMode: GameMode;
    /** 音声メモ機能のON/OFF。音声を端末外へ送るため既定はOFF */
    voiceMemoEnabled: boolean;
    /** 音声の外部送信について一度でも同意したか。OFFに戻しても取り消さない */
    voiceMemoConsented: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
    defaultGameMode: 'full',
    voiceMemoEnabled: false,
    voiceMemoConsented: false,
};
```

ファイル末尾に追加:

```ts
// 音声メモ機能のON/OFF。
// 既定OFFなのは、この機能だけが「記録者の声」を端末外（Googleのサーバー）へ
// 送るため。知らないうちに送られている状態を作らない。
export function isVoiceMemoEnabled(): boolean {
    return loadAppSettings().voiceMemoEnabled;
}

export function setVoiceMemoEnabled(enabled: boolean): void {
    saveAppSettings({ voiceMemoEnabled: enabled });
}

// 外部送信への同意。初回ONのときだけ確認を出すための記録で、
// OFFに戻しても取り消さない（同じ説明を何度も読ませない）
export function hasVoiceMemoConsent(): boolean {
    return loadAppSettings().voiceMemoConsented;
}

export function grantVoiceMemoConsent(): void {
    saveAppSettings({ voiceMemoConsented: true });
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm test
```

Expected: PASS（既存の appSettings テスト＋新規7件。`hasStoredGameMode` 等の既存挙動が壊れていないこと）

- [ ] **Step 5: lint・型を通す**

```bash
npm run lint && npm run build
```

Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/utils/appSettings.ts src/utils/appSettings.test.ts
git commit -m "feat(voicememo): 設定項目（既定OFFと同意フラグ）"
```

---

### Task 6: useVoiceMemo フック

録音・送信・一覧の状態管理。ブラウザAPI（`getUserMedia` / `MediaRecorder`）に触れる唯一の層。

**Files:**
- Create: `src/hooks/useVoiceMemo.ts`
- Create: `src/hooks/useVoiceMemo.test.tsx`

**Interfaces:**
- Consumes: Task 2 の全関数、Task 3 の `blobToWav`、Task 4 の `transcribeAudio`、Task 5 の `isVoiceMemoEnabled`、Task 1 の `getStoredApiKey`
- Produces:

```ts
export interface UseVoiceMemoOptions {
    quarter: number;
    /** フルモードのときだけ有効にする */
    enabled: boolean;
}

export interface UseVoiceMemoResult {
    memos: VoiceMemo[];
    isRecording: boolean;
    /** 設定ON・APIキーあり・オンライン・enabled のすべてを満たすか */
    isAvailable: boolean;
    /** オフラインが理由で使えない状態か（案内の出し分けに使う） */
    isOffline: boolean;
    startRecording: () => Promise<void>;
    stopRecording: () => void;
    retryMemo: (id: string) => void;
    removeMemoById: (id: string) => void;
    clearAll: () => void;
}

export function useVoiceMemo(options: UseVoiceMemoOptions): UseVoiceMemoResult;
```

- [ ] **Step 1: 失敗するテストを書く**

`src/hooks/useVoiceMemo.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useVoiceMemo } from './useVoiceMemo';
import { saveApiKey } from '../utils/geminiClient';
import { setVoiceMemoEnabled } from '../utils/appSettings';
import { clearVoiceMemos, loadVoiceMemos } from '../utils/voiceMemoStorage';

vi.mock('../utils/audioTranscribe', () => ({
    transcribeAudio: vi.fn(),
}));
vi.mock('../utils/audioWav', () => ({
    blobToWav: vi.fn(async (b: Blob) => b),
}));

import { transcribeAudio } from '../utils/audioTranscribe';

// MediaRecorder と getUserMedia の最小スタブ。
// stop() を呼ぶと ondataavailable → onstop の順に発火する実物の挙動を再現する
class FakeMediaRecorder {
    static lastInstance: FakeMediaRecorder | null = null;
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    state = 'inactive';
    constructor() {
        FakeMediaRecorder.lastInstance = this;
    }
    start() {
        this.state = 'recording';
    }
    stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
        this.onstop?.();
    }
}

const setOnline = (online: boolean) => {
    Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
};

// 押下時間を制御する。fake timers は waitFor と噛み合わないので Date.now だけ差し替える
let now = 1_000_000;
const holdFor = (ms: number) => { now += ms; };

beforeEach(() => {
    now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    localStorage.clear();
    sessionStorage.clear();
    clearVoiceMemos();
    setOnline(true);
    saveApiKey('test-key');
    setVoiceMemoEnabled(true);
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) },
        configurable: true,
    });
    vi.mocked(transcribeAudio).mockResolvedValue({ success: true, text: '青5シュートミス' });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

const render = (quarter = 1, enabled = true) =>
    renderHook(() => useVoiceMemo({ quarter, enabled }));

describe('useVoiceMemo: 利用可否', () => {
    it('設定ON・キーあり・オンライン・enabledなら使える', () => {
        const { result } = render();
        expect(result.current.isAvailable).toBe(true);
    });

    it('設定OFFなら使えない', () => {
        setVoiceMemoEnabled(false);
        const { result } = render();
        expect(result.current.isAvailable).toBe(false);
    });

    it('APIキーが無ければ使えない', () => {
        saveApiKey('');
        const { result } = render();
        expect(result.current.isAvailable).toBe(false);
    });

    it('オフラインなら使えず、その理由が分かる', () => {
        setOnline(false);
        const { result } = render();
        expect(result.current.isAvailable).toBe(false);
        expect(result.current.isOffline).toBe(true);
    });

    it('enabled=false（シンプルモード）なら使えない', () => {
        const { result } = render(1, false);
        expect(result.current.isAvailable).toBe(false);
    });
});

describe('useVoiceMemo: 録音から文字起こしまで', () => {
    it('録音して離すとメモが1件増え、文字起こし結果が入る', async () => {
        const { result } = render(2);

        await act(async () => {
            await result.current.startRecording();
        });
        expect(result.current.isRecording).toBe(true);

        await act(async () => {
            holdFor(2000);
            result.current.stopRecording();
        });

        await waitFor(() => expect(result.current.memos).toHaveLength(1));
        await waitFor(() => expect(result.current.memos[0].status).toBe('done'));
        expect(result.current.memos[0].text).toBe('青5シュートミス');
        expect(result.current.memos[0].quarter).toBe(2);
    });

    it('文字起こしに失敗したらfailedになる', async () => {
        vi.mocked(transcribeAudio).mockResolvedValue({ success: false, error: '通信エラー' });
        const { result } = render();

        await act(async () => {
            await result.current.startRecording();
        });
        await act(async () => {
            holdFor(2000);
            result.current.stopRecording();
        });

        await waitFor(() => expect(result.current.memos[0].status).toBe('failed'));
        expect(result.current.memos[0].error).toBe('通信エラー');
    });

    it('sessionStorageに保存される', async () => {
        const { result } = render();
        await act(async () => {
            await result.current.startRecording();
        });
        await act(async () => {
            holdFor(2000);
            result.current.stopRecording();
        });
        await waitFor(() => expect(loadVoiceMemos()).toHaveLength(1));
    });
});

describe('useVoiceMemo: 誤タップ', () => {
    it('0.5秒未満の押下は破棄され、メモが増えない', async () => {
        const { result } = render();
        await act(async () => {
            await result.current.startRecording();
        });
        await act(async () => {
            // ほとんど時間を進めずに離す＝一瞬の押下
            holdFor(100);
            result.current.stopRecording();
        });
        await new Promise(r => setTimeout(r, 10));
        expect(result.current.memos).toHaveLength(0);
        expect(vi.mocked(transcribeAudio)).not.toHaveBeenCalled();
    });
});

describe('useVoiceMemo: マイク権限', () => {
    it('拒否されたら以後は機能ごと無効になる', async () => {
        const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
        vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(denied as never);

        const { result } = render();
        await act(async () => {
            await result.current.startRecording();
        });

        expect(result.current.isRecording).toBe(false);
        await waitFor(() => expect(result.current.isAvailable).toBe(false));
    });
});

describe('useVoiceMemo: 一覧の操作', () => {
    it('削除できる', async () => {
        const { result } = render();
        await act(async () => {
            await result.current.startRecording();
        });
        await act(async () => {
            holdFor(2000);
            result.current.stopRecording();
        });
        await waitFor(() => expect(result.current.memos).toHaveLength(1));

        const id = result.current.memos[0].id;
        act(() => {
            result.current.removeMemoById(id);
        });
        expect(result.current.memos).toHaveLength(0);
    });

    it('clearAllで全件消え、sessionStorageも空になる', async () => {
        const { result } = render();
        await act(async () => {
            await result.current.startRecording();
        });
        await act(async () => {
            holdFor(2000);
            result.current.stopRecording();
        });
        await waitFor(() => expect(result.current.memos).toHaveLength(1));

        act(() => {
            result.current.clearAll();
        });
        expect(result.current.memos).toHaveLength(0);
        expect(loadVoiceMemos()).toEqual([]);
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

```bash
npx vitest run src/hooks/useVoiceMemo.test.tsx
```

Expected: FAIL — `Failed to resolve import "./useVoiceMemo"`

- [ ] **Step 3: useVoiceMemo.ts を実装**

```ts
// 音声メモの録音・送信・一覧管理。
//
// ブラウザAPI（getUserMedia / MediaRecorder）に触るのはこの層だけにして、
// 並び順・保存・通信は下位のモジュールに任せる。
//
// 送信は並列で構わない。連射された口述の順序は createdAt が保証するので、
// 応答が前後しても表示は崩れない（voiceMemo.ts 参照）。

import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '../components/Toast/toastApi';
import { getStoredApiKey } from '../utils/geminiClient';
import { isVoiceMemoEnabled } from '../utils/appSettings';
import { blobToWav } from '../utils/audioWav';
import { transcribeAudio } from '../utils/audioTranscribe';
import type { VoiceMemo } from '../utils/voiceMemo';
import { appendMemo, applyTranscription, markSending, removeMemo } from '../utils/voiceMemo';
import { clearVoiceMemos, loadVoiceMemos, saveVoiceMemos } from '../utils/voiceMemoStorage';

/** これより短い押下は誤タップとみなして捨てる */
const MIN_DURATION_MS = 500;
/** 握ったまま忘れたときの保険。この長さで自動的に打ち切る */
const MAX_DURATION_MS = 60_000;

export interface UseVoiceMemoOptions {
    quarter: number;
    /** フルモードのときだけ有効にする */
    enabled: boolean;
}

export interface UseVoiceMemoResult {
    memos: VoiceMemo[];
    isRecording: boolean;
    isAvailable: boolean;
    isOffline: boolean;
    startRecording: () => Promise<void>;
    stopRecording: () => void;
    retryMemo: (id: string) => void;
    removeMemoById: (id: string) => void;
    clearAll: () => void;
}

export function useVoiceMemo({ quarter, enabled }: UseVoiceMemoOptions): UseVoiceMemoResult {
    const [memos, setMemos] = useState<VoiceMemo[]>(() => loadVoiceMemos());
    const [isRecording, setIsRecording] = useState(false);
    const [isOnline, setIsOnline] = useState(() => navigator.onLine);
    // マイクを拒否されたら以後は機能ごと下ろす。押すたびに拒否ダイアログが
    // 出るのは記録中に邪魔なので、案内は一度だけにする
    const [micDenied, setMicDenied] = useState(false);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const startedAtRef = useRef(0);
    const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // 再送のために、まだ成功していないメモの音声だけメモリ上に持つ
    const pendingAudioRef = useRef<Map<string, Blob>>(new Map());

    // 一覧が変わるたび sessionStorage に写す
    useEffect(() => {
        saveVoiceMemos(memos);
    }, [memos]);

    useEffect(() => {
        const sync = () => setIsOnline(navigator.onLine);
        window.addEventListener('online', sync);
        window.addEventListener('offline', sync);
        return () => {
            window.removeEventListener('online', sync);
            window.removeEventListener('offline', sync);
        };
    }, []);

    const isOffline = !isOnline;
    const isAvailable = enabled && isVoiceMemoEnabled() && !!getStoredApiKey() && isOnline && !micDenied;

    const send = useCallback(async (id: string, audio: Blob) => {
        try {
            const wav = await blobToWav(audio);
            const result = await transcribeAudio(wav, getStoredApiKey());
            setMemos(prev => applyTranscription(prev, id, result));
            if (result.success) pendingAudioRef.current.delete(id);
        } catch (error) {
            const message = error instanceof Error ? error.message : '音声の変換に失敗しました';
            setMemos(prev => applyTranscription(prev, id, { success: false, error: message }));
        }
    }, []);

    const releaseStream = useCallback(() => {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (autoStopRef.current) {
            clearTimeout(autoStopRef.current);
            autoStopRef.current = null;
        }
    }, []);

    const startRecording = useCallback(async () => {
        if (!isAvailable || isRecording) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            chunksRef.current = [];
            startedAtRef.current = Date.now();

            recorder.ondataavailable = event => {
                if (event.data.size > 0) chunksRef.current.push(event.data);
            };

            recorder.onstop = () => {
                const durationMs = Date.now() - startedAtRef.current;
                const audio = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' });
                releaseStream();
                setIsRecording(false);

                // 一瞬の押下は誤タップ。無音をAPIに送っても意味がない
                if (durationMs < MIN_DURATION_MS || audio.size === 0) return;

                const id = `vm-${startedAtRef.current}-${Math.random().toString(36).slice(2, 8)}`;
                pendingAudioRef.current.set(id, audio);
                setMemos(prev => appendMemo(prev, {
                    id,
                    quarter,
                    createdAt: startedAtRef.current,
                    status: 'sending',
                }));
                void send(id, audio);
            };

            streamRef.current = stream;
            recorderRef.current = recorder;
            recorder.start();
            setIsRecording(true);

            autoStopRef.current = setTimeout(() => {
                if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
            }, MAX_DURATION_MS);
        } catch (error) {
            console.error('Failed to start voice memo recording:', error);
            releaseStream();
            setIsRecording(false);

            // 権限拒否は押し直しても結果が変わらない。案内を一度出して機能を下ろす
            const name = error instanceof Error ? error.name : '';
            if (name === 'NotAllowedError' || name === 'SecurityError') {
                setMicDenied(true);
                showToast('🎤 マイクが使えないため音声メモを無効にしました', 'error');
            }
        }
    }, [isAvailable, isRecording, quarter, releaseStream, send]);

    const stopRecording = useCallback(() => {
        const recorder = recorderRef.current;
        if (!recorder) return;
        if (recorder.state === 'recording') recorder.stop();
    }, []);

    const retryMemo = useCallback((id: string) => {
        const audio = pendingAudioRef.current.get(id);
        if (!audio) return;
        setMemos(prev => markSending(prev, id));
        void send(id, audio);
    }, [send]);

    const removeMemoById = useCallback((id: string) => {
        pendingAudioRef.current.delete(id);
        setMemos(prev => removeMemo(prev, id));
    }, []);

    const clearAll = useCallback(() => {
        pendingAudioRef.current.clear();
        setMemos([]);
        clearVoiceMemos();
    }, []);

    // 画面を離れるときに録音を止め、マイクを解放する
    useEffect(() => releaseStream, [releaseStream]);

    return {
        memos,
        isRecording,
        isAvailable,
        isOffline,
        startRecording,
        stopRecording,
        retryMemo,
        removeMemoById,
        clearAll,
    };
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/hooks/useVoiceMemo.test.tsx
```

Expected: PASS（12件）

- [ ] **Step 5: 全体テスト・lint・型を通す**

```bash
npm test && npm run lint && npm run build
```

Expected: 全PASS、エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/hooks/useVoiceMemo.ts src/hooks/useVoiceMemo.test.tsx
git commit -m "feat(voicememo): 録音・送信・一覧管理のフック"
```

---

### Task 7: 録音ボタン

**Files:**
- Create: `src/components/VoiceMemo/VoiceMemoButton.tsx`
- Create: `src/components/VoiceMemo/VoiceMemoButton.test.tsx`
- Create: `src/components/VoiceMemo/VoiceMemo.css`
- Create: `src/components/VoiceMemo/index.ts`

**Interfaces:**
- Consumes: なし（表示専用。状態は props で受ける）
- Produces:

```ts
export interface VoiceMemoButtonProps {
    isRecording: boolean;
    isOffline: boolean;
    onStart: () => void;
    onStop: () => void;
}
```

- [ ] **Step 1: 失敗するテストを書く**

`src/components/VoiceMemo/VoiceMemoButton.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { VoiceMemoButton } from './VoiceMemoButton';

afterEach(cleanup);

const setup = (overrides: Partial<Parameters<typeof VoiceMemoButton>[0]> = {}) => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    render(
        <VoiceMemoButton
            isRecording={false}
            isOffline={false}
            onStart={onStart}
            onStop={onStop}
            {...overrides}
        />,
    );
    return { onStart, onStop };
};

describe('VoiceMemoButton: 押している間だけ録音', () => {
    it('押し下げで録音を開始する', () => {
        const { onStart } = setup();
        fireEvent.pointerDown(screen.getByRole('button'));
        expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('離すと録音を止める', () => {
        const { onStop } = setup({ isRecording: true });
        fireEvent.pointerUp(screen.getByRole('button'));
        expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('指がボタンの外へ滑っても止める（押しっぱなしのまま取り残されない）', () => {
        const { onStop } = setup({ isRecording: true });
        fireEvent.pointerLeave(screen.getByRole('button'));
        expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('着信などでポインタが奪われても止める', () => {
        const { onStop } = setup({ isRecording: true });
        fireEvent.pointerCancel(screen.getByRole('button'));
        expect(onStop).toHaveBeenCalledTimes(1);
    });
});

// jest-dom は導入していないため、属性・disabled は素のプロパティで確かめる
describe('VoiceMemoButton: 状態表示', () => {
    it('録音中はaria-pressedがtrueになる', () => {
        setup({ isRecording: true });
        expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
    });

    it('待機中はaria-pressedがfalseになる', () => {
        setup();
        expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('false');
    });

    it('オフラインでは無効になり、理由が読める', () => {
        setup({ isOffline: true });
        const button = screen.getByRole('button') as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        expect(button.getAttribute('aria-label')).toContain('オンライン');
    });

    it('オフラインでは押しても録音を開始しない', () => {
        const { onStart } = setup({ isOffline: true });
        fireEvent.pointerDown(screen.getByRole('button'));
        expect(onStart).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

```bash
npx vitest run src/components/VoiceMemo/VoiceMemoButton.test.tsx
```

Expected: FAIL — `Failed to resolve import "./VoiceMemoButton"`

- [ ] **Step 3: VoiceMemoButton.tsx を実装**

```tsx
// 押している間だけ録音するボタン。
//
// pointer系のイベントを使い、マウス・タッチ・ペンを1系統で扱う。
// pointerUp だけでなく pointerLeave / pointerCancel でも止めるのは、
// 指がボタンの外へ滑ったり着信で奪われたときに録音が残り続けるのを防ぐため。

import './VoiceMemo.css';

export interface VoiceMemoButtonProps {
    isRecording: boolean;
    isOffline: boolean;
    onStart: () => void;
    onStop: () => void;
}

export function VoiceMemoButton({ isRecording, isOffline, onStart, onStop }: VoiceMemoButtonProps) {
    const label = isOffline
        ? '音声メモ（オンラインのときに使えます）'
        : isRecording
            ? '音声メモを録音中。指を離すと文字起こしされます'
            : '音声メモ。押している間だけ録音します';

    const handleDown = () => {
        if (isOffline) return;
        onStart();
    };

    const handleUp = () => {
        if (!isRecording) return;
        onStop();
    };

    return (
        <button
            type="button"
            className={`voice-memo-btn ${isRecording ? 'is-recording' : ''}`}
            aria-label={label}
            aria-pressed={isRecording}
            disabled={isOffline}
            onPointerDown={handleDown}
            onPointerUp={handleUp}
            onPointerLeave={handleUp}
            onPointerCancel={handleUp}
            // 長押しで選択・コンテキストメニューが出るのを抑える
            onContextMenu={e => e.preventDefault()}
        >
            <span className="voice-memo-btn-icon" aria-hidden="true">{isRecording ? '⏺' : '🎤'}</span>
            <span className="voice-memo-btn-label">{isRecording ? '録音中' : 'メモ'}</span>
        </button>
    );
}
```

- [ ] **Step 4: VoiceMemo.css を作る**

```css
/* 音声メモ。休眠中の VoiceInput 用スタイル（index.css の .voice-indicator 等）
   とは別系統として定義する。あちらは触らない */

.voice-memo-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    /* 押しっぱなしにするので、指で確実に掴める大きさを確保する */
    min-height: 44px;
    padding: 6px 14px;
    border: 2px solid var(--color-border, #ccc);
    border-radius: 22px;
    background: var(--color-surface, #fff);
    color: var(--color-text, #222);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    /* 長押し中に選択・スクロール・拡大が起きないようにする */
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
}

.voice-memo-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.voice-memo-btn.is-recording {
    border-color: var(--color-danger, #d32f2f);
    background: var(--color-danger, #d32f2f);
    color: #fff;
    animation: voice-memo-pulse 1s ease-in-out infinite;
}

@keyframes voice-memo-pulse {
    50% { opacity: 0.65; }
}

@media (prefers-reduced-motion: reduce) {
    .voice-memo-btn.is-recording {
        animation: none;
    }
}

.voice-memo-btn-icon {
    font-size: 1.1rem;
}

/* 一覧パネル */
.voice-memo-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 60vh;
    overflow-y: auto;
}

.voice-memo-item {
    padding: 10px 12px;
    border: 1px solid var(--color-border, #ccc);
    border-radius: 8px;
    background: var(--color-surface, #fff);
}

.voice-memo-item-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
    font-size: 0.8rem;
    color: var(--color-text-muted, #666);
}

.voice-memo-item-text {
    margin: 0;
    font-size: 1rem;
    line-height: 1.5;
    white-space: pre-wrap;
}

.voice-memo-item.is-failed {
    border-color: var(--color-danger, #d32f2f);
}

.voice-memo-empty {
    padding: 24px 12px;
    text-align: center;
    color: var(--color-text-muted, #666);
}
```

- [ ] **Step 5: index.ts を作る**

```ts
export { VoiceMemoButton } from './VoiceMemoButton';
export { VoiceMemoPanel } from './VoiceMemoPanel';
```

`VoiceMemoPanel` は次のタスクで作るため、この時点では型エラーになる。Step 5 は Task 8 の完了まで保留し、**この段階では `index.ts` に `VoiceMemoButton` の行だけ書く**:

```ts
export { VoiceMemoButton } from './VoiceMemoButton';
```

- [ ] **Step 6: テストが通ることを確認**

```bash
npx vitest run src/components/VoiceMemo/VoiceMemoButton.test.tsx
```

Expected: PASS（8件）

- [ ] **Step 7: lint・型を通す**

```bash
npm run lint && npm run build
```

Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/components/VoiceMemo/
git commit -m "feat(voicememo): 押している間だけ録音するボタン"
```

---

### Task 8: メモ一覧パネル

**Files:**
- Create: `src/components/VoiceMemo/VoiceMemoPanel.tsx`
- Create: `src/components/VoiceMemo/VoiceMemoPanel.test.tsx`
- Modify: `src/components/VoiceMemo/index.ts`

**Interfaces:**
- Consumes: `VoiceMemo`（Task 2）、`Modal`（既存 `src/components/Modal`）
- Produces:

```ts
export interface VoiceMemoPanelProps {
    memos: VoiceMemo[];
    onClose: () => void;
    onRetry: (id: string) => void;
    onRemove: (id: string) => void;
}
```

- [ ] **Step 1: 失敗するテストを書く**

`src/components/VoiceMemo/VoiceMemoPanel.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { VoiceMemo } from '../../utils/voiceMemo';
import { VoiceMemoPanel } from './VoiceMemoPanel';

afterEach(cleanup);

const memo = (over: Partial<VoiceMemo> = {}): VoiceMemo => ({
    id: 'a',
    quarter: 2,
    createdAt: 1000,
    status: 'done',
    text: '青5シュートミス、青6リバウンド',
    ...over,
});

const setup = (memos: VoiceMemo[]) => {
    const onClose = vi.fn();
    const onRetry = vi.fn();
    const onRemove = vi.fn();
    render(<VoiceMemoPanel memos={memos} onClose={onClose} onRetry={onRetry} onRemove={onRemove} />);
    return { onClose, onRetry, onRemove };
};

describe('VoiceMemoPanel: 表示', () => {
    it('文字起こし結果を表示する', () => {
        setup([memo()]);
        expect(screen.getByText('青5シュートミス、青6リバウンド')).toBeTruthy();
    });

    it('クォーターを表示する', () => {
        setup([memo({ quarter: 3 })]);
        expect(screen.getByText(/Q3/)).toBeTruthy();
    });

    it('発話順（createdAt昇順）に並ぶ', () => {
        setup([
            memo({ id: 'a', createdAt: 100, text: '先に喋った' }),
            memo({ id: 'b', createdAt: 200, text: '後に喋った' }),
        ]);
        const texts = screen.getAllByText(/喋った/).map(el => el.textContent);
        expect(texts).toEqual(['先に喋った', '後に喋った']);
    });

    it('送信中は進行中と分かる表示になる', () => {
        setup([memo({ status: 'sending', text: undefined })]);
        expect(screen.getByText(/文字起こし中/)).toBeTruthy();
    });

    it('1件も無ければ案内を出す', () => {
        setup([]);
        expect(screen.getByText(/まだありません/)).toBeTruthy();
    });
});

describe('VoiceMemoPanel: 操作', () => {
    it('失敗したメモには再送ボタンが出る', () => {
        const { onRetry } = setup([memo({ status: 'failed', text: undefined, error: '通信エラー' })]);
        fireEvent.click(screen.getByRole('button', { name: /再送/ }));
        expect(onRetry).toHaveBeenCalledWith('a');
    });

    it('成功したメモには再送ボタンを出さない', () => {
        setup([memo()]);
        expect(screen.queryByRole('button', { name: /再送/ })).toBeNull();
    });

    it('削除できる', () => {
        const { onRemove } = setup([memo()]);
        fireEvent.click(screen.getByRole('button', { name: /削除/ }));
        expect(onRemove).toHaveBeenCalledWith('a');
    });

    it('失敗の理由が読める', () => {
        setup([memo({ status: 'failed', text: undefined, error: '通信エラー' })]);
        expect(screen.getByText(/通信エラー/)).toBeTruthy();
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

```bash
npx vitest run src/components/VoiceMemo/VoiceMemoPanel.test.tsx
```

Expected: FAIL — `Failed to resolve import "./VoiceMemoPanel"`

- [ ] **Step 3: VoiceMemoPanel.tsx を実装**

```tsx
// 音声メモの一覧。常時表示せず、確認したいときだけ開く。
//
// スタッツには一切反映しない。ここは「読んで手入力するための下書き」であり、
// 入力し終わったものは削除して減らしていく使い方を想定している。

import { Modal } from '../Modal';
import type { VoiceMemo } from '../../utils/voiceMemo';
import './VoiceMemo.css';

export interface VoiceMemoPanelProps {
    memos: VoiceMemo[];
    onClose: () => void;
    onRetry: (id: string) => void;
    onRemove: (id: string) => void;
}

const formatTime = (createdAt: number) =>
    new Date(createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

export function VoiceMemoPanel({ memos, onClose, onRetry, onRemove }: VoiceMemoPanelProps) {
    return (
        <Modal onClose={onClose} labelledBy="voice-memo-panel-title">
            <h3 id="voice-memo-panel-title">🎤 音声メモ</h3>
            <p className="section-description">
                吹き込んだメモの文字起こしです。スタッツには反映されません。
            </p>

            {memos.length === 0 ? (
                <p className="voice-memo-empty">音声メモはまだありません。</p>
            ) : (
                <div className="voice-memo-panel">
                    {memos.map(m => (
                        <div
                            key={m.id}
                            className={`voice-memo-item ${m.status === 'failed' ? 'is-failed' : ''}`}
                        >
                            <div className="voice-memo-item-head">
                                <span>Q{m.quarter} / {formatTime(m.createdAt)}</span>
                                <span>
                                    {m.status === 'failed' && (
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-small"
                                            onClick={() => onRetry(m.id)}
                                        >
                                            再送
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-small"
                                        onClick={() => onRemove(m.id)}
                                        aria-label={`このメモを削除 (Q${m.quarter} ${formatTime(m.createdAt)})`}
                                    >
                                        削除
                                    </button>
                                </span>
                            </div>

                            {m.status === 'sending' && <p className="voice-memo-item-text">⏳ 文字起こし中…</p>}
                            {m.status === 'done' && <p className="voice-memo-item-text">{m.text}</p>}
                            {m.status === 'failed' && (
                                <p className="voice-memo-item-text">⚠️ 文字起こしに失敗しました（{m.error}）</p>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <button type="button" className="btn btn-primary btn-large" onClick={onClose}>
                閉じる
            </button>
        </Modal>
    );
}
```

- [ ] **Step 4: index.ts に追加**

```ts
export { VoiceMemoButton } from './VoiceMemoButton';
export { VoiceMemoPanel } from './VoiceMemoPanel';
```

- [ ] **Step 5: テストが通ることを確認**

```bash
npx vitest run src/components/VoiceMemo/
```

Expected: PASS（Task 7 の8件＋新規9件）

- [ ] **Step 6: lint・型を通す**

```bash
npm run lint && npm run build
```

Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/components/VoiceMemo/
git commit -m "feat(voicememo): メモ一覧パネル"
```

---

### Task 9: 設定UIと初回同意

**Files:**
- Modify: `src/components/Settings/AppSettingsModal.tsx`
- Create: `src/components/Settings/voiceMemoSetting.test.tsx`

**Interfaces:**
- Consumes: Task 5 の `isVoiceMemoEnabled` / `setVoiceMemoEnabled` / `hasVoiceMemoConsent` / `grantVoiceMemoConsent`、既存の `ConfirmModal`
- Produces: なし（UIのみ）

- [ ] **Step 1: 失敗するテストを書く**

`src/components/Settings/voiceMemoSetting.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AppSettingsModal } from './AppSettingsModal';
import { saveApiKey } from '../../utils/geminiClient';
import { hasVoiceMemoConsent, isVoiceMemoEnabled } from '../../utils/appSettings';

afterEach(cleanup);

beforeEach(() => {
    localStorage.clear();
    saveApiKey('test-key');
});

// jest-dom は導入していないため、checked は素のプロパティで確かめる
const toggle = () => screen.getByRole('checkbox', { name: /音声メモを使う/ }) as HTMLInputElement;

const openVoiceMemoSection = () => {
    render(<AppSettingsModal isOpen onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /音声メモ/ }));
};

describe('設定: 音声メモ', () => {
    it('既定ではOFFになっている', () => {
        openVoiceMemoSection();
        expect(toggle().checked).toBe(false);
    });

    it('初回ONで外部送信の確認が出る（この時点ではまだ有効化しない）', () => {
        openVoiceMemoSection();
        fireEvent.click(toggle());
        expect(screen.getByText(/Googleのサーバーに送信されます/)).toBeTruthy();
        expect(isVoiceMemoEnabled()).toBe(false);
    });

    it('確認に同意すると有効になる', () => {
        openVoiceMemoSection();
        fireEvent.click(toggle());
        fireEvent.click(screen.getByRole('button', { name: /同意して有効にする/ }));
        expect(isVoiceMemoEnabled()).toBe(true);
        expect(hasVoiceMemoConsent()).toBe(true);
    });

    it('確認をキャンセルするとOFFのまま', () => {
        openVoiceMemoSection();
        fireEvent.click(toggle());
        fireEvent.click(screen.getByRole('button', { name: /キャンセル/ }));
        expect(isVoiceMemoEnabled()).toBe(false);
        expect(hasVoiceMemoConsent()).toBe(false);
    });

    it('同意済みなら2回目のONで確認は出ない', () => {
        openVoiceMemoSection();
        fireEvent.click(toggle());
        fireEvent.click(screen.getByRole('button', { name: /同意して有効にする/ }));
        fireEvent.click(toggle()); // OFF
        fireEvent.click(toggle()); // 再ON
        expect(screen.queryByText(/Googleのサーバーに送信されます/)).toBeNull();
        expect(isVoiceMemoEnabled()).toBe(true);
    });

    it('APIキーが無いときは必要である旨を案内する', () => {
        saveApiKey('');
        openVoiceMemoSection();
        expect(screen.getByText(/APIキーの設定が必要/)).toBeTruthy();
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

```bash
npx vitest run src/components/Settings/voiceMemoSetting.test.tsx
```

Expected: FAIL — 「音声メモ」のセクションが見つからない

- [ ] **Step 3: AppSettingsModal.tsx にセクションを追加**

import に追加:

```ts
import {
    grantVoiceMemoConsent,
    hasVoiceMemoConsent,
    isVoiceMemoEnabled,
    setVoiceMemoEnabled,
} from '../../utils/appSettings';
```

state を追加（他の `useState` の並びに合わせる）:

```ts
const [voiceMemoOn, setVoiceMemoOn] = useState(false);
const [showVoiceMemoConsent, setShowVoiceMemoConsent] = useState(false);
```

既存の初期化 `useEffect`（`setApiKey(getStoredApiKey())` を呼んでいる箇所）に1行足す:

```ts
setVoiceMemoOn(isVoiceMemoEnabled());
```

ハンドラを追加:

```ts
// 初回ONのときだけ外部送信の確認を出す。
// 同意はOFFに戻しても取り消さない（同じ説明を何度も読ませない）
const handleVoiceMemoToggle = () => {
    if (voiceMemoOn) {
        setVoiceMemoEnabled(false);
        setVoiceMemoOn(false);
        return;
    }
    if (!hasVoiceMemoConsent()) {
        setShowVoiceMemoConsent(true);
        return;
    }
    setVoiceMemoEnabled(true);
    setVoiceMemoOn(true);
};

const handleVoiceMemoConsent = () => {
    grantVoiceMemoConsent();
    setVoiceMemoEnabled(true);
    setVoiceMemoOn(true);
    setShowVoiceMemoConsent(false);
};
```

「AI機能 (Google Gemini API)」の `SettingsSection` の直後（`{/* 将来の拡張用セクション */}` のコメント塊の前）に挿入:

```tsx
<SettingsSection
    id="voicememo"
    title="🎤 音声メモ"
    hint={voiceMemoOn ? '有効' : 'OFF'}
    isOpen={openSection === 'voicememo'}
    onToggle={() => toggleSection('voicememo')}
>
    <p className="section-description">
        ボタンを押している間だけ録音し、文字起こしして一覧に残します。
        連続したプレーを覚えきれないときの下書きです。
        <strong>スタッツには反映されません。</strong>
    </p>

    <label className="settings-toggle">
        <input
            type="checkbox"
            checked={voiceMemoOn}
            onChange={handleVoiceMemoToggle}
        />
        <span>音声メモを使う</span>
    </label>

    {!hasApiKey && (
        <p className="section-description">
            ⚠️ この機能にはGemini APIキーの設定が必要です（上の「AI機能」から設定できます）。
        </p>
    )}

    <p className="section-description">
        記録画面のフルモードでのみ使えます。オフラインのときは使えません。
        メモは試合が終わると破棄され、バックアップにも保存されません。
    </p>
</SettingsSection>
```

モーダル本体の末尾（他のモーダルを並べている箇所）に確認ダイアログを追加:

```tsx
{showVoiceMemoConsent && (
    <ConfirmModal
        title="音声メモを有効にしますか？"
        message={
            '吹き込んだ音声はGoogleのサーバーに送信されて文字起こしされます。\n' +
            '無料枠のAPIキーでは、送信したデータがモデルの改善に利用される可能性があるため、' +
            '有料プランのキーを推奨します。\n\n' +
            '録音は押している間だけで、音声そのものは端末にも保存されません。'
        }
        confirmLabel="同意して有効にする"
        cancelLabel="キャンセル"
        onConfirm={handleVoiceMemoConsent}
        onCancel={() => setShowVoiceMemoConsent(false)}
    />
)}
```

props 名は `src/components/Modal/ConfirmModal.tsx` の実装（`title` / `message` / `note?` / `confirmLabel?` / `cancelLabel?` / `onConfirm` / `onCancel`）と一致している。

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/components/Settings/voiceMemoSetting.test.tsx
```

Expected: PASS（6件）

- [ ] **Step 5: 全体テスト・lint・型を通す**

```bash
npm test && npm run lint && npm run build
```

Expected: 全PASS、エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/components/Settings/
git commit -m "feat(voicememo): 設定UIと初回同意ダイアログ"
```

---

### Task 10: App.tsx へ統合

**Files:**
- Modify: `src/App.tsx`
- Create: `src/components/VoiceMemo/voiceMemoIntegration.test.tsx`

**Interfaces:**
- Consumes: Task 6 の `useVoiceMemo`、Task 7-8 のコンポーネント
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

`src/components/VoiceMemo/voiceMemoIntegration.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { VoiceMemoButton } from './VoiceMemoButton';

afterEach(cleanup);

// App.tsx への配線そのものは、モードとフラグの組み合わせで
// 「出る/出ない」だけを固定する。描画の詳細は各コンポーネントのテストが見る
const renderIfAvailable = (isAvailable: boolean) =>
    render(
        <>
            {isAvailable && (
                <VoiceMemoButton isRecording={false} isOffline={false} onStart={vi.fn()} onStop={vi.fn()} />
            )}
        </>,
    );

describe('音声メモの表示条件', () => {
    it('利用可能なら記録画面にボタンが出る', () => {
        renderIfAvailable(true);
        expect(screen.queryByRole('button', { name: /音声メモ/ })).toBeTruthy();
    });

    it('利用不可ならボタンは描画されない', () => {
        renderIfAvailable(false);
        expect(screen.queryByRole('button', { name: /音声メモ/ })).toBeNull();
    });
});
```

> このテストは配線の仕様を文書として固定するもので、App.tsx 自体は描画しない（App は GameProvider や多数のストレージに依存しており、単体描画のコストが実益に見合わない）。App.tsx 側の確認は Step 5 の手動検証で行う。

- [ ] **Step 2: テストが通ることを確認（コンポーネントは既にある）**

```bash
npx vitest run src/components/VoiceMemo/voiceMemoIntegration.test.tsx
```

Expected: PASS（2件）

- [ ] **Step 3: App.tsx にフックと表示を配線**

import に追加:

```ts
import { VoiceMemoButton, VoiceMemoPanel } from './components/VoiceMemo';
import { useVoiceMemo } from './hooks/useVoiceMemo';
```

state を追加:

```ts
const [showVoiceMemos, setShowVoiceMemos] = useState(false);
```

フックを呼ぶ（`currentQuarter` と `gameMode` が確定した後）:

```ts
// 音声メモ。フルモードのみ。シンプルモードは入力項目が少なく、記録に迷う場面が少ない
const voiceMemo = useVoiceMemo({ quarter: currentQuarter, enabled: gameMode === 'full' });
```

`header-center`（現在は中身が空。休眠中のVoiceInputのコメントはそのまま残す）に追加:

```tsx
<div className="header-center">
  {/* 音声入力機能は一時的に非表示 */}
  {/* {gameMode === 'full' && <VoiceInput onCommand={handleVoiceCommand} />} */}
  {voiceMemo.isAvailable && (
    <>
      <VoiceMemoButton
        isRecording={voiceMemo.isRecording}
        isOffline={voiceMemo.isOffline}
        onStart={voiceMemo.startRecording}
        onStop={voiceMemo.stopRecording}
      />
      <button
        className="btn btn-secondary btn-small"
        onClick={() => setShowVoiceMemos(true)}
        style={{ marginLeft: '8px' }}
        aria-label={`音声メモを見る（${voiceMemo.memos.length}件）`}
      >
        📝<span className="btn-label"> メモ</span>
        {voiceMemo.memos.length > 0 && ` ${voiceMemo.memos.length}`}
      </button>
    </>
  )}
</div>
```

モーダルを並べている箇所（試合終了確認モーダルの近く）に追加:

```tsx
{showVoiceMemos && (
  <VoiceMemoPanel
    memos={voiceMemo.memos}
    onClose={() => setShowVoiceMemos(false)}
    onRetry={voiceMemo.retryMemo}
    onRemove={voiceMemo.removeMemoById}
  />
)}
```

- [ ] **Step 4: 試合終了・破棄で音声メモを捨てる**

`clearGameSession()` を呼んでいる2箇所（`handleGameFinished` 内と `handleDiscardGame` 内）の直後に1行ずつ追加:

```ts
clearGameSession();
// 音声メモは手入力のための下書きなので、試合が終われば役目は終わり
voiceMemo.clearAll();
```

`handleGameFinished` は `saved` が false のときに早期 return しているので、**保存に成功した経路でだけ捨てられる**。順序を入れ替えないこと。

- [ ] **Step 5: 実機で動作を確認**

```bash
npm run dev
```

ブラウザで以下を目視確認する:

1. 設定 → 音声メモ を ON（初回は同意ダイアログが出る）
2. 設定 → AI機能 に Gemini APIキーを入れる
3. 新規試合を開始し、フルモードでヘッダー中央に🎤ボタンが出ること
4. ボタンを押しながら「青5シュートミス、青6リバウンド」と発声し、離す
5. 「メモ」ボタンを開き、文字起こしが表示されること
6. シンプルモードに切り替えるとボタンが消え、フルモードに戻すとメモが残っていること
7. DevTools の Network を Offline にすると🎤ボタンが無効になること
8. 試合終了して保存すると、メモが空になること

**握ってみてヘッダー中央が窮屈な場合**は、設計書「配置」節の代替案（`ActionButtons.tsx` のファウル群の下に `action-group` を追加）へ移す。その場合は `ActionButtons` に props を足すのではなく、`App.tsx` から `ActionButtons` の下に並べる形にする（ActionButtons を音声メモの都合で汚さないため）。

- [ ] **Step 6: 全体テスト・lint・型を通す**

```bash
npm test && npm run lint && npm run build
```

Expected: 全PASS、エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/App.tsx src/components/VoiceMemo/voiceMemoIntegration.test.tsx
git commit -m "feat(voicememo): 記録画面へ統合し、試合終了で破棄する"
```

---

### Task 11: 法務文言とドキュメントの更新

現行のプライバシーポリシーは「外部に送信するのはOCRの撮影画像のみ」と明記しているため、実装と食い違ったままにできない。

**Files:**
- Modify: `src/components/Legal/LegalModal.tsx:119-126`
- Create: `src/components/Legal/externalTransmission.test.tsx`
- Modify: `public/manual.html`
- Modify: `README.md`
- Modify: `FLYER.md`
- Modify: `PROJECT_MAP.md`

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

`src/components/Legal/externalTransmission.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { LegalModal } from './LegalModal';

afterEach(cleanup);

// LegalModal は isOpen が必須で、プライバシーポリシーは 'privacy' タブ配下にある
const openPrivacy = () => render(<LegalModal isOpen initialTab="privacy" onClose={() => {}} />);

describe('プライバシーポリシー: 外部への送信', () => {
    it('外部への送信の節がある', () => {
        openPrivacy();
        expect(screen.getByText(/外部への送信/)).toBeTruthy();
    });

    it('音声メモで吹き込んだ音声が送信対象として書かれている', () => {
        openPrivacy();
        expect(document.body.textContent).toContain('音声メモ');
    });

    it('送信は利用者自身のAPIキーを設定した場合に限ると明記している', () => {
        openPrivacy();
        expect(document.body.textContent).toContain('APIキー');
    });

    it('メモが試合終了で破棄されバックアップに含まれないことを明記している', () => {
        openPrivacy();
        expect(document.body.textContent).toContain('バックアップ');
    });
});
```

- [ ] **Step 2: テストが落ちることを確認**

```bash
npx vitest run src/components/Legal/externalTransmission.test.tsx
```

Expected: FAIL — 4件中2件が失敗（「音声メモ」「バックアップ」が含まれていない）

- [ ] **Step 3: LegalModal.tsx の「3. 外部への送信」を書き換える**

現行:

> 本アプリが外部にデータを送信するのは、**OCR機能（高精度モード）をご自身のGoogle Gemini APIキーで利用した場合の撮影画像のみ**です。

これを次に置き換える:

```tsx
<h3>3. 外部への送信</h3>
<p>
    本アプリが外部にデータを送信するのは、<strong>ご自身のGoogle Gemini APIキーを
    設定したうえで、次の機能を使った場合に限ります</strong>。
</p>
<ul>
    <li>OCR機能（高精度モード）… 撮影した画像</li>
    <li>音声メモ … ボタンを押している間に録音した音声</li>
</ul>
<p>
    いずれもGoogle社のサーバーに対して行われ、
    <a href="https://ai.google.dev/terms" target="_blank" rel="noopener noreferrer">Google AI利用規約</a>が適用されます。
    無料枠のAPIキーでは送信データがモデル改善に利用される可能性があるため、
    有料プランの利用を推奨します。
    APIキーを設定しない場合、画像も音声も端末外に送信されません
    （オフラインOCR（基本モード）は端末内で処理し、音声メモは機能自体が無効です）。
</p>
<p>
    音声メモの録音は押している間だけで、音声そのものは端末にも保存されません。
    文字起こしの結果は試合中のみ保持され、試合が終わると破棄されます。
    バックアップやエクスポートにも含まれません。
</p>
```

節全体を置き換える。現行にある <a href="https://ai.google.dev/terms">Google AI利用規約</a> へのリンクは**必ず残す**（上のコードに含めてある）。置き換え後、「撮影画像のみ」という文言がファイルに残っていないことを確認する:

```bash
grep -n "撮影画像のみ" src/components/Legal/LegalModal.tsx
```

Expected: 一致なし

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/components/Legal/externalTransmission.test.tsx
```

Expected: PASS（2件）

- [ ] **Step 5: ドキュメント4件を更新**

- `public/manual.html`: 使い方に「音声メモ」の項を追加する。書く内容は ①フルモードでヘッダー中央の🎤を押しながら喋る ②離すと文字起こしされる ③「メモ」から読む ④スタッツには反映されないので手入力する ⑤設定でONにする必要があり、Gemini APIキーとオンライン接続が要る ⑥試合が終わると消える
- `README.md`: 機能一覧に音声メモを追加。「Gemini APIキー設定時・オンライン時のみ」「スタッツ自動反映はしない」を明記する
- `FLYER.md`: Gemini APIに触れている箇所に音声メモを追記する。オフラインが売りである点と矛盾しないよう、「オンラインのときだけ使える補助機能」と位置づけを添える
- `PROJECT_MAP.md`: ディレクトリ構成に `VoiceMemo/` を追加し、`hooks/` に `useVoiceMemo.ts` を追加。`utils/` に `geminiClient.ts` / `audioWav.ts` / `audioTranscribe.ts` / `voiceMemo.ts` / `voiceMemoStorage.ts` を追加。既存の「VoiceInput/ 音声入力（現在App.tsxでコメントアウト・休眠）」の行は**そのまま残す**

- [ ] **Step 6: 全体テスト・lint・型を通す**

```bash
npm test && npm run lint && npm run build
```

Expected: 全PASS、エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/components/Legal/ public/manual.html README.md FLYER.md PROJECT_MAP.md
git commit -m "docs(voicememo): 外部送信の記載とマニュアル・READMEを更新"
```

---

## 完了条件

- `npm test` / `npm run lint` / `npm run build` がすべて通る
- 設定OFFの状態では、記録画面に音声メモの痕跡が一切出ない
- Gemini APIキー未設定・オフライン・シンプルモードのいずれでもボタンが出ない、または無効になる
- 実機（Chrome / iOS Safari）で録音→文字起こし→表示が動く
- 試合終了・破棄のいずれでも音声メモが残らない
- `mirrorBackup` のスナップショットとエクスポートJSONに音声メモが含まれない
- 休眠中の `VoiceInput` 関連4ファイルが変更されていない（`git diff main --stat` で確認）
