// グローバルなトースト表示関数（Fast Refresh対応のためコンポーネントと別ファイルに分離）

// グローバルなトースト表示関数
let globalShowToast: ((text: string, type: 'success' | 'error') => void) | null = null;

export function setGlobalShowToast(fn: ((text: string, type: 'success' | 'error') => void) | null) {
    globalShowToast = fn;
}

export function showToast(text: string, type: 'success' | 'error') {
    if (globalShowToast) {
        globalShowToast(text, type);
    }
}
