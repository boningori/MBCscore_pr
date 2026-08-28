// 成長比較コンポーネント

import { useState, useMemo, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { buildAxisTicks, formatBarValue, formatTick, TICK_COUNT } from './chartAxis';
// 年をまたぐと「6月／6月」「Q2／Q2」が並んで区別できなくなる。
// 判定には並び全体が要るので、1つずつではなくまとめて組み立てる
import {
    buildXLabels,
    labelColumnWidth,
    labelStep,
    isExportLabelVisible,
    EXPORT_PLOT_WIDTH,
} from './chartXLabel';
import { scrollToLatest, syncScrollLeft } from './chartScroll';
import {
    aggregateByPeriod,
    type PeriodStats,
    type PeriodType,
} from '../../utils/playerStatsAnalysis';
import {
    STAT_LABELS,
    STAT_UNITS,
    STAT_COLORS,
    STAT_TEXT_COLORS,
    type StatType,
    type GrowthComparisonProps,
} from './types';

export function GrowthComparison({ gameHistory }: GrowthComparisonProps) {
    const [periodType, setPeriodType] = useState<PeriodType>('game');

    const periodStats = useMemo(() => aggregateByPeriod(gameHistory, periodType), [gameHistory, periodType]);

    // 6枚ぶんの横スクロール枠。位置の初期化と同期に使う（詳細は chartScroll）
    const axisRefs = useRef<(HTMLDivElement | null)[]>([]);

    const showLatest = useCallback(() => {
        for (const axis of axisRefs.current) scrollToLatest(axis);
    }, []);

    // 期間の切り替えと画面幅の変化のたびに右端＝最新へ寄せ直す。
    // 左端のままだと、20試合の選手をタブレットで開いても最初の5試合しか見えない
    useEffect(() => {
        showLatest();
        window.addEventListener('resize', showLatest);
        return () => window.removeEventListener('resize', showLatest);
    }, [showLatest, periodStats]);

    // 1枚を動かしたら残りもそろえる。別々に動くと、得点とリバウンドで
    // 同じ横位置が別の期間を指してしまい、並べて比べられない
    const handleAxisScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        syncScrollLeft(e.currentTarget, axisRefs.current);
    }, []);

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
        // 列幅はラベルに合わせる。20px固定だと、年をまたいだときに添えた年ごと
        // 省略されて読めなくなる（詳細は labelColumnWidth）
        const columnWidth = labelColumnWidth(xLabels);
        // 出力は幅固定の1枚画像で、横スクロールで逃がせない。列を縮めて全部の棒を
        // 入れるかわりに、重なるラベルだけ間引く（詳細は chartXLabel の labelStep）
        const exportStep = labelStep(xLabels.length, EXPORT_PLOT_WIDTH, columnWidth);
        // 試合単位は回数そのもの、それ以外は期間平均（詳細は chartAxis.formatBarValue）。
        // 軸の刻みと棒の桁は同じ判断から出す。片方だけ値の整数性で決めていたため、
        // 月平均がたまたま全部整数になった月だけ軸の刻みが変わっていた
        const wholeNumbers = periodType === 'game';
        const ticks = buildAxisTicks(values, wholeNumbers);
        const niceMax = ticks[0];
        const tickCount = TICK_COUNT;

        return (
            <div
                className="standard-chart"
                key={statType}
                style={{ '--chart-col-width': `${columnWidth}px` } as CSSProperties}
            >
                <div className="chart-header">
                    {/* 見出しは文字用の系列色。塗り用の STAT_COLORS を文字にすると
                        カード地の上でAAに届かない（types.ts の STAT_TEXT_COLORS） */}
                    <span className="chart-title" style={{ color: STAT_TEXT_COLORS[statType] }}>
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
                    <div
                        className="chart-scroll-area"
                        ref={el => { axisRefs.current[chartIndex] = el; }}
                        onScroll={handleAxisScroll}
                    >
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
                                <span
                                    key={`x-${chartIndex}-${p.periodKey}`}
                                    className="x-label"
                                    // 画面では常に表示。出力のときだけCSSがこの値を読む
                                    style={{
                                        '--export-label-vis':
                                            isExportLabelVisible(i, xLabels.length, exportStep) ? 'visible' : 'hidden',
                                    } as CSSProperties}
                                >
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
