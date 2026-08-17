// 単体インポートの保存が createJsonStorage を通っていなかった。
//
// 試合1件・チーム1件のインポートは localStorage.setItem を直接呼んでいたため、
// 容量超過を検知して STORAGE_ERROR_EVENT を投げる仕組み（createStorage）を
// 素通りしていた。App はこのイベントを聞いて「設定画面からバックアップを
// 保存してください」と案内するので、インポートで容量が尽きたときだけ
// その導線が出ない。
//
// 全体復元（importFullBackup）は7つのキーをまとめて書き、失敗したら
// 巻き戻す独自の仕組みを持つ。あちらは全部入るか何も変わらないかの
// 保証が要るため、この統一の対象外。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { executeImport } from './dataBackup';
import type { GameExportData, TeamExportData } from './dataBackup';
import { STORAGE_ERROR_EVENT } from './storageError';

const gameData: GameExportData = {
    type: 'game', version: '2.0', exportDate: new Date().toISOString(),
    game: {
        id: 'g1', date: new Date().toISOString(), gameName: '第1節',
        teamA: { id: 'teamA', name: 'A' }, teamB: { id: 'teamB', name: 'B' },
        finalScore: { teamA: 10, teamB: 8 },
        scoreHistory: [], statHistory: [], foulHistory: [],
        createdAt: new Date().toISOString(),
    } as unknown as GameExportData['game'],
};

const teamData: TeamExportData = {
    type: 'team', version: '2.0', exportDate: new Date().toISOString(),
    team: {
        id: 't1', name: 'レッドミニバス', coachName: 'C', assistantCoachName: '',
        players: [{ number: 4, name: '選手4', isCaptain: true }],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as unknown as TeamExportData['team'],
};

/** 保存失敗の通知を捕まえる */
function captureStorageErrors(): { count: () => number; stop: () => void } {
    let count = 0;
    const handler = () => { count += 1; };
    window.addEventListener(STORAGE_ERROR_EVENT, handler);
    return { count: () => count, stop: () => window.removeEventListener(STORAGE_ERROR_EVENT, handler) };
}

function failWrites() {
    vi.spyOn(console, 'error').mockImplementation(() => { });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
    });
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('単体インポートの保存失敗', () => {
    it('試合のインポートが失敗したら保存失敗として通知する', () => {
        const errors = captureStorageErrors();
        failWrites();

        const result = executeImport({ type: 'game', data: gameData, summary: '' });

        expect(result.success).toBe(false);
        expect(errors.count()).toBeGreaterThan(0);
        errors.stop();
    });

    it('マイチームのインポートが失敗したら保存失敗として通知する', () => {
        const errors = captureStorageErrors();
        failWrites();

        const result = executeImport({ type: 'team', data: teamData, summary: '' }, { teamTarget: 'myTeam' });

        expect(result.success).toBe(false);
        expect(errors.count()).toBeGreaterThan(0);
        errors.stop();
    });

    it('対戦チームのインポートが失敗したら保存失敗として通知する', () => {
        const errors = captureStorageErrors();
        failWrites();

        const result = executeImport({ type: 'team', data: teamData, summary: '' }, { teamTarget: 'opponent' });

        expect(result.success).toBe(false);
        expect(errors.count()).toBeGreaterThan(0);
        errors.stop();
    });
});

describe('単体インポートの成功', () => {
    it('試合を取り込めば履歴に入る', () => {
        const result = executeImport({ type: 'game', data: gameData, summary: '' });

        expect(result.success).toBe(true);
        expect(JSON.parse(localStorage.getItem('minibasket-game-history') ?? '[]')).toHaveLength(1);
    });

    it('マイチームを取り込めば一覧に入る', () => {
        const result = executeImport({ type: 'team', data: teamData, summary: '' }, { teamTarget: 'myTeam' });

        expect(result.success).toBe(true);
        expect(JSON.parse(localStorage.getItem('minibasket-my-teams') ?? '[]')).toHaveLength(1);
    });

    it('対戦チームを取り込めば一覧に入る', () => {
        const result = executeImport({ type: 'team', data: teamData, summary: '' }, { teamTarget: 'opponent' });

        expect(result.success).toBe(true);
        expect(JSON.parse(localStorage.getItem('minibasket-saved-opponents') ?? '[]')).toHaveLength(1);
    });
});
