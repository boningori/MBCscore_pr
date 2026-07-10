import { describe, it, expect, beforeEach } from 'vitest';
import { exportAllData, parseImportJSON, executeImport, escapeCsvCell } from './dataBackup';
import { saveMyTeam, loadMyTeams } from './teamStorage';
import type { SavedTeam } from './teamStorage';
import { saveGameResult, loadGameHistory } from './gameHistoryStorage';
import { createTeam, createPlayer } from '../types/game';
import { saveRecentOpponent, loadRecentOpponents } from './teamStorage';
import { saveGameSession, loadGameSession, hasGameSession } from './gameSessionStorage';
import { createInitialGame } from '../types/game';

function makeSavedTeam(id: string, name: string): SavedTeam {
    return {
        id,
        name,
        coachName: 'コーチ',
        assistantCoachName: '',
        players: [
            { number: 4, name: '選手A', isCaptain: true },
            { number: 5, name: '選手B', isCaptain: false },
        ],
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
    };
}

describe('dataBackup 往復整合性', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('全データをエクスポート→全消去→インポートで復元できる', () => {
        saveMyTeam(makeSavedTeam('team-1', 'マイチーム'));
        const teamA = createTeam('teamA', 'マイチーム', 'コーチ');
        teamA.players = [createPlayer('teamA-player-0', 4, '選手A', true)];
        const teamB = createTeam('teamB', '相手チーム', '相手コーチ');
        saveGameResult('テスト大会', teamA, teamB, [], [], []);

        const json = JSON.stringify(exportAllData());

        localStorage.clear();
        expect(loadMyTeams()).toHaveLength(0);
        expect(loadGameHistory()).toHaveLength(0);

        const parsed = parseImportJSON(json);
        expect(parsed.type).toBe('backup');
        const result = executeImport(parsed);
        expect(result.success).toBe(true);

        const teams = loadMyTeams();
        expect(teams).toHaveLength(1);
        expect(teams[0].name).toBe('マイチーム');
        expect(teams[0].players).toHaveLength(2);

        const history = loadGameHistory();
        expect(history).toHaveLength(1);
        expect(history[0].gameName).toBe('テスト大会');
    });

    it('バージョン情報のないJSONはunknownとして拒否される', () => {
        expect(parseImportJSON('{"foo": 1}').type).toBe('unknown');
        expect(parseImportJSON('こわれたJSON').type).toBe('unknown');
    });

    it('unknownデータのインポートは失敗を返す', () => {
        const result = executeImport(parseImportJSON('{"foo": 1}'));
        expect(result.success).toBe(false);
    });
});

describe('インポートのスキーマ検証', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    function backupWith(data: Record<string, unknown>) {
        return JSON.stringify({
            version: '1.0',
            appName: 'MBCscore',
            exportDate: '2026-07-06T00:00:00.000Z',
            data,
        });
    }

    it('players が配列でないチームは空配列に矯正して取り込む（クラッシュ回避）', () => {
        const json = backupWith({
            myTeams: [
                { id: 't1', name: '壊れロスター', players: 'not-an-array', coachName: '', assistantCoachName: '', createdAt: '', updatedAt: '' },
            ],
        });
        const result = executeImport(parseImportJSON(json));
        expect(result.success).toBe(true);

        const teams = loadMyTeams();
        expect(teams).toHaveLength(1);
        expect(Array.isArray(teams[0].players)).toBe(true);
        expect(teams[0].players).toHaveLength(0);
    });

    it('id を欠くチームは取り込まず、errors に報告する', () => {
        const json = backupWith({
            myTeams: [
                { id: 'ok', name: '正常', players: [], coachName: '', assistantCoachName: '', createdAt: '', updatedAt: '' },
                { name: 'ID無し', players: [] },
            ],
        });
        const result = executeImport(parseImportJSON(json));

        const teams = loadMyTeams();
        expect(teams.map(t => t.id)).toEqual(['ok']);
        expect(result.errors && result.errors.length).toBeGreaterThan(0);
    });

    it('チーム内の不正な選手エントリ（非オブジェクト）は除外する', () => {
        const json = backupWith({
            myTeams: [
                {
                    id: 't1', name: 'チーム', coachName: '', assistantCoachName: '', createdAt: '', updatedAt: '',
                    players: [{ number: 4, name: 'A', isCaptain: false }, null, 'ゴミ', { number: 5, name: 'B', isCaptain: false }],
                },
            ],
        });
        executeImport(parseImportJSON(json));

        const teams = loadMyTeams();
        expect(teams[0].players).toHaveLength(2);
        expect(teams[0].players.map(p => p.name)).toEqual(['A', 'B']);
    });

    it('id を欠く試合データはバックアップから取り込まない', () => {
        const json = backupWith({
            gameHistory: [
                { name: 'ID無し試合', teamA: { players: [] }, teamB: { players: [] } },
            ],
        });
        const result = executeImport(parseImportJSON(json));
        expect(loadGameHistory()).toHaveLength(0);
        expect(result.errors && result.errors.length).toBeGreaterThan(0);
    });
});

