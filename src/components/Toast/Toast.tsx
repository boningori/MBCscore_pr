import { useState, useEffect, useCallback } from 'react';
import './Toast.css';

interface ToastMessage {
    id: number;
    text: string;
    type: 'success' | 'error';
}

let toastId = 0;

// グローバルなトースト表示関数
let globalShowToast: ((text: string, type: 'success' | 'error') => void) | null = null;

export function showToast(text: string, type: 'success' | 'error') {
    if (globalShowToast) {
        globalShowToast(text, type);
    }
}

export function ToastContainer() {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const addToast = useCallback((text: string, type: 'success' | 'error') => {
        const id = ++toastId;
        setToasts(prev => [...prev, { id, text, type }]);

        // 成功は4秒、エラーは8秒で自動消滅
        const duration = type === 'success' ? 4000 : 8000;
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, duration);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // グローバル関数として登録
    useEffect(() => {
        globalShowToast = addToast;
        return () => {
            globalShowToast = null;
        };
    }, [addToast]);

    if (toasts.length === 0) return null;

    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    className={`toast toast-${toast.type}`}
                    role="alert"
                    aria-live="assertive"
                >
                    <span className="toast-text">{toast.text}</span>
                    <button
                        className="toast-dismiss"
                        onClick={() => removeToast(toast.id)}
                        aria-label="閉じる"
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    );
}
