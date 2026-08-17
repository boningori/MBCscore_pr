import { describe, it, expect, beforeEach } from 'vitest';
import { exportGameHistoryCSV } from './dataBackup';
import { saveGameResult } from './gameHistoryStorage';
import { createTeam, createPlayer } from '../types/game';
import type { Team } from '../types/game';

// 試合履歴CSVの「自チーム／相手／結果」は teamA(白) 固定で出していた。
// マイチームの色に「青」を選ぶと buildMatchTeams はマイチームを teamB に置くため、
// 勝った試合が「敗北」として書き出されていた。

function makeTeam(id: 'teamA' | 'teamB', name: string, points: number, isMyTeam: boolean): Team {
    const team = createTeam(id, name, 'コーチ');
    const player = createPlayer(`${id}-p0`, 4, '選手', true);
    player.stats.points = points;
    team.players = [player];
    team.isMyTeam = isMyTeam;
    return team;
}

/** ヘッダー行と最初のデータ行を、列ごとの対応表にして返す */
function firstRow(csv: string): Record<string, string> {
    // 先頭のBOM（Excel対策で付けている）を落としてから列に割る。
    // ソースには生のBOMを置かずエスケープで書く（見えない文字は事故のもと）
    const [header, row] = csv.replace(/^\uFEFF/, '').split('\n');
    const cells = (line: string) =>
        line.split(',').map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"'));
    const keys = cells(header);
    const values = cells(row);
    return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
}

describe('exportGameHistoryCSV: 自チームの向き', () => {
    beforeEach(() => localStorage.clear());

    it('マイチームが白(teamA)なら、そのまま自チームとして出る', () => {
        saveGameResult(
            'テスト大会',
            makeTeam('teamA', 'マイチーム', 30, true),
            makeTeam('teamB', '相手チーム', 20, false),
            [], [], [],
        );

        const row = firstRow(exportGameHistoryCSV());
        expect(row['自チーム']).toBe('マイチーム');
        expect(row['対戦相手']).toBe('相手チーム');
        expect(row['自チーム得点']).toBe('30');
        expect(row['相手得点']).toBe('20');
        expect(row['結果']).toBe('勝利');
    });

    it('マイチームが青(teamB)でも、自チーム側から見た列と結果になる', () => {
        saveGameResult(
            'テスト大会',
            makeTeam('teamA', '相手チーム', 20, false),
            makeTeam('teamB', 'マイチーム', 30, true),
            [], [], [],
        );

        const row = firstRow(exportGameHistoryCSV());
        expect(row['自チーム']).toBe('マイチーム');
        expect(row['対戦相手']).toBe('相手チーム');
        expect(row['自チーム得点']).toBe('30');
        expect(row['相手得点']).toBe('20');
        expect(row['結果']).toBe('勝利');
    });

    it('どちらにも isMyTeam が無い旧データは従来どおり teamA を左に置く', () => {
        const teamA = makeTeam('teamA', 'Aチーム', 20, false);
        const teamB = makeTeam('teamB', 'Bチーム', 30, false);
        delete teamA.isMyTeam;
        delete teamB.isMyTeam;
        saveGameResult('テスト大会', teamA, teamB, [], [], []);

        const row = firstRow(exportGameHistoryCSV());
        expect(row['自チーム']).toBe('Aチーム');
        expect(row['結果']).toBe('敗北');
    });
});
