// 開いているモーダルの重なり順を、Reactツリーの外に持つ小さなレジストリ。
//
// 端末の戻る操作（Androidの戻るボタン／エッジスワイプ）は popstate として届き、
// useScreenHistorySync がそれを画面遷移として処理していた。そのため入力途中の
// ダイアログを開いていても、閉じるどころか画面ごとホームへ飛ばされていた
// （実測: FoulInputFlow を開いたまま戻ると記録画面から追い出される）。
// Modal は Escape しか見ていないが、タブレットに Escape キーは無い。
//
// popstate を受ける側は「いま最前面のモーダルは何か」を知る必要がある一方、
// モーダルは画面ごとにばらばらの階層で描かれていて共通の親が無い。
// Context ではなくモジュールレベルの配列にしているのはそのため。

interface RegisteredModal {
    id: number;
    /** 最新の onClose を呼ぶラッパ。Modal 側が ref 経由で解決する */
    close: () => void;
}

const stack: RegisteredModal[] = [];
let nextId = 1;

/** モーダルを最前面として登録し、解除に使うidを返す */
export function registerModal(close: () => void): number {
    const id = nextId++;
    stack.push({ id, close });
    return id;
}

/** 登録を解除する。閉じ順とアンマウント順が食い違っても壊れないようidで引く */
export function unregisterModal(id: number): void {
    const index = stack.findIndex(m => m.id === id);
    if (index !== -1) stack.splice(index, 1);
}

/**
 * 最前面のモーダルへ閉じる要求を出す（閉じるものが無ければ false）。
 *
 * ここでスタックから外さないのは、onClose が state を変えて Modal が
 * アンマウントされ、その cleanup が unregisterModal を呼ぶため。
 * 二重に外すと、閉じない作りのモーダルが登録から消えてしまう。
 */
export function closeTopModal(): boolean {
    const top = stack[stack.length - 1];
    if (!top) return false;
    top.close();
    return true;
}

/** 開いているモーダルがあるか（テストと診断用） */
export function hasOpenModal(): boolean {
    return stack.length > 0;
}
