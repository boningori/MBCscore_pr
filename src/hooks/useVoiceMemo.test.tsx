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
