// データバックアップ・復元ユーティリティ

import type { GameRecord } from './gameHistoryStorage';
import { loadGameHistory } from './gameHistoryStorage';
import type { SavedTeam } from './teamStorage';
import { loadMyTeams, loadOpponents } from './teamStorage';
import type { AppSettings } from './appSettings';
import { loadAppSettings } from './appSettings';

// バックアップデータのバージョン
export const BACKUP_VERSION = '1.0';

// バックアップデータ型定義
export interface BackupData {
    version: string;
    exportDate: string;
    appName: string;
    data: {
        gameHistory?: GameRecord[];
        myTeams?: SavedTeam[];
        opponents?: SavedTeam[];
        settings?: AppSettings;
        hiddenPlayers?: Record<string, string[]>;
    };
}

// 試合単位のエクスポートデータ
export interface GameExportData {
    type: 'game';
    version: string;
    exportDate: string;
    game: GameRecord;
}

// チーム単位のエクスポートデータ
export interface TeamExportData {
    type: 'team';
    version: string;
    exportDate: string;
    team: SavedTeam;
}

// インポート結果
export interface ImportResult {
    success: boolean;
    message: string;
    errors?: string[];
    imported?: {
        games?: number;
        teams?: number;
        opponents?: number;
    };
}

// ===== エクスポート機能 =====

/**
 * 全データをエクスポート
 */
export function exportAllData(): BackupData {
    const gameHistory = loadGameHistory();
    const myTeams = loadMyTeams();
    const opponents = loadOpponents();
    const settings = loadAppSettings();

    // 非表示選手情報を取得
    const hiddenPlayers = getHiddenPlayersData();

    return {
        version: BACKUP_VERSION,
        exportDate: new Date().toISOString(),
        appName: 'MBCscore',
        data: {
            gameHistory,
            myTeams,
            opponents,
            settings,
            hiddenPlayers,
        },
    };
}

/**
 * 非表示選手データを取得
 */
function getHiddenPlayersData(): Record<string, string[]> {
    try {
        const data = localStorage.getItem('minibasket-hidden-players');
        if (!data) return {};
        return JSON.parse(data);
    } catch {
        return {};
    }
}

/**
 * 特定の試合をエクスポート
 */
export function exportGame(gameId: string): GameExportData | null {
    const gameHistory = loadGameHistory();
    const game = gameHistory.find(g => g.id === gameId);

    if (!game) return null;

    return {
        type: 'game',
        version: BACKUP_VERSION,
        exportDate: new Date().toISOString(),
        game,
    };
}

/**
 * 特定のチームをエクスポート
 */
export function exportTeam(team: SavedTeam): TeamExportData {
    return {
        type: 'team',
        version: BACKUP_VERSION,
        exportDate: new Date().toISOString(),
        team,
    };
}

/**
 * 試合履歴をCSV形式でエクスポート
 */
export function exportGameHistoryCSV(): string {
    const gameHistory = loadGameHistory();

    // CSVヘッダー
    const headers = [
        '日付',
        '大会名',
        '自チーム',
        '対戦相手',
        '自チーム得点',
        '相手得点',
        '結果',
        '会場',
    ];

    // データ行
    const rows = gameHistory.map(game => {
        const date = new Date(game.date).toLocaleDateString('ja-JP');
        const result = game.finalScore.teamA > game.finalScore.teamB ? '勝利' :
                      game.finalScore.teamA < game.finalScore.teamB ? '敗北' : '引分';

        return [
            date,
            game.gameName,
            game.teamA.name,
            game.teamB.name,
            game.finalScore.teamA.toString(),
            game.finalScore.teamB.toString(),
            result,
            game.gameInfo?.venue || '',
        ];
    });

    // CSV文字列を生成
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    // BOM付きUTF-8（Excelで正しく開くため）
    return '\uFEFF' + csvContent;
}

// ===== ファイル保存機能 =====

/**
 * データをJSONファイルとしてダウンロード
 */
export function downloadJSON(data: any, filename: string): void {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    downloadBlob(blob, filename);
}

