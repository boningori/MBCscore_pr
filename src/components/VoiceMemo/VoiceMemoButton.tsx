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
