// 復元の書き込みが失敗したときの扱い。
//
// restoreSnapshot は try/catch を持たず、RestorePrompt は戻り値も見ずに
// window.location.reload() を呼んでいた。書き込みが途中で失敗すると例外で
// リロードに届かず、画面上は「復元する」を押しても何も起きない。
// しかも一部だけ書けた状態が残るため、次回起動では hasRestorableUserData() が真になり
// 復元プロンプト自体が二度と出ない（やり直せなくなる）。
//
// 復元プロンプトが出るのは「データが消えた」場面で、端末の容量が逼迫して
// いることは十分あり得る。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { restoreSnapshot } from './mirrorBackup';
import type { MirrorSnapshot } from './mirrorBackup';

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
});

const snapshot: MirrorSnapshot = {
    timestamp: 1,
    entries: {
        'minibasket-my-teams': '[{"id":"t1"}]',
        'minibasket-game-history': '[{"id":"g1"}]',
        'minibasket-app-settings': '{"a":1}',
    },
};

describe('restoreSnapshot', () => {
    it('すべて書けたら true を返す', () => {
        expect(restoreSnapshot(snapshot)).toBe(true);
        expect(localStorage.getItem('minibasket-my-teams')).toBe('[{"id":"t1"}]');
        expect(localStorage.getItem('minibasket-app-settings')).toBe('{"a":1}');
    });

    it('途中で書き込みが失敗したら false を返す', () => {
        let calls = 0;
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
            calls++;
            if (calls > 1) throw new DOMException('QuotaExceededError');
            Storage.prototype.getItem.call(this, k);
            Object.defineProperty(this, k, { value: v, configurable: true });
        });

        expect(restoreSnapshot(snapshot)).toBe(false);
    });

    it('失敗したら書けた分を残さない（次回もう一度やり直せる）', () => {
        const real = Storage.prototype.setItem;
        let calls = 0;
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
            calls++;
            if (calls > 1) throw new DOMException('QuotaExceededError');
            real.call(this, k, v);
        });

        restoreSnapshot(snapshot);
        vi.restoreAllMocks();

        // 1件だけ書けた状態が残ると hasRestorableUserData() が真になり復元プロンプトが出なくなる
        expect(localStorage.getItem('minibasket-my-teams')).toBeNull();
    });
});

// 記録中の復元が、進行中の試合を消さないこと。
//
// 実測（Playwright・本番ビルド）: 記録中に控えから戻すと、復元した
// セッションがリロードの pagehide で書き戻され、無言で元へ戻っていた。
// 試合履歴やチームは戻るので、利用者には区別が付かない。
//
// dataBackup の取り込みは「端末に進行中セッションが無い場合のみ復元」と
// 書いて既に守っている。こちらにだけ同じ判断が無かった。
describe('restoreSnapshot と進行中の試合', () => {
    const withSession: MirrorSnapshot = {
        timestamp: 2,
        entries: {
            'minibasket-my-teams': '[{"id":"t1"}]',
            'minibasket-game-session': '{"game":{"phase":"playing"},"gameName":"控えの試合","date":"2026-04-01","savedAt":"2026-04-01T00:00:00.000Z"}',
        },
    };

    /** いま記録中の試合を localStorage に置く */
    function liveGame() {
        localStorage.setItem(
            'minibasket-game-session',
            '{"game":{"phase":"playing"},"gameName":"いまの試合","date":"2026-04-10","savedAt":"2026-04-10T00:00:00.000Z"}',
        );
    }

    it('守るべき試合があるとき、セッションだけ書き換えない', () => {
        liveGame();

        expect(restoreSnapshot(withSession)).toBe(true);
        // 他のキーは戻る
        expect(localStorage.getItem('minibasket-my-teams')).toBe('[{"id":"t1"}]');
        // 進行中の試合はそのまま
        expect(localStorage.getItem('minibasket-game-session')).toContain('いまの試合');
    });

    it('守るべき試合が無ければ、セッションも控えのとおりに戻す', () => {
        expect(restoreSnapshot(withSession)).toBe(true);
        expect(localStorage.getItem('minibasket-game-session')).toContain('控えの試合');
    });

    it('読めないセッションは守らない（正しい控えから戻せる）', () => {
        localStorage.setItem('minibasket-game-session', '{壊れた');
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.spyOn(console, 'error').mockImplementation(() => { });

        expect(restoreSnapshot(withSession)).toBe(true);
        expect(localStorage.getItem('minibasket-game-session')).toContain('控えの試合');
    });
});
