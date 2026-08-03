import { useEffect } from 'react';
import { showToast } from '../components/Toast/toastApi';

/**
 * オフラインへの切り替わりをトーストで知らせる。
 *
 * 常設バッジにはしない。記録画面は横向き(812x375)で四辺すべてが操作要素で
 * 埋まっており、固定表示を置くとどこかのボタンに必ず重なるため
 * （上端中央は「📄 スコアシート」、左下は「#8」「🔄 交代」に重なることを実測）。
 *
 * このアプリは全機能がオフラインで動くので、警告ではなく安心材料として出す。
 * 体育館は電波が入りにくく、通信が切れた瞬間に「記録が消えるのでは」と
 * 不安になるのを防ぐのが目的。
 *
 * 起動時にすでにオフラインでも何も出さない。体育館では常時オフラインに
 * なりうるため毎回出すと煩わしく、ホーム画面のフッターに「オフライン動作」と
 * 常時表示している。
 */
export function useOfflineToast(): void {
    useEffect(() => {
        const goOffline = () => showToast('📴 オフラインになりました — 記録は続けられます', 'success');
        const goOnline = () => showToast('📶 オンラインに復帰しました', 'success');

        window.addEventListener('offline', goOffline);
        window.addEventListener('online', goOnline);
        return () => {
            window.removeEventListener('offline', goOffline);
            window.removeEventListener('online', goOnline);
        };
    }, []);
}
