import { useEffect, useState } from 'react';
import { getAllSnapshots, restoreSnapshot } from '../../utils/mirrorBackup';
import type { MirrorSnapshot } from '../../utils/mirrorBackup';
import { ConfirmModal } from '../Modal';

interface MirrorBackupListProps {
    /** 書き戻しが完了したときに呼ばれる（呼び出し側でリロードする） */
    onRestored: () => void;
}

/**
 * IndexedDBに溜めている自動バックアップの世代一覧。
 *
 * mirrorBackup は10世代を保持しているのに、これまでUIから辿れるのは
 * 「localStorageが完全に空のときに最新1世代を復元するか聞く」プロンプトだけで、
 * getAllSnapshots は本番コードから一度も呼ばれていなかった。
 * 誤って削除した・不正なデータを取り込んで上書きした・保存に失敗した、
 * といった場合はどれも救えないままだった。
 *
 * 書き戻しは全キーの上書きなので、必ず確認を挟む。
 */
export function MirrorBackupList({ onRestored }: MirrorBackupListProps) {
    const [snapshots, setSnapshots] = useState<MirrorSnapshot[] | null>(null);
    const [pending, setPending] = useState<MirrorSnapshot | null>(null);

    useEffect(() => {
        let alive = true;
        // getAllSnapshots は内部で例外を握って [] を返すため、ここでは待つだけでよい
        getAllSnapshots().then(list => {
            if (alive) setSnapshots(list);
        });
        return () => { alive = false; };
    }, []);

    if (snapshots === null) {
        return <p className="section-description">読み込み中…</p>;
    }

    if (snapshots.length === 0) {
        return (
            <p className="section-description">
                自動バックアップはまだありません。試合を記録すると自動で作られます。
            </p>
        );
    }

    return (
        <>
            <ul className="mirror-backup-list">
                {snapshots.map(snap => (
                    <li key={snap.timestamp} className="mirror-backup-item">
                        <span className="mirror-backup-when">
                            {new Date(snap.timestamp).toLocaleString('ja-JP')}
                        </span>
                        <span className="mirror-backup-count">
                            {Object.keys(snap.entries).length}項目
                        </span>
                        <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => setPending(snap)}
                        >
                            この時点に戻す
                        </button>
                    </li>
                ))}
            </ul>

            {pending && (
                <ConfirmModal
                    title="この時点に戻しますか？"
                    message={
                        `${new Date(pending.timestamp).toLocaleString('ja-JP')} の状態に戻します。\n` +
                        '現在のチーム・試合履歴・設定は、この時点の内容で上書きされます。\n' +
                        '戻したあとアプリを再読み込みします。'
                    }
                    confirmLabel="戻す"
                    cancelLabel="キャンセル"
                    onConfirm={() => {
                        restoreSnapshot(pending);
                        setPending(null);
                        onRestored();
                    }}
                    onCancel={() => setPending(null)}
                />
            )}
        </>
    );
}
