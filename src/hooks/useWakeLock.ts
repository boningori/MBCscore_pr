// 記録中に画面を消させないためのフック（Screen Wake Lock API）。
//
// 1試合は20〜30分あり、その間の入力は数十秒おきになる。端末の自動ロックが
// 効くと画面が暗転し、次の得点までに復帰操作が要る。全画面表示（useFullscreen）は
// 表示領域を広げるだけでスリープは防げないため、こちらで押さえる。
//
// APIを持たない端末（iOS 16.4未満など）と、要求が拒否される端末（省電力モード）が
// あるが、どちらも記録自体は続けられるので黙って諦める。取れなかったことを
// 通知しても利用者にできることがない。

import { useEffect, useRef } from 'react';

export function useWakeLock(enabled: boolean): void {
    // 「解放済みだが enabled のまま」を復帰時に取り直すため、
    // 現在保持しているセンチネルを持ち続ける
    const sentinelRef = useRef<WakeLockSentinel | null>(null);

    useEffect(() => {
        if (!enabled) return;

        const wakeLock = navigator.wakeLock;
        if (!wakeLock) return;

        // 効果の後始末より後に非同期の要求が解決することがあるため、
        // 世代フラグで「もう不要になった要求」を捨てる
        let active = true;

        const acquire = async () => {
            if (!active || sentinelRef.current) return;
            try {
                const sentinel = await wakeLock.request('screen');
                if (!active) {
                    // 解除済みなら受け取ってすぐ返す
                    void sentinel.release();
                    return;
                }
                sentinelRef.current = sentinel;
                // ブラウザが自動解放したときに参照を捨てる。
                // 残したままだと復帰時のacquireが「保持済み」と誤判定して取り直せない
                sentinel.addEventListener('release', () => {
                    if (sentinelRef.current === sentinel) sentinelRef.current = null;
                });
            } catch {
                // 省電力モード等で拒否される。記録は続けられるので何もしない
            }
        };

        // タブが隠れるとブラウザ側で自動解放されるため、復帰時に取り直す
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') void acquire();
        };

        void acquire();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            active = false;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            const sentinel = sentinelRef.current;
            sentinelRef.current = null;
            void sentinel?.release().catch(() => { });
        };
    }, [enabled]);
}
