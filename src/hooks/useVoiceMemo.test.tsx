import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useVoiceMemo } from './useVoiceMemo';
import { saveApiKey } from '../utils/geminiClient';
import { notifyAppSettingsChanged, setVoiceMemoEnabled } from '../utils/appSettings';
import { clearVoiceMemos, loadVoiceMemos, saveVoiceMemos } from '../utils/voiceMemoStorage';

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

// AppContentは得点・スタッツ・ファウルの記録のたびに再描画される。
// isFeatureEnabledの計算でisVoiceMemoEnabled()・getStoredApiKey()を毎回呼ぶと、
// 記録操作のたびにlocalStorageの読み込み・JSON.parseが走ってしまう。
// 値を状態として持ち、設定変更時にだけ購読経由で読み直す形にする
describe('useVoiceMemo: 設定は毎レンダーで読み直さない（ホットパス対策）', () => {
    it('設定と無関係な再レンダーでは、音声メモの設定キーをlocalStorageから読み直さない', () => {
        const { rerender } = renderHook(
            ({ quarter }: { quarter: number }) => useVoiceMemo({ quarter, enabled: true }),
            { initialProps: { quarter: 1 } },
        );
        const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
        getItemSpy.mockClear();

        // quarterの変化は得点記録などに伴う、設定とは無関係な再レンダーを模す
        for (let q = 2; q <= 20; q++) {
            rerender({ quarter: q });
        }

        const settingsReads = getItemSpy.mock.calls.filter(([key]) => key === 'minibasket-app-settings');
        expect(settingsReads).toHaveLength(0);
    });

    it('マウント後に設定画面でONにすると、リロードなしでisFeatureEnabledへ反映される', async () => {
        setVoiceMemoEnabled(false);
        const { result } = render();
        expect(result.current.isFeatureEnabled).toBe(false);

        act(() => {
            setVoiceMemoEnabled(true);
        });

        await waitFor(() => expect(result.current.isFeatureEnabled).toBe(true));
    });

    it('バックアップ復元のようにlocalStorageへ直接書き込む変更も、notifyAppSettingsChanged経由で反映される', async () => {
        // バックアップ復元（dataBackup.ts）はsaveAppSettingsを経由せずlocalStorageへ
        // 直接書く。状態を一度読み込んだ後でも、その変更が届くことを確認する
        setVoiceMemoEnabled(false);
        const { result } = render();
        expect(result.current.isFeatureEnabled).toBe(false);

        localStorage.setItem('minibasket-app-settings', JSON.stringify({ voiceMemoEnabled: true }));
        act(() => {
            notifyAppSettingsChanged();
        });

        await waitFor(() => expect(result.current.isFeatureEnabled).toBe(true));
    });

    it('APIキーを設定画面で変更すると、リロードなしでisFeatureEnabledへ反映される', async () => {
        saveApiKey('');
        const { result } = render();
        expect(result.current.isFeatureEnabled).toBe(false);

        act(() => {
            saveApiKey('new-key');
        });

        await waitFor(() => expect(result.current.isFeatureEnabled).toBe(true));
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

describe('useVoiceMemo: 同時押しでのマイク多重取得（オーファン防止）', () => {
    it('同じtickで2回startRecordingが呼ばれても、最終的に使われているストリームのトラックは必ず止まる', async () => {
        // 体育館のタブレットは複数指のタッチを同時に拾いうる。2本指が
        // ほぼ同時にボタンへ触れると、pointerdown が同じtickで2回発火し、
        // isRecording がまだ false のうちに両方が startRecording を通過しうる。
        // その場合でも、マイクの取得は1回だけに絞られ、確保したストリームは
        // 必ず解放されなければならない（さもないとOSのマイクインジケータが
        // 点きっぱなしになる）
        const stopSpy1 = vi.fn();
        const stopSpy2 = vi.fn();
        let resolveFirst!: (v: unknown) => void;
        let resolveSecond!: (v: unknown) => void;
        const firstGum = new Promise(resolve => { resolveFirst = resolve; });
        const secondGum = new Promise(resolve => { resolveSecond = resolve; });
        vi.mocked(navigator.mediaDevices.getUserMedia)
            .mockImplementationOnce(() => firstGum as never)
            .mockImplementationOnce(() => secondGum as never);

        const { result } = render();

        // 2本指同時タップ: どちらの getUserMedia もまだ pending のうちに
        // 両方の startRecording が同じtickで呼ばれる
        let call1!: Promise<void>;
        let call2!: Promise<void>;
        act(() => {
            call1 = result.current.startRecording();
            call2 = result.current.startRecording();
        });

        // 1本目の許可が先に下りる
        await act(async () => {
            resolveFirst({ getTracks: () => [{ stop: stopSpy1 }] });
            await call1;
        });
        // 2本目の許可はその後で下りる（現実のブラウザでも許可ダイアログの
        // タイミングはズレうる）
        await act(async () => {
            resolveSecond({ getTracks: () => [{ stop: stopSpy2 }] });
            await call2;
        });

        await act(async () => {
            result.current.stopRecording();
        });
        await new Promise(r => setTimeout(r, 10));

        // 1本目に許可されたストリームのトラックが、最後まで放置されず止まっている
        expect(stopSpy1).toHaveBeenCalled();
    });

    it('エラー（マイク拒否以外）が起きても、ガードが立ちっぱなしにならず次の押下を受け付ける', async () => {
        const busy = Object.assign(new Error('device busy'), { name: 'NotReadableError' });
        vi.mocked(navigator.mediaDevices.getUserMedia)
            .mockRejectedValueOnce(busy as never)
            .mockResolvedValueOnce({ getTracks: () => [{ stop: vi.fn() }] } as never);

        const { result } = render();
        await act(async () => {
            await result.current.startRecording();
        });
        expect(result.current.isRecording).toBe(false);
        // マイク拒否（NotAllowedError/SecurityError）ではないので機能は下りない
        expect(result.current.isFeatureEnabled).toBe(true);

        await act(async () => {
            await result.current.startRecording();
        });
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
        expect(result.current.isRecording).toBe(true);
    });
});

describe('useVoiceMemo: マイク許可待ち中に離した場合（オーファン録音防止）', () => {
    // ボタン側の修正により、getUserMediaがまだ解決していない（isRecordingがまだ
    // falseの）うちに stopRecording が呼ばれることがある。録音を一切始めず、
    // 確保したストリームだけ解放しないと、許可が下りた瞬間に誰も止めない
    // 録音が始まり、MAX_DURATION_MSの60秒まで周囲の音を録り続けてしまう
    it('getUserMedia解決前にstopRecordingが呼ばれたら、録音を開始せずストリームだけ解放する', async () => {
        const stopSpy = vi.fn();
        let resolveGum!: (v: unknown) => void;
        const gum = new Promise(resolve => { resolveGum = resolve; });
        vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementationOnce(() => gum as never);

        const { result } = render();

        let startPromise!: Promise<void>;
        act(() => {
            startPromise = result.current.startRecording();
        });
        // マイク許可ダイアログが出ている間に指を離す
        act(() => {
            result.current.stopRecording();
        });

        await act(async () => {
            resolveGum({ getTracks: () => [{ stop: stopSpy }] });
            await startPromise;
        });

        // マイクの使用許可は取れているので、そのストリームのトラックは必ず止める
        expect(stopSpy).toHaveBeenCalled();
        // 録音は一切始まっていない
        expect(result.current.isRecording).toBe(false);
        expect(result.current.memos).toHaveLength(0);
        expect(vi.mocked(transcribeAudio)).not.toHaveBeenCalled();
    });

    it('取り消した後の押下は普通に録音できる（フラグが次の押下へ持ち越されない）', async () => {
        let resolveGum!: (v: unknown) => void;
        const gum = new Promise(resolve => { resolveGum = resolve; });
        vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementationOnce(() => gum as never);

        const { result } = render();

        let startPromise!: Promise<void>;
        act(() => {
            startPromise = result.current.startRecording();
        });
        act(() => {
            result.current.stopRecording();
        });
        await act(async () => {
            resolveGum({ getTracks: () => [{ stop: vi.fn() }] });
            await startPromise;
        });
        expect(result.current.isRecording).toBe(false);

        // 次の押下は通常どおり録音を開始できる
        await act(async () => {
            await result.current.startRecording();
        });
        expect(result.current.isRecording).toBe(true);
    });
});

describe('useVoiceMemo: リロード復元', () => {
    it('sending状態のまま保存されたメモは、復元時にfailedへ降格する（音声はメモリ上にしか無く再送できないため）', () => {
        saveVoiceMemos([{ id: 'stuck', quarter: 1, createdAt: 1000, status: 'sending' }]);
        const { result } = render();
        expect(result.current.memos).toHaveLength(1);
        expect(result.current.memos[0].status).toBe('failed');
    });

    it('sending状態から降格したメモは、音声が無いので再送できないと分かる', () => {
        saveVoiceMemos([{ id: 'stuck', quarter: 1, createdAt: 1000, status: 'sending' }]);
        const { result } = render();
        expect(result.current.canRetry('stuck')).toBe(false);
    });

    it('もともとfailedで保存されていたメモも、音声が無いので再送できないと分かる', () => {
        saveVoiceMemos([{ id: 'old-fail', quarter: 1, createdAt: 1000, status: 'failed', error: '通信エラー' }]);
        const { result } = render();
        expect(result.current.canRetry('old-fail')).toBe(false);
    });

    it('retryMemoは音声が無ければ何もしない（sendingへ戻さない）', () => {
        saveVoiceMemos([{ id: 'old-fail', quarter: 1, createdAt: 1000, status: 'failed', error: '通信エラー' }]);
        const { result } = render();
        act(() => {
            result.current.retryMemo('old-fail');
        });
        expect(result.current.memos[0].status).toBe('failed');
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
