// 詳細ビューコンポーネント

import { useRef } from 'react';
import { exportElement } from '../../utils/pdfExport';
import { formatPlayerNumber } from '../../utils/playerNumber';
import { GrowthComparison } from './GrowthComparison';
import { RecentForm } from './RecentForm';
import { WinLossSplit } from './WinLossSplit';
import { formatDate, type DetailViewProps } from './types';

export function DetailView({ player, isHidden, onToggleHidden }: DetailViewProps) {
    const detailRef = useRef<HTMLDivElement>(null);
    const totalRebounds = player.totalStats.offensiveRebounds + player.totalStats.defensiveRebounds;
    const avgRebounds = player.avgStats.offensiveRebounds + player.avgStats.defensiveRebounds;
    const stdDevRebounds = player.stdDevStats.offensiveRebounds + player.stdDevStats.defensiveRebounds;

    const playerName = player.name || `#${formatPlayerNumber(player.number)}`;
    const title = `#${formatPlayerNumber(player.number)} ${player.name}（${player.gamesPlayed}試合）`;
    const filename = `stats_${playerName}_${player.gamesPlayed}games`;

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
            <div className="detail-toolbar">
                <button className="btn btn-primary" onClick={handleExportPDF}>
                    PDF出力
                </button>
                <button className="btn btn-secondary" onClick={handleExportJPEG}>
                    JPEG出力
                </button>
                <label className={`toggle-switch ${isHidden ? 'hidden-state' : ''}`}>
                    <span className="toggle-label">{isHidden ? '非表示中' : '表示中'}</span>
                    <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={onToggleHidden}
                    />
                    <span className="toggle-slider"></span>
                </label>
            </div>

            <h2 className="detail-player-title">
                <span className="player-number">#{formatPlayerNumber(player.number)}</span>
                {player.name}
            </h2>

            <div className="detail-export-area" ref={detailRef}>
                <div className="stats-period-header">
                    <span className="period-badge">📅 {player.gamesPlayed}試合の統計</span>
                </div>

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

                <RecentForm gameHistory={player.gameHistory} />

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

                <WinLossSplit gameHistory={player.gameHistory} />

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

                <GrowthComparison gameHistory={player.gameHistory} />
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
