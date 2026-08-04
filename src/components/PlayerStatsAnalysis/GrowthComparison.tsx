// 成長比較コンポーネント

import { useState, useMemo } from 'react';
import { buildAxisTicks, TICK_COUNT } from './chartAxis';
import {
    aggregateByPeriod,
    type PeriodStats,
    type PeriodType,
} from '../../utils/playerStatsAnalysis';
import {
    STAT_LABELS,
    STAT_UNITS,
    STAT_COLORS,
    type StatType,
    type GrowthComparisonProps,
} from './types';

// Y軸目盛りラベルのフォーマット
function formatTick(value: number): string {
    if (value === 0) return '0';
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(1);
}

// X軸ラベルの短縮フォーマット
function formatXLabel(label: string, periodType: PeriodType): string {
    switch (periodType) {
        case 'game': {
            // "2026/01/15" → "1/15"
            const parts = label.split('/');
            if (parts.length === 3) return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
            return label;
        }
        case 'month': {
            // "2026年1月" → "1月"
            const monthMatch = label.match(/(\d+)月/);
            return monthMatch ? `${monthMatch[1]}月` : label;
        }
        case 'quarter': {
            // "2026年Q1" → "Q1"
            const qMatch = label.match(/(Q\d)/);
            return qMatch ? qMatch[1] : label;
        }
        case 'year': {
            // "2026年" → "'26"
            const yearMatch = label.match(/(\d{4})年/);
            return yearMatch ? `'${yearMatch[1].slice(2)}` : label;
        }
        default:
            return label;
    }
}

export function GrowthComparison({ gameHistory }: GrowthComparisonProps) {
    const [periodType, setPeriodType] = useState<PeriodType>('game');

    const periodStats = useMemo(() => aggregateByPeriod(gameHistory, periodType), [gameHistory, periodType]);

    const getStatValue = (period: PeriodStats, type: StatType): number => {
        switch (type) {
            case 'points': return period.avgStats.points;
            case 'rebounds': return period.avgStats.offensiveRebounds + period.avgStats.defensiveRebounds;
            case 'assists': return period.avgStats.assists;
            case 'steals': return period.avgStats.steals;
            case 'blocks': return period.avgStats.blocks;
            case 'turnovers': return period.avgStats.turnovers;
        }
    };

    const periodLabels: Record<PeriodType, string> = {
        game: '試合',
        month: '月',
        quarter: '四半期',
        year: '年',
    };

    const renderChart = (
        periods: PeriodStats[],
        statType: StatType,
        chartIndex: number
    ) => {
        const reversed = periods.slice().reverse();
        const values = reversed.map(p => getStatValue(p, statType));
        const ticks = buildAxisTicks(values);
        const niceMax = ticks[0];
        const tickCount = TICK_COUNT;

        return (
            <div className="standard-chart" key={statType}>
                <div className="chart-header">
                    <span className="chart-title" style={{ color: STAT_COLORS[statType] }}>
                        {STAT_LABELS[statType]}
                    </span>
                    <span className="chart-unit">({STAT_UNITS[statType]})</span>
                    <span className="chart-subtitle">{periodType === 'game' ? '試合別' : `${periodLabels[periodType]}平均`}</span>
                </div>
                <div className="chart-area">
                    <div className="y-axis">
                        {ticks.map((tick, i) => (
                            <span key={i}>{formatTick(tick)}</span>
                        ))}
                    </div>
                    <div className="chart-scroll-area">
                        <div className="plot-area">
                            {ticks.map((_, i) => (
                                <div
                                    key={`grid-${i}`}
                                    className="grid-line"
                                    style={{ bottom: `${((tickCount - 1 - i) / (tickCount - 1)) * 100}%` }}
                                />
                            ))}
                            {reversed.map((p) => (
                                <div key={`${chartIndex}-${p.periodKey}`} className="bar-wrapper">
                                    <div className="bar-track">
                                        <div
                                            className="bar-fill"
                                            style={{
                                                height: `${(getStatValue(p, statType) / niceMax) * 100}%`,
                                                backgroundColor: STAT_COLORS[statType]
                                            }}
                                        />
                                        <span className="bar-value">{getStatValue(p, statType).toFixed(1)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="x-axis">
                            {reversed.map((p) => (
                                <span key={`x-${chartIndex}-${p.periodKey}`} className="x-label">
                                    {formatXLabel(p.periodLabel, periodType)}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="growth-comparison-section">
            <div className="section-header-row">
                <h4>📈 スタッツの推移</h4>
                <div className="comparison-controls-simple">
                    <select
                        value={periodType}
                        onChange={e => setPeriodType(e.target.value as PeriodType)}
                        className="period-select-simple"
                    >
                        {(['game', 'month', 'quarter', 'year'] as PeriodType[]).map(p => (
                            <option key={p} value={p}>{periodLabels[p]}単位</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="comparison-charts-grid">
                {(Object.keys(STAT_LABELS) as StatType[]).map((stat, index) =>
                    renderChart(periodStats, stat, index)
                )}
            </div>
        </div>
    );
}
