import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { exportAllData, parseImportJSON, executeImport, escapeCsvCell, shareBackup, shareFile, generateBackupFilename } from './dataBackup';
import { saveMyTeam, loadMyTeams } from './teamStorage';
import type { SavedTeam } from './teamStorage';
import { saveGameResult, loadGameHistory } from './gameHistoryStorage';
import { createTeam, createPlayer } from '../types/game';
import { saveRecentOpponent, loadRecentOpponents } from './teamStorage';
import { saveGameSession, loadGameSession, hasGameSession } from './gameSessionStorage';
import { createInitialGame } from '../types/game';
import { loadLastBackup } from './lastBackupStorage';
import { isVoiceMemoEnabled, hasVoiceMemoConsent, loadAppSettings } from './appSettings';

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

describe('バックアップ復元は音声メモの同意を持ち込まない（同意は端末単位）', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('バックアップ側がON・同意済みでも、真っさらな端末はOFF・未同意のまま復元される', () => {
        const backup = {
            version: '2.0',
            exportDate: '2026-08-24T00:00:00.000Z',
            appName: 'MBCscore',
            data: {
                settings: {
                    defaultGameMode: 'full',
                    voiceMemoEnabled: true,
                    voiceMemoConsented: true,
                },
            },
        };
        const parsed = parseImportJSON(JSON.stringify(backup));
        expect(parsed.type).toBe('backup');
        const result = executeImport(parsed);
        expect(result.success).toBe(true);

        // 同意ダイアログを見ていない端末が、他端末のバックアップ復元だけで
        // 音声を外部送信できる状態になってはならない
        expect(isVoiceMemoEnabled()).toBe(false);
        expect(hasVoiceMemoConsent()).toBe(false);
    });

    it('設定の形が想定と違っても（型崩れ・余計なキー）、音声メモのフラグは持ち込まれない', () => {
        const backup = {
            version: '2.0',
            exportDate: '2026-08-24T00:00:00.000Z',
            appName: 'MBCscore',
            data: {
                settings: {
                    voiceMemoEnabled: 'true',
                    voiceMemoConsented: 1,
                    unknownField: 'x',
                },
            },
        };
        const parsed = parseImportJSON(JSON.stringify(backup));
        const result = executeImport(parsed);
        expect(result.success).toBe(true);

        expect(isVoiceMemoEnabled()).toBe(false);
        expect(hasVoiceMemoConsent()).toBe(false);
    });

    it('既にONで同意済みの端末では、その状態を維持する（バックアップに引きずられて消えない）', () => {
        localStorage.setItem('minibasket-app-settings', JSON.stringify({ voiceMemoEnabled: true, voiceMemoConsented: true }));
        const backup = {
            version: '2.0',
            exportDate: '2026-08-24T00:00:00.000Z',
            appName: 'MBCscore',
            data: {
                settings: { defaultGameMode: 'simple', voiceMemoEnabled: false, voiceMemoConsented: false },
            },
        };
        const parsed = parseImportJSON(JSON.stringify(backup));
        const result = executeImport(parsed);
        expect(result.success).toBe(true);

        expect(isVoiceMemoEnabled()).toBe(true);
        expect(hasVoiceMemoConsent()).toBe(true);
        // 他の設定（defaultGameMode）は除外対象ではなく、バックアップ通りに反映される
        expect(loadAppSettings().defaultGameMode).toBe('simple');
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

describe('重複IDを含む旧バックアップの復元（救済）', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    // 旧バージョンが書き出した、同日の試合が同一IDになっているバックアップ
    function legacyGame(gameName: string, dateStr: string, createdAt: string) {
        return {
            id: `game-${new Date(dateStr).getTime()}`,
            date: new Date(dateStr).toISOString(),
            gameName,
            createdAt,
            teamA: { name: 'マイチーム', players: [] },
            teamB: { name: gameName, players: [] },
            finalScore: { teamA: 10, teamB: 8 },
            scoreHistory: [], statHistory: [], foulHistory: [],
        };
    }

    function legacyBackupJson() {
        return JSON.stringify({
            version: '2.0',
            appName: 'MBCscore',
            exportDate: '2026-07-06T00:00:00.000Z',
            data: {
                gameHistory: [
                    legacyGame('2日目 第1試合', '2026-07-05', '2026-07-05T02:00:00.000Z'),
                    legacyGame('2日目 第2試合', '2026-07-05', '2026-07-05T04:00:00.000Z'),
                    legacyGame('1日目 第1試合', '2026-07-04', '2026-07-04T02:00:00.000Z'),
                    legacyGame('1日目 第2試合', '2026-07-04', '2026-07-04T04:00:00.000Z'),
                ],
            },
        });
    }

    it('IDが重複した4試合を、新しい端末に4試合とも復元する', () => {
        const result = executeImport(parseImportJSON(legacyBackupJson()));

        expect(result.success).toBe(true);
        const history = loadGameHistory();
        expect(history).toHaveLength(4);
        expect(history.map(g => g.gameName).sort()).toEqual([
            '1日目 第1試合', '1日目 第2試合', '2日目 第1試合', '2日目 第2試合',
        ]);
        expect(new Set(history.map(g => g.id)).size).toBe(4);
    });

    it('同じバックアップを2回復元しても試合が増えない', () => {
        executeImport(parseImportJSON(legacyBackupJson()));
        const idsAfterFirst = loadGameHistory().map(g => g.id);

        executeImport(parseImportJSON(legacyBackupJson()));

        const history = loadGameHistory();
        expect(history).toHaveLength(4);
        expect(history.map(g => g.id)).toEqual(idsAfterFirst);
    });

    it('復元件数の内訳が実際の取り込み結果と一致する', () => {
        const parsed = parseImportJSON(legacyBackupJson());
        expect(parsed.preview).toContain('試合: 新規4件');

        const result = executeImport(parsed);
        expect(result.details?.newGames).toBe(4);
        expect(result.details?.updatedGames).toBe(0);
    });

    it('復元済みの端末に同じファイルを読み込むと全件が更新扱いになる', () => {
        executeImport(parseImportJSON(legacyBackupJson()));

        const parsed = parseImportJSON(legacyBackupJson());
        expect(parsed.preview).toContain('試合: 新規0件、上書き4件');

        const result = executeImport(parsed);
        expect(result.details?.updatedGames).toBe(4);
        expect(result.details?.newGames).toBe(0);
    });

    it('取り込んだ単一試合は履歴の先頭に入る', () => {
        executeImport(parseImportJSON(legacyBackupJson()));

        const singleGame = JSON.stringify({
            type: 'game',
            version: '2.0',
            exportDate: '2026-07-06T00:00:00.000Z',
            game: legacyGame('2日目 第3試合', '2026-07-05', '2026-07-05T06:00:00.000Z'),
        });
        executeImport(parseImportJSON(singleGame));

        expect(loadGameHistory()[0].gameName).toBe('2日目 第3試合');
    });

    it('復元に失敗して2試合しか入っていない端末でも、読み直せば4試合に復旧する', () => {
        // 修正前の挙動を再現: IDで名寄せされて2試合だけが残っている状態
        const collapsed = JSON.parse(legacyBackupJson()).data.gameHistory
            .filter((_: unknown, i: number) => i === 1 || i === 3);
        localStorage.setItem('minibasket-game-history', JSON.stringify(collapsed));
        expect(loadGameHistory()).toHaveLength(2);

        const result = executeImport(parseImportJSON(legacyBackupJson()));

        expect(result.success).toBe(true);
        const history = loadGameHistory();
        expect(history).toHaveLength(4);
        expect(history.map(g => g.gameName).sort()).toEqual([
            '1日目 第1試合', '1日目 第2試合', '2日目 第1試合', '2日目 第2試合',
        ]);
    });

    it('単一試合エクスポートの取り込みが同日の別試合を上書きしない', () => {
        executeImport(parseImportJSON(legacyBackupJson()));
        const before = loadGameHistory();

        const singleGame = JSON.stringify({
            type: 'game',
            version: '2.0',
            exportDate: '2026-07-06T00:00:00.000Z',
            game: legacyGame('2日目 第3試合', '2026-07-05', '2026-07-05T06:00:00.000Z'),
        });
        const result = executeImport(parseImportJSON(singleGame));

        expect(result.success).toBe(true);
        const after = loadGameHistory();
        expect(after).toHaveLength(before.length + 1);
        expect(after.map(g => g.gameName)).toContain('2日目 第2試合');
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

    it('gameSession.game.teamA.players が配列でなくてもクラッシュせずに空配列へ矯正して取り込む', () => {
        const game = createInitialGame();
        const brokenSession = {
            game: { ...game, teamA: { ...game.teamA, players: null }, teamB: { ...game.teamB, players: 'ゴミ' } },
            gameName: '壊れセッション',
            date: '2026-07-10T00:00:00.000Z',
            savedAt: '2026-07-10T00:00:00.000Z',
        };
        const json = JSON.stringify({
            version: '2.0',
            exportDate: '2026-07-10T00:00:00.000Z',
            appName: 'MBCscore',
            data: { gameSession: brokenSession },
        });

        expect(() => executeImport(parseImportJSON(json))).not.toThrow();

        const restored = loadGameSession();
        expect(restored?.game.teamA.players).toEqual([]);
        expect(restored?.game.teamB.players).toEqual([]);
    });

    it('バックアップに gameSession が含まれる場合、プレビューに進行中の試合が復元される旨を表示する', () => {
        const session = {
            game: createInitialGame(),
            gameName: 'X',
            date: '2026-07-10T00:00:00.000Z',
            savedAt: '2026-07-10T00:00:00.000Z',
        };
        const json = JSON.stringify({
            version: '2.0',
            exportDate: '2026-07-10T00:00:00.000Z',
            appName: 'MBCscore',
            data: { gameSession: session },
        });

        const parsed = parseImportJSON(json);
        expect(parsed.preview?.some(l => l.includes('進行中の試合'))).toBe(true);
    });

    it('recentOpponents は updatedAt の新しい順にマージされ、端末側・バックアップ側の両方が保持される', () => {
        // saveRecentOpponent は保存時に updatedAt を現在時刻へ上書きするため、
        // updatedAt を明示的に制御するには localStorage へ直接書き込む
        const older = { ...makeSavedTeam('opp-old', '端末側の相手'), updatedAt: '2026-07-01T00:00:00.000Z' };
        localStorage.setItem('minibasket-opponent-teams', JSON.stringify([older]));

        const newer = { ...makeSavedTeam('opp-new', 'バックアップ側の相手'), updatedAt: '2099-01-01T00:00:00.000Z' };
        const json = JSON.stringify({
            version: '2.0',
            exportDate: '2026-07-10T00:00:00.000Z',
            appName: 'MBCscore',
            data: { recentOpponents: [newer] },
        });

        executeImport(parseImportJSON(json));

        const recent = loadRecentOpponents();
        const ids = recent.map(t => t.id);
        expect(ids).toContain('opp-old');
        expect(ids).toContain('opp-new');
        expect(ids.indexOf('opp-new')).toBeLessThan(ids.indexOf('opp-old'));
    });
});

describe('shareBackup', () => {
    beforeEach(() => {
        localStorage.clear();
    });
    afterEach(() => {
        vi.restoreAllMocks();
        // テストで差し込んだ navigator.share を除去
        delete (navigator as unknown as { share?: unknown }).share;
    });

    it('Web Share非対応時はダウンロードで保存し、最終バックアップを記録する', async () => {
        const teamA = createTeam('teamA', 'A', 'コーチ');
        const teamB = createTeam('teamB', 'B', 'コーチ');
        saveGameResult('第1試合', teamA, teamB, [], [], []);

        // jsdomにはURL.createObjectURL等が無いためダウンロード経路をスタブ
        const createEl = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
            const el = createEl(tag);
            if (tag === 'a') el.click = () => {};
            return el as HTMLElement;
        });
        URL.createObjectURL = () => 'blob:mock';
        URL.revokeObjectURL = () => {};

        const ok = await shareBackup();
        expect(ok).toBe(true);
        expect(loadLastBackup()?.gameCount).toBe(1);
    });

    it('Web Share成功時はダウンロードせず記録する', async () => {
        const teamA = createTeam('teamA', 'A', 'コーチ');
        const teamB = createTeam('teamB', 'B', 'コーチ');
        saveGameResult('第1試合', teamA, teamB, [], [], []);

        // navigator.share を成功するモックに
        navigator.share = vi.fn().mockResolvedValue(undefined);
        const downloadSpy = vi.spyOn(URL, 'createObjectURL');

        const ok = await shareBackup();
        expect(ok).toBe(true);
        expect(loadLastBackup()?.gameCount).toBe(1);
        expect(downloadSpy).not.toHaveBeenCalled();
    });
});

describe('shareFile モバイル共有（.json共有不可対策）', () => {
    beforeEach(() => {
        localStorage.clear();
    });
    afterEach(() => {
        vi.restoreAllMocks();
        delete (navigator as unknown as { share?: unknown }).share;
        delete (navigator as unknown as { canShare?: unknown }).canShare;
    });

    it('.jsonファイル名でも共有時は.txt(text/plain)として共有し、titleに日付入りファイル名を使う', async () => {
        let payload: { files: File[]; title?: string } | undefined;
        navigator.canShare = () => true;
        navigator.share = vi.fn(async (p: { files: File[]; title?: string }) => { payload = p; });

        const ok = await shareFile({ a: 1 }, 'MBCscore_backup_2026-07-10_10-30.json');

        expect(ok).toBe(true);
        const sharedFile = payload!.files[0];
        expect(sharedFile).toBeInstanceOf(File);
        expect(sharedFile.name).toBe('MBCscore_backup_2026-07-10_10-30.txt');
        expect(sharedFile.type).toBe('text/plain');
        // 共有先(Drive等)がファイル名に使うtitleも日付入りの.txt名にする
        expect(payload!.title).toBe('MBCscore_backup_2026-07-10_10-30.txt');
        // 共有した中身は元のJSONのまま
        expect(await sharedFile.text()).toBe(JSON.stringify({ a: 1 }, null, 2));
    });

    it('canShareがfalseを返す場合は共有せずfalseを返す（呼び出し側がダウンロードにフォールバック）', async () => {
        navigator.canShare = () => false;
        const shareSpy = vi.fn();
        navigator.share = shareSpy;

        const ok = await shareFile({ a: 1 }, 'x.json');

        expect(ok).toBe(false);
        expect(shareSpy).not.toHaveBeenCalled();
    });
});

// 復元は複数のlocalStorageキーへ順に書き込む。途中で容量超過になると、
// 先に書いたキーだけ新しい内容に置き換わったまま「復元に失敗しました」と
// 返っていた。利用者から見ると、失敗したはずなのに一部のデータが
// 差し替わっている＝どちらの状態なのか分からない。全部戻すか全部やめるか
// のどちらかにする。
describe('復元の途中失敗（部分適用させない）', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * 指定キーへの書き込みだけを失敗させる。
     *
     * 全ての書き込みを潰すと巻き戻しの書き込みまで失敗し、「何もできない」
     * ことしか確かめられない。ここで見たいのは「1つ失敗したら、書けた分を
     * 元に戻して失敗を返す」なので、失敗は1キーに限定する
     */
    function failWritesTo(failingKey: string) {
        const real = Storage.prototype.setItem;
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
            this: Storage, key: string, value: string,
        ) {
            if (key === failingKey) throw new Error('QuotaExceededError');
            real.call(this, key, value);
        });
    }

    function backupJsonWith(teamName: string, gameName: string): string {
        localStorage.clear();
        saveMyTeam(makeSavedTeam('team-import', teamName));
        const teamA = createTeam('teamA', teamName, 'コーチ');
        teamA.players = [createPlayer('teamA-player-0', 4, '選手A', true)];
        saveGameResult(gameName, teamA, createTeam('teamB', '相手', '相手コーチ'), [], [], []);
        const json = JSON.stringify(exportAllData());
        localStorage.clear();
        return json;
    }

    it('途中で書き込めなくなったら、元のデータのまま失敗を返す', () => {
        const json = backupJsonWith('復元チーム', '復元大会');

        // 端末には既存のデータがある
        saveMyTeam(makeSavedTeam('team-existing', '既存チーム'));
        const teamA = createTeam('teamA', '既存チーム', 'コーチ');
        teamA.players = [createPlayer('teamA-player-0', 7, '既存選手', true)];
        saveGameResult('既存大会', teamA, createTeam('teamB', '相手', '相手コーチ'), [], [], []);

        const parsed = parseImportJSON(json);
        // 試合履歴は書けたが、続くマイチームの書き込みで容量が尽きる状況
        failWritesTo('minibasket-my-teams');
        const result = executeImport(parsed);

        expect(result.success).toBe(false);

        vi.restoreAllMocks();
        // 既存データが残っており、インポート分は入っていない
        const history = loadGameHistory();
        expect(history).toHaveLength(1);
        expect(history[0].gameName).toBe('既存大会');
        const teams = loadMyTeams();
        expect(teams).toHaveLength(1);
        expect(teams[0].name).toBe('既存チーム');
    });

    it('元データが無い端末で失敗しても、書きかけを残さない', () => {
        const json = backupJsonWith('復元チーム', '復元大会');
        const parsed = parseImportJSON(json);

        failWritesTo('minibasket-my-teams');
        const result = executeImport(parsed);

        expect(result.success).toBe(false);

        vi.restoreAllMocks();
        expect(loadGameHistory()).toHaveLength(0);
        expect(loadMyTeams()).toHaveLength(0);
    });
});

describe('generateBackupFilename', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    // 現地の朝9時前に取ったバックアップが前日のファイル名になると、
    // 「今日のぶんを取ったはず」の控えを探せなくなる
    it('現地の朝8時半に取っても、その日の日付が入る', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 7, 8, 8, 30));

        expect(generateBackupFilename()).toContain('2026-08-08');
    });
});
