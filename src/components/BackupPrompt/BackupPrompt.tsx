import React, { useState } from 'react';
import { Modal } from '../Modal';
import type { BackupOutcome } from '../../utils/dataBackup';
import './BackupPrompt.css';

interface BackupPromptProps {
    /**
     * バックアップを実行し、結果を返す。
     *
     * 以前は `() => void` で、呼び出し側（App）が `await shareBackup()` の
     * 戻り値を捨てていた。失敗しても案内が黙って閉じるため、利用者からは
     * 「保存された」ようにしか見えない。督促の画面でそれをやると、
     * バックアップが無いまま安心させることになる。
     *
     * boolean ではなく3値なのは、共有シートを閉じただけの 'cancelled' を
     * 失敗として赤字で咎めないため（BackupOutcome）。
     */
    onBackup: () => Promise<BackupOutcome> | BackupOutcome;
    onDismiss: () => void;
}

export const BackupPrompt: React.FC<BackupPromptProps> = ({ onBackup, onDismiss }) => {
    // 出力は数秒かかる（全データのJSON化＋共有シート）。押しっぱなしの無反応と
    // 二重起動を防ぐ（PDF出力の useExportAction と同じ考え方）
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);

    const handleBackup = async () => {
        if (busy) return;
        setBusy(true);
        setFailed(false);
        try {
            const outcome = await onBackup();
            // 失敗したら閉じない。ここで閉じると、やり直す導線が
            // 設定画面の奥にしか無くなる。
            // やめただけ（'cancelled'）は咎めない。何が起きたかは利用者が
            // 分かっていて、閉じないことだけが要る
            if (outcome === 'failed') setFailed(true);
        } finally {
            setBusy(false);
        }
    };

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
                {failed && (
                    <p className="backup-prompt-error" role="alert">
                        保存できませんでした。空き容量を確認してもう一度お試しください
                        （記録は端末に残っています）。
                    </p>
                )}
                <div className="backup-prompt-actions">
                    <button className="btn btn-secondary" onClick={onDismiss} disabled={busy}>あとで</button>
                    <button className="btn btn-primary" onClick={handleBackup} disabled={busy}>
                        {busy ? '保存中…' : '今すぐ保存'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};
