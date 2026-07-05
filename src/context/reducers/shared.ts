import type { ScoreEntry } from '../../types/game';

// ヘルパー関数: ランニングスコアを再計算
export function recalculateRunningScores(
    scoreHistory: ScoreEntry[]
): ScoreEntry[] {
    // タイムスタンプ順にソート
    const sorted = [...scoreHistory].sort((a, b) => a.timestamp - b.timestamp);

    let runningA = 0;
    let runningB = 0;

    return sorted.map(entry => {
        runningA += entry.teamId === 'teamA' ? entry.points : 0;
        runningB += entry.teamId === 'teamB' ? entry.points : 0;
        return {
            ...entry,
            runningScoreA: runningA,
            runningScoreB: runningB,
        };
    });
}
