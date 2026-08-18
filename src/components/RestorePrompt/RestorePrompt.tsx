import { useState } from 'react';
import type { MirrorSnapshot } from '../../utils/mirrorBackup';
import { restoreSnapshot } from '../../utils/mirrorBackup';
import { Modal } from '../Modal';
import './RestorePrompt.css';

interface RestorePromptProps {
    snapshot: MirrorSnapshot;
    onDismiss: () => void;
}

export function RestorePrompt({ snapshot, onDismiss }: RestorePromptProps) {
    const savedAt = new Date(snapshot.timestamp).toLocaleString('ja-JP');
    const keyCount = Object.keys(snapshot.entries).length;

    // 書き戻しに失敗しても、以前は例外でリロードに届かず画面は無反応だった。
    // イベントハンドラ内の例外は ErrorBoundary が拾わないため、利用者には
    // 「押しても何も起きない」としか見えない
    const [failed, setFailed] = useState(false);

    const handleRestore = () => {
        if (!restoreSnapshot(snapshot)) {
            setFailed(true);
            return;
        }
        window.location.reload();
    };

    return (
        <Modal
            onClose={onDismiss}
            overlayClassName="restore-prompt-overlay"
            contentClassName="restore-prompt"
            closeOnOverlayClick={false}
            closeOnEsc={false}
            labelledBy="restore-prompt-title"
        >
                <h2 id="restore-prompt-title">💾 以前のデータが見つかりました</h2>
                <p>
                    端末内のバックアップ（{savedAt} 保存・{keyCount}項目）から
                    チーム・試合データを復元できます。
                </p>
                <p className="restore-prompt-note">
                    ブラウザのデータ消去などでアプリのデータが失われた可能性があります。
                </p>
                {failed && (
                    <p className="restore-prompt-error" role="alert">
                        復元できませんでした。端末の空き容量が足りない可能性があります。
                        空きを作ってからもう一度お試しください（データは元のままです）。
                    </p>
                )}
                <div className="restore-prompt-actions">
                    <button className="btn btn-primary" onClick={handleRestore}>
                        復元する
                    </button>
                    <button className="btn btn-secondary" onClick={onDismiss}>
                        復元せずに始める
                    </button>
                </div>
        </Modal>
    );
}