/**
 * データをCSVファイルとしてダウンロード
 */
export function downloadCSV(csvContent: string, filename: string): void {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, filename);
}

/**
 * Blobをファイルとしてダウンロード
 */
function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Web Share APIを使用してファイルを共有（モバイル向け）
 */
export async function shareFile(data: any, filename: string, title: string = 'MBCscore データ'): Promise<boolean> {
    if (!navigator.share) {
        return false;
    }

    try {
        const json = JSON.stringify(data, null, 2);
        const file = new File([json], filename, { type: 'application/json' });

        await navigator.share({
            files: [file],
            title: title,
            text: 'MBCscoreのバックアップデータです',
        });

        return true;
    } catch (error) {
        // ユーザーがキャンセルした場合もここに来る
        console.log('Share cancelled or failed:', error);
        return false;
    }
}

/**
 * JSONデータをクリップボードにコピー
 */
export async function copyToClipboard(data: any): Promise<boolean> {
    try {
        const json = JSON.stringify(data, null, 2);
        await navigator.clipboard.writeText(json);
        return true;
    } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        return false;
    }
}

// ===== インポート機能 =====

/**
 * JSONファイルからデータをインポート
 */
export async function importFromFile(file: File): Promise<ImportResult> {
    try {
        const text = await file.text();
        return importFromJSON(text);
    } catch (error) {
        return {
            success: false,
            message: 'ファイルの読み込みに失敗しました',
            errors: [error instanceof Error ? error.message : '不明なエラー'],
        };
    }
}

/**
 * JSON文字列からデータをインポート
 */
export function importFromJSON(jsonText: string): ImportResult {
    try {
        const data = JSON.parse(jsonText);
        return validateAndImport(data);
    } catch (error) {
        return {
            success: false,
            message: '不正なJSON形式です',
            errors: [error instanceof Error ? error.message : '不明なエラー'],
        };
    }
}

/**
 * データを検証してインポート
 */
function validateAndImport(data: any): ImportResult {
    const errors: string[] = [];
    const imported = {
        games: 0,
        teams: 0,
        opponents: 0,
    };

    // バージョンチェック
    if (!data.version) {
        errors.push('バージョン情報がありません');
    }

    // データ種別の判定
    if (data.type === 'game') {
        // 試合単位のインポート
        return importSingleGame(data as GameExportData);
    } else if (data.type === 'team') {
        // チーム単位のインポート
        return importSingleTeam(data as TeamExportData);
    } else if (data.data) {
        // 全データのインポート
        return importFullBackup(data as BackupData);
    } else {
        return {
            success: false,
            message: '認識できないデータ形式です',
            errors: ['データ形式が不正です'],
        };
    }
}

/**
 * 単一試合データのインポート
 */
function importSingleGame(data: GameExportData): ImportResult {
    try {
        if (!data.game || !data.game.id) {
            return {
                success: false,
                message: '試合データが不正です',
                errors: ['必須フィールドが不足しています'],
            };
        }

        const gameHistory = loadGameHistory();

        // 既存の試合と重複チェック
        const existingIndex = gameHistory.findIndex(g => g.id === data.game.id);

        if (existingIndex >= 0) {
            // 上書き確認（ここでは上書き）
            gameHistory[existingIndex] = data.game;
        } else {
            // 新規追加
            gameHistory.unshift(data.game);
        }

        localStorage.setItem('minibasket-game-history', JSON.stringify(gameHistory));

        return {
            success: true,
            message: '試合データをインポートしました',
            imported: { games: 1, teams: 0, opponents: 0 },
        };
    } catch (error) {
        return {
            success: false,
            message: 'インポートに失敗しました',
            errors: [error instanceof Error ? error.message : '不明なエラー'],
        };
    }
}

/**
 * 単一チームデータのインポート
 */
