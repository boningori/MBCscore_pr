import { describe, it, expect, beforeEach } from 'vitest';
import { consumeLaunchShortcut, parseLaunchShortcut, LAUNCH_SHORTCUT_PARAM } from './launchShortcut';

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

    it('未知の値でもクエリは消す（リロードのたびに解釈を試みても無意味なため）', () => {
        setUrl(`?${LAUNCH_SHORTCUT_PARAM}=bogus`);
        expect(consumeLaunchShortcut()).toBeNull();
        expect(window.location.search).toBe('');
    });
});

// 起動中にlaunchQueueから渡されるtargetURLを解釈するための純粋関数。
// consumeLaunchShortcutと違いURLを書き換えない。
describe('parseLaunchShortcut', () => {
    it.each([
        ['newGame', 'newGame'],
        ['history', 'history'],
        ['playerStats', 'playerStats'],
    ])('?s=%s を遷移先として読む', (value, expected) => {
        expect(parseLaunchShortcut(`https://example.com/MBCscore_pr/?${LAUNCH_SHORTCUT_PARAM}=${value}`)).toBe(expected);
    });

    it('クエリが無ければnull', () => {
        expect(parseLaunchShortcut('https://example.com/MBCscore_pr/')).toBeNull();
    });

    it('未知の値はnull（URLで任意の画面に飛ばさせない）', () => {
        expect(parseLaunchShortcut(`https://example.com/?${LAUNCH_SHORTCUT_PARAM}=settings`)).toBeNull();
    });

    it('解釈できないURLでも例外を投げずnull', () => {
        // launchQueueから渡される値をそのまま受けるため、不正入力で落ちてはいけない
        expect(parseLaunchShortcut('not a url')).toBeNull();
    });

    it('URLを書き換えない（副作用なし）', () => {
        setUrl('?utm_source=qr');
        parseLaunchShortcut(`https://example.com/?${LAUNCH_SHORTCUT_PARAM}=history`);
        expect(window.location.search).toBe('?utm_source=qr');
    });
});
