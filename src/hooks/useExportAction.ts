// 画像・PDF出力の実行状態を扱うフック。
// 出力は html2canvas が同期的に数秒かかるうえ、タブレットではメモリ不足で
// 失敗しうる。押しっぱなしの無反応・二重起動・無言の失敗を防ぐために、
// 進行中フラグ／多重実行の抑止／成否の通知をここへ集約する。

import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '../components/Toast/toastApi';

export interface UseExportActionResult {
    /** 出力処理の実行中か（ボタンの無効化・ラベル差し替えに使う） */
    isExporting: boolean;
    /** 出力処理を実行する。labelは通知文に使う表示名（例: 'PDF'） */
    runExport: (task: () => Promise<void>, label: string) => Promise<void>;
}

export function useExportAction(): UseExportActionResult {
    const [isExporting, setIsExporting] = useState(false);
    // stateは次のレンダーまで更新されないため、連打の判定には使えない。
    // 同一ティック内の2回目を弾くのは ref の役目
    const runningRef = useRef(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const runExport = useCallback(async (task: () => Promise<void>, label: string) => {
        if (runningRef.current) return;
        runningRef.current = true;
        setIsExporting(true);

        try {
            await task();
            showToast(`${label}を出力しました`, 'success');
        } catch (error) {
            console.error(`${label}出力エラー:`, error);
            showToast(`${label}の出力に失敗しました。他のアプリを閉じてもう一度お試しください`, 'error');
        } finally {
            runningRef.current = false;
            // 画面を離れた後のsetStateはReactの警告になるため、生存時のみ戻す
            if (mountedRef.current) setIsExporting(false);
        }
    }, []);

    return { isExporting, runExport };
}
