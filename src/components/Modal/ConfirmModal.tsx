import { Modal } from './Modal';

interface ConfirmModalProps {
    title: string;
    message: string;
    note?: string;
    /** 実行側のラベル（既定: 削除する） */
    confirmLabel?: string;
    /** 打ち消し側のラベル（既定: キャンセル） */
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * 取り返しのつかない操作の確認ダイアログ。
 * window.confirm を使わないのは、アプリ内の他の確認と作法が揃わないうえ、
 * PWA（standalone表示）では出方が端末任せになるため。
 *
 * 打ち消し側を先に置き、さらに data-autofocus を付ける。開いた直後の
 * Enterやタップが実行側に落ちないようにするため（Modal 側が解釈する）。
 */
export function ConfirmModal({
    title,
    message,
    note,
    confirmLabel = '削除する',
    cancelLabel = 'キャンセル',
    onConfirm,
    onCancel,
}: ConfirmModalProps) {
    return (
        <Modal onClose={onCancel} closeOnOverlayClick={false} labelledBy="confirm-modal-title">
            <h3 id="confirm-modal-title">{title}</h3>
            <p>{message}</p>
            {note && <p className="text-muted text-sm my-2">{note}</p>}
            <div className="modal-actions">
                <button className="btn btn-secondary" data-autofocus onClick={onCancel}>
                    {cancelLabel}
                </button>
                <button className="btn btn-danger" onClick={onConfirm}>
                    {confirmLabel}
                </button>
            </div>
        </Modal>
    );
}
