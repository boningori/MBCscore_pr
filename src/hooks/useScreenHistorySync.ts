import { useEffect, useRef } from 'react';
import { closeTopModal, subscribeModalCount } from '../components/Modal/modalStack';

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
 *
 * ただしホームは基点でエントリを持たないため、ホームでモーダルを開いている間だけは
 * 「戻るで消費させる」エントリを1つ積む（modalGuard）。積まないと popstate 自体が
 * 起きず、閉じるどころかアプリが終了していた。
 */
export function useScreenHistorySync<S extends string>(
    screen: S,
    setScreen: (screen: S) => void,
    { homeScreen, guardedScreens, canShowGuarded }: ScreenHistorySyncOptions<S>,
) {
    // いま表示している画面。popstateリスナーやモーダルの購読から「その瞬間の最新」を
    // 読みたいが、依存に入れて貼り替えたくないので ref で渡す
    const screenRef = useRef(screen);
    useEffect(() => {
        screenRef.current = screen;
    });

    // ホームでモーダルを開いている間だけ積んだ、戻る用のエントリがあるか。
    // 積むのは常に1つまでで、戻るで消費したら次のモーダルで積み直す
    const modalGuardRef = useRef(false);
    // 上のエントリを取り除くために自分で呼んだ history.back() の待ち。
    // この popstate は画面遷移ではないので setScreen まで通してはいけない
    const guardPopPendingRef = useRef(false);
    /**
     * ホームへ戻るために自分で呼んだ history.back() の待ち。
     *
     * この popstate は「利用者が戻った」ではないのに、下の handlePopState が
     * まず closeTopModal() を呼ぶため、back() を出してから popstate が届くまでの
     * 数msの間に開いたモーダルが身代わりに閉じられてしまう。
     *
     * 実測: 試合を保存してホームへ戻ると、handleGameFinished が
     * setScreen('home') と setShowBackupPrompt(true) を続けて呼ぶ。
     * バックアップ督促は mount の 8ms 後に unmount され、直後に
     * popstate {"appScreen":"home"} が届いていた。つまりデータ保全のための
     * 唯一の能動的な促しが、画面に出た瞬間に自分で消されていた。
     */
    const homePopPendingRef = useRef(false);

    // 初期エントリにホーム画面を記録
    useEffect(() => {
        window.history.replaceState({ appScreen: homeScreen }, '');
        // マウント時のみ（homeScreenは固定値の想定）
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ホームでモーダルが開いている間だけ、戻るで消費させるエントリを持たせる
    useEffect(() => subscribeModalCount(count => {
        if (count > 0) {
            // ホーム以外は画面のエントリが既にあるので積まない
            if (modalGuardRef.current || screenRef.current !== homeScreen) return;
            modalGuardRef.current = true;
            window.history.pushState({ appScreen: homeScreen }, '');
            return;
        }
        // 全部閉じた。戻る以外（ボタン・オーバーレイ）で閉じたなら積んだぶんが残るので取り除く
        if (!modalGuardRef.current) return;
        modalGuardRef.current = false;
        guardPopPendingRef.current = true;
        window.history.back();
    }), [homeScreen]);

    // 画面遷移を履歴へ反映
    useEffect(() => {
        const current = (window.history.state as HistoryState<S> | null)?.appScreen;
        if (current === screen) {
            // popstate起因（ブラウザが履歴側を先に更新済み）は何もしない
            return;
        }
        if (screen === homeScreen) {
            if (current !== undefined) {
                // アプリ内操作でホームへ戻った: 積んだエントリをポップして基点に戻す。
                // 自分で呼んだ戻りなので、届く popstate は素通しさせる
                // （homePopPendingRef のコメント）
                homePopPendingRef.current = true;
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

    // 戻る/進む操作への追従
    useEffect(() => {
        const handlePopState = (e: PopStateEvent) => {
            // ホームへ戻るために自分で呼んだ戻り。画面はもうホームになっており、
            // 履歴も基点に戻っただけなので何もしない。ここで closeTopModal() へ
            // 進ませると、ホームへ移ると同時に開いたモーダル（バックアップ督促）を
            // 身代わりに閉じてしまう（homePopPendingRef のコメント）
            if (homePopPendingRef.current) {
                homePopPendingRef.current = false;
                return;
            }

            // モーダル用に積んだエントリを取り除くための、自分で呼んだ戻り。
            // 画面遷移ではないので、いまの画面をこのエントリに書き込んで終わる
            // （積み直すと余分なエントリが残る）
            if (guardPopPendingRef.current) {
                guardPopPendingRef.current = false;
                const current = screenRef.current;
                if (current === homeScreen) {
                    window.history.replaceState({ appScreen: homeScreen }, '');
                    return;
                }
                // モーダルを閉じるのと同時にホームから移動した場合
                // （「進行中の試合があります」の『試合を再開する』『新規試合を開始』）。
                // この戻りが降りた先は履歴の基点＝ホームなので、そこへ遷移先の画面を
                // 書き込むとホームのエントリが消える。実測: 再開後の戻るが何も
                // 起きなくなり、もう一度でPWAごと終了していた。
                // 基点は触らず、いまの画面のエントリを積み直す
                window.history.pushState({ appScreen: current }, '');
                return;
            }

            // 端末の戻る操作は、まず最前面のモーダルを閉じる。
            // ここを通さないと、入力途中のダイアログを開いたまま画面ごと
            // ホームへ飛ばされる（Androidのエッジスワイプで日常的に起きる）。
            // Modal は Escape も見ているが、タブレットにEscapeキーは無い
            const closed = closeTopModal();
            if (closed) {
                const current = screenRef.current;
                // ブラウザは既に1段戻っているので、閉じる前の画面へ積み直す。
                // ホームは基点なので積み増さず、stateだけ整合させる
                if (current === homeScreen) {
                    if (closed === 'received') {
                        // 受け止めただけで閉じないモーダル（復元プロンプト）。
                        // 枚数が変わらないので購読側は動かない ——
                        // ここで積み直さないと履歴が基点に戻り、次の戻るで
                        // アプリごと終了する。実測(v1.6.14・実ブラウザ):
                        // 1回目はダイアログが残るが、2回目でページごと離脱した。
                        // closeOnBack={false} を付けた理由（エッジスワイプの
                        // 誤爆から復元の機会を守る）が2回目で崩れていた
                        window.history.pushState({ appScreen: homeScreen }, '');
                    } else {
                        // 消費されたのはモーダル用に積んだエントリ。
                        // まだ下にモーダルが残っていれば、閉じた1枚のアンマウントで
                        // 購読側が積み直す
                        modalGuardRef.current = false;
                        window.history.replaceState({ appScreen: homeScreen }, '');
                    }
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