function importSingleTeam(data: TeamExportData): ImportResult {
    try {
        if (!data.team || !data.team.id) {
            return {
                success: false,
                message: 'チームデータが不正です',
                errors: ['必須フィールドが不足しています'],
            };
        }

        // マイチームまたは対戦チームどちらに追加するかは後で選択可能にする
        // とりあえず対戦チームに追加
        const opponents = loadOpponents();

        const existingIndex = opponents.findIndex(t => t.id === data.team.id);

        if (existingIndex >= 0) {
            opponents[existingIndex] = data.team;
        } else {
            opponents.push(data.team);
        }

        localStorage.setItem('minibasket-saved-opponents', JSON.stringify(opponents));

        return {
            success: true,
            message: 'チームデータをインポートしました',
            imported: { games: 0, teams: 0, opponents: 1 },
        };
    } catch (error) {
        return {
            success: false,
            message: 'インポートに失敗しました',
            errors: [error instanceof Error ? error.message : '不明なエラー'],
        };
    }
}

/**
 * 全データバックアップのインポート
 */
function importFullBackup(data: BackupData): ImportResult {
    try {
        const imported = {
            games: 0,
            teams: 0,
            opponents: 0,
        };

        // 試合履歴のインポート
        if (data.data.gameHistory && Array.isArray(data.data.gameHistory)) {
            const existingGames = loadGameHistory();
            const mergedGames = mergeArrayById(existingGames, data.data.gameHistory);
            localStorage.setItem('minibasket-game-history', JSON.stringify(mergedGames));
            imported.games = data.data.gameHistory.length;
        }

        // マイチームのインポート
        if (data.data.myTeams && Array.isArray(data.data.myTeams)) {
            const existingTeams = loadMyTeams();
            const mergedTeams = mergeArrayById(existingTeams, data.data.myTeams);
            localStorage.setItem('minibasket-my-teams', JSON.stringify(mergedTeams));
            imported.teams = data.data.myTeams.length;
        }

        // 対戦チームのインポート
        if (data.data.opponents && Array.isArray(data.data.opponents)) {
            const existingOpponents = loadOpponents();
            const mergedOpponents = mergeArrayById(existingOpponents, data.data.opponents);
            localStorage.setItem('minibasket-saved-opponents', JSON.stringify(mergedOpponents));
            imported.opponents = data.data.opponents.length;
        }

        // アプリ設定のインポート
        if (data.data.settings) {
            localStorage.setItem('minibasket-app-settings', JSON.stringify(data.data.settings));
        }

        // 非表示選手情報のインポート
        if (data.data.hiddenPlayers) {
            localStorage.setItem('minibasket-hidden-players', JSON.stringify(data.data.hiddenPlayers));
        }

        return {
            success: true,
            message: `データを復元しました（試合:${imported.games}件、チーム:${imported.teams}件、対戦相手:${imported.opponents}件）`,
            imported,
        };
    } catch (error) {
        return {
            success: false,
            message: '復元に失敗しました',
            errors: [error instanceof Error ? error.message : '不明なエラー'],
        };
    }
}

/**
 * 配列をIDでマージ（重複は上書き）
 */
function mergeArrayById<T extends { id: string }>(existing: T[], imported: T[]): T[] {
    const merged = [...existing];

    for (const item of imported) {
        const index = merged.findIndex(e => e.id === item.id);
        if (index >= 0) {
            merged[index] = item;
        } else {
            merged.push(item);
        }
    }

    return merged;
}

// ===== ファイル名生成 =====

/**
 * バックアップファイル名を生成
 */
export function generateBackupFilename(prefix: string = 'MBCscore_backup'): string {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `${prefix}_${date}.json`;
}

/**
 * 試合エクスポートファイル名を生成
 */
export function generateGameFilename(gameName: string, date: string): string {
    const dateStr = new Date(date).toISOString().slice(0, 10);
    const safeName = gameName.replace(/[^a-zA-Z0-9ぁ-んァ-ヶー一-龠]/g, '_');
    return `MBCscore_game_${safeName}_${dateStr}.json`;
}

/**
 * チームエクスポートファイル名を生成
 */
export function generateTeamFilename(teamName: string): string {
    const safeName = teamName.replace(/[^a-zA-Z0-9ぁ-んァ-ヶー一-龠]/g, '_');
    return `MBCscore_team_${safeName}.json`;
}
