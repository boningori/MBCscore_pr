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
