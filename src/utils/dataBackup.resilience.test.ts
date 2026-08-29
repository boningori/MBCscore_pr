// 手で編集した／途中で切れたバックアップを取り込んでも、アプリが使えなくならないこと。
//
// v1.6.3 で選手ごとの stats について直したのと同じ穴が finalScore に残っていた。
// sanitizeImportedGame は id と teamA/teamB しか見ておらず、読み手（履歴一覧・
// 選手スタッツ分析・CSV出力）はどこも素で record.finalScore.teamA と引いていた。
// 実測: finalScore を落とした1件を取り込むと success:true で保存され、その後
// 「Cannot read properties of undefined (reading 'teamA')」で分析画面と履歴が落ち、
// ErrorBoundary によってアプリ全体がエラー画面に置き換わる。localStorage に残るので
// リロードしても再発し、どのレコードが原因かも示されない。

import { describe, it, expect, beforeEach } from 'vitest';
import {
    executeImport,
    parseImportJSON,
    exportGameHistoryCSV,
    exportGameHistoryDetailCSV,
    generateGameFilename,
    downloadJSON,
    BACKUP_VERSION,
} from './dataBackup';
import { aggregatePlayerStats, getTeamRecord } from './playerStatsAnalysis';
import { loadGameHistory, resolveFinalScore } from './gameHistoryStorage';
import type { SavedTeam } from './teamStorage';

const myTeam: SavedTeam = {
    id: 'mine', name: 'みなみ', coachName: 'C', assistantCoachName: '',
    players: [{ number: 4, name: '佐藤', isCaptain: false }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

/** finalScore を欠いた試合レコード（自チーム6点・相手0点ぶんのスタッツは残っている） */
function gameWithoutFinalScore(overrides: Record<string, unknown> = {}) {
    return {
        id: 'g-broken',
        date: '2026-05-01T00:00:00.000Z',
        gameName: '壊れた記録',
        createdAt: '2026-05-01T10:00:00.000Z',
        teamA: {
            id: 'teamA', name: 'みなみ', isMyTeam: true, savedTeamId: 'mine',
            coachName: 'C', assistantCoachName: '', color: 'white',
            teamFouls: [0, 0, 0, 0], timeouts: [], coachFouls: [], assistantCoachFouls: [], benchFouls: [],
            players: [{
                id: 'p1', number: 4, name: '佐藤', isCaptain: false, isOnCourt: false,
                fouls: [], quartersPlayed: ['starter', 'starter', false, false, 'sub'],
                stats: {
                    points: 6, twoPointMade: 3, twoPointAttempt: 5, threePointMade: 0, threePointAttempt: 0,
                    freeThrowMade: 0, freeThrowAttempt: 0, offensiveRebounds: 1, defensiveRebounds: 2,
                    assists: 1, steals: 0, blocks: 0, turnovers: 0,
                    turnoverDD: 0, turnoverTR: 0, turnoverPM: 0, turnoverCM: 0,
                },
            }],
        },
        teamB: {
            id: 'teamB', name: 'きた', coachName: 'C', assistantCoachName: '', color: 'blue',
            teamFouls: [0, 0, 0, 0], timeouts: [], coachFouls: [], assistantCoachFouls: [], benchFouls: [],
            players: [],
        },
        ...overrides,
    };
}

function importBackupWith(games: unknown[]) {
    const backup = {
        version: BACKUP_VERSION,
        exportDate: '2026-05-02T00:00:00.000Z',
        appName: 'MBCscore',
        data: { gameHistory: games },
    };
    return executeImport(parseImportJSON(JSON.stringify(backup)));
}

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
});

