import { useEffect, useRef } from 'react';
import './UndoSnackbar.css';

interface UndoSnackbarProps {
    /**
     * 取り消し対象の記録を識別する値（得点・スタッツのエントリID）。
     *
     * タイマーのリセットはこれで判定する。文言で見ていたため、同じ選手が
     * 同じ種別を続けて記録すると（#4 の 2P が2連続など、試合中は普通にある）
     * 2件目が1件目のタイマーを引き継ぎ、取り消せる時間が短くなっていた。
     * 未指定なら従来どおり文言で判定する。
     */
    recordId?: string;
    /** 表示メッセージ（例: "#4 2P成功 +2"） */
    message: string;
    onUndo: () => void;
    onDismiss: () => void;
    /** 自動で消えるまでのミリ秒（既定: 5000） */
    autoHideMs?: number;
}

/**
 * 記録直後のワンタップ取り消し用スナックバー。
 * 別の記録に変わるたびに自動消滅タイマーをリセットする。
 * 外側のタップでも即座に消える（次の操作の邪魔をしないため）。
 */
export function UndoSnackbar({ recordId, message, onUndo, onDismiss, autoHideMs = 5000 }: UndoSnackbarProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    // 記録の識別子があればそれで、無ければ従来どおり文言で「別の記録か」を見る
    const timerKey = recordId ?? message;

    useEffect(() => {
        const timer = setTimeout(onDismiss, autoHideMs);
        return () => clearTimeout(timer);
        // 別の記録に変わったらタイマーをリセットする
    }, [timerKey, autoHideMs, onDismiss]);

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
