import { isLiveSessionProtected } from '../../utils/gameSessionStorage';

/**
 * 復元のあとに読み込み直すか。
 *
 * 記録中は読み込み直さない。リロードすると記録者は試合画面から弾き出され、
 * ホームの「試合を再開」を押し直すことになる。履歴もチームも開いた時点で
 * 読み直されるので、表示が古いまま残ることはない（Home が「描画のたびに
 * 読み直す」と決めているのと同じ理由）。
 *
 * AppSettingsModal.tsx ではなく別ファイルに置くのは、コンポーネントの
 * ファイルから関数を export すると react-refresh/only-export-components が
 * 通らないため。判断を切り出しておくと、jsdom で window.location.reload を
 * 差し替えずに検査できるという利点もそのまま残る。
 */
export function shouldReloadAfterRestore(): boolean {
    return !isLiveSessionProtected();
}
