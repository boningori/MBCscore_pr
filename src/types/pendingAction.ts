// 保留アクションの型定義

// コート上にいた選手の情報（軽量版）
export interface PlayerSnapshot {
    id: string;
    number: number;
    name: string;
    courtName?: string;
}

// 保留アクション
export interface PendingAction {
    id: string;
    actionType: 'SCORE' | 'STAT' | 'FOUL';
    value: string; // '2P', '3P', 'FT', 'OREB', 'DREB', 'AST', 'STL', 'BLK', 'TO', '2PA', '3PA', 'FTA', etc.
    teamId: 'teamA' | 'teamB';
    quarter: number;
    timestamp: number; // Date.now()
    playersOnCourt: PlayerSnapshot[]; // その時点でコート上にいた選手
    candidatePlayerIds: string[]; // 候補として選択された選手ID（任意）
}

// 保留アクション作成ヘルパー
export const createPendingAction = (
    actionType: PendingAction['actionType'],
    value: string,
    teamId: 'teamA' | 'teamB',
    quarter: number,
    playersOnCourt: PlayerSnapshot[],
    candidatePlayerIds: string[] = []
): PendingAction => ({
    id: crypto.randomUUID(),
    actionType,
    value,
    teamId,
    quarter,
    timestamp: Date.now(),
    playersOnCourt,
    candidatePlayerIds,
});
