import { describe, it, expect, beforeEach } from 'vitest';
import { consumeLaunchShortcut, LAUNCH_SHORTCUT_PARAM } from './launchShortcut';

// manifestのshortcutsは start_url にクエリを付けて起動する。
// このアプリはURLルーティングを持たず画面をstateで持つため、
// 起動時に一度だけクエリを読んで初期画面を決める。

function setUrl(search: string) {
    window.history.replaceState({}, '', `/MBCscore_pr/${search}`);
}

beforeEach(() => {
    setUrl('');
});

describe('consumeLaunchShortcut', () => {
    it('クエリが無ければnull', () => {
        expect(consumeLaunchShortcut()).toBeNull();
    });

    it.each([
        ['newGame', 'newGame'],
        ['history', 'history'],
        ['playerStats', 'playerStats'],
    ])('?%s を遷移先として読む', (value, expected) => {
        setUrl(`?${LAUNCH_SHORTCUT_PARAM}=${value}`);
        expect(consumeLaunchShortcut()).toBe(expected);
    });

    it('未知の値はnull（不正なURLで変な画面に飛ばさない）', () => {
        setUrl(`?${LAUNCH_SHORTCUT_PARAM}=../../etc/passwd`);
        expect(consumeLaunchShortcut()).toBeNull();
    });

    it('読み取ったらURLからクエリを消す', () => {
        // 消さないとリロードのたびにショートカット先へ飛ばされる
        setUrl(`?${LAUNCH_SHORTCUT_PARAM}=history`);
        consumeLaunchShortcut();
        expect(window.location.search).toBe('');
    });

    it('二度目はnullを返す', () => {
        setUrl(`?${LAUNCH_SHORTCUT_PARAM}=history`);
        expect(consumeLaunchShortcut()).toBe('history');
        expect(consumeLaunchShortcut()).toBeNull();
    });

    it('他のクエリは残す', () => {
        setUrl(`?utm_source=qr&${LAUNCH_SHORTCUT_PARAM}=history`);
        consumeLaunchShortcut();
        expect(window.location.search).toBe('?utm_source=qr');
    });
});
