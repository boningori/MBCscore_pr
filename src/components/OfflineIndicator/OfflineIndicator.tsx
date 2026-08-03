import { useEffect, useState } from 'react';
import './OfflineIndicator.css';

/**
 * オフライン中であることを示すバッジ。
 *
 * このアプリは全機能がオフラインで動くため、警告ではなく安心材料として出す。
 * 体育館は電波が入りにくいことが多く、通信が切れたときに「記録が消えるのでは」
 * と不安になるのを防ぐのが目的。
 */
export function OfflineIndicator() {
    const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

    useEffect(() => {
        const goOffline = () => setIsOffline(true);
        const goOnline = () => setIsOffline(false);
        window.addEventListener('offline', goOffline);
        window.addEventListener('online', goOnline);
        return () => {
            window.removeEventListener('offline', goOffline);
            window.removeEventListener('online', goOnline);
        };
    }, []);

    if (!isOffline) return null;

    return (
        <div className="offline-indicator" role="status">
            📴 オフライン中 — 記録は続けられます
        </div>
    );
}
