// サイトデータが消えたあと、復元プロンプトが出ること。
//
// 以前は「アプリのキーが1つでもあるか」で判定していたため、アプリが自分で
// 書き戻すキー（自動保存のセッション・心拍の印・エラーログ）が1つでも
// 復活するとプロンプトが出なかった。IndexedDB に完全な控えがあるのに、
// 利用者は何も案内されないまま履歴もチームも失う。

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import App from './App';
import { saveSnapshot } from './utils/mirrorBackup';

/** アプリが自分で書き戻すキーだけを置く（消去直後の実際の姿） */
function onlySelfWrittenKeys() {
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game: { phase: 'playing' }, gameName: '第1節', date: '2026-04-10',
        savedAt: new Date().toISOString(),
    }));
    localStorage.setItem('minibasket-session-owner', JSON.stringify({ id: 't', at: Date.now() }));
    localStorage.setItem('mbc_error_log', JSON.stringify([{ message: 'x' }]));
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
});
afterEach(cleanup);

describe('データ消失後の復元プロンプト', () => {
    it('アプリが書き戻したキーしか無ければ、控えから戻すか尋ねる', async () => {
        // 控えを作る（このときはデータがある）
        localStorage.setItem('minibasket-my-teams', '[{"id":"t1","name":"テスト"}]');
        expect(await saveSnapshot('startup')).toBe(true);

        // サイトデータ消去を模し、アプリが書き戻す分だけ戻す
        localStorage.clear();
        onlySelfWrittenKeys();

        render(<App />);

        expect(await screen.findByRole('heading', { name: /以前のデータが見つかりました/ })).toBeTruthy();
    });

    it('試合履歴が残っていれば尋ねない', async () => {
        localStorage.setItem('minibasket-my-teams', '[{"id":"t1","name":"テスト"}]');
        expect(await saveSnapshot('startup')).toBe(true);

        onlySelfWrittenKeys();
        localStorage.setItem('minibasket-game-history', '[{"id":"g1"}]');

        render(<App />);

        await waitFor(() => expect(screen.queryByRole('heading', { name: /以前のデータが見つかりました/ })).toBeNull());
    });
});
