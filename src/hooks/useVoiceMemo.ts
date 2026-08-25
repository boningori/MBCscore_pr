// 音声メモの録音・送信・一覧管理。
//
// ブラウザAPI（getUserMedia / MediaRecorder）に触るのはこの層だけにして、
// 並び順・保存・通信は下位のモジュールに任せる。
//
// 送信は並列で構わない。連射された口述の順序は createdAt が保証するので、
// 応答が前後しても表示は崩れない（voiceMemo.ts 参照）。

import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '../components/Toast/toastApi';
import { getStoredApiKey, subscribeApiKeyChanged } from '../utils/geminiClient';
import { isVoiceMemoEnabled, subscribeAppSettingsChanged } from '../utils/appSettings';
import { blobToWav } from '../utils/audioWav';
import { transcribeAudio } from '../utils/audioTranscribe';
import type { VoiceMemo } from '../utils/voiceMemo';
import { appendMemo, applyTranscription, downgradeStaleSending, markSending, removeMemo } from '../utils/voiceMemo';
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
    /** 設定ON・APIキーあり・オンライン・enabled のすべてを満たすか */
    isAvailable: boolean;
    /** 設定ON・APIキーあり・enabled・マイク拒否なし（オンライン状態は問わない）。
     *  録音ボタン／一覧ボタンの表示可否はこちらを使う。オンラインかどうかは
     *  isOffline で別に見て、録音ボタン側で無効化表示に反映する */
    isFeatureEnabled: boolean;
    /** オフラインが理由で使えない状態か（案内の出し分けに使う） */
    isOffline: boolean;
    startRecording: () => Promise<void>;
    stopRecording: () => void;
    retryMemo: (id: string) => void;
    /** そのメモを再送できるか（音声をまだメモリ上に持っているか）。
     *  再読み込みで復元されたメモは音声を持たないため常にfalse */
    canRetry: (id: string) => boolean;
    removeMemoById: (id: string) => void;
    /** 済にしたメモを一覧へ戻す（Undo用）。createdAt を保つので元の並び位置に復帰する。
     *  音声Blobは removeMemoById の時点で捨てているため、戻しても再送はできない */
    restoreMemo: (memo: VoiceMemo) => void;
    clearAll: () => void;
}

