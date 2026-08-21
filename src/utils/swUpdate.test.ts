import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { watchForUpdate, applyUpdate, startUpdatePolling } from './swUpdate';

// ServiceWorkerはjsdomに存在しないため、必要な部分だけを組み立てて差し込む。

class FakeWorker extends EventTarget {
    state: ServiceWorkerState = 'installing';
    postMessage = vi.fn();
    setState(state: ServiceWorkerState) {
        this.state = state;
        this.dispatchEvent(new Event('statechange'));
    }
}

class FakeRegistration extends EventTarget {
    waiting: FakeWorker | null = null;
    installing: FakeWorker | null = null;
    update = vi.fn().mockResolvedValue(undefined);
    /** ブラウザが新SWを見つけたときの流れを再現する */
    startInstall(): FakeWorker {
        const worker = new FakeWorker();
        this.installing = worker;
        this.dispatchEvent(new Event('updatefound'));
        return worker;
    }
}

class FakeContainer extends EventTarget {
    controller: object | null = null;
    registration = new FakeRegistration();
    getRegistration = () => Promise.resolve(this.registration);
}

let container: FakeContainer;

function installFakeServiceWorker(hasController: boolean) {
    container = new FakeContainer();
    // controllerがある = すでにSWに制御されている = 2回目以降の訪問
    container.controller = hasController ? {} : null;
    Object.defineProperty(navigator, 'serviceWorker', {
        value: container,
        configurable: true,
        writable: true,
    });
}

beforeEach(() => {
    installFakeServiceWorker(true);
});

afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('watchForUpdate', () => {
    it('すでに待機中のSWがあれば即座に通知する', async () => {
        const waiting = new FakeWorker();
        waiting.state = 'installed';
        container.registration.waiting = waiting;

        const onReady = vi.fn();
        watchForUpdate(onReady);
        await Promise.resolve();

        expect(onReady).toHaveBeenCalledTimes(1);
    });

    it('セッション中に新SWがインストールされたら通知する', async () => {
        const onReady = vi.fn();
        watchForUpdate(onReady);
        await Promise.resolve();
        expect(onReady).not.toHaveBeenCalled();

        const installing = container.registration.startInstall();
        installing.setState('installed');

        expect(onReady).toHaveBeenCalledTimes(1);
    });

    it('購読開始時点ですでにインストール中のSWがいても取りこぼさない', async () => {
        // registerSW.js は window.load で登録するため、Reactのeffectが動く頃には
        // updatefound を撃ち終えていることがある。その場合 waiting はまだ null で、
        // installing だけが存在する。実機でこの取りこぼしにより更新バーが
        // 出なかった。
        const installing = new FakeWorker();
        container.registration.installing = installing;

        const onReady = vi.fn();
        watchForUpdate(onReady);
        await Promise.resolve();

        installing.setState('installed');

        expect(onReady).toHaveBeenCalledTimes(1);
    });

    it('初回インストール（controllerなし）では通知しない', async () => {
        // 初回訪問で「新しいバージョンがあります」と出るのは誤り
        installFakeServiceWorker(false);

        const onReady = vi.fn();
        watchForUpdate(onReady);
        await Promise.resolve();

        const installing = container.registration.startInstall();
        installing.setState('installed');

        expect(onReady).not.toHaveBeenCalled();
    });

    it('購読解除後は通知しない', async () => {
        const onReady = vi.fn();
        const unsubscribe = watchForUpdate(onReady);
        await Promise.resolve();

        unsubscribe();
        const installing = container.registration.startInstall();
        installing.setState('installed');

        expect(onReady).not.toHaveBeenCalled();
    });

    it('ServiceWorker非対応環境でも例外を投げない', () => {
        Reflect.deleteProperty(navigator, 'serviceWorker');
        expect(() => watchForUpdate(vi.fn())()).not.toThrow();
    });
});

describe('applyUpdate', () => {
    it('待機中SWにSKIP_WAITINGを送り、切り替わってからリロードする', async () => {
        const waiting = new FakeWorker();
        waiting.state = 'installed';
        container.registration.waiting = waiting;

        const reload = vi.fn();
        await applyUpdate(reload);

        expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        // 制御が移る前にリロードすると旧SWのまま読み直すだけになる
        expect(reload).not.toHaveBeenCalled();

        container.dispatchEvent(new Event('controllerchange'));
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('待機中SWが無ければそのままリロードする', async () => {
        const reload = vi.fn();
        await applyUpdate(reload);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('controllerchangeが来なければ時間切れでリロードする（押して無反応にしない）', async () => {
        vi.useFakeTimers();
        try {
            const waiting = new FakeWorker();
            waiting.state = 'installed';
            container.registration.waiting = waiting;

            const reload = vi.fn();
            await applyUpdate(reload);
            expect(reload).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(10_000);
            expect(reload).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('時間切れの保険は制御が移ったあと二重にリロードしない', async () => {
        vi.useFakeTimers();
        try {
            const waiting = new FakeWorker();
            waiting.state = 'installed';
            container.registration.waiting = waiting;

            const reload = vi.fn();
            await applyUpdate(reload);
            container.dispatchEvent(new Event('controllerchange'));
            expect(reload).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(30_000);
            expect(reload).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('startUpdatePolling', () => {
    // 記録用端末としてアプリを開きっぱなしにする使い方だと、ナビゲーションが
    // 起きないままになる。SWの更新チェックはナビゲーション時にしか走らないので、
    // 明示的に叩かないと新版に永久に気づけない。
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('一定間隔で更新を問い合わせる', async () => {
        const stop = startUpdatePolling(60_000);
        await vi.advanceTimersByTimeAsync(60_000);
        expect(container.registration.update).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(60_000);
        expect(container.registration.update).toHaveBeenCalledTimes(2);
        stop();
    });

    it('画面が隠れている間は問い合わせない（バックグラウンドで通信しない）', async () => {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        const stop = startUpdatePolling(60_000);
        await vi.advanceTimersByTimeAsync(180_000);
        expect(container.registration.update).not.toHaveBeenCalled();
        stop();
    });

    it('オフラインでは問い合わせない', async () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        const stop = startUpdatePolling(60_000);
        await vi.advanceTimersByTimeAsync(180_000);
        expect(container.registration.update).not.toHaveBeenCalled();
        stop();
    });

    it('画面に戻ってきた時にも問い合わせる', async () => {
        const stop = startUpdatePolling(60_000);
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(0);
        expect(container.registration.update).toHaveBeenCalledTimes(1);
        stop();
    });

    it('停止したら以後問い合わせない', async () => {
        const stop = startUpdatePolling(60_000);
        stop();
        await vi.advanceTimersByTimeAsync(180_000);
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(0);
        expect(container.registration.update).not.toHaveBeenCalled();
    });

    it('update()が失敗しても例外を投げない', async () => {
        container.registration.update.mockRejectedValue(new Error('offline'));
        const stop = startUpdatePolling(60_000);
        await expect(vi.advanceTimersByTimeAsync(60_000)).resolves.not.toThrow();
        stop();
    });

    it('ServiceWorker非対応環境でも例外を投げない', () => {
        Reflect.deleteProperty(navigator, 'serviceWorker');
        expect(() => startUpdatePolling(60_000)()).not.toThrow();
    });
});
