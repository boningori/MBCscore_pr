import { useState, useEffect, useMemo, useRef } from 'react';
import type { SavedTeam } from '../../utils/teamStorage';
import {
    aggregatePlayerStats,
    aggregateByPeriod,
    getAvailableMyTeams,
    getTeamRecord,
    type AggregatedPlayerStats,
    type PeriodStats,
    type PeriodType,
    type TeamRecord,
} from '../../utils/playerStatsAnalysis';
import { exportElement } from '../../utils/pdfExport';
import './PlayerStatsAnalysis.css';

interface PlayerStatsAnalysisProps {
    onBack: () => void;
}

type ViewMode = 'summary' | 'detail';

export function PlayerStatsAnalysis({ onBack }: PlayerStatsAnalysisProps) {
    const [myTeams, setMyTeams] = useState<SavedTeam[]>([]);
    const [selectedTeam, setSelectedTeam] = useState<SavedTeam | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('summary');
    const [selectedPlayer, setSelectedPlayer] = useState<AggregatedPlayerStats | null>(null);
    const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({});

    useEffect(() => {
        const teams = getAvailableMyTeams();
        setMyTeams(teams);
        if (teams.length > 0) {
            setSelectedTeam(teams[0]);
        }
    }, []);

    const startDate = dateRange.start ? new Date(dateRange.start) : undefined;
    const endDate = dateRange.end ? new Date(dateRange.end + 'T23:59:59') : undefined;

    const playerStats = useMemo(() => {
        if (!selectedTeam) return [];
        return aggregatePlayerStats(selectedTeam, startDate, endDate);
    }, [selectedTeam, startDate, endDate]);

    const teamRecord = useMemo((): TeamRecord | null => {
        if (!selectedTeam) return null;
        return getTeamRecord(selectedTeam, startDate, endDate);
    }, [selectedTeam, startDate, endDate]);

    const handleTeamChange = (teamId: string) => {
        const team = myTeams.find(t => t.id === teamId);
        if (team) {
            setSelectedTeam(team);
            setSelectedPlayer(null);
            setViewMode('summary');
        }
    };

    const handlePlayerClick = (player: AggregatedPlayerStats) => {
        setSelectedPlayer(player);
        setViewMode('detail');
    };

    const handleBackToSummary = () => {
        setViewMode('summary');
        setSelectedPlayer(null);
    };

    if (myTeams.length === 0) {
        return (
            <div className="player-stats-container">
                <div className="player-stats-header">
                    <button className="btn-back" onClick={onBack}>
                        <span className="back-icon">←</span>
                        <span>ホーム</span>
                    </button>
                    <h2>📊 選手スタッツ分析</h2>
                </div>
                <div className="empty-state">
                    <div className="empty-icon">🏀</div>
                    <h3>マイチームが登録されていません</h3>
                    <p>先にマイチームを登録してください</p>
                </div>
            </div>
        );
    }

    if (playerStats.length === 0 && viewMode === 'summary') {
        return (
            <div className="player-stats-container">
                <div className="player-stats-header">
                    <button className="btn-back" onClick={onBack}>
                        <span className="back-icon">←</span>
                        <span>ホーム</span>
                    </button>
                    <h2>📊 選手スタッツ分析</h2>
                </div>
                <div className="controls-bar">
                    <select
                        value={selectedTeam?.id || ''}
                        onChange={e => handleTeamChange(e.target.value)}
                        className="team-select"
                    >
                        {myTeams.map(team => (
                            <option key={team.id} value={team.id}>{team.name}</option>
                        ))}
                    </select>
                </div>
                <div className="empty-state">
                    <div className="empty-icon">📋</div>
                    <h3>試合データがありません</h3>
                    <p>試合を記録すると選手スタッツが表示されます</p>
                </div>
            </div>
        );
    }

    return (
        <div className="player-stats-container">
            <div className="player-stats-header">
                <button className="btn-back" onClick={viewMode === 'summary' ? onBack : handleBackToSummary}>
                    <span className="back-icon">←</span>
                    <span>{viewMode === 'summary' ? 'ホーム' : '一覧'}</span>
                </button>
                {viewMode === 'summary' && <h2>📊 選手スタッツ分析</h2>}
            </div>

            {viewMode === 'summary' && (
                <>
                    <div className="controls-bar">
                        <select
                            value={selectedTeam?.id || ''}
                            onChange={e => handleTeamChange(e.target.value)}
                            className="team-select"
                        >
                            {myTeams.map(team => (
                                <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                        </select>

                        <div className="date-range">
                            <input
                                type="date"
                                value={dateRange.start || ''}
                                onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            />
                            <span className="date-separator">〜</span>
                            <input
                                type="date"
                                value={dateRange.end || ''}
                                onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            />
                            {(dateRange.start || dateRange.end) && (
                                <button
                                    className="btn-reset"
                                    onClick={() => setDateRange({})}
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>

                    {teamRecord && teamRecord.totalGames > 0 && (
                        <div className="team-summary-card">
                            <div className="team-name">{selectedTeam?.name}</div>
                            <div className="team-record">
                                <div className="record-stat total">
                                    <span className="value">{teamRecord.totalGames}</span>
                                    <span className="label">試合</span>
                                </div>
                                <div className="record-stat win">
                                    <span className="value">{teamRecord.wins}</span>
                                    <span className="label">勝</span>
                                </div>
                                <div className="record-stat loss">
                                    <span className="value">{teamRecord.losses}</span>
                                    <span className="label">敗</span>
                                </div>
                                {teamRecord.draws > 0 && (
                                    <div className="record-stat draw">
                                        <span className="value">{teamRecord.draws}</span>
                                        <span className="label">分</span>
                                    </div>
                                )}
                                <div className="record-stat rate">
                                    <span className="value">
                                        {((teamRecord.wins / teamRecord.totalGames) * 100).toFixed(0)}%
                                    </span>
                                    <span className="label">勝率</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <PlayerCardList players={playerStats} onPlayerClick={handlePlayerClick} />
                </>
            )}

            {viewMode === 'detail' && selectedPlayer && (
                <DetailView player={selectedPlayer} />
            )}
        </div>
    );
}

// 選手カードリスト（モバイルフレンドリー）
interface PlayerCardListProps {
    players: AggregatedPlayerStats[];
    onPlayerClick: (player: AggregatedPlayerStats) => void;
}

function PlayerCardList({ players, onPlayerClick }: PlayerCardListProps) {
    return (
        <div className="player-card-list">
            {players.map(player => {
                const totalRebounds = player.avgStats.offensiveRebounds + player.avgStats.defensiveRebounds;
                const fgPercent = player.totalStats.twoPointAttempt + player.totalStats.threePointAttempt > 0
                    ? ((player.totalStats.twoPointMade + player.totalStats.threePointMade) /
                        (player.totalStats.twoPointAttempt + player.totalStats.threePointAttempt) * 100).toFixed(0)
                    : '-';

                return (
                    <div
                        key={player.playerKey}
                        className="player-card"
                        onClick={() => onPlayerClick(player)}
                    >
                        <div className="player-info">
                            <span className="player-number">#{player.number}</span>
                            <span className="player-name">{player.name}</span>
                            <span className="player-games">{player.gamesPlayed}試合</span>
                        </div>
                        <div className="player-stats-grid">
                            <div className="stat-box primary">
                                <span className="stat-value">{player.avgStats.points.toFixed(1)}</span>
                                <span className="stat-label">PTS</span>
                            </div>
                            <div className="stat-box">
                                <span className="stat-value">{totalRebounds.toFixed(1)}</span>
                                <span className="stat-label">REB</span>
                            </div>
                            <div className="stat-box">
                                <span className="stat-value">{player.avgStats.assists.toFixed(1)}</span>
                                <span className="stat-label">AST</span>
                            </div>
                            <div className="stat-box">
                                <span className="stat-value">{fgPercent}%</span>
                                <span className="stat-label">FG</span>
                            </div>
                        </div>
                        <div className="card-arrow">›</div>
                    </div>
                );
            })}
        </div>
    );
}

// 詳細ビュー
interface DetailViewProps {
    player: AggregatedPlayerStats;
}

function DetailView({ player }: DetailViewProps) {
    const detailRef = useRef<HTMLDivElement>(null);
    const totalRebounds = player.totalStats.offensiveRebounds + player.totalStats.defensiveRebounds;
    const avgRebounds = player.avgStats.offensiveRebounds + player.avgStats.defensiveRebounds;
    const stdDevRebounds = player.stdDevStats.offensiveRebounds + player.stdDevStats.defensiveRebounds;

    const playerName = player.name || `#${player.number}`;
    const title = `#${player.number} ${player.name}（${player.gamesPlayed}試合）`;
    const filename = `stats_${playerName}_${player.gamesPlayed}games`;

    // A4縦 (210mm) 最適化: windowWidth=827px, scale=3 → 2481px ≈ 300DPI
    const handleExportPDF = async () => {
        if (!detailRef.current) return;
        await exportElement(detailRef.current, {
            filename, format: 'pdf',
            windowWidth: 827, scale: 3, title,
        });
    };

    const handleExportJPEG = async () => {
        if (!detailRef.current) return;
        await exportElement(detailRef.current, {
            filename, format: 'jpeg',
            windowWidth: 827, scale: 3, title,
        });
    };

    return (
        <div className="player-detail-view">
            {/* エクスポートツールバー */}
            <div className="detail-toolbar">
                <button className="btn btn-primary" onClick={handleExportPDF}>
                    PDF出力
                </button>
                <button className="btn btn-secondary" onClick={handleExportJPEG}>
                    JPEG出力
                </button>
            </div>

            {/* 選手名タイトル */}
            <h2 className="detail-player-title">
                <span className="player-number">#{player.number}</span>
                {player.name}
            </h2>

            <div className="detail-export-area" ref={detailRef}>
            {/* 期間の統計サマリー */}
            <div className="stats-period-header">
                <span className="period-badge">📅 {player.gamesPlayed}試合の統計</span>
            </div>

            {/* ハイライトスタッツ */}
            <div className="highlight-section">
                <div className="section-title">
                    <span className="title-text">📊 試合平均</span>
                    <span className="title-note">±は標準偏差（ばらつき）</span>
                </div>
                <div className="highlight-stats">
                    <div className="highlight-stat primary">
                        <span className="highlight-value">{player.avgStats.points.toFixed(1)}</span>
                        <span className="highlight-std">±{player.stdDevStats.points.toFixed(1)}</span>
                        <span className="highlight-label">得点/試合</span>
                    </div>
                    <div className="highlight-stat">
                        <span className="highlight-value">{avgRebounds.toFixed(1)}</span>
                        <span className="highlight-std">±{stdDevRebounds.toFixed(1)}</span>
                        <span className="highlight-label">REB/試合</span>
                    </div>
                    <div className="highlight-stat">
                        <span className="highlight-value">{player.avgStats.assists.toFixed(1)}</span>
                        <span className="highlight-std">±{player.stdDevStats.assists.toFixed(1)}</span>
                        <span className="highlight-label">AST/試合</span>
                    </div>
                </div>
            </div>

            {/* 詳細スタッツカード */}
            <div className="stats-cards">
                <div className="stats-card">
                    <h4>🏀 シューティング <span className="card-note">（累計成績）</span></h4>
                    <div className="shooting-stats">
                        <ShootingBar
                            label="2P"
                            made={player.totalStats.twoPointMade}
                            attempt={player.totalStats.twoPointAttempt}
                        />
                        <ShootingBar
                            label="3P"
                            made={player.totalStats.threePointMade}
                            attempt={player.totalStats.threePointAttempt}
                        />
                        <ShootingBar
                            label="FT"
                            made={player.totalStats.freeThrowMade}
                            attempt={player.totalStats.freeThrowAttempt}
                        />
                    </div>
                </div>

                <div className="stats-card">
                    <h4>🏀 リバウンド比率 <span className="card-note">（累計）</span></h4>
                    <ReboundPieChart
                        off={player.totalStats.offensiveRebounds}
                        def={player.totalStats.defensiveRebounds}
                    />
                </div>

                <div className="stats-card">
                    <h4>📈 パフォーマンス</h4>
                    <div className="performance-stats">
                        <div className="perf-header">
                            <span></span>
                            <span>平均/試合</span>
                            <span>累計</span>
                        </div>
                        <div className="perf-row stl">
                            <span className="perf-label">スティール</span>
                            <span className="perf-value">{player.avgStats.steals.toFixed(1)}</span>
                            <span className="perf-total">{player.totalStats.steals}</span>
                        </div>
                        <div className="perf-row blk">
                            <span className="perf-label">ブロック</span>
                            <span className="perf-value">{player.avgStats.blocks.toFixed(1)}</span>
                            <span className="perf-total">{player.totalStats.blocks}</span>
                        </div>
                        <div className="perf-row to">
                            <span className="perf-label">ターンオーバー</span>
                            <span className="perf-value">{player.avgStats.turnovers.toFixed(1)}</span>
                            <span className="perf-total">{player.totalStats.turnovers}</span>
                        </div>
                    </div>
                </div>

                <div className="stats-card wide">
                    <h4>⏱️ 累計記録 ({player.gamesPlayed}試合)</h4>
                    <div className="total-stats-grid">
                        <div className="total-stat">
                            <span className="value">{player.totalStats.points}</span>
                            <span className="label">得点</span>
                        </div>
                        <div className="total-stat">
                            <span className="value">{totalRebounds}</span>
                            <span className="label">リバウンド</span>
                        </div>
                        <div className="total-stat">
                            <span className="value">{player.totalStats.assists}</span>
                            <span className="label">アシスト</span>
                        </div>
                        <div className="total-stat">
                            <span className="value">{player.totalStats.steals}</span>
                            <span className="label">スティール</span>
                        </div>
                        <div className="total-stat">
                            <span className="value">{player.totalStats.blocks}</span>
                            <span className="label">ブロック</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 試合別詳細 */}
            <div className="game-history-section">
                <h4>📋 試合別詳細</h4>
                <div className="game-history-header">
                    <span>日付</span>
                    <span></span>
                    <span>対戦相手</span>
                    <span>スコア</span>
                    <div className="stats-header">
                        <span>PTS</span>
                        <span>REB</span>
                        <span>AST</span>
                        <span>STL</span>
                    </div>
                    <div className="to-header">
                        <span>TO</span>
                        <span className="to-sub">DD</span>
                        <span className="to-sub">TR</span>
                        <span className="to-sub">PM</span>
                        <span className="to-sub">CM</span>
                    </div>
                </div>
                <div className="game-history-compact">
                    {player.gameHistory.map(game => (
                        <div key={game.gameId} className={`game-row ${game.result}`}>
                            <span className="game-date">{formatDate(game.date)}</span>
                            <span className={`result-dot ${game.result}`}></span>
                            <span className="game-opponent">{game.opponent}</span>
                            <span className="game-score">{game.teamScore}-{game.opponentScore}</span>
                            <div className="game-stats-compact">
                                <span className="stat-pts">{game.stats.points}</span>
                                <span className="stat-reb">{game.stats.offensiveRebounds + game.stats.defensiveRebounds}</span>
                                <span className="stat-ast">{game.stats.assists}</span>
                                <span className="stat-stl">{game.stats.steals}</span>
                            </div>
                            <div className="game-to-compact">
                                <span className="to-total">{game.stats.turnovers}</span>
                                <span className="to-dd">{game.stats.turnoverDD || 0}</span>
                                <span className="to-tr">{game.stats.turnoverTR || 0}</span>
                                <span className="to-pm">{game.stats.turnoverPM || 0}</span>
                                <span className="to-cm">{game.stats.turnoverCM || 0}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 成長推移（2期間×2スタッツ比較） */}
            <GrowthComparison
                gameHistory={player.gameHistory}
            />
            </div>
        </div>
    );
}

// シューティングバーコンポーネント
function ShootingBar({ label, made, attempt }: { label: string; made: number; attempt: number }) {
    const percent = attempt > 0 ? (made / attempt) * 100 : 0;
    const percentStr = attempt > 0 ? `${percent.toFixed(0)}%` : '-';

    return (
        <div className="shooting-bar-row">
            <span className="shooting-label">{label}</span>
            <div className="shooting-bar-container">
                <div
                    className="shooting-bar-fill"
                    style={{ width: `${percent}%` }}
                />
            </div>
            <span className="shooting-percent">{percentStr}</span>
            <span className="shooting-made">{made}/{attempt}</span>
        </div>
    );
}

// リバウンド比率パイチャート
function ReboundPieChart({ off, def }: { off: number; def: number }) {
    const total = off + def;
    const offPercent = total > 0 ? (off / total) * 100 : 0;

    return (
        <div className="rebound-pie-container">
            <div
                className="rebound-pie"
                style={{
                    background: `conic-gradient(
                        var(--stats-success) 0% ${offPercent}%,
                        #dcfce7 ${offPercent}% 100%
                    )`
                }}
            >
                <div className="pie-center">
                    <span className="pie-total">{total}</span>
                    <span className="pie-label">Total</span>
                </div>
            </div>
            <div className="pie-legend">
                <div className="legend-item">
                    <span className="legend-dot off"></span>
                    <span className="legend-label">OFF</span>
                    <span className="legend-value">{off}</span>
                    <span className="legend-percent">({offPercent.toFixed(0)}%)</span>
                </div>
                <div className="legend-item">
                    <span className="legend-dot def"></span>
                    <span className="legend-label">DEF</span>
                    <span className="legend-value">{def}</span>
                    <span className="legend-percent">({total > 0 ? (100 - offPercent).toFixed(0) : 0}%)</span>
                </div>
            </div>
        </div>
    );
}

// スタッツ種類
type StatType = 'points' | 'rebounds' | 'assists' | 'steals' | 'blocks' | 'turnovers';

const STAT_LABELS: Record<StatType, string> = {
    points: '得点',
    rebounds: 'リバウンド',
    assists: 'アシスト',
    steals: 'スティール',
    blocks: 'ブロック',
    turnovers: 'TO',
};

const STAT_UNITS: Record<StatType, string> = {
    points: '点',
    rebounds: '回',
    assists: '回',
    steals: '回',
    blocks: '回',
    turnovers: '回',
};

const STAT_COLORS: Record<StatType, string> = {
    points: '#3b82f6',
    rebounds: '#22c55e',
    assists: '#f59e0b',
    steals: '#8b5cf6',
    blocks: '#ec4899',
    turnovers: '#ef4444',
};

// 成長比較コンポーネント
interface GrowthComparisonProps {
    gameHistory: import('../../utils/playerStatsAnalysis').PlayerGameRecord[];
}

function GrowthComparison({ gameHistory }: GrowthComparisonProps) {
    const [periodType, setPeriodType] = useState<PeriodType>('month');

    // 選択された期間で集計
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
        const rawMax = Math.max(...reversed.map(p => getStatValue(p, statType)), 1);
        // きりの良い最大値を計算（5段階目盛りに適した値）
        const niceMax = getNiceMaxValue(rawMax);
        const tickCount = 5;
        const ticks = Array.from({ length: tickCount }, (_, i) => niceMax - (niceMax / (tickCount - 1)) * i);

        return (
            <div className="standard-chart" key={statType}>
                <div className="chart-header">
                    <span className="chart-title" style={{ color: STAT_COLORS[statType] }}>
                        {STAT_LABELS[statType]}
                    </span>
                    <span className="chart-unit">({STAT_UNITS[statType]})</span>
                    <span className="chart-subtitle">{periodLabels[periodType]}平均</span>
                </div>
                <div className="chart-area">
                    {/* Y軸（固定） */}
                    <div className="y-axis">
                        {ticks.map((tick, i) => (
                            <span key={i}>{formatTick(tick)}</span>
                        ))}
                    </div>
                    {/* スクロール可能エリア */}
                    <div className="chart-scroll-area">
                        <div className="plot-area">
                            {/* グリッド線 */}
                            {ticks.map((_, i) => (
                                <div
                                    key={`grid-${i}`}
                                    className="grid-line"
                                    style={{ bottom: `${(i / (tickCount - 1)) * 100}%` }}
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
                <h4>📈 成長推移比較</h4>
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

// Y軸のきりの良い最大値を計算
function getNiceMaxValue(rawMax: number): number {
    if (rawMax <= 0) return 1;
    // 目盛り間隔の候補: 1, 2, 2.5, 5, 10, 20, 25, 50, ...
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
    const normalized = rawMax / magnitude;
    let niceStep: number;
    if (normalized <= 1) niceStep = 0.25 * magnitude;
    else if (normalized <= 2) niceStep = 0.5 * magnitude;
    else if (normalized <= 5) niceStep = 1 * magnitude;
    else niceStep = 2 * magnitude;
    // 4段階分（5目盛り）でrawMaxを超える値
    return Math.ceil(rawMax / niceStep) * niceStep;
}

// Y軸目盛りラベルのフォーマット
function formatTick(value: number): string {
    if (value === 0) return '0';
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(1);
}

// X軸ラベルの短縮フォーマット
function formatXLabel(label: string, periodType: PeriodType): string {
    switch (periodType) {
        case 'game':
            // "2026/01/15" → "1/15"
            const parts = label.split('/');
            if (parts.length === 3) return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
            return label;
        case 'month':
            // "2026年1月" → "1月"
            const monthMatch = label.match(/(\d+)月/);
            return monthMatch ? `${monthMatch[1]}月` : label;
        case 'quarter':
            // "2026年Q1" → "Q1"
            const qMatch = label.match(/(Q\d)/);
            return qMatch ? qMatch[1] : label;
        case 'year':
            // "2026年" → "'26"
            const yearMatch = label.match(/(\d{4})年/);
            return yearMatch ? `'${yearMatch[1].slice(2)}` : label;
        default:
            return label;
    }
}

// ユーティリティ関数
function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return `${(date.getMonth() + 1)}/${date.getDate()}`;
}
