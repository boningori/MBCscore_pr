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
        id: `game-${date.getTime()}`,
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

// 試合履歴一覧取得
export function loadGameHistory(): GameRecord[] {
    return historyStorage.load();
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
