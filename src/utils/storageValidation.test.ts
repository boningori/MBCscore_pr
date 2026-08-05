import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { loadMyTeams, loadOpponents, loadRecentOpponents } from './teamStorage';
import { loadGameHistory } from './gameHistoryStorage';

// localStorageの中身は「JSONとして読めるが形が違う」状態になりうる。
// 旧バージョンの形が残る、別アプリとキーが衝突する、利用者が
// バックアップJSONを手で編集して取り込む、など。
// 配列を期待している所に配列以外が入ると、最初の .map で画面が落ちる。
// 読み込みの時点で捨てて、記録を続けられる状態を保つ。

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    localStorage.clear();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
});

afterEach(() => {
    warn.mockRestore();
    vi.clearAllMocks();
});

const loaders: [string, string, () => unknown[]][] = [
    ['マイチーム', 'minibasket-my-teams', loadMyTeams],
    ['対戦チーム', 'minibasket-saved-opponents', loadOpponents],
    ['最近の対戦相手', 'minibasket-opponent-teams', loadRecentOpponents],
    ['試合履歴', 'minibasket-game-history', loadGameHistory],
];

describe('中断した試合セッションの読み込み', () => {
    it('gameを持たない形なら「中断中の試合なし」として扱う', async () => {
        // 復元直後に game を触るため、ここが欠けていると再開した瞬間に落ちる
        localStorage.setItem('minibasket-game-session', '{"gameName":"x","date":"2026-01-01"}');
        const { loadGameSession } = await import('./gameSessionStorage');
        expect(loadGameSession()).toBeNull();
    });

    it('配列が入っていても「中断中の試合なし」として扱う', async () => {
        localStorage.setItem('minibasket-game-session', '[]');
        const { loadGameSession } = await import('./gameSessionStorage');
        expect(loadGameSession()).toBeNull();
    });
});

describe('非表示選手の読み込み', () => {
    it('配列が入っていたら空として扱う', async () => {
        localStorage.setItem('minibasket-hidden-players', '["a"]');
        const { loadHiddenPlayers } = await import('./playerStatsAnalysis');
        expect(loadHiddenPlayers('team-1')).toEqual([]);
    });
});

describe.each(loaders)('%s の読み込み', (_label, key, load) => {
    it('配列でないものが入っていたら空として扱う', () => {
        localStorage.setItem(key, '{"oops":true}');
        expect(load()).toEqual([]);
    });

    it('JSONのnullが入っていたら空として扱う', () => {
        localStorage.setItem(key, 'null');
        expect(load()).toEqual([]);
    });

    it('文字列が入っていたら空として扱う', () => {
        localStorage.setItem(key, '"こわれた"');
        expect(load()).toEqual([]);
    });

    it('正しい配列はそのまま読める', () => {
        localStorage.setItem(key, '[]');
        expect(load()).toEqual([]);
    });
});