describe('escapeCsvCell', () => {
    it('通常の値は二重引用符で囲む', () => {
        expect(escapeCsvCell('田中太郎')).toBe('"田中太郎"');
    });

    it('セル内の二重引用符を二重化してエスケープする', () => {
        // 「あだ名"エース"」→ 内部の " を "" にし、全体を "" で囲む
        expect(escapeCsvCell('あだ名"エース"')).toBe('"あだ名""エース"""');
    });

    it('カンマや改行を含む値も引用符内に安全に保持する', () => {
        expect(escapeCsvCell('a,b')).toBe('"a,b"');
        expect(escapeCsvCell('l1\nl2')).toBe('"l1\nl2"');
    });

    it('数式インジェクションを無害化する（=,+,-,@ 始まり）', () => {
        expect(escapeCsvCell('=1+1')).toBe('"\'=1+1"');
        expect(escapeCsvCell('+SUM(A1)')).toBe('"\'+SUM(A1)"');
        expect(escapeCsvCell('-2+3')).toBe('"\'-2+3"');
        expect(escapeCsvCell('@name')).toBe('"\'@name"');
    });

    it('数値や空文字はそのまま引用符で囲む', () => {
        expect(escapeCsvCell('42')).toBe('"42"');
        expect(escapeCsvCell('')).toBe('""');
    });
});

describe('dataBackup 拡張範囲（recentOpponents / gameSession）', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('recentOpponents をエクスポート→全消去→インポートで復元できる', () => {
        saveRecentOpponent(makeSavedTeam('opp-1', '最近の相手'));

        const json = JSON.stringify(exportAllData());
        localStorage.clear();
        expect(loadRecentOpponents()).toHaveLength(0);

        const result = executeImport(parseImportJSON(json));
        expect(result.success).toBe(true);
        expect(loadRecentOpponents().some(t => t.id === 'opp-1')).toBe(true);
    });

    it('gameSession をエクスポート→全消去→インポートで復元できる', () => {
        const game = createInitialGame();
        saveGameSession(game, 'テスト大会', '2026-07-10T00:00:00.000Z');

        const json = JSON.stringify(exportAllData());
        localStorage.clear();
        expect(hasGameSession()).toBe(false);

        executeImport(parseImportJSON(json));
        const restored = loadGameSession();
        expect(restored?.gameName).toBe('テスト大会');
    });

    it('進行中セッションがある場合は gameSession を上書きしない', () => {
        saveGameSession(createInitialGame(), 'バックアップ側', '2026-07-10T00:00:00.000Z');
        const json = JSON.stringify(exportAllData());

        // 端末側に別の進行中セッションがある状態で復元
        saveGameSession(createInitialGame(), '端末側の進行中', '2026-07-11T00:00:00.000Z');
        executeImport(parseImportJSON(json));

        expect(loadGameSession()?.gameName).toBe('端末側の進行中');
    });

    it('version 1.0 の（新フィールドを持たない）バックアップもインポートできる', () => {
        const legacy = {
            version: '1.0',
            exportDate: '2026-07-01T00:00:00.000Z',
            appName: 'MBCscore',
            data: { myTeams: [makeSavedTeam('team-legacy', '旧チーム')] },
        };
        const result = executeImport(parseImportJSON(JSON.stringify(legacy)));
        expect(result.success).toBe(true);
        expect(loadMyTeams().some(t => t.id === 'team-legacy')).toBe(true);
    });
});
