// PlayerStatsAnalysis 共通型定義・定数

import type { AggregatedPlayerStats, PlayerGameRecord } from '../../utils/playerStatsAnalysis';

// ビューモード
export type ViewMode = 'summary' | 'detail';

// スタッツ種類
export type StatType = 'points' | 'rebounds' | 'assists' | 'steals' | 'blocks' | 'turnovers';

// スタッツラベル
export const STAT_LABELS: Record<StatType, string> = {
    points: '得点',
    rebounds: 'リバウンド',
    assists: 'アシスト',
    steals: 'スティール',
    blocks: 'ブロック',
    turnovers: 'TO',
};

// スタッツ単位
export const STAT_UNITS: Record<StatType, string> = {
    points: '点',
    rebounds: '回',
    assists: '回',
    steals: '回',
    blocks: '回',
    turnovers: '回',
};

// スタッツカラー
export const STAT_COLORS: Record<StatType, string> = {
    points: '#3b82f6',
    rebounds: '#22c55e',
    assists: '#f59e0b',
    steals: '#8b5cf6',
    blocks: '#ec4899',
    turnovers: '#ef4444',
};

// 日付フォーマット
export function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return `${(date.getMonth() + 1)}/${date.getDate()}`;
}

// Props型
export interface PlayerCardListProps {
    players: AggregatedPlayerStats[];
    onPlayerClick: (player: AggregatedPlayerStats) => void;
}

export interface DetailViewProps {
    player: AggregatedPlayerStats;
    teamId: string;
    isHidden: boolean;
    onToggleHidden: () => void;
}

export interface GrowthComparisonProps {
    gameHistory: PlayerGameRecord[];
}
