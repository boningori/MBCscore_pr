import { useCallback, useEffect, useState } from 'react';
import { applyUpdate, startUpdatePolling, watchForUpdate } from '../../utils/swUpdate';

export interface UseAppUpdateResult {
    /** 更新バーを表示してよいか */
    show: boolean;
    /** 更新を適用してリロードする */
    apply: () => void;
    /** 今回は表示しない */
    dismiss: () => void;
}

/**
 * SWの更新を検知し、表示してよいタイミングかを判断する。
 *
 * @param suppressed 試合中など、更新を促してはいけない状況か。
 *   更新はリロードを伴うため、記録作業の最中に出すと手が止まる。
 *   保留した更新は試合が終われば表示される（検知結果は保持したまま）。
 */
export function useAppUpdate(suppressed: boolean): UseAppUpdateResult {
    const [updateReady, setUpdateReady] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => watchForUpdate(() => setUpdateReady(true)), []);

    // 検知だけでは足りない。ブラウザが新SWを探すのはナビゲーション時が中心で、
    // 記録用端末としてアプリを開きっぱなしにするとその機会が来ないため、
    // こちらから定期的に問い合わせる（watchForUpdate がその結果を拾う）
    useEffect(() => startUpdatePolling(), []);

    const apply = useCallback(() => { applyUpdate(); }, []);
    const dismiss = useCallback(() => setDismissed(true), []);

    return {
        show: updateReady && !dismissed && !suppressed,
        apply,
        dismiss,
    };
}
