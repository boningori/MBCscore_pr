import { describe, it, expect, beforeEach } from 'vitest';
import { exportAllData, parseImportJSON, executeImport } from './dataBackup';
import { saveMyTeam, loadMyTeams } from './teamStorage';
import type { SavedTeam } from './teamStorage';
import { saveGameResult, loadGameHistory } from './gameHistoryStorage';
import { createTeam, createPlayer } from '../types/game';

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