describe('finalScore を欠く試合レコード', () => {
    it('取り込む時点で選手スタッツから組み直す', () => {
        expect(importBackupWith([gameWithoutFinalScore()]).success).toBe(true);

        // 0で埋めない。saveGameResult と同じ「選手の points の合計」に戻す
        expect(loadGameHistory()[0].finalScore).toEqual({ teamA: 6, teamB: 0 });
    });

    it('取り込んだあとも選手スタッツ分析が落ちない', () => {
        importBackupWith([gameWithoutFinalScore()]);

        const stats = aggregatePlayerStats(myTeam);
        expect(stats).toHaveLength(1);
        expect(stats[0].gameHistory[0].result).toBe('win');
        expect(getTeamRecord(myTeam)).toMatchObject({ wins: 1, losses: 0, totalGames: 1 });
    });

    // 取り込み側を塞いでも、この修正より前に保存されてしまったレコードは残る。
    // 読み側でも同じ既定へ寄せる（migrateTeam と同じ考え方）
    it('すでに保存されているレコードでも、読み側が組み直して落ちない', () => {
        localStorage.setItem('minibasket-game-history', JSON.stringify([gameWithoutFinalScore()]));

        expect(() => aggregatePlayerStats(myTeam)).not.toThrow();
        expect(() => getTeamRecord(myTeam)).not.toThrow();
        expect(aggregatePlayerStats(myTeam)[0].gameHistory[0].teamScore).toBe(6);
    });

    it('CSV出力も落ちず、組み直したスコアで書き出す', () => {
        localStorage.setItem('minibasket-game-history', JSON.stringify([gameWithoutFinalScore()]));

        const summary = exportGameHistoryCSV();
        expect(summary).toContain('"6"');
        expect(() => exportGameHistoryDetailCSV()).not.toThrow();
    });

    it('finalScore が入っていればそのまま使う（勝手に組み直さない）', () => {
        // 保留アクションが残ったまま終えた試合など、合計と一致しないこともある
        const record = gameWithoutFinalScore({ finalScore: { teamA: 8, teamB: 3 } });
        expect(resolveFinalScore(record as never)).toEqual({ teamA: 8, teamB: 3 });
    });
});

describe('壊れた日付の試合をエクスポートする', () => {
    // 履歴の handleExportGame は try/catch を持たない。ここで投げると
    // 共有ボタンが何も言わずに無反応になる（実測: Invalid time value）
    it('日付が読めなくてもファイル名生成が例外を投げない', () => {
        expect(() => generateGameFilename('練習試合', 'not-a-date')).not.toThrow();
        expect(generateGameFilename('練習試合', 'not-a-date')).toBe('MBCscore_game_練習試合.json');
    });

    it('読める日付は記録された暦日をそのまま使う', () => {
        expect(generateGameFilename('冬季大会', '2026-05-01T00:00:00.000Z'))
            .toBe('MBCscore_game_冬季大会_2026-05-01.json');
    });
});

describe('ファイルへ書き出すJSONは整形しない', () => {
    // 整形するとインデントだけでサイズがほぼ倍になり、取り込み側の10MB上限
    // （parseImportFile）に達するのが端末の保存上限より先に来かねない
    it('downloadJSON の中身に余分な空白が入らない', async () => {
        const blobs: Blob[] = [];
        const origCreate = URL.createObjectURL;
        const origRevoke = URL.revokeObjectURL;
        URL.createObjectURL = (b: Blob) => { blobs.push(b); return 'blob:test'; };
        URL.revokeObjectURL = () => { };
        try {
            downloadJSON({ a: 1, b: [2, 3] }, 'x.json');
        } finally {
            URL.createObjectURL = origCreate;
            URL.revokeObjectURL = origRevoke;
        }

        expect(await blobs[0].text()).toBe('{"a":1,"b":[2,3]}');
    });
});

describe('詳細CSVの延長出場', () => {
    it('延長に出た記録が「延長出場」列に残る', () => {
        localStorage.setItem('minibasket-game-history', JSON.stringify([gameWithoutFinalScore()]));

        const csv = exportGameHistoryDetailCSV();
        const [header, ...rows] = csv.replace('﻿', '').split('\n');
        const columns = header.split(',');
        expect(columns[columns.length - 1]).toBe('延長出場');

        // quartersPlayed の5枠目（OT1）に 'sub' が入っている
        expect(rows[0]).toContain('"OT1:途中出場"');
    });

    it('延長に出ていなければ空欄', () => {
        const noOt = gameWithoutFinalScore();
        noOt.teamA.players[0].quartersPlayed = ['starter', 'starter', false, false];
        localStorage.setItem('minibasket-game-history', JSON.stringify([noOt]));

        const rows = exportGameHistoryDetailCSV().replace('﻿', '').split('\n');
        expect(rows[1].endsWith('""')).toBe(true);
        expect(rows[1]).not.toContain('OT1');
    });
});
