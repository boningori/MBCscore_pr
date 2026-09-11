import { estimateStorageUsage, formatBytes } from '../../utils/storageUsage';
import './StorageWarning.css';

/**
 * 保存領域が埋まってきたことを、ホームでも知らせる帯。
 *
 * 使用容量の可視化と8割超の警告は設定 → データ管理に既にある。ただしあの欄は
 * 折り畳みの中で、普段そこを開く用事は「バックアップを取る」ときだけである。
 * まさにその用事を思いつかない人に届かない。開かないまま録り続けた人が
 * 最初に知るのは、試合が終わって保存を押したその瞬間になる。
 *
 * 閉じるボタンは付けない。InstallPrompt は閉じられるが、あれは無くても
 * 困らない案内である。こちらは放置すると記録が保存できなくなるので、
 * 8割を切るまで出続ける。消したければ実際にデータを減らせばよい。
 *
 * ボタンも付けない。「設定」も「試合履歴」もすぐ下のメニューに並んでおり、
 * 帯から重ねて出す理由がない。ここは情報表示であって操作ではない。
 *
 * 文言は設定画面の警告文を引き継ぐ。同じことを別の言葉で二度言うと、
 * 別のことのように読める。
 */
export function StorageWarning() {
    // 描画のたびに測る。Home が loadMyTeams / getGameSessionState について
    // 決めているのと同じ方針（ホームの再描画はまれ）。マウント時1回に絞ると、
    // 設定モーダルからバックアップを復元してもホームは再マウントされないため、
    // データが増えたのに帯が出ない食い違いができる
    const usage = estimateStorageUsage();
    if (!usage.nearlyFull) return null;

    return (
        <div className="storage-warning">
            <p className="storage-warning-title">⚠️ 保存領域の空きが少なくなっています</p>
            <p className="storage-warning-body">
                端末内の使用容量は {formatBytes(usage.usedBytes)} / 約{formatBytes(usage.limitBytes)} です。いっぱいになると、新しい試合を保存できなくなります。
                設定 →「データ管理」からバックアップを保存し、試合履歴から古い試合を削除してください。
            </p>
        </div>
    );
}