export function useVoiceMemo({ quarter, enabled }: UseVoiceMemoOptions): UseVoiceMemoResult {
    // 「文字起こし中」のままsessionStorageへ保存されたメモは、リロードを跨ぐと
    // 誰も応答を返してくれない。音声はメモリ上（pendingAudioRef）にしか無く
    // 再送もできないので、復元時点でfailedへ落として「もう待っても来ない」と分かるようにする
    const [memos, setMemos] = useState<VoiceMemo[]>(() => downgradeStaleSending(loadVoiceMemos()));
    const [isRecording, setIsRecording] = useState(false);
    const [isOnline, setIsOnline] = useState(() => navigator.onLine);
    // マイクを拒否されたら以後は機能ごと下ろす。押すたびに拒否ダイアログが
    // 出るのは記録中に邪魔なので、案内は一度だけにする
    const [micDenied, setMicDenied] = useState(false);

    // 音声メモON/OFFとAPIキーは状態として持つ（毎レンダー読み直さない）。
    // AppContentは得点・スタッツ・ファウルの記録のたびに再描画されるため、
    // isFeatureEnabledの計算でisVoiceMemoEnabled()・getStoredApiKey()を
    // 呼ぶ実装のままだと、記録操作のたびにlocalStorageを読んでしまう。
    // 変更は設定画面またはバックアップ復元でしか起きないので、そのときだけ
    // 購読経由で読み直す（下のuseEffect参照）
    const [voiceMemoEnabled, setVoiceMemoEnabledState] = useState(isVoiceMemoEnabled);
    const [apiKey, setApiKeyState] = useState(getStoredApiKey);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const startedAtRef = useRef(0);
    const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // 再送のために、まだ成功していないメモの音声だけメモリ上に持つ
    const pendingAudioRef = useRef<Map<string, Blob>>(new Map());
    // startRecording の多重起動防止。isRecording はステートなので
    // getUserMedia の await 中は更新されず、同じtickで2回押されると
    // どちらも isRecording による早期returnをすり抜けてしまう。
    // ref は同期的に効くので、await の前に立てて finally で必ず下ろす
    const startingRef = useRef(false);
    // startingRef が立っている間（＝getUserMedia の許可待ち）に stopRecording が
    // 呼ばれたことを覚えておくフラグ。まだ MediaRecorder が無いので直接止める
    // ものが無く、許可が下りた時点で releaseStream するだけにして録音を始めない
    const stopRequestedRef = useRef(false);

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

    // 設定画面での変更やバックアップ復元（localStorageへの直接書き込み。
    // saveAppSettingsを経由しないため通知だけ別に呼ばれる）を、リロードなしで拾う
    useEffect(() => {
        const unsubscribeSettings = subscribeAppSettingsChanged(() => setVoiceMemoEnabledState(isVoiceMemoEnabled()));
        const unsubscribeApiKey = subscribeApiKeyChanged(() => setApiKeyState(getStoredApiKey()));
        return () => {
            unsubscribeSettings();
            unsubscribeApiKey();
        };
    }, []);

    const isOffline = !isOnline;
    const isFeatureEnabled = enabled && voiceMemoEnabled && !!apiKey && !micDenied;
    const isAvailable = isFeatureEnabled && isOnline;

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

    // マイク解放の後始末をここに一本化する。onstop からも（正常終了時）、
    // アンマウント時のクリーンアップからも呼ばれる。
    //
    // ハンドラを外してから stop() するのがポイント：
    // - onstop 中にここへ来た場合、その時点で recorder.state は既に 'inactive'
    //   なので stop() は呼ばれず、再帰しない
    // - アンマウント時に呼ばれた場合、まだ 'recording' なら stop() で確実に
    //   打ち切る。ondataavailable/onstop は先に外してあるので、ブラウザが
    //   後から非同期にイベントを発火しても離脱済み画面の古いクロージャは動かない
    const releaseStream = useCallback(() => {
        const recorder = recorderRef.current;
        if (recorder) {
            recorder.ondataavailable = null;
            recorder.onstop = null;
            if (recorder.state === 'recording') {
                try {
                    recorder.stop();
                } catch {
                    // ブラウザ実装によっては既に停止処理中で InvalidStateError に
                    // なることがあるが、目的（録音を止める）は達成されているので無視する
                }
            }
        }
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (autoStopRef.current) {
            clearTimeout(autoStopRef.current);
            autoStopRef.current = null;
        }
    }, []);

    const startRecording = useCallback(async () => {
        if (!isAvailable || isRecording || startingRef.current) return;
        // await の前、まだ同期区間のうちに立てる。ここから finally までの間に
        // 同じtickで再度呼ばれても、上のガードで確実に弾かれる
        startingRef.current = true;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // マイクの使用許可はここで確定する。以降で何が起きても
            // （MediaRecorder のコンストラクタが投げても）releaseStream() が
            // このストリームを見つけて必ず止められるよう、真っ先に控えておく
            streamRef.current = stream;

            if (stopRequestedRef.current) {
                // 許可ダイアログが出ている間に指が離れていた。ここで録音を
                // 始めると誰も止めない録音になる（MAX_DURATION_MSまで居座る）ので、
                // 何も録らず・何も送らずに確保したストリームだけ解放する
                releaseStream();
                return;
            }

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
        } finally {
            startingRef.current = false;
            // 次の押下へ持ち越さない（消費済みでも未消費でも、ここで必ずリセットする）
            stopRequestedRef.current = false;
        }
    }, [isAvailable, isRecording, quarter, releaseStream, send]);

    const stopRecording = useCallback(() => {
        const recorder = recorderRef.current;
        if (!recorder) {
            // まだ MediaRecorder が無い＝getUserMedia の許可待ちの可能性がある。
            // 許可待ち中でなければ（押下自体が無かった等）何もしない
            if (startingRef.current) stopRequestedRef.current = true;
            return;
        }
        if (recorder.state === 'recording') recorder.stop();
    }, []);

    const retryMemo = useCallback((id: string) => {
        const audio = pendingAudioRef.current.get(id);
        if (!audio) return;
        setMemos(prev => markSending(prev, id));
        void send(id, audio);
    }, [send]);

    const canRetry = useCallback((id: string) => pendingAudioRef.current.has(id), []);

    const removeMemoById = useCallback((id: string) => {
        pendingAudioRef.current.delete(id);
        setMemos(prev => removeMemo(prev, id));
    }, []);

    const restoreMemo = useCallback((memo: VoiceMemo) => {
        setMemos(prev => appendMemo(prev, memo));
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
        isFeatureEnabled,
        isOffline,
        startRecording,
        stopRecording,
        retryMemo,
        canRetry,
        removeMemoById,
        restoreMemo,
        clearAll,
    };
}
