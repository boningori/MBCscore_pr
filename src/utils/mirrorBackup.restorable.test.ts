// 復元プロンプトを出すかどうかの判定。
//
// 以前は「アプリのキーが1つでもあるか」で見ていた。ところがアプリ自身が
// 利用者の操作なしに書き戻すキーが3つある——自動保存のセッション、心拍の印、
// エラーログ。どれか1つでも復活すればプロンプトは二度と出ない。
//
// 実測（Playwright・本番ビルド）: サイトデータを消したあと、6.5秒後には
// minibasket-session-owner だけが復活し、リロードすると pagehide の
// フラッシュが minibasket-game-session も書き戻して、プロンプトは出なかった。
// IndexedDB に完全な控えがあるのに、アプリからは何も案内されない状態になる。
//
// 「アプリのキーがあるか」ではなく「失ったら困るデータがあるか」で見る。

import { describe, it, expect, beforeEach } from 'vitest';
import { hasRestorableUserData } from './mirrorBackup';

beforeEach(() => localStorage.clear());

describe('失ったら困るデータが残っているか', () => {
    it('何も無ければ偽', () => {
        expect(hasRestorableUserData()).toBe(false);
    });

    it('試合履歴があれば真', () => {
        localStorage.setItem('minibasket-game-history', '[{"id":"g1"}]');
        expect(hasRestorableUserData()).toBe(true);
    });

    it('APIキーだけでも真（利用者が入力したもの）', () => {
        localStorage.setItem('mbc_gemini_api_key', 'k');
        expect(hasRestorableUserData()).toBe(true);
    });

    it('アプリが自分で書き戻す3つだけなら偽', () => {
        // これが今回の事故そのもの
        localStorage.setItem('minibasket-game-session', '{"game":{"phase":"playing"}}');
        localStorage.setItem('minibasket-session-owner', '{"id":"t","at":1}');
        localStorage.setItem('mbc_error_log', '[{"message":"x"}]');
        expect(hasRestorableUserData()).toBe(false);
    });

    it('UIの旗と最終バックアップ時刻だけなら偽', () => {
        localStorage.setItem('minibasket-install-guide-dismissed', '1');
        localStorage.setItem('minibasket-last-backup', '{"timestamp":1}');
        expect(hasRestorableUserData()).toBe(false);
    });

    it('中身が空のキーだけなら偽（取り込みの巻き戻しで空が書かれることがある）', () => {
        localStorage.setItem('minibasket-game-history', '[]');
        localStorage.setItem('minibasket-my-teams', '[]');
        localStorage.setItem('minibasket-merged-players', '{}');
        expect(hasRestorableUserData()).toBe(false);
    });

    it('空のキーに混じって中身のあるキーが1つでもあれば真', () => {
        localStorage.setItem('minibasket-game-history', '[]');
        localStorage.setItem('minibasket-my-teams', '[{"id":"t1"}]');
        expect(hasRestorableUserData()).toBe(true);
    });

    it('無関係なキーは数えない', () => {
        localStorage.setItem('unrelated-key', 'x');
        expect(hasRestorableUserData()).toBe(false);
    });
});
