// 押している間だけ録音するボタン。
//
// pointer系のイベントを使い、マウス・タッチ・ペンを1系統で扱う。
// pointerUp だけでなく pointerLeave / pointerCancel でも止めるのは、
// 指がボタンの外へ滑ったり着信で奪われたときに録音が残り続けるのを防ぐため。

import { useRef } from 'react';
import './VoiceMemo.css';

export interface VoiceMemoButtonProps {
    isRecording: boolean;
    isOffline: boolean;
    onStart: () => void;
    onStop: () => void;
}

export function VoiceMemoButton({ isRecording, isOffline, onStart, onStop }: VoiceMemoButtonProps) {
    // 録音中は「録音中」を最優先で伝える。オフライン文言に差し替わると、
    // 実際にはまだ録音中なのに「使えません」と読み上げてしまう
    const label = isRecording
        ? '音声メモを録音中。指を離すと文字起こしされます'
        : isOffline
            ? '音声メモ（オンラインのときに使えます）'
            : '音声メモ。押している間だけ録音します';

    // 待機中でオフラインのときだけ「使えない」。録音中はネットワーク状態に
    // 関わらず操作可能にしておく（disabledにすると指を離すイベントごと
    // ブラウザに配送されなくなり、マイクを止められなくなるため）
    const idleOffline = isOffline && !isRecording;

    // isRecording はReactのstateなので、onStart→getUserMediaのawait中は
    // まだ更新されない。この間に指が離れると（マイク許可ダイアログへ
    // 指を伸ばした瞬間など）isRecordingだけを見ていては release を
    // 取りこぼし、許可が下りた後に誰も止めない録音が始まってしまう。
    // ref は同期的に効くので、押下が進行中かどうかをこちらで別途持つ
    const pressingRef = useRef(false);

    const handleDown = () => {
        if (isOffline) return;
        pressingRef.current = true;
        onStart();
    };

    const handleUp = () => {
        const wasPressing = pressingRef.current;
        pressingRef.current = false;
        // 押下していないのに来た pointerLeave（通常のマウスアウト等）は無視する。
        // isRecording が真なら（＝呼び出し側が録音中と伝えている）押下追跡に
        // 関わらず必ず止める
        if (!isRecording && !wasPressing) return;
        onStop();
    };

    return (
        <button
            type="button"
            className={`voice-memo-btn ${isRecording ? 'is-recording' : ''}`}
            aria-label={label}
            aria-pressed={isRecording}
            disabled={idleOffline}
            onPointerDown={handleDown}
            onPointerUp={handleUp}
            onPointerLeave={handleUp}
            onPointerCancel={handleUp}
            // 長押しで選択・コンテキストメニューが出るのを抑える
            onContextMenu={e => e.preventDefault()}
        >
            <span className="voice-memo-btn-icon" aria-hidden="true">{isRecording ? '⏺' : '🎤'}</span>
            <span className="voice-memo-btn-label">{isRecording ? '録音中' : '録音'}</span>
        </button>
    );
}
