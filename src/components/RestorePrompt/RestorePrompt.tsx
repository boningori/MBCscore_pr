import type { MirrorSnapshot } from '../../utils/mirrorBackup';
import { restoreSnapshot } from '../../utils/mirrorBackup';
import './RestorePrompt.css';

interface RestorePromptProps {
    snapshot: MirrorSnapshot;
    onDismiss: () => void;
}

export function RestorePrompt({ snapshot, onDismiss }: RestorePromptProps) {
    const savedAt = new Date(snapshot.timestamp).toLocaleString('ja-JP');
    const keyCount = Object.keys(snapshot.entries).length;

    const handleRestore = () => {
        restoreSnapshot(snapshot);
        window.location.reload();
    };

    return (
        <div className="restore-prompt-overlay">
            <div className="restore-prompt">
                <h2>💾 以前のデータが見つかりました</h2>
                <p>
                    端末内のバックアップ（{savedAt} 保存・{keyCount}項目）から
                    チーム・試合データを復元できます。
                </p>
                <p className="restore-prompt-note">
                    ブラウザのデータ消去などでアプリのデータが失われた可能性があります。
                </p>
                <div className="restore-prompt-actions">
                    <button className="btn btn-primary" onClick={handleRestore}>
                        復元する
                    </button>
                    <button className="btn btn-secondary" onClick={onDismiss}>
                        復元せずに始める
                    </button>
                </div>
            </div>
        </div>
    );
}
