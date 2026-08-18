// ミラーバックアップの収集対象と、使用量計算の集計対象を揃える。
//
// storageUsage.ts は「バックアップ対象と同じ基準（mirrorBackup.ts の
// APP_KEY_PREFIXES と揃える）」と書きながら 'mbc-' を余分に持っており、
// 実際には一致していなかった。いま 'mbc-' で始まる localStorage キーは
// 無いので実害は出ていないが、追加された瞬間に
// 「使用量には数えるのに、端末内バックアップからは漏れる」ことになる。
// 消えて困るのは利用者の記録なので、収集漏れは静かに起きてはいけない。

import { describe, it, expect, beforeEach } from 'vitest';
import { collectAppData, hasAppData } from './mirrorBackup';

beforeEach(() => localStorage.clear());

describe('collectAppData: 収集対象のプレフィックス', () => {
    it('minibasket- を集める', () => {
        localStorage.setItem('minibasket-my-teams', '[]');
        expect(Object.keys(collectAppData())).toContain('minibasket-my-teams');
    });

    it('mbc_ を集める', () => {
        localStorage.setItem('mbc_error_log', '[]');
        expect(Object.keys(collectAppData())).toContain('mbc_error_log');
    });

    it('mbc- を集める（storageUsage が数えている基準に揃える）', () => {
        localStorage.setItem('mbc-future-key', 'x');
        expect(Object.keys(collectAppData())).toContain('mbc-future-key');
    });

    it('無関係なキーは集めない', () => {
        localStorage.setItem('unrelated-key', 'x');
        expect(Object.keys(collectAppData())).not.toContain('unrelated-key');
    });

    it('アプリのキーが1つも無ければデータ無しと判定する', () => {
        localStorage.setItem('unrelated-key', 'x');
        expect(hasAppData()).toBe(false);
    });
});
