import { useCallback, useEffect, useState } from 'react';
import {
    dismissInstallGuide,
    isIos,
    isStandalone,
    loadInstallGuideDismissed,
} from '../../utils/installState';

/** Chromium系が発火する beforeinstallprompt（標準化されていないため自前で型を置く） */
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
}

export type InstallPromptMode =
    /** 案内しない（インストール済み・非対応・一度閉じた） */
    | 'none'
    /** ブラウザのインストールダイアログを呼べる */
    | 'prompt'
    /** iOS: 「共有」→「ホーム画面に追加」を手順で案内する */
    | 'manual';

export interface UseInstallPromptResult {
    mode: InstallPromptMode;
    /** ブラウザのインストールダイアログを開く（mode==='prompt'のときのみ有効） */
    install: () => void;
    /** 以後表示しない */
    dismiss: () => void;
}

/**
 * ホーム画面への追加を案内するための状態。
 *
 * Chromium系は beforeinstallprompt を捕まえて自前のボタンから呼び出す。
 * iOSはこのイベントが無く、Safariの「共有」→「ホーム画面に追加」しか手段が
 * ないため、手順を案内するモードに切り替える。
 */
export function useInstallPrompt(): UseInstallPromptResult {
    const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
    const [dismissed, setDismissed] = useState(loadInstallGuideDismissed);

    useEffect(() => {
        const handler = (e: Event) => {
            // 既定のミニインフォバーを止め、案内を自前のUIに一本化する
            e.preventDefault();
            setDeferred(e as BeforeInstallPromptEvent);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    // インストールが済んだらカードを引っ込める。
    // ブラウザのタブは追加後も standalone にならないので、isStandalone() では
    // 判定できず、見ないとインストール済みの人に案内が出続ける。
    // 記録も残す（タブを開き直しても再び出さないため）
    useEffect(() => {
        const handler = () => {
            dismissInstallGuide();
            setDismissed(true);
            setDeferred(null);
        };
        window.addEventListener('appinstalled', handler);
        return () => window.removeEventListener('appinstalled', handler);
    }, []);

    const install = useCallback(() => {
        if (!deferred) return;
        // prompt() は1イベントにつき1回しか呼べず、2回目は InvalidStateError で
        // rejectする。しかもChromeは同一ページ内で beforeinstallprompt を
        // 撃ち直さないため、イベントを持ち続けると「押しても何も起きない
        // ボタン」が残る。呼んだ時点で捨て、案内ごと引っ込める。
        // 追加をやめた場合は、次にブラウザが撃ってきたときにまた出る
        setDeferred(null);
        deferred.prompt().catch(() => {
            // 追加を断られた場合も含め、ここで打てる手は無い
        });
    }, [deferred]);

    const dismiss = useCallback(() => {
        dismissInstallGuide();
        setDismissed(true);
    }, []);

    const mode: InstallPromptMode =
        dismissed || isStandalone() ? 'none'
            : deferred ? 'prompt'
                : isIos() ? 'manual'
                    : 'none';

    return { mode, install, dismiss };
}
