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
// stop() を呼ぶと ondataavailable → onstop の順に発火する実物の挙動を再現する。
// state が 'inactive' のときの stop() は実ブラウザ同様 InvalidStateError を投げる
class FakeMediaRecorder {
    static lastInstance: FakeMediaRecorder | null = null;
    // 1回だけコンストラクタを失敗させたいテスト用のフラグ（mimeType未対応などを再現）
    static shouldThrowOnConstruct = false;
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    state = 'inactive';
    constructor() {
        if (FakeMediaRecorder.shouldThrowOnConstruct) {
            FakeMediaRecorder.shouldThrowOnConstruct = false;
            throw new DOMException('mimeType not supported', 'NotSupportedError');
        }
        FakeMediaRecorder.lastInstance = this;
    }
    start() {
        this.state = 'recording';
    }
    stop() {
        if (this.state === 'inactive') {
            throw new DOMException('The MediaRecorder is inactive', 'InvalidStateError');
        }
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
    FakeMediaRecorder.shouldThrowOnConstruct = false;
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

describe('useVoiceMemo: 機能そのもののON/OFF（ネットワーク状態に関わらない）', () => {
    it('オフラインでも、設定ON・キーあり・enabledなら機能自体はONのまま', () => {
        setOnline(false);
        const { result } = render();
        expect(result.current.isFeatureEnabled).toBe(true);
        // 録音の可否（isAvailable）はオフラインでは依然falseのまま
        expect(result.current.isAvailable).toBe(false);
    });

    it('シンプルモード（enabled=false）なら機能自体もOFF', () => {
        const { result } = render(1, false);
        expect(result.current.isFeatureEnabled).toBe(false);
    });

    it('設定OFFなら機能自体もOFF', () => {
        setVoiceMemoEnabled(false);
        const { result } = render();
        expect(result.current.isFeatureEnabled).toBe(false);
    });

    it('APIキーが無ければ機能自体もOFF', () => {
        saveApiKey('');
        const { result } = render();
        expect(result.current.isFeatureEnabled).toBe(false);
    });

    it('マイクを拒否された後は機能自体もOFF', async () => {
        const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
        vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(denied as never);

        const { result } = render();
        await act(async () => {
            await result.current.startRecording();
        });

        await waitFor(() => expect(result.current.isFeatureEnabled).toBe(false));
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

        // 案内は一度きりのはず。無効化された後に再度押してもダイアログを
        // 出し直す（＝ getUserMedia を再度呼ぶ）ことがあってはならない
        await act(async () => {
            await result.current.startRecording();
        });
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    });
});

describe('useVoiceMemo: マイク解放のライフサイクル', () => {
    it('MediaRecorderのコンストラクタが例外を投げても、許可済みストリームは解放される', async () => {
        const stopSpy = vi.fn();
        vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce({
            getTracks: () => [{ stop: stopSpy }],
        } as never);
        FakeMediaRecorder.shouldThrowOnConstruct = true;

        const { result } = render();
        await act(async () => {
            await result.current.startRecording();
        });

        // マイクの使用許可自体は取れているので、そのストリームのトラックは
        // 必ず止められていなければならない（止め忘れるとインジケータが点きっぱなしになる）
        expect(stopSpy).toHaveBeenCalled();
        expect(result.current.isRecording).toBe(false);
    });

    it('録音中にアンマウントすると、トラックは止まり、文字起こしは呼ばれない', async () => {
        // ブラウザによっては「トラックを止めると MediaRecorder も自動で停止し、
        // onstop が発火する」という挙動を取ることがある（仕様上は実装依存）。
        // ここではその最悪ケースを模してテストする：トラックの stop() をきっかけに
        // recorder.stop() が呼ばれたとき、古い onstop クロージャが生き残っていれば
        // 送信処理が走ってしまう
        let onTrackStop: (() => void) | null = null;
        const stopSpy = vi.fn(() => onTrackStop?.());
        vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce({
            getTracks: () => [{ stop: stopSpy }],
        } as never);

        const { result, unmount } = render();
        await act(async () => {
            await result.current.startRecording();
        });
        expect(result.current.isRecording).toBe(true);

        const recorder = FakeMediaRecorder.lastInstance;
        onTrackStop = () => {
            if (recorder && recorder.state === 'recording') recorder.stop();
        };

        // 誤タップ判定（500ms未満は破棄）に引っかからないよう、十分な時間録音させておく
        holdFor(2000);
        unmount();

        // トラックは確実に止められている
        expect(stopSpy).toHaveBeenCalled();
        await new Promise(r => setTimeout(r, 10));
        // アンマウント後に stop イベントが発火しても、離脱済みの画面のために
        // 文字起こしAPIを叩き始めてはならない
        expect(vi.mocked(transcribeAudio)).not.toHaveBeenCalled();
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
