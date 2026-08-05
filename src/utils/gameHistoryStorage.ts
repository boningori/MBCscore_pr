import type { Team, ScoreEntry, StatEntry, FoulEntry, GameInfo } from '../types/game';
import { createJsonStorage } from './createStorage';

const GAME_HISTORY_KEY = 'minibasket-game-history';

const historyStorage = createJsonStorage<GameRecord[]>(GAME_HISTORY_KEY, [], 'game result');
const recordStorage = createJsonStorage<GameRecord[]>(GAME_HISTORY_KEY, [], 'game record');

export interface GameRecord {
    id: string;
    date: string; // ISO string
    gameName: string; // 大会名や試合名
    location?: string; // 場所（任意）
    teamA: Team;
    teamB: Team;
    finalScore: {
        teamA: number;
        teamB: number;
    };
    scoreHistory: ScoreEntry[];
    statHistory: StatEntry[];
    foulHistory: FoulEntry[];
    gameInfo?: GameInfo; // 試合情報（審判員・会場など）
    createdAt: string;
}

// 試合IDのランダムサフィックス（同一ミリ秒での衝突を防ぐ）
function randomSuffix(): string {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID().slice(0, 8);
    return Math.random().toString(36).slice(2, 10);
}

/**
 * 試合IDを生成する。
 *
 * 試合日は <input type="date"> 由来の YYYY-MM-DD（＝常に 00:00:00）なので、
 * 日付の getTime() だけではその日の全試合が同一IDになる。ランダムサフィックスを
 * 付けて必ず一意にする。IDが重複すると、バックアップ復元時のID名寄せで試合が
 * 統合されて消える・1件削除で同日の全試合が消える等のデータ欠損につながる。
 */
export function createGameId(date: Date): string {
    return `game-${date.getTime()}-${randomSuffix()}`;
}

// 試合結果を保存
export function saveGameResult(
    gameName: string,
    teamA: Team,
    teamB: Team,
    scoreHistory: ScoreEntry[],
    statHistory: StatEntry[],
    foulHistory: FoulEntry[],
    date: Date = new Date(),
    gameInfo?: GameInfo
): GameRecord {
    const record: GameRecord = {
        id: createGameId(date),
        date: date.toISOString(),
        gameName,
        teamA,
        teamB,
        finalScore: {
            teamA: teamA.players.reduce((sum, p) => sum + p.stats.points, 0),
            teamB: teamB.players.reduce((sum, p) => sum + p.stats.points, 0),
        },
        scoreHistory,
        statHistory,
        foulHistory,
        gameInfo,
        createdAt: new Date().toISOString(),
    };

    const history = loadGameHistory();
    history.unshift(record); // 新しい順
    historyStorage.save(history);

    return record;
}

/**
 * 履歴内の重複IDを解消した配列を返す（変更が不要なら null）。
 *
 * 旧バージョンは試合IDを試合日だけから作っていたため、同じ日に記録した試合は
 * 全て同一IDになっている。IDで名寄せする処理（バックアップ復元・削除・更新）が
 * 試合を取り違えるので、読み込み時に後続の重複分へ新しいIDを振り直す。
 * 先頭の1件は既存IDを保持し、他データからの参照ずれを最小限にする。
 */
export function dedupeGameIds(records: GameRecord[]): GameRecord[] | null {
    const used = new Set<string>();
    let changed = false;

    const result = records.map(record => {
        if (typeof record?.id === 'string' && !used.has(record.id)) {
            used.add(record.id);
            return record;
        }
        let id = createGameId(record?.date ? new Date(record.date) : new Date());
        while (used.has(id)) {
            id = createGameId(record?.date ? new Date(record.date) : new Date());
        }
        used.add(id);
        changed = true;
        return { ...record, id };
    });

    return changed ? result : null;
}

// 試合履歴一覧取得（旧バージョン由来の重複IDはこの時点で修復する）
export function loadGameHistory(): GameRecord[] {
    const history = historyStorage.load();
    if (!Array.isArray(history)) return [];

    const deduped = dedupeGameIds(history);
    if (!deduped) return history;

    historyStorage.save(deduped);
    return deduped;
}

// 試合詳細取得
export function loadGameRecord(infoId: string): GameRecord | null {
    const history = loadGameHistory();
    return history.find(r => r.id === infoId) || null;
}

// 試合記録のgameInfoを更新
export function updateGameRecordGameInfo(id: string, gameInfo: GameInfo): void {
    const history = loadGameHistory();
    const index = history.findIndex(r => r.id === id);
    if (index !== -1) {
        history[index].gameInfo = gameInfo;
        recordStorage.save(history);
    }
}

// 履歴削除
export function deleteGameRecord(id: string): void {
    const history = loadGameHistory().filter(r => r.id !== id);
    historyStorage.save(history);
}

// 試合名の候補を取得（同日優先、最近の試合名も含む）
export function getGameNameSuggestions(targetDate?: string): string[] {
    const history = loadGameHistory();
    if (history.length === 0) return [];

    const suggestions: string[] = [];
    const seen = new Set<string>();

    // 同日の試合名を優先
    if (targetDate) {
        for (const record of history) {
            const recordDate = record.date.substring(0, 10); // YYYY-MM-DD
            if (recordDate === targetDate && !seen.has(record.gameName)) {
                suggestions.push(record.gameName);
                seen.add(record.gameName);
            }
        }
    }

    // 最近の試合名も追加（最大10件）
    for (const record of history) {
        if (!seen.has(record.gameName) && suggestions.length < 10) {
            suggestions.push(record.gameName);
            seen.add(record.gameName);
        }
    }

    return suggestions;
}
