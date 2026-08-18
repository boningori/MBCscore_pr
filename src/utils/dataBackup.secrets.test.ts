// 共有されるバックアップに秘密を混ぜない。
//
// バックアップはファイルとして書き出され、Web Share でそのまま他人へ渡せる
// （AppSettingsModal の「バックアップを保存」／History の試合共有）。
// 一方 Gemini の APIキーとローカルエラーログは端末内に置くだけの情報で、
// 渡した相手に見せてよいものではない。
//
// いまは APIキーが独立したキー（mbc_gemini_api_key）に、エラーログが
// mbc_error_log に置かれ、exportAllData はどちらも読んでいないので混ざらない。
// ただし AppSettings に項目を足す変更や、収集をプレフィックス一括に変える
// 変更で、静かに混ざりうる（ミラーバックアップは実際にプレフィックスで
// 一括収集している。あちらは端末内のIndexedDBに閉じるので別扱い）。
// 混ざったことは出力ファイルを開くまで誰も気づけないため、ここで固定する。

import { describe, it, expect, beforeEach } from 'vitest';
import { exportAllData, exportGame, exportTeam } from './dataBackup';
import { logError } from './errorLog';
import type { SavedTeam } from './teamStorage';

const API_KEY = 'AIzaSy-SECRET-TOKEN-must-not-leak';
const ERROR_TEXT = 'SECRET-STACK-must-not-leak';

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mbc_gemini_api_key', API_KEY);
    logError('test', ERROR_TEXT, ERROR_TEXT);
});

const team = (): SavedTeam => ({
    id: 't1', name: 'ホーム', coachName: '', assistantCoachName: '',
    players: [], createdAt: '', updatedAt: '',
} as SavedTeam);

describe('バックアップに秘密を含めない', () => {
    it('全体バックアップにAPIキーが入らない', () => {
        const dumped = JSON.stringify(exportAllData());
        // 空の出力に対して not.toContain が自明に通るのを防ぐ
        expect(dumped).toContain('exportDate');
        expect(dumped.length).toBeGreaterThan(50);
        expect(dumped).not.toContain(API_KEY);
    });

    it('全体バックアップにエラーログが入らない', () => {
        const dumped = JSON.stringify(exportAllData());
        expect(dumped).not.toContain(ERROR_TEXT);
    });

    it('チーム単体の共有にもAPIキーが入らない', () => {
        const dumped = JSON.stringify(exportTeam(team()));
        expect(dumped).not.toContain(API_KEY);
    });

    it('試合単体の共有にもAPIキーが入らない', () => {
        localStorage.setItem('minibasket-game-history', JSON.stringify([{
            id: 'g1', date: '2026-06-01T00:00:00.000Z', gameName: 'テスト',
            teamA: { id: 'teamA', name: 'A', players: [] },
            teamB: { id: 'teamB', name: 'B', players: [] },
            finalScore: { teamA: 0, teamB: 0 },
            scoreHistory: [], statHistory: [], foulHistory: [],
            createdAt: '2026-06-01T10:00:00.000Z',
        }]));

        const dumped = JSON.stringify(exportGame('g1'));
        expect(dumped).not.toContain(API_KEY);
    });

    it('アプリ設定にAPIキーを持たせていない（混入経路を塞いでいることの確認）', () => {
        const settings = exportAllData().data.settings;
        expect(JSON.stringify(settings ?? {})).not.toContain(API_KEY);
        expect(Object.keys(settings ?? {})).not.toContain('apiKey');
    });
});
