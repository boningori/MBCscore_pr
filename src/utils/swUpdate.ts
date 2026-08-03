// Service Workerの更新検知と適用。
//
// registerType: 'prompt'（vite.config.ts）と対になる。新しいSWは waiting で
// 待機し、利用者が「更新」を選ぶまで旧プリキャッシュを消さない。試合中に
// 足元のアセットが入れ替わり、jspdfが動的importするチャンクが404になって
// PDF出力だけ失敗する、という事故を防ぐのが目的。

/** 待機中SWを有効化させるメッセージ（sw.js側のハンドラと対） */
const SKIP_WAITING = { type: 'SKIP_WAITING' } as const;

function getContainer(): ServiceWorkerContainer | null {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
        ? navigator.serviceWorker
        : null;
}

/**
 * 新しいSWが利用可能になったら onUpdateReady を呼ぶ。
 * 戻り値を呼ぶと購読を解除する。
 */
export function watchForUpdate(onUpdateReady: () => void): () => void {
    const container = getContainer();
    if (!container) return () => { };

    let cancelled = false;
    const cleanups: Array<() => void> = [];

    const notifyIfUpdate = (worker: ServiceWorker | null) => {
        // controllerが無い＝このページはまだSWに制御されていない＝初回インストール。
        // 更新ではないので「新しいバージョンがあります」を出してはいけない。
        if (cancelled || !worker || !container.controller) return;
        if (worker.state === 'installed') onUpdateReady();
    };

    /** インストール完了を待って通知する */
    const trackInstalling = (installing: ServiceWorker | null) => {
        if (!installing) return;
        const handleStateChange = () => notifyIfUpdate(installing);
        installing.addEventListener('statechange', handleStateChange);
        cleanups.push(() => installing.removeEventListener('statechange', handleStateChange));
    };

    container.getRegistration().then(registration => {
        if (!registration || cancelled) return;

        // ページを開いた時点ですでに待機中のSWがいる場合
        notifyIfUpdate(registration.waiting);

        // すでにインストールが始まっている場合。registerSW.js は window.load で
        // 登録するため、Reactのeffectが動く頃には updatefound を撃ち終えていて
        // waiting はまだ null、ということが実機で起きる。ここを見ないと
        // 更新を取りこぼす。
        trackInstalling(registration.installing);

        // セッション中に新しいSWが見つかった場合
        const handleUpdateFound = () => trackInstalling(registration.installing);
        registration.addEventListener('updatefound', handleUpdateFound);
        cleanups.push(() => registration.removeEventListener('updatefound', handleUpdateFound));
    }).catch(() => {
        // 取得できない環境では更新通知を諦める（アプリ本体の動作には影響しない）
    });

    return () => {
        cancelled = true;
        for (const cleanup of cleanups) cleanup();
    };
}

/**
 * 待機中のSWを有効化し、制御が移ってからページを再読み込みする。
 * 制御が移る前にリロードすると旧SWのまま読み直すだけで更新されない。
 */
export async function applyUpdate(
    reload: () => void = () => window.location.reload(),
): Promise<void> {
    const container = getContainer();
    if (!container) {
        reload();
        return;
    }

    const registration = await container.getRegistration().catch(() => null);
    if (!registration?.waiting) {
        reload();
        return;
    }

    container.addEventListener('controllerchange', () => reload(), { once: true });
    registration.waiting.postMessage(SKIP_WAITING);
}
