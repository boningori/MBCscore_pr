// manifest の shortcuts（ホーム画面アイコンの長押しメニュー）から起動したときの遷移先。
//
// このアプリはURLルーティングを持たず画面をReactのstateで管理している。
// そのためショートカットは start_url にクエリを付けて起動し、
// 起動時に一度だけここで読み取って初期画面を決める。

export const LAUNCH_SHORTCUT_PARAM = 's';

export const SHORTCUT_TARGETS = ['newGame', 'history', 'playerStats'] as const;

export type ShortcutTarget = (typeof SHORTCUT_TARGETS)[number];

function isShortcutTarget(value: string): value is ShortcutTarget {
    return (SHORTCUT_TARGETS as readonly string[]).includes(value);
}

/**
 * ショートカット起動の遷移先を読み、URLからそのクエリを取り除く。
 *
 * 取り除くのは、残したままだとリロードのたびにショートカット先へ飛ばされ、
 * ホームに戻れなくなるため。他のクエリ（計測用パラメータ等）は残す。
 * 未知の値は null を返し、URLで任意の画面に飛ばせないようにする。
 */
export function consumeLaunchShortcut(): ShortcutTarget | null {
    if (typeof window === 'undefined') return null;

    const url = new URL(window.location.href);
    const value = url.searchParams.get(LAUNCH_SHORTCUT_PARAM);
    if (value === null) return null;

    url.searchParams.delete(LAUNCH_SHORTCUT_PARAM);
    window.history.replaceState(window.history.state, '', url);

    return isShortcutTarget(value) ? value : null;
}
