import { ConfirmModal } from '../Modal/ConfirmModal';

interface DeleteConfirmModalProps {
    title: string;
    message: string;
    note?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

/** 削除確認。汎用の ConfirmModal に「削除する」ラベルを与えただけの薄い層 */
export function DeleteConfirmModal(props: DeleteConfirmModalProps) {
    return <ConfirmModal {...props} confirmLabel="削除する" />;
}
