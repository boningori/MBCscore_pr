import { useEffect, useState } from 'react';
import { getSnapshot, getSnapshotMetas, restoreSnapshot, saveSnapshot } from '../../utils/mirrorBackup';
import type { SnapshotMeta, SnapshotReason } from '../../utils/mirrorBackup';
import { ConfirmModal } from '../Modal';

interface MirrorBackupListProps {
    /** 書き戻しが完了したときに呼ばれる（呼び出し側でリロードする） */
    onRestored: () => void;
}

/**
 * 世代が何の時点かを表す短い文。
 *
 * 時刻だけを出していた頃は、記録者が「あの試合の直後はどれか」を推測する
 * しかなかった。理由が出れば時刻を数えずに選べる。
 * 理由を持たない世代（v1 が書いたもの）は、実態がほぼ試合中の自動保存なので
 * 定期と同じ扱いで見せる。
 */
const REASON_LABEL: Record<SnapshotReason, string> = {
    gameEnd: '試合を保存した直後',
    startup: 'アプリを開いたとき',
    beforeRestore: '復元を実行する直前',
    periodic: '記録中の自動保存',
};

function reasonLabel(reason?: SnapshotReason): string {
    return REASON_LABEL[reason ?? 'periodic'];
}

/**
 * IndexedDBに溜めている自動バックアップの世代一覧。
 *
 * 一覧は日時と理由だけを読む（getSnapshotMetas）。全世代の中身を載せていた頃は、
 * 履歴が 3MB ある利用者で 10世代 30MB をメモリへ読んでいた。
 *
 * 書き戻しは全キーの上書きなので、必ず確認を挟む。さらに実行の直前に
 * 現在の状態を beforeRestore として退避する —— 誤った世代を選んだときに
 * 戻る道が無いため。
 */
export function MirrorBackupList({ onRestored }: MirrorBackupListProps) {
    const [metas, setMetas] = useState<SnapshotMeta[] | null>(null);
    const [pending, setPending] = useState<SnapshotMeta | null>(null);
    // 書き戻しに失敗した（restoreSnapshot が false を返した、または世代を読めなかった）。
    // 握って onRestored を呼ぶと、データは元のままなのにリロードだけが走り、
    // 利用者は「戻せた」と思い込む。RestorePrompt と同じ扱いにそろえる
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        // getSnapshotMetas は内部で例外を握って [] を返すため、ここでは待つだけでよい
        getSnapshotMetas().then(list => {
            if (alive) setMetas(list);
        });
        return () => { alive = false; };
    }, []);

    if (metas === null) {
        return <p className="section-description">読み込み中…</p>;
    }

    if (metas.length === 0) {
        return (
            <p className="section-description">
                自動バックアップはまだありません。試合を記録すると自動で作られます。
            </p>
        );
    }

    const handleRestore = async (target: SnapshotMeta) => {
        setPending(null);

        const snapshot = await getSnapshot(target.timestamp);
        if (!snapshot) {
            setFailed(true);
            return;
        }

        // 退避が先。あとだと上書き後のデータを写すことになり、戻る道にならない
        await saveSnapshot('beforeRestore');

        if (!restoreSnapshot(snapshot)) {
            setFailed(true);
            return;
        }
        onRestored();
    };

    return (
        <>
            {failed && (
                <p className="status-message error" role="alert">
                    この時点に戻せませんでした。端末の空き容量が足りない可能性があります。
                    空きを作ってからもう一度お試しください（データは元のままです）。
                </p>
            )}
            <ul className="mirror-backup-list">
                {metas.map(meta => (
                    <li key={meta.timestamp} className="mirror-backup-item">
                        <span className="mirror-backup-when">
                            {new Date(meta.timestamp).toLocaleString('ja-JP')}
                        </span>
                        <span className="mirror-backup-reason">
                            {reasonLabel(meta.reason)}
                        </span>
                        <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => { setFailed(false); setPending(meta); }}
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
                        `${new Date(pending.timestamp).toLocaleString('ja-JP')}（${reasonLabel(pending.reason)}）の状態に戻します。\n` +
                        '現在のチーム・試合履歴・設定は、この時点の内容で上書きされます。\n' +
                        '戻したあとアプリを再読み込みします。'
                    }
                    note="いまの状態は、戻す直前に自動で控えを取ります。選び間違えたときはその世代から戻せます。"
                    confirmLabel="戻す"
                    cancelLabel="キャンセル"
                    onConfirm={() => { void handleRestore(pending); }}
                    onCancel={() => setPending(null)}
                />
            )}
        </>
    );
}
