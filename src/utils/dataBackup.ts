// データバックアップ・復元ユーティリティ

import type { GameRecord } from './gameHistoryStorage';
import type { QuarterPlayType } from '../types/game';
import { loadGameHistory, createGameId, saveGameHistory } from './gameHistoryStorage';
import { formatPlayerNumber } from './playerNumber';
import type { SavedTeam } from './teamStorage';
import { loadMyTeams, loadOpponents, loadRecentOpponents, saveMyTeams, saveOpponents } from './teamStorage';
import type { AppSettings } from './appSettings';
import { loadAppSettings } from './appSettings';
import type { GameSession } from './gameSessionStorage';
import { loadGameSession, hasGameSession } from './gameSessionStorage';
import { recordBackup } from './lastBackupStorage';
import { formatInputDate, formatRecordDate } from './localDate';
import { loadAllMergedPlayers } from './mergedPlayers';

// バックアップデータのバージョン
export const BACKUP_VERSION = '2.0';

// バックアップデータ型定義
export interface BackupData {
    version: string;
    exportDate: string;
    appName: string;
    data: {
        gameHistory?: GameRecord[];
        myTeams?: SavedTeam[];
        opponents?: SavedTeam[];
        recentOpponents?: SavedTeam[];
        settings?: AppSettings;
        hiddenPlayers?: Record<string, string[]>;
        /** 手動で統合した選手の対応表（チームID → 記録上のキー: 代表キー） */
        mergedPlayers?: Record<string, Record<string, string>>;
        gameSession?: GameSession | null;
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
    details?: {
        newGames?: number;
        updatedGames?: number;
        newTeams?: number;
        updatedTeams?: number;
        newOpponents?: number;
        updatedOpponents?: number;
    };
}

// インポートデータの解析結果
export interface ParsedImportData {
    type: 'game' | 'team' | 'backup' | 'unknown';
    data: GameExportData | TeamExportData | BackupData | null;
    summary: string;
    hasDuplicates?: boolean;
    duplicateDetails?: string;
    preview?: string[];
}

// ===== CSVユーティリティ =====

/**
 * CSVの1セルを安全にエスケープする。
 * - 内部の二重引用符を二重化し、全体を二重引用符で囲む（カンマ・改行対策）
 * - 先頭が = + - @ のセルは先頭にシングルクォートを付与し、
 *   ExcelやSheetsでの数式インジェクションを無害化する（CSVインジェクション対策）
 */
export function escapeCsvCell(value: string): string {
    let cell = value;
    // 数式インジェクション対策: 危険な先頭文字を無害化
    if (/^[=+\-@]/.test(cell)) {
        cell = "'" + cell;
    }
    // 二重引用符の二重化 + 全体を引用符で囲む
    return '"' + cell.replace(/"/g, '""') + '"';
}

// ===== エクスポート機能 =====

/**
 * 全データをエクスポート
 */
export function exportAllData(): BackupData {
    const gameHistory = loadGameHistory();
    const myTeams = loadMyTeams();
    const opponents = loadOpponents();
    const recentOpponents = loadRecentOpponents();
    const settings = loadAppSettings();
    const gameSession = loadGameSession();

    // 非表示選手情報を取得
    const hiddenPlayers = getHiddenPlayersData();
    const mergedPlayers = loadAllMergedPlayers();

    return {
        version: BACKUP_VERSION,
        exportDate: new Date().toISOString(),
        appName: 'MBCscore',
        data: {
            gameHistory,
            myTeams,
            opponents,
            recentOpponents,
            settings,
            hiddenPlayers,
            mergedPlayers,
            gameSession,
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
 * その試合でマイチームが teamA 側だったか。
 *
 * teamA は「白」であって「自分」ではない。マイチームの色に青を選ぶと
 * buildMatchTeams はマイチームを teamB に置く（matchTeams.ts）。
 * どちらが自分かは記録の isMyTeam にだけ残っているので、それを見る。
 *
 * 紅白戦などで両側に isMyTeam が立っている場合と、どちらにも無い旧データは
 * 決め手が無いので従来どおり teamA を左に置く（並びが変わらないだけで、
 * 勝敗の向きも teamA 基準のまま一貫する）。
 */
function isMyTeamOnSideA(game: GameRecord): boolean {
    if (game.teamA?.isMyTeam === game.teamB?.isMyTeam) return true;
    return game.teamA?.isMyTeam === true;
}

/**
 * 試合履歴をCSV形式でエクスポート（試合サマリー版）
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
        const date = formatRecordDate(game.date);
        // 列名が「自チーム／相手」である以上、中身も自チーム視点にそろえる。
        // teamA 固定で出していたため、青で戦った試合は自他が入れ替わり、
        // 勝った試合が「敗北」として書き出されていた
        const mineIsA = isMyTeamOnSideA(game);
        const myTeam = mineIsA ? game.teamA : game.teamB;
        const opponentTeam = mineIsA ? game.teamB : game.teamA;
        const myScore = mineIsA ? game.finalScore.teamA : game.finalScore.teamB;
        const opponentScore = mineIsA ? game.finalScore.teamB : game.finalScore.teamA;
        const result = myScore > opponentScore ? '勝利' :
            myScore < opponentScore ? '敗北' : '引分';

        return [
            date,
            game.gameName,
            myTeam.name,
            opponentTeam.name,
            myScore.toString(),
            opponentScore.toString(),
            result,
            game.gameInfo?.venue || '',
        ];
    });

    // CSV文字列を生成
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(escapeCsvCell).join(',')),
    ].join('\n');

    // BOM付きUTF-8（Excelで正しく開くため）
    return '\uFEFF' + csvContent;
}

/**
 * 試合履歴をCSV形式でエクスポート（選手スタッツ詳細版）
 */
export function exportGameHistoryDetailCSV(): string {
    const gameHistory = loadGameHistory();

    // CSVヘッダー
    const headers = [
        '日付',
        '大会名',
        '会場',
        'チーム名',
        '対戦相手',
        '結果',
        '自チーム得点',
        '相手得点',
        '背番号',
        '選手名',
        'コートネーム',
        'キャプテン',
        '得点',
        '2P成功',
        '2P試投',
        '2P成功率',
        '3P成功',
        '3P試投',
        '3P成功率',
        'FT成功',
        'FT試投',
        'FT成功率',
        'FG成功',
        'FG試投',
        'FG成功率',
        'オフェンスリバウンド',
        'ディフェンスリバウンド',
        '総リバウンド',
        'アシスト',
        'スティール',
        'ブロック',
        'ターンオーバー',
        'TO:ダブドリ',
        'TO:トラベ',
        'TO:パスミス',
        'TO:キャッチミス',
        'ファウル数',
        'Q1出場',
        'Q2出場',
        'Q3出場',
        'Q4出場',
    ];

    // データ行
    const rows: string[][] = [];

    for (const game of gameHistory) {
        const date = formatRecordDate(game.date);
        const venue = game.gameInfo?.venue || '';

        // チームAの選手データ
        const resultA = game.finalScore.teamA > game.finalScore.teamB ? '勝利' :
            game.finalScore.teamA < game.finalScore.teamB ? '敗北' : '引分';

        for (const player of game.teamA.players) {
            const stats = player.stats;
            const twoPercent = stats.twoPointAttempt > 0 ? (stats.twoPointMade / stats.twoPointAttempt * 100).toFixed(1) : '-';
            const threePercent = stats.threePointAttempt > 0 ? (stats.threePointMade / stats.threePointAttempt * 100).toFixed(1) : '-';
            const ftPercent = stats.freeThrowAttempt > 0 ? (stats.freeThrowMade / stats.freeThrowAttempt * 100).toFixed(1) : '-';
            const fgMade = stats.twoPointMade + stats.threePointMade;
            const fgAttempt = stats.twoPointAttempt + stats.threePointAttempt;
            const fgPercent = fgAttempt > 0 ? (fgMade / fgAttempt * 100).toFixed(1) : '-';

            const formatQuarterPlay = (qp: QuarterPlayType) => {
                if (qp === 'starter') return 'スタメン';
                if (qp === 'sub') return '途中出場';
                if (qp === 'both') return 'スタメン+再出場';
                return '';
            };

            rows.push([
                date,
                game.gameName,
                venue,
                game.teamA.name,
                game.teamB.name,
                resultA,
                game.finalScore.teamA.toString(),
                game.finalScore.teamB.toString(),
                formatPlayerNumber(player.number),
                player.name,
                player.courtName || '',
                player.isCaptain ? 'C' : '',
                stats.points.toString(),
                stats.twoPointMade.toString(),
                stats.twoPointAttempt.toString(),
                twoPercent,
                stats.threePointMade.toString(),
                stats.threePointAttempt.toString(),
                threePercent,
                stats.freeThrowMade.toString(),
                stats.freeThrowAttempt.toString(),
                ftPercent,
                fgMade.toString(),
                fgAttempt.toString(),
                fgPercent,
                stats.offensiveRebounds.toString(),
                stats.defensiveRebounds.toString(),
                (stats.offensiveRebounds + stats.defensiveRebounds).toString(),
                stats.assists.toString(),
                stats.steals.toString(),
                stats.blocks.toString(),
                stats.turnovers.toString(),
                stats.turnoverDD.toString(),
                stats.turnoverTR.toString(),
                stats.turnoverPM.toString(),
                stats.turnoverCM.toString(),
                player.fouls.length.toString(),
                formatQuarterPlay(player.quartersPlayed[0]),
                formatQuarterPlay(player.quartersPlayed[1]),
                formatQuarterPlay(player.quartersPlayed[2]),
                formatQuarterPlay(player.quartersPlayed[3]),
            ]);
        }

        // チームBの選手データ
        const resultB = game.finalScore.teamB > game.finalScore.teamA ? '勝利' :
            game.finalScore.teamB < game.finalScore.teamA ? '敗北' : '引分';

        for (const player of game.teamB.players) {
            const stats = player.stats;
            const twoPercent = stats.twoPointAttempt > 0 ? (stats.twoPointMade / stats.twoPointAttempt * 100).toFixed(1) : '-';
            const threePercent = stats.threePointAttempt > 0 ? (stats.threePointMade / stats.threePointAttempt * 100).toFixed(1) : '-';
            const ftPercent = stats.freeThrowAttempt > 0 ? (stats.freeThrowMade / stats.freeThrowAttempt * 100).toFixed(1) : '-';
            const fgMade = stats.twoPointMade + stats.threePointMade;
            const fgAttempt = stats.twoPointAttempt + stats.threePointAttempt;
            const fgPercent = fgAttempt > 0 ? (fgMade / fgAttempt * 100).toFixed(1) : '-';

            const formatQuarterPlay = (qp: QuarterPlayType) => {
                if (qp === 'starter') return 'スタメン';
                if (qp === 'sub') return '途中出場';
                if (qp === 'both') return 'スタメン+再出場';
                return '';
            };

            rows.push([
                date,
                game.gameName,
                venue,
                game.teamB.name,
                game.teamA.name,
                resultB,
                game.finalScore.teamB.toString(),
                game.finalScore.teamA.toString(),
                formatPlayerNumber(player.number),
                player.name,
                player.courtName || '',
                player.isCaptain ? 'C' : '',
                stats.points.toString(),
                stats.twoPointMade.toString(),
                stats.twoPointAttempt.toString(),
                twoPercent,
                stats.threePointMade.toString(),
                stats.threePointAttempt.toString(),
                threePercent,
                stats.freeThrowMade.toString(),
                stats.freeThrowAttempt.toString(),
                ftPercent,
                fgMade.toString(),
                fgAttempt.toString(),
                fgPercent,
                stats.offensiveRebounds.toString(),
                stats.defensiveRebounds.toString(),
                (stats.offensiveRebounds + stats.defensiveRebounds).toString(),
                stats.assists.toString(),
                stats.steals.toString(),
                stats.blocks.toString(),
                stats.turnovers.toString(),
                stats.turnoverDD.toString(),
                stats.turnoverTR.toString(),
                stats.turnoverPM.toString(),
                stats.turnoverCM.toString(),
                player.fouls.length.toString(),
                formatQuarterPlay(player.quartersPlayed[0]),
                formatQuarterPlay(player.quartersPlayed[1]),
                formatQuarterPlay(player.quartersPlayed[2]),
                formatQuarterPlay(player.quartersPlayed[3]),
            ]);
        }
    }

    // CSV文字列を生成
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(escapeCsvCell).join(',')),
    ].join('\n');

    // BOM付きUTF-8（Excelで正しく開くため）
    return '\uFEFF' + csvContent;
}

// ===== ファイル保存機能 =====

/**
 * データをJSONファイルとしてダウンロード
 */
export function downloadJSON(data: unknown, filename: string): void {
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
 * Web Share APIを使用してファイルを共有（モバイル向け）。
 *
 * 注意: ChromiumのWeb Shareは共有可能なファイル拡張子をホワイトリスト制限しており、
 * `.json` は許可されていない。そのままだとAndroid Chrome等で共有が拒否され、共有シートが
 * 開かないまま失敗する。中身はJSONのまま、共有ファイルは許可リストにある `.txt`(text/plain)
 * として渡すことで共有シートを開けるようにする（インポートは中身をJSON解析するため拡張子非依存）。
 * 対応可否は `navigator.canShare` で事前判定し、不可のときは false を返して呼び出し側の
 * ダウンロードにフォールバックさせる。
 *
 * 共有先（Google Drive等）はファイル名に `File.name` ではなく共有の `title` を使うことが
 * あるため、`title` には日付入りの共有ファイル名（.txt）を渡す。これにより保存先でも
 * 日付付きの一意な名前になり、複数バックアップの区別・上書き事故を防ぐ。
 */
export async function shareFile(data: unknown, filename: string): Promise<boolean> {
    if (!navigator.share) {
        return false;
    }

    try {
        const json = JSON.stringify(data, null, 2);
        // .json は共有許可リスト外のため .txt として共有する
        const shareName = filename.replace(/\.json$/i, '') + '.txt';
        const file = new File([json], shareName, { type: 'text/plain' });

        // canShareが使える場合はファイル共有可否を事前確認（不可ならダウンロードへフォールバック）
        if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
            return false;
        }

        // filesと同時にtextを渡すと一部iOSで共有が失敗するため渡さない。
        // titleには共有ファイル名を渡し、保存先で日付付きの名前になるようにする。
        await navigator.share({
            files: [file],
            title: shareName,
        });

        return true;
    } catch (error) {
        // ユーザーがキャンセルした場合もここに来る
        if (import.meta.env.DEV) console.log('Share cancelled or failed:', error);
        return false;
    }
}

/**
 * 全データバックアップを共有シート（対応時）またはダウンロードで保存する。
 * どちらかでファイルを生成できたら最終バックアップとして記録し true を返す。
 * データ保全のため、共有がキャンセル/失敗してもダウンロードにフォールバックする。
 */
export async function shareBackup(): Promise<boolean> {
    try {
        const data = exportAllData();
        const filename = generateBackupFilename();

        // モバイル等でWeb Shareが使えるならまず共有シートを試す
        if ('share' in navigator) {
            const shared = await shareFile(data, filename);
            if (shared) {
                recordBackup();
                return true;
            }
        }

        // 非対応・共有キャンセル時はダウンロードにフォールバック
        downloadJSON(data, filename);
        recordBackup();
        return true;
    } catch (error) {
        console.error('shareBackup failed:', error);
        return false;
    }
}

/**
 * JSONデータをクリップボードにコピー
 */
export async function copyToClipboard(data: unknown): Promise<boolean> {
    try {
        const json = JSON.stringify(data, null, 2);
        await navigator.clipboard.writeText(json);
        return true;
    } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        return false;
    }
}

// ===== インポートデータの検証・矯正 =====

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * インポートされたチームを検証・矯正する。
 * - id を持たない（マージ・重複判定ができない）レコードは取り込み不可として null を返す
 * - players が配列でない場合は空配列へ矯正し、レンダリング時の .map クラッシュを防ぐ
 * - players 内の非オブジェクトエントリは除外する
 */
function sanitizeImportedTeam(raw: unknown): SavedTeam | null {
    if (!isPlainObject(raw)) return null;
    if (typeof raw.id !== 'string' || raw.id === '') return null;
    const players = Array.isArray(raw.players) ? raw.players.filter(isPlainObject) : [];
    return { ...raw, players } as unknown as SavedTeam;
}

/**
 * インポートされた試合データを検証・矯正する。
 * - id を持たないレコードは取り込み不可として null を返す
 * - teamA / teamB が壊れていても players を安全な配列へ矯正する
 */
function sanitizeImportedGame(raw: unknown): GameRecord | null {
    if (!isPlainObject(raw)) return null;
    if (typeof raw.id !== 'string' || raw.id === '') return null;
    const fixTeam = (t: unknown) => {
        if (!isPlainObject(t)) return { players: [] };
        return { ...t, players: Array.isArray(t.players) ? t.players.filter(isPlainObject) : [] };
    };
    return { ...raw, teamA: fixTeam(raw.teamA), teamB: fixTeam(raw.teamB) } as unknown as GameRecord;
}

/**
 * インポートされた進行中試合セッションを検証・矯正する。
 * - game を持たない、あるいは game がオブジェクトでないレコードは取り込み不可として null を返す
 * - game.id は必須ではない（GameSession の Game は保存済み試合と異なり id を持たない場合がある）
 * - teamA / teamB が壊れていても players を安全な配列へ矯正する
 */
function sanitizeImportedGameSession(raw: unknown): GameSession | null {
    if (!isPlainObject(raw)) return null;
    if (!isPlainObject(raw.game)) return null;
    const g = raw.game;
    const fixTeam = (t: unknown) => {
        if (!isPlainObject(t)) return { players: [] };
        return { ...t, players: Array.isArray(t.players) ? t.players.filter(isPlainObject) : [] };
    };
    return {
        ...raw,
        game: { ...g, teamA: fixTeam(g.teamA), teamB: fixTeam(g.teamB) },
    } as unknown as GameSession;
}

// ===== 試合データのマージ =====

/**
 * 2つの試合レコードが同じ試合かどうかを判定する。
 *
 * 旧バージョンは試合IDを試合日だけから生成していたため、同じ日の試合はIDが重複する。
 * IDだけで名寄せすると別々の試合が1件に統合されて消えるので、保存時刻である
 * createdAt（ミリ秒精度・試合ごとに一意）を優先して突き合わせる。
 * createdAt を持たない古い/手書きデータのみIDにフォールバックする。
 */
function isSameGameRecord(a: GameRecord, b: GameRecord): boolean {
    if (a.createdAt && b.createdAt) return a.createdAt === b.createdAt;
    return a.id === b.id;
}

/**
 * 既存の試合履歴にインポート分をマージする。
 *
 * - 同じ試合（isSameGameRecord）は既存レコードを更新し、端末側の一意なIDを維持する
 * - 別の試合はIDが衝突していても新しいIDを振って必ず別レコードとして残す
 *   （重複IDのまま保存された旧バックアップからの取りこぼしを防ぐ）
 *
 * 履歴は新しい順に並ぶため、単一試合の取り込み（prepend）では先頭に追加する。
 */
function mergeGameRecords(
    existing: GameRecord[],
    imported: GameRecord[],
    options?: { prepend?: boolean }
): { merged: GameRecord[]; newGames: number; updatedGames: number } {
    const merged = [...existing];
    const existingCount = merged.length;
    const claimed = new Set<number>();
    const usedIds = new Set(merged.map(g => g.id));
    let newGames = 0;
    let updatedGames = 0;

    for (const game of imported) {
        const index = merged.findIndex((e, i) => !claimed.has(i) && isSameGameRecord(e, game));
        if (index >= 0) {
            claimed.add(index);
            merged[index] = { ...game, id: merged[index].id };
            updatedGames++;
            continue;
        }

        let id = game.id;
        while (usedIds.has(id)) {
            const date = new Date(game.date);
            id = createGameId(Number.isNaN(date.getTime()) ? new Date() : date);
        }
        usedIds.add(id);
        merged.push({ ...game, id });
        newGames++;
    }

    const result = options?.prepend
        ? [...merged.slice(existingCount), ...merged.slice(0, existingCount)]
        : merged;

    return { merged: result, newGames, updatedGames };
}

/**
 * インポート対象の試合配列を検証・矯正する。不正なレコードは errors に報告して除外する。
 */
function sanitizeImportedGames(raw: unknown[], errors: string[]): GameRecord[] {
    const games: GameRecord[] = [];
    for (const g of raw) {
        const clean = sanitizeImportedGame(g);
        if (clean) games.push(clean);
        else errors.push('不正な試合データを1件スキップしました（idが不足）');
    }
    return games;
}

// ===== インポート機能 =====

/**
 * JSONファイルを解析し、インポートデータの種別と内容を返す（実際のインポートは行わない）
 */
export async function parseImportFile(file: File): Promise<ParsedImportData> {
    // ファイルサイズチェック（10MB制限）
    if (file.size > 10 * 1024 * 1024) {
        return { type: 'unknown', data: null, summary: 'ファイルサイズが大きすぎます（最大10MB）。正しいバックアップファイルか確認してください。' };
    }
    try {
        const text = await file.text();
        return parseImportJSON(text);
    } catch {
        return { type: 'unknown', data: null, summary: 'ファイルの読み込みに失敗しました。ファイルが破損していないか確認してください。' };
    }
}

/**
 * JSON文字列を解析し、種別と内容を返す（実際のインポートは行わない）
 */
export function parseImportJSON(jsonText: string): ParsedImportData {
    try {
        const data = JSON.parse(jsonText);
        return classifyImportData(data);
    } catch {
        return { type: 'unknown', data: null, summary: '不正なJSON形式です。MBCscoreからエクスポートしたファイルを使用してください。' };
    }
}

/**
 * インポートデータを分類・検証する
 */
function classifyImportData(data: Partial<GameExportData> & Partial<TeamExportData> & Partial<BackupData>): ParsedImportData {
    if (!data.version) {
        return {
            type: 'unknown',
            data: null,
            summary: 'このファイルはMBCscoreのエクスポートデータではないようです。バージョン情報が見つかりません。',
        };
    }

    if (data.type === 'game' && data.game) {
        const game = data.game as GameRecord;
        const existing = loadGameHistory();
        const isDuplicate = existing.some(g => isSameGameRecord(g, game));
        const dateStr = formatRecordDate(game.date) || '不明';
        const score = game.finalScore ? `${game.finalScore.teamA} - ${game.finalScore.teamB}` : '';
        const preview: string[] = [
            `📅 ${dateStr}`,
            `🏀 ${game.teamA?.name || '?'} vs ${game.teamB?.name || '?'}`,
        ];
        if (score) preview.push(`📊 スコア: ${score}`);
        if (game.gameInfo?.venue) preview.push(`📍 会場: ${game.gameInfo.venue}`);
        const playerCount = (game.teamA?.players?.length || 0) + (game.teamB?.players?.length || 0);
        if (playerCount > 0) preview.push(`👥 記録選手数: ${playerCount}名`);
        return {
            type: 'game',
            data: data as GameExportData,
            summary: `試合: ${game.gameName || '不明'}`,
            hasDuplicates: isDuplicate,
            duplicateDetails: isDuplicate ? '同一IDの試合データが既に存在します。上書きされます。' : undefined,
            preview,
        };
    }

    if (data.type === 'team' && data.team) {
        const team = data.team as SavedTeam;
        // 重複チェック: マイチーム・対戦チーム両方を確認
        const myTeams = loadMyTeams();
        const opponents = loadOpponents();
        const existsInMyTeam = myTeams.some(t => t.id === team.id);
        const existsInOpponent = opponents.some(t => t.id === team.id);
        const isDuplicate = existsInMyTeam || existsInOpponent;
        let duplicateDetails: string | undefined;
        if (existsInMyTeam) {
            duplicateDetails = '同名のチームがマイチームに既に存在します。上書きされます。';
        } else if (existsInOpponent) {
            duplicateDetails = '同名のチームが対戦チームに既に存在します。上書きされます。';
        }
        // プレビュー: 選手リスト上位5名
        const preview: string[] = [
            `👥 ${team.players?.length || 0}名の選手`,
        ];
        if (team.coachName) preview.push(`🧑‍🏫 コーチ: ${team.coachName}`);
        if (team.players && team.players.length > 0) {
            const playerList = team.players.slice(0, 5).map(p => `#${p.number} ${p.name}`).join(', ');
            preview.push(`選手: ${playerList}${team.players.length > 5 ? ` 他${team.players.length - 5}名` : ''}`);
        }
        return {
            type: 'team',
            data: data as TeamExportData,
            summary: `チーム: ${team.name || '不明'}（${team.players?.length || 0}名）`,
            hasDuplicates: isDuplicate,
            duplicateDetails,
            preview,
        };
    }

    if (data.data) {
        const bd = data as BackupData;
        const parts: string[] = [];
        if (bd.data.gameHistory?.length) parts.push(`試合${bd.data.gameHistory.length}件`);
        if (bd.data.myTeams?.length) parts.push(`マイチーム${bd.data.myTeams.length}件`);
        if (bd.data.opponents?.length) parts.push(`対戦チーム${bd.data.opponents.length}件`);
        if (bd.data.recentOpponents?.length) parts.push(`最近の対戦相手${bd.data.recentOpponents.length}件`);
        if (bd.data.settings) parts.push('設定');

        // 既存データとの比較で新規/上書きの内訳を計算
        const preview: string[] = [];
        let hasDuplicates = false;
        if (bd.data.gameHistory?.length) {
            // 実際のインポートと同じ突き合わせで内訳を出す（プレビューと結果を一致させる）
            const games = sanitizeImportedGames(bd.data.gameHistory, []);
            const { newGames, updatedGames } = mergeGameRecords(loadGameHistory(), games);
            preview.push(`試合: 新規${newGames}件${updatedGames > 0 ? `、上書き${updatedGames}件` : ''}`);
            if (updatedGames > 0) hasDuplicates = true;
        }
        if (bd.data.myTeams?.length) {
            const existing = loadMyTeams();
            const newCount = bd.data.myTeams.filter(t => !existing.some(e => e.id === t.id)).length;
            const updateCount = bd.data.myTeams.length - newCount;
            preview.push(`マイチーム: 新規${newCount}件${updateCount > 0 ? `、上書き${updateCount}件` : ''}`);
            if (updateCount > 0) hasDuplicates = true;
        }
        if (bd.data.opponents?.length) {
            const existing = loadOpponents();
            const newCount = bd.data.opponents.filter(t => !existing.some(e => e.id === t.id)).length;
            const updateCount = bd.data.opponents.length - newCount;
            preview.push(`対戦チーム: 新規${newCount}件${updateCount > 0 ? `、上書き${updateCount}件` : ''}`);
            if (updateCount > 0) hasDuplicates = true;
        }
        if (bd.data.settings) preview.push('設定: 上書き');
        if (bd.data.gameSession) preview.push('🏀 進行中の試合: 端末に進行中の試合が無い場合に復元されます');

        return {
            type: 'backup',
            data: bd,
            summary: `全データバックアップ（${parts.join('、')}）`,
            hasDuplicates,
            duplicateDetails: hasDuplicates ? '既存データの一部が上書きされます。' : undefined,
            preview,
        };
    }

    return {
        type: 'unknown',
        data: null,
        summary: 'このファイルはMBCscoreのエクスポートデータではないようです。MBCscoreからエクスポートしたJSONファイルを使用してください。',
    };
}

/**
 * 解析済みデータを実際にインポートする
 */
export function executeImport(parsed: ParsedImportData, options?: { teamTarget?: 'myTeam' | 'opponent' }): ImportResult {
    switch (parsed.type) {
        case 'game':
            return importSingleGame(parsed.data as GameExportData);
        case 'team': {
            const teamData = parsed.data as TeamExportData;
            if (options?.teamTarget === 'myTeam') {
                return importTeamAsMyTeam(teamData.team);
            } else {
                return importTeamAsOpponent(teamData.team);
            }
        }
        case 'backup':
            return importFullBackup(parsed.data as BackupData);
        default:
            return { success: false, message: parsed.summary, errors: ['データ形式が不正です'] };
    }
}

/**
 * 保存できなかったときの結果。
 *
 * 保存関数（createJsonStorage 経由）が失敗を返した時点で、
 * 容量超過の通知イベントはすでに飛んでいる。ここでは利用者に
 * 何をすればよいかを返す。
 */
function storageFullResult(): ImportResult {
    return {
        success: false,
        message: '端末の空き容量が足りず保存できませんでした',
        errors: ['空き容量を作るか、先にバックアップを取り出してからやり直してください'],
    };
}

/**
 * 単一試合データのインポート
 */
function importSingleGame(data: GameExportData): ImportResult {
    try {
        const game = sanitizeImportedGame(data.game);
        if (!game) {
            return {
                success: false,
                message: '試合データが不正です',
                errors: ['必須フィールド（id）が不足しています'],
            };
        }

        // 既存の試合と突き合わせる（IDが衝突していても別の試合なら新規追加になる）
        const { merged, updatedGames } = mergeGameRecords(loadGameHistory(), [game], { prepend: true });
        const isUpdate = updatedGames > 0;

        // 直接 setItem すると、容量超過の検知と保存失敗の通知を素通りする
        if (!saveGameHistory(merged)) return storageFullResult();

        return {
            success: true,
            message: isUpdate ? '試合データを更新しました' : '試合データを新規追加しました',
            imported: { games: 1, teams: 0, opponents: 0 },
            details: { newGames: isUpdate ? 0 : 1, updatedGames: isUpdate ? 1 : 0 },
        };
    } catch (error) {
        return {
            success: false,
            message: 'インポートに失敗しました',
            errors: [error instanceof Error ? error.message : '不明なエラー'],
        };
    }
}

// importSingleTeam は廃止 → importTeamAsMyTeam / importTeamAsOpponent を使用

/**
 * マイチームとしてインポート
 */
export function importTeamAsMyTeam(rawTeam: SavedTeam): ImportResult {
    try {
        const team = sanitizeImportedTeam(rawTeam);
        if (!team) {
            return {
                success: false,
                message: 'チームデータが不正です',
                errors: ['必須フィールド（id）が不足しています'],
            };
        }

        const myTeams = loadMyTeams();
        const existingIndex = myTeams.findIndex(t => t.id === team.id);
        const isUpdate = existingIndex >= 0;

        if (isUpdate) {
            myTeams[existingIndex] = team;
        } else {
            myTeams.push(team);
        }

        if (!saveMyTeams(myTeams)) return storageFullResult();

        return {
            success: true,
            message: isUpdate ? 'マイチームを更新しました' : 'マイチームに新規追加しました',
            imported: { games: 0, teams: 1, opponents: 0 },
            details: { newTeams: isUpdate ? 0 : 1, updatedTeams: isUpdate ? 1 : 0 },
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
 * 対戦チームとしてインポート
 */
export function importTeamAsOpponent(rawTeam: SavedTeam): ImportResult {
    try {
        const team = sanitizeImportedTeam(rawTeam);
        if (!team) {
            return {
                success: false,
                message: 'チームデータが不正です',
                errors: ['必須フィールド（id）が不足しています'],
            };
        }

        const opponents = loadOpponents();
        const existingIndex = opponents.findIndex(t => t.id === team.id);
        const isUpdate = existingIndex >= 0;

        if (isUpdate) {
            opponents[existingIndex] = team;
        } else {
            opponents.push(team);
        }

        if (!saveOpponents(opponents)) return storageFullResult();

        return {
            success: true,
            message: isUpdate ? '対戦チームを更新しました' : '対戦チームに新規追加しました',
            imported: { games: 0, teams: 0, opponents: 1 },
            details: { newOpponents: isUpdate ? 0 : 1, updatedOpponents: isUpdate ? 1 : 0 },
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
/**
 * 複数キーへの書き込みをまとめて適用する。1つでも失敗したら、書けた分を
 * 書き込む前の状態へ戻して false を返す。
 *
 * 全体復元は試合履歴・チーム・設定など7つのキーにまたがる。順に書いていくと
 * 途中で容量が尽きたとき「一部だけ差し替わったまま失敗しました」になり、
 * 利用者からは今どちらのデータなのか判別できない。全部入るか、何も変わらないか
 * のどちらかにする。
 *
 * 巻き戻しは先に removeItem で場所を空けてから書き戻す（容量超過で失敗した
 * 直後に、元の値を入れる余地を作るため）。
 */
function commitAll(writes: [key: string, value: string][]): boolean {
    const previous = writes.map(([key]) => [key, localStorage.getItem(key)] as const);
    const applied: string[] = [];
    try {
        for (const [key, value] of writes) {
            localStorage.setItem(key, value);
            applied.push(key);
        }
        return true;
    } catch (error) {
        console.error('Failed to apply backup import, rolling back:', error);
        for (const key of applied) {
            try {
                localStorage.removeItem(key);
            } catch {
                // 削除にすら失敗する状況では打つ手がない。下の書き戻しに任せる
            }
        }
        for (const [key, value] of previous) {
            if (value === null || !applied.includes(key)) continue;
            try {
                localStorage.setItem(key, value);
            } catch (restoreError) {
                // 巻き戻しも書けない＝端末が完全に詰まっている。
                // 呼び出し側は失敗を返すので、利用者にはバックアップの
                // 取り出しを促す導線が出る
                console.error(`Failed to restore ${key}:`, restoreError);
            }
        }
        return false;
    }
}

function importFullBackup(data: BackupData): ImportResult {
    try {
        // 書き込みは最後にまとめて適用する（部分適用を残さないため）
        const writes: [key: string, value: string][] = [];
        const imported = { games: 0, teams: 0, opponents: 0 };
        const details = {
            newGames: 0, updatedGames: 0,
            newTeams: 0, updatedTeams: 0,
            newOpponents: 0, updatedOpponents: 0,
        };
        const errors: string[] = [];

        // 試合履歴のインポート
        if (data.data.gameHistory && Array.isArray(data.data.gameHistory)) {
            const games = sanitizeImportedGames(data.data.gameHistory, errors);
            const { merged, newGames, updatedGames } = mergeGameRecords(loadGameHistory(), games);
            details.newGames = newGames;
            details.updatedGames = updatedGames;
            writes.push(['minibasket-game-history', JSON.stringify(merged)]);
            imported.games = games.length;
        }

        // マイチームのインポート
        if (data.data.myTeams && Array.isArray(data.data.myTeams)) {
            const teams: SavedTeam[] = [];
            for (const t of data.data.myTeams) {
                const clean = sanitizeImportedTeam(t);
                if (clean) teams.push(clean);
                else errors.push('不正なマイチームデータを1件スキップしました（idが不足）');
            }
            const existingTeams = loadMyTeams();
            for (const t of teams) {
                if (existingTeams.some(e => e.id === t.id)) details.updatedTeams++;
                else details.newTeams++;
            }
            const mergedTeams = mergeArrayById(existingTeams, teams);
            writes.push(['minibasket-my-teams', JSON.stringify(mergedTeams)]);
            imported.teams = teams.length;
        }

        // 対戦チームのインポート
        if (data.data.opponents && Array.isArray(data.data.opponents)) {
            const teams: SavedTeam[] = [];
            for (const t of data.data.opponents) {
                const clean = sanitizeImportedTeam(t);
                if (clean) teams.push(clean);
                else errors.push('不正な対戦チームデータを1件スキップしました（idが不足）');
            }
            const existingOpponents = loadOpponents();
            for (const t of teams) {
                if (existingOpponents.some(e => e.id === t.id)) details.updatedOpponents++;
                else details.newOpponents++;
            }
            const mergedOpponents = mergeArrayById(existingOpponents, teams);
            writes.push(['minibasket-saved-opponents', JSON.stringify(mergedOpponents)]);
            imported.opponents = teams.length;
        }

        // 最近の対戦相手のインポート（updatedAt の新しい順にマージ・最大10件）
        let importedRecent = 0;
        if (data.data.recentOpponents && Array.isArray(data.data.recentOpponents)) {
            const teams: SavedTeam[] = [];
            for (const t of data.data.recentOpponents) {
                const clean = sanitizeImportedTeam(t);
                if (clean) teams.push(clean);
                else errors.push('不正な最近の対戦相手データを1件スキップしました（idが不足）');
            }
            const existingRecent = loadRecentOpponents();
            const byId = new Map<string, SavedTeam>();
            for (const t of [...existingRecent, ...teams]) {
                const prev = byId.get(t.id);
                if (!prev || (t.updatedAt ?? '') > (prev.updatedAt ?? '')) byId.set(t.id, t);
            }
            const mergedRecent = [...byId.values()]
                .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
                .slice(0, 10);
            writes.push(['minibasket-opponent-teams', JSON.stringify(mergedRecent)]);
            importedRecent = teams.length;
        }

        // 進行中の試合セッションのインポート（端末に進行中セッションが無い場合のみ復元）
        let sessionRestored = false;
        if (data.data.gameSession && !hasGameSession()) {
            const cleanSession = sanitizeImportedGameSession(data.data.gameSession);
            if (cleanSession) {
                writes.push(['minibasket-game-session', JSON.stringify(cleanSession)]);
                sessionRestored = true;
            }
        }

        // アプリ設定のインポート（既存設定とマージ）
        //
        // 音声メモのON/OFFと同意は端末単位。バックアップは別端末（別の同意状態）
        // から来ることがあるため、data.data.settings に何が入っていても
        // 常にこの端末の現在値で上書きし、持ち込ませない。
        // data.data.settings は型上 AppSettings だが実体はJSONパース結果で
        // 保証がないため、スプレッド後に明示的に上書きすることで
        // 想定外の形のバックアップファイルでも迂回されないようにする
        if (data.data.settings) {
            const existingSettings = loadAppSettings();
            const mergedSettings: AppSettings = {
                ...existingSettings,
                ...data.data.settings,
                voiceMemoEnabled: existingSettings.voiceMemoEnabled,
                voiceMemoConsented: existingSettings.voiceMemoConsented,
            };
            writes.push(['minibasket-app-settings', JSON.stringify(mergedSettings)]);
        }

        // 非表示選手情報のインポート（既存データとマージ）
        if (data.data.hiddenPlayers) {
            const existingHidden = getHiddenPlayersData();
            const mergedHidden = { ...existingHidden };
            for (const [teamId, playerIds] of Object.entries(data.data.hiddenPlayers)) {
                const existing = mergedHidden[teamId] || [];
                mergedHidden[teamId] = [...new Set([...existing, ...playerIds])];
            }
            writes.push(['minibasket-hidden-players', JSON.stringify(mergedHidden)]);
        }

        // 統合設定のインポート（既存データとマージ）。
        // チームごとに項目単位で重ねる。同じキーがあればバックアップ側を採る
        if (data.data.mergedPlayers) {
            const existingMerged = loadAllMergedPlayers();
            const mergedAll: Record<string, Record<string, string>> = { ...existingMerged };
            for (const [teamId, map] of Object.entries(data.data.mergedPlayers)) {
                mergedAll[teamId] = { ...(mergedAll[teamId] ?? {}), ...map };
            }
            writes.push(['minibasket-merged-players', JSON.stringify(mergedAll)]);
        }

        // ここまでは何も書いていない。まとめて適用し、途中で失敗したら巻き戻す
        if (!commitAll(writes)) {
            return {
                success: false,
                message: '復元に失敗しました（端末の空き容量が足りない可能性があります）。データは元のままです',
                errors: ['localStorageへの書き込みに失敗しました'],
            };
        }

        // 詳細メッセージ生成
        const msgParts: string[] = [];
        if (imported.games > 0) {
            msgParts.push(`試合: 新規${details.newGames}件${details.updatedGames > 0 ? `・更新${details.updatedGames}件` : ''}`);
        }
        if (imported.teams > 0) {
            msgParts.push(`チーム: 新規${details.newTeams}件${details.updatedTeams > 0 ? `・更新${details.updatedTeams}件` : ''}`);
        }
        if (imported.opponents > 0) {
            msgParts.push(`対戦相手: 新規${details.newOpponents}件${details.updatedOpponents > 0 ? `・更新${details.updatedOpponents}件` : ''}`);
        }
        if (importedRecent > 0) {
            msgParts.push(`最近の対戦相手: ${importedRecent}件`);
        }
        if (sessionRestored) {
            msgParts.push('進行中の試合: 復元');
        }

        return {
            success: true,
            message: `データを復元しました（${msgParts.join('、')}）`,
            imported,
            details,
            ...(errors.length > 0 ? { errors } : {}),
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
    const now = new Date();
    // 時刻は現地(toTimeString)なので、日付も現地で揃える。
    // toISOStringだと朝9時前の控えが前日のファイル名になり、時刻とも食い違う
    const date = formatInputDate(now); // YYYY-MM-DD
    const time = now.toTimeString().slice(0, 5).replace(':', '-'); // HH-MM
    return `${prefix}_${date}_${time}.json`;
}

/**
 * 試合エクスポートファイル名を生成
 */
export function generateGameFilename(gameName: string, date: string): string {
    const dateStr = new Date(date).toISOString().slice(0, 10);
    const safeName = gameName
        .replace(/[\\/:*?"<>|]/g, '') // Windows非対応文字のみ削除
        .replace(/\s+/g, '-') // スペースはハイフンに
        .replace(/-+/g, '-') // 連続ハイフンを1つに
        .trim();
    // マルチバイト文字を安全に切り詰め
    const truncated = Array.from(safeName).slice(0, 50).join('');
    return `MBCscore_game_${truncated || 'unnamed'}_${dateStr}.json`;
}

/**
 * チームエクスポートファイル名を生成
 */
export function generateTeamFilename(teamName: string): string {
    const safeName = teamName
        .replace(/[\\/:*?"<>|]/g, '') // Windows非対応文字のみ削除
        .replace(/\s+/g, '-') // スペースはハイフンに
        .replace(/-+/g, '-') // 連続ハイフンを1つに
        .trim();
    // マルチバイト文字を安全に切り詰め
    const truncated = Array.from(safeName).slice(0, 50).join('');
    return `MBCscore_team_${truncated || 'unnamed'}.json`;
}
