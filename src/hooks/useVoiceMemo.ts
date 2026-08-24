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
        if (!isAvailable || isRecording) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // マイクの使用許可はここで確定する。以降で何が起きても
            // （MediaRecorder のコンストラクタが投げても）releaseStream() が
            // このストリームを見つけて必ず止められるよう、真っ先に控えておく
            streamRef.current = stream;
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
