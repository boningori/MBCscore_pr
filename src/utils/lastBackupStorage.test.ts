import { describe, it, expect, beforeEach } from 'vitest';
import { loadLastBackup, recordBackup, isBackupDue } from './lastBackupStorage';
import { saveGameResult } from './gameHistoryStorage';
import { createTeam } from '../types/game';

function saveOneGame(name: string) {
    const teamA = createTeam('teamA', 'A', 'コーチ');
    const teamB = createTeam('teamB', 'B', 'コーチ');
    saveGameResult(name, teamA, teamB, [], [], []);
}

describe('lastBackupStorage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('試合が1件も無ければ督促しない', () => {
        expect(isBackupDue()).toBe(false);
    });

    it('未記録で試合が1件以上あれば督促する', () => {
        saveOneGame('第1試合');
        expect(loadLastBackup()).toBeNull();
        expect(isBackupDue()).toBe(true);
    });

    it('recordBackup後は督促しない', () => {
        saveOneGame('第1試合');
        recordBackup();
        const info = loadLastBackup();
        expect(info?.gameCount).toBe(1);
        expect(typeof info?.timestamp).toBe('number');
        expect(isBackupDue()).toBe(false);
    });

    it('バックアップ後に試合が増えたら再び督促する', () => {
        saveOneGame('第1試合');
        recordBackup();
        saveOneGame('第2試合');
        expect(isBackupDue()).toBe(true);
    });
});
