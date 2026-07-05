// 選手カードリストコンポーネント

import type { PlayerCardListProps } from './types';

export function PlayerCardList({ players, onPlayerClick }: PlayerCardListProps) {
    return (
        <div className="player-card-list">
            {players.map(player => {
                const totalRebounds = player.avgStats.offensiveRebounds + player.avgStats.defensiveRebounds;
                const fgPercent = player.totalStats.twoPointAttempt + player.totalStats.threePointAttempt > 0
                    ? ((player.totalStats.twoPointMade + player.totalStats.threePointMade) /
                        (player.totalStats.twoPointAttempt + player.totalStats.threePointAttempt) * 100).toFixed(0)
                    : '-';

                return (
                    <button
                        type="button"
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
                    </button>
                );
            })}
        </div>
    );
}
