import { useEffect, useRef } from 'react';
import './UndoSnackbar.css';

interface UndoSnackbarProps {
    /** 表示メッセージ（例: "#4 2P成功 +2"） */
    message: string;
    onUndo: () => void;
    onDismiss: () => void;
    /** 自動で消えるまでのミリ秒（既定: 5000） */
    autoHideMs?: number;
}

/**
 * 記録直後のワンタップ取り消し用スナックバー。
 * messageが変わるたびに自動消滅タイマーをリセットする。
 * 外側のタップでも即座に消える（次の操作の邪魔をしないため）。
 */
export function UndoSnackbar({ message, onUndo, onDismiss, autoHideMs = 5000 }: UndoSnackbarProps) {
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const timer = setTimeout(onDismiss, autoHideMs);
        return () => clearTimeout(timer);
        // メッセージ更新でタイマーをリセットする
    }, [message, autoHideMs, onDismiss]);

    // スナックバー外のタップで即消す
    useEffect(() => {
        const handlePointerDown = (e: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                onDismiss();
            }
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [onDismiss]);

    return (
        <div className="undo-snackbar" role="status" ref={rootRef}>
            <span className="undo-snackbar-message">{message}</span>
            <button className="undo-snackbar-btn" onClick={onUndo}>
                取り消す
            </button>
        </div>
    );
}
