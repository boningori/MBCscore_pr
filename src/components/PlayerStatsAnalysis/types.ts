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

// スタッツカラー（棒グラフの塗り・凡例ドット用）。
// 面として見える用途なので、求められるコントラストは3:1（WCAG 1.4.11）。
export const STAT_COLORS: Record<StatType, string> = {
    points: '#3b82f6',
    rebounds: '#22c55e',
    assists: '#f59e0b',
    steals: '#8b5cf6',
    blocks: '#ec4899',
    turnovers: '#ef4444',
};

/**
 * 同じ系列を「文字」に使うとき用（成長グラフの見出し）。
 *
 * 塗り用の STAT_COLORS をそのまま文字にすると、カード地の上でAA(4.5:1)に
 * 届かない（実測: 得点 3.98、スティール 3.45、ブロック 4.15、TO 3.89)。
 * アプリ本体の --primary / --primary-text と同じ「塗り用と文字用を分ける」
 * 作法にそろえ、色相は保ったまま明度だけ上げる。
 * 系列の見分けは棒の色が担うので、見出しが少し淡くなっても対応は崩れない。
 *
 * --bg-secondary（グラフカードの地）と --bg-tertiary の両方で4.6:1以上。
 * 値の根拠は src/components/PlayerStatsAnalysis/statTextColors.test.ts。
 */
export const STAT_TEXT_COLORS: Record<StatType, string> = {
    points: '#80aef9',
    rebounds: '#26c661',
    assists: '#f59e0b',  // 元から足りているので変えない
    steals: '#ba9efa',
    blocks: '#f38cbf',
    turnovers: '#f69191',
};

// Props型
export interface PlayerCardListProps {
    players: AggregatedPlayerStats[];
    /** 非表示にしている選手のキー。全員表示のときにどれが非表示かを示すために使う */
    hiddenPlayerKeys?: ReadonlySet<string>;
    onPlayerClick: (player: AggregatedPlayerStats) => void;
    /** 選択モード中か。true のときカードのタップは選択の切り替えになる */
    selectionMode?: boolean;
    /** 選択中のキー */
    selectedKeys?: ReadonlySet<string>;
    /** 選択の切り替え（選択モード中のみ呼ばれる） */
    onToggleSelect?: (playerKey: string) => void;
    /** 統合済みの代表キー。まとめたことが一覧から分かるように印を出す */
    mergedKeys?: ReadonlySet<string>;
}

export interface DetailViewProps {
    player: AggregatedPlayerStats;
    teamId: string;
    isHidden: boolean;
    onToggleHidden: () => void;
    /** 他のカードをまとめた代表か（解除の操作子を出すかの判断） */
    isMerged?: boolean;
    /** 統合の解除 */
    onUnmerge?: () => void;
}

export interface GrowthComparisonProps {
    gameHistory: PlayerGameRecord[];
}
