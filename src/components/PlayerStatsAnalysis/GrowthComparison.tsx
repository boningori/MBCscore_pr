// 成長比較コンポーネント

import { useState, useMemo } from 'react';
import { buildAxisTicks, formatBarValue, formatTick, TICK_COUNT } from './chartAxis';
// 年をまたぐと「6月／6月」「Q2／Q2」が並んで区別できなくなる。
// 判定には並び全体が要るので、1つずつではなくまとめて組み立てる
import { buildXLabels } from './chartXLabel';
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
        const xLabels = buildXLabels(reversed.map(p => p.periodLabel), periodType);
        const ticks = buildAxisTicks(values);
        const niceMax = ticks[0];
        const tickCount = TICK_COUNT;
        // 試合単位は回数そのもの、それ以外は期間平均（詳細は chartAxis.formatBarValue）
        const wholeNumbers = periodType === 'game';

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
                                        <span className="bar-value">{formatBarValue(getStatValue(p, statType), wholeNumbers)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="x-axis">
                            {reversed.map((p, i) => (
                                <span key={`x-${chartIndex}-${p.periodKey}`} className="x-label">
                                    {xLabels[i]}
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
