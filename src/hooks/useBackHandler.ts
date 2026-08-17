import { useEffect, useRef } from 'react';
import { registerModal, unregisterModal } from '../components/Modal/modalStack';

/**
 * 端末の戻る操作（Androidの戻るボタン／エッジスワイプ）を、画面内のサブビューで
 * 受け取る。
 *
 * useScreenHistorySync が同期しているのは AppScreen 単位の画面だけで、各画面が
 * ローカルstateで持つサブビュー —— マイチームの編集フォーム、選手スタッツの詳細、
 * 履歴の試合詳細 —— は履歴に存在しない。そのため戻ると1段上ではなくホームまで
 * 飛び、名簿の編集フォームでは未保存の入力が確認なく消えていた。画面上の
 * 「← 戻る」は1段だけ戻すので、同じ「戻る」でハードとソフトの挙動が
 * 食い違っていたことになる。
 *
 * 登録先はモーダルと同じLIFO（modalStack）。サブビューの上にモーダルを開いたら
 * モーダルが後から積まれるので、先にモーダルが閉じる —— この優先順位は
 * マウント順から自然に決まる。
 *
 * @param active サブビューを表示している間だけ true
 * @param onBack 1段戻す処理（画面上の「戻る」ボタンと同じもの）
 */
export function useBackHandler(active: boolean, onBack: () => void): void {
    // 呼び出し側のコールバックは毎レンダー作り直されるのが普通なので、
    // 登録するのは ref を読むラッパにして、登録/解除は active の変化だけに保つ
    // （Modal.tsx と同じ作法）
    const onBackRef = useRef(onBack);
    useEffect(() => {
        onBackRef.current = onBack;
    });

    useEffect(() => {
        if (!active) return;
        const id = registerModal(() => onBackRef.current());
        return () => unregisterModal(id);
    }, [active]);
}
