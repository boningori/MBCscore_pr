import React from 'react';
import { Modal } from '../Modal';
import './BackupPrompt.css';

interface BackupPromptProps {
    onBackup: () => void;
    onDismiss: () => void;
}

export const BackupPrompt: React.FC<BackupPromptProps> = ({ onBackup, onDismiss }) => {
    return (
        <Modal
            onClose={onDismiss}
            overlayClassName="backup-prompt-overlay"
            contentClassName="backup-prompt-modal"
            labelledBy="backup-prompt-title"
        >
            <div className="backup-prompt-body">
                <h2 id="backup-prompt-title">💾 バックアップしますか？</h2>
                <p>
                    新しい試合が記録されました。端末の故障や機種変更に備えて、
                    今のうちにクラウド（Drive/iCloud等）へバックアップしておくと安心です。
                </p>
                <div className="backup-prompt-actions">
                    <button className="btn btn-secondary" onClick={onDismiss}>あとで</button>
                    <button className="btn btn-primary" onClick={onBackup}>今すぐ保存</button>
                </div>
            </div>
        </Modal>
    );
};
