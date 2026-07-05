interface DeleteConfirmModalProps {
    title: string;
    message: string;
    note?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export function DeleteConfirmModal({ title, message, note, onConfirm, onCancel }: DeleteConfirmModalProps) {
    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>{title}</h3>
                <p>{message}</p>
                {note && <p className="text-muted text-sm my-2">{note}</p>}
                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={onCancel}>
                        キャンセル
                    </button>
                    <button className="btn btn-danger" onClick={onConfirm}>
                        削除する
                    </button>
                </div>
            </div>
        </div>
    );
}
