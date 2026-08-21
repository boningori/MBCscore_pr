// Service Workerの更新検知と適用。
//
// registerType: 'prompt'（vite.config.ts）と対になる。新しいSWは waiting で
// 待機し、利用者が「更新」を選ぶまで旧プリキャッシュを消さない。試合中に
// 足元のアセットが入れ替わり、jspdfが動的importするチャンクが404になって
// PDF出力だけ失敗する、という事故を防ぐのが目的。

/** 待機中SWを有効化させるメッセージ（sw.js側のハンドラと対） */
const SKIP_WAITING = { type: 'SKIP_WAITING' } as const;

/**
 * SKIP_WAITING を送ってから controllerchange を待つ上限。
 * 待ち続けると「更新」を押しても無反応で終わるため、時間切れで押し切る。
 */
const CONTROLLER_CHANGE_TIMEOUT_MS = 10_000;

/** 更新確認の既定間隔。試合1本（20〜30分）より短くしても意味がない */
const DEFAULT_POLL_INTERVAL_MS = 30 * 60 * 1000;

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

    // 制御が移ったら（または時間切れで）1回だけリロードする。
    // 時間切れの保険が要るのは、skipWaiting が効かず controllerchange が
    // 来ないことがあるため。待ち続けると「更新」が無反応のボタンになる。
    // 保険で読み直しても旧版が再表示されるだけで、失うものは無い
    // （更新バーは記録中には出さない。updateSuppression.ts）
    let reloaded = false;
    const reloadOnce = () => {
        if (reloaded) return;
        reloaded = true;
        clearTimeout(timer);
        reload();
    };
    const timer = setTimeout(reloadOnce, CONTROLLER_CHANGE_TIMEOUT_MS);

    container.addEventListener('controllerchange', reloadOnce, { once: true });
    registration.waiting.postMessage(SKIP_WAITING);
}

/**
 * 新しいSWが出ていないかを定期的に問い合わせる。戻り値を呼ぶと停止する。
 *
 * ブラウザがSWの更新を確認するのはナビゲーション時が中心で、記録用端末として
 * アプリを開きっぱなしにする使い方だとその機会が来ない。明示的に update() を
 * 叩かないと、何日でも旧版のまま気づけない。
 *
 * 画面が隠れている間とオフラインでは叩かない。体育館では大半がオフラインで、
 * 無駄な通信を繰り返しても電池を減らすだけになる。
 */
export function startUpdatePolling(intervalMs = DEFAULT_POLL_INTERVAL_MS): () => void {
    const container = getContainer();
    if (!container) return () => { };

    let stopped = false;

    const check = async () => {
        if (stopped) return;
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;
        try {
            const registration = await container.getRegistration();
            await registration?.update();
        } catch {
            // 取得できない・通信が切れた等。次の機会に任せる
        }
    };

    const timer = setInterval(() => { void check(); }, intervalMs);
    // 画面に戻ってきた瞬間は、間隔を待たずに確認する。
    // 端末を置いていた間にデプロイが済んでいることが多い
    const handleVisibilityChange = () => { void check(); };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
        stopped = true;
        clearInterval(timer);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
}
