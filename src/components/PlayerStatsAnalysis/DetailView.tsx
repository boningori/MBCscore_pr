// 詳細ビューコンポーネント

import { useRef } from 'react';
import { exportElement } from '../../utils/pdfExport';
import { useExportAction } from '../../hooks/useExportAction';
import { formatPlayerNumber } from '../../utils/playerNumber';
import { splitPercent } from '../../utils/percentSplit';
import { GrowthComparison } from './GrowthComparison';
import { RecentForm } from './RecentForm';
import { WinLossSplit } from './WinLossSplit';
import { Workload } from './Workload';
import { formatDate, type DetailViewProps } from './types';

/**
 * 「±（標準偏差）」を出しはじめる試合数。
 *
 * 計算は2試合から可能だが、2試合の標準偏差は差の半分にしかならず、
 * 「ばらつき」として読むと実態を表さない。数字が出ている＝根拠がある、と
 * 受け取られるので、根拠が薄いうちは出さずに理由を書く。
 */
const MIN_GAMES_FOR_STD_DEV = 3;

export function DetailView({ player, isHidden, onToggleHidden }: DetailViewProps) {
    const showStdDev = player.gamesPlayed >= MIN_GAMES_FOR_STD_DEV;
    const detailRef = useRef<HTMLDivElement>(null);
    const { isExporting, runExport } = useExportAction();
    const totalRebounds = player.totalStats.offensiveRebounds + player.totalStats.defensiveRebounds;
    const avgRebounds = player.avgStats.offensiveRebounds + player.avgStats.defensiveRebounds;
    // 平均は足してよいが標準偏差は足せない。理由は AggregatedPlayerStats.reboundsStdDev のコメント
    const stdDevRebounds = player.reboundsStdDev;
    // フィールドゴール＝2P+3P。FTは含めない（一覧のFG%・並べ替えと同じ定義）
    const fieldGoalMade = player.totalStats.twoPointMade + player.totalStats.threePointMade;
    const fieldGoalAttempt = player.totalStats.twoPointAttempt + player.totalStats.threePointAttempt;

    const playerName = player.name || `#${formatPlayerNumber(player.number)}`;
    const title = `#${formatPlayerNumber(player.number)} ${player.name}（${player.gamesPlayed}試合）`;
    const filename = `stats_${playerName}_${player.gamesPlayed}games`;

    const handleExportPDF = () => {
        if (!detailRef.current) return;
        const element = detailRef.current;
        return runExport(() => exportElement(element, {
            filename, format: 'pdf',
            windowWidth: 827, scale: 3, title,
        }), 'PDF');
    };

    const handleExportJPEG = () => {
        if (!detailRef.current) return;
        const element = detailRef.current;
        return runExport(() => exportElement(element, {
            filename, format: 'jpeg',
            windowWidth: 827, scale: 3, title,
        }), 'JPEG');
    };

    return (
        <div className="player-detail-view">
            <div className="detail-toolbar">
                <button className="btn btn-primary" onClick={handleExportPDF} disabled={isExporting}>
                    PDF出力
                </button>
                <button className="btn btn-secondary" onClick={handleExportJPEG} disabled={isExporting}>
                    JPEG出力
                </button>
                {/* ボタンのラベルは差し替えず別領域で知らせ、読み上げ名を保つ */}
                <span className="detail-export-status" role="status">
                    {isExporting ? '出力中… そのままお待ちください' : ''}
                </span>
                {/*
                  「表示中／非表示中」だけでは何が表示されるのか分からない。
                  この切り替えが効くのは選手スタッツ分析の一覧と集計だけで、
                  試合記録やマイチームの名簿には影響しないため、対象を明示する。
                */}
                <label className={`toggle-switch ${isHidden ? 'hidden-state' : ''}`}>
                    <span className="toggle-label">
                        選手スタッツ一覧に{isHidden ? '非表示' : '表示'}
                    </span>
                    <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={onToggleHidden}
                        aria-label={`${player.name}を選手スタッツ一覧に表示する`}
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
                        <span className="title-note">
                            {showStdDev
                                ? '±は標準偏差（ばらつき）'
                                : `ばらつき（±）は${MIN_GAMES_FOR_STD_DEV}試合以上から表示します`}
                        </span>
                    </div>
                    <div className="highlight-stats">
                        <div className="highlight-stat primary">
                            <span className="highlight-value">{player.avgStats.points.toFixed(1)}</span>
                            {showStdDev && <span className="highlight-std">±{player.stdDevStats.points.toFixed(1)}</span>}
                            <span className="highlight-label">得点/試合</span>
                        </div>
                        <div className="highlight-stat">
                            <span className="highlight-value">{avgRebounds.toFixed(1)}</span>
                            {showStdDev && <span className="highlight-std">±{stdDevRebounds.toFixed(1)}</span>}
                            <span className="highlight-label">REB/試合</span>
                        </div>
                        <div className="highlight-stat">
                            <span className="highlight-value">{player.avgStats.assists.toFixed(1)}</span>
                            {showStdDev && <span className="highlight-std">±{player.stdDevStats.assists.toFixed(1)}</span>}
                            <span className="highlight-label">AST/試合</span>
                        </div>
                    </div>
                </div>

                <Workload player={player} />

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
                            {/*
                              一覧のカードと並べ替え（FG%が高い順）が使っている数字。
                              詳細に無いと、一覧で見て並べ替えた根拠がここで消える。
                              FTはフィールドゴールではないので含めない（一覧と同じ定義）
                            */}
                            <div className="shooting-total">
                                <ShootingBar
                                    label="FG"
                                    made={fieldGoalMade}
                                    attempt={fieldGoalAttempt}
                                />
                                <span className="shooting-total-note">FG＝2P+3P（FTは含みません）</span>
                            </div>
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
                            {/* ファウルは PlayerStats に無いため、これまで分析側に出ていなかった */}
                            <div className="perf-row foul">
                                <span className="perf-label">ファウル</span>
                                <span className="perf-value">{(player.totalFouls / player.gamesPlayed).toFixed(1)}</span>
                                <span className="perf-total">{player.totalFouls}</span>
                            </div>
                        </div>
                        {player.foulOutGames > 0 && (
                            <p className="perf-note">
                                退場・失格 {player.foulOutGames}試合（{player.gamesPlayed}試合中）
                            </p>
                        )}
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
                        <span className="foul-header">F</span>
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
                                {/* 退場・失格した試合は数字だけでは分からないので印を付ける */}
                                <span className={`game-fouls ${game.fouledOut ? 'fouled-out' : ''}`}>
                                    {game.fouls}{game.fouledOut ? '!' : ''}
                                </span>
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
    // 円グラフの角度は丸めない生の割合、凡例の表示は合計100%になる整数を使う
    const offPercent = total > 0 ? (off / total) * 100 : 0;
    const { part: offLabel, rest: defLabel } = splitPercent(off, total);

    return (
        <div className="rebound-pie-container">
            <div
                className="rebound-pie"
                // html2canvasはconic-gradientを描けないため、出力時にこの割合から
                // PNGを描き直す（src/utils/pdfExport.ts の repaintPieCharts）
                data-pie-percent={offPercent}
                style={{
                    // DEF側は面として見える中立色。淡い緑(#dcfce7)は暗い画面で浮くため
                    // 凡例ドットと同じ --stats-success-pale を使う
                    background: `conic-gradient(
                        var(--stats-success) 0% ${offPercent}%,
                        var(--stats-success-pale) ${offPercent}% 100%
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
                    <span className="legend-percent">({offLabel}%)</span>
                </div>
                <div className="legend-item">
                    <span className="legend-dot def"></span>
                    <span className="legend-label">DEF</span>
                    <span className="legend-value">{def}</span>
                    <span className="legend-percent">({defLabel}%)</span>
                </div>
            </div>
        </div>
    );
}
