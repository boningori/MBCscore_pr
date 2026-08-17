import { useEffect, useRef } from 'react';
import { closeTopModal } from '../components/Modal/modalStack';

interface HistoryState<S extends string> {
    appScreen?: S;
}

interface ScreenHistorySyncOptions<S extends string> {
    /** 基点となるホーム画面 */
    homeScreen: S;
    /** canShowGuarded が false のとき戻る/進むで復元せずホームへ差し替える画面 */
    guardedScreens: readonly S[];
    /** ガード対象画面を表示できる状態か（例: 表示可能な試合があるか） */
    canShowGuarded: boolean;
}

/**
 * 画面状態をブラウザ履歴と同期する（Androidの戻るボタン/ジェスチャでアプリが終了しないように）。
 *
 * 履歴スタックは「ホーム + 現在画面」の最大2段に保つ:
 * - ホーム → 他画面: pushState（戻るでホームに帰れる）
 * - 他画面 → 他画面: replaceState（スタックを増やさない。戻るは常にホーム行き）
 * - 他画面 → ホーム（アプリ内の戻る操作）: history.back()で積んだエントリをポップ
 *
 * これにより戻る操作は常に「ホームへ戻る → もう一度でアプリ終了」となる。
 */
export function useScreenHistorySync<S extends string>(
    screen: S,
    setScreen: (screen: S) => void,
    { homeScreen, guardedScreens, canShowGuarded }: ScreenHistorySyncOptions<S>,
) {
    // 初期エントリにホーム画面を記録
    useEffect(() => {
        window.history.replaceState({ appScreen: homeScreen }, '');
        // マウント時のみ（homeScreenは固定値の想定）
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 画面遷移を履歴へ反映
    useEffect(() => {
        const current = (window.history.state as HistoryState<S> | null)?.appScreen;
        if (current === screen) {
            // popstate起因（ブラウザが履歴側を先に更新済み）は何もしない
            return;
        }
        if (screen === homeScreen) {
            if (current !== undefined) {
                // アプリ内操作でホームへ戻った: 積んだエントリをポップして基点に戻す
                window.history.back();
            } else {
                window.history.replaceState({ appScreen: homeScreen }, '');
            }
        } else if (current === homeScreen || current === undefined) {
            window.history.pushState({ appScreen: screen }, '');
        } else {
            // 非ホーム画面同士の遷移はエントリを置き換え、スタックを増やさない
            window.history.replaceState({ appScreen: screen }, '');
        }
    }, [screen, homeScreen]);

    // 戻る操作でモーダルを閉じたあと、いまの画面のエントリを積み直すために使う。
    // popstateリスナーは貼り替えたくないので依存には入れずrefで読む
    const screenRef = useRef(screen);
    useEffect(() => {
        screenRef.current = screen;
    });

    // 戻る/進む操作への追従
    useEffect(() => {
        const handlePopState = (e: PopStateEvent) => {
            // 端末の戻る操作は、まず最前面のモーダルを閉じる。
            // ここを通さないと、入力途中のダイアログを開いたまま画面ごと
            // ホームへ飛ばされる（Androidのエッジスワイプで日常的に起きる）。
            // Modal は Escape も見ているが、タブレットにEscapeキーは無い
            if (closeTopModal()) {
                const current = screenRef.current;
                // ブラウザは既に1段戻っているので、閉じる前の画面へ積み直す。
                // ホームは基点なので積み増さず、stateだけ整合させる
                if (current === homeScreen) {
                    window.history.replaceState({ appScreen: homeScreen }, '');
                } else {
                    window.history.pushState({ appScreen: current }, '');
                }
                return;
            }

            let target = (e.state as HistoryState<S> | null)?.appScreen ?? homeScreen;
            if (guardedScreens.includes(target) && !canShowGuarded) {
                target = homeScreen;
                // 表示画面と履歴エントリのstateを一致させる
                window.history.replaceState({ appScreen: homeScreen }, '');
            }
            setScreen(target);
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [homeScreen, guardedScreens, canShowGuarded, setScreen]);
}
