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
    /**
     * 最新の onClose を呼ぶラッパ。Modal 側が ref 経由で解決する。
     *
     * 戻り値は「閉じる要求を受け入れたか」。closeOnBack={false} のモーダルは
     * 受け止めるだけで閉じないので false を返す（詳細は closeTopModal）。
     */
    close: () => boolean;
}

/**
 * 戻る要求の行き先。
 *
 * - `'closed'`   … 最前面へ閉じる要求を渡した（そのモーダルは閉じる）
 * - `'received'` … 最前面が受け止めたが閉じない（closeOnBack={false}）
 * - `null`       … 開いているモーダルが無い＝戻るは画面遷移として扱ってよい
 *
 * `'closed'` と `'received'` を区別するのは、ホームで積んだ戻る用のエントリを
 * 積み直すかどうかが変わるため。閉じるなら枚数の変化を購読側が拾って積み直すが、
 * 閉じない場合は枚数が動かず誰も積み直さない（useScreenHistorySync）。
 * null は falsy にしてある —— 呼び出し側が真偽で見ても意味が変わらない。
 */
export type CloseTopModalResult = 'closed' | 'received' | null;

const stack: RegisteredModal[] = [];
let nextId = 1;

// 開いている枚数が変わったことを外から知るための購読口。
//
// ホーム画面は履歴の基点で、エントリを積まない（useScreenHistorySync）。
// そのためホームでモーダルを開いても、戻る操作に消費できるエントリが無く、
// popstate が起きないまま PWA ごと終了していた（実測: 新規タブで
// history.length === 1 のままアプリ設定が開き、開いても 1 のまま）。
// 「開いている間だけ戻る用のエントリを積む」という対処は履歴側の仕事なので、
// 開閉の通知だけをここから出す。
type ModalCountListener = (count: number) => void;

const listeners = new Set<ModalCountListener>();

function notifyCount(): void {
    for (const listener of [...listeners]) listener(stack.length);
}

/**
 * 開いている枚数の変化を購読する（購読した時点の枚数で1回呼ぶ）。
 *
 * 購読時にも呼ぶのは、Modal の登録が子→親の順で先に走るため。
 * 変化だけを見ると、既にモーダルが開いた状態でマウントした購読者が
 * 「1枚も開いていない」と誤認する。
 */
export function subscribeModalCount(listener: ModalCountListener): () => void {
    listeners.add(listener);
    listener(stack.length);
    return () => {
        listeners.delete(listener);
    };
}

/** モーダルを最前面として登録し、解除に使うidを返す */
export function registerModal(close: () => boolean): number {
    const id = nextId++;
    stack.push({ id, close });
    notifyCount();
    return id;
}

/** 登録を解除する。閉じ順とアンマウント順が食い違っても壊れないようidで引く */
export function unregisterModal(id: number): void {
    const index = stack.findIndex(m => m.id === id);
    if (index === -1) return;
    stack.splice(index, 1);
    notifyCount();
}

/**
 * 最前面のモーダルへ閉じる要求を出す（結果は CloseTopModalResult）。
 *
 * ここでスタックから外さないのは、onClose が state を変えて Modal が
 * アンマウントされ、その cleanup が unregisterModal を呼ぶため。
 * 二重に外すと、閉じない作りのモーダルが登録から消えてしまう。
 */
export function closeTopModal(): CloseTopModalResult {
    const top = stack[stack.length - 1];
    if (!top) return null;
    return top.close() ? 'closed' : 'received';
}

/** 開いているモーダルがあるか（テストと診断用） */
export function hasOpenModal(): boolean {
    return stack.length > 0;
}
