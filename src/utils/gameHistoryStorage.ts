import type { Team, ScoreEntry, StatEntry, FoulEntry } from '../types/game';

const GAME_HISTORY_KEY = 'minibasket-game-history';

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
    date: Date = new Date()
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
        createdAt: new Date().toISOString(),
    };

    try {
        const history = loadGameHistory();
        history.unshift(record); // 新しい順
        localStorage.setItem(GAME_HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
        console.error('Failed to save game result:', error);
    }

    return record;
}

// 試合履歴一覧取得
export function loadGameHistory(): GameRecord[] {
    try {
        const data = localStorage.getItem(GAME_HISTORY_KEY);
        if (!data) return [];
        return JSON.parse(data) as GameRecord[];
    } catch (error) {
        console.error('Failed to load game history:', error);
        return [];
    }
}

// 試合詳細取得
export function loadGameRecord(infoId: string): GameRecord | null {
    const history = loadGameHistory();
    return history.find(r => r.id === infoId) || null;
}

// 履歴削除
export function deleteGameRecord(id: string): void {
    try {
        const history = loadGameHistory().filter(r => r.id !== id);
        localStorage.setItem(GAME_HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
        console.error('Failed to delete game record:', error);
    }
}
