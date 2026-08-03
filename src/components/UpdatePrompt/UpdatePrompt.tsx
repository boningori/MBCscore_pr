import './UpdatePrompt.css';

interface UpdatePromptProps {
    onUpdate: () => void;
    onDismiss: () => void;
}

/**
 * 新しいバージョンが利用可能なことを知らせる非ブロッキングなバー。
 * 更新はページの再読み込みを伴うため、必ず利用者の操作を待つ。
 */
export function UpdatePrompt({ onUpdate, onDismiss }: UpdatePromptProps) {
    return (
        <div className="update-prompt" role="status">
            <span className="update-prompt-message">
                新しいバージョンがあります
            </span>
            <div className="update-prompt-actions">
                <button className="update-prompt-btn secondary" onClick={onDismiss}>
                    後で
                </button>
                <button className="update-prompt-btn primary" onClick={onUpdate}>
                    更新
                </button>
            </div>
        </div>
    );
}
