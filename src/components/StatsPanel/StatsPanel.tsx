import type { Player, PlayerStats } from '../../types/game';
import './StatsPanel.css';

interface StatsPanelProps {
    players: Player[];
    teamName: string;
}

export function StatsPanel({ players, teamName }: StatsPanelProps) {
    const sortedPlayers = [...players].sort((a, b) => b.stats.points - a.stats.points);

    return (
        <div className="stats-panel">
            <h3 className="stats-panel-title">{teamName} 統計</h3>

            <div className="stats-table">
                <div className="stats-header">
                    <span className="stats-col-num">#</span>
                    <span className="stats-col-name">選手</span>
                    <span className="stats-col">PTS</span>
                    <span className="stats-col">2P</span>
                    <span className="stats-col">3P</span>
                    <span className="stats-col">FT</span>
                    <span className="stats-col">REB</span>
                    <span className="stats-col">AST</span>
                    <span className="stats-col">STL</span>
                    <span className="stats-col">BLK</span>
                    <span className="stats-col stats-col-separator">TO</span>
                    <span className="stats-col stats-col-to">DD</span>
                    <span className="stats-col stats-col-to">TR</span>
                    <span className="stats-col stats-col-to">PM</span>
                    <span className="stats-col stats-col-to">CM</span>
                </div>

                {sortedPlayers.map(player => (
                    <div key={player.id} className={`stats-row ${player.isOnCourt ? 'on-court' : ''}`}>
                        <span className="stats-col-num">{player.number}</span>
                        <span className="stats-col-name">{player.name}</span>
                        <span className="stats-col stats-points">{player.stats.points}</span>
                        <span className="stats-col">{formatShot(player.stats.twoPointMade, player.stats.twoPointAttempt)}</span>
                        <span className="stats-col">{formatShot(player.stats.threePointMade, player.stats.threePointAttempt)}</span>
                        <span className="stats-col">{formatShot(player.stats.freeThrowMade, player.stats.freeThrowAttempt)}</span>
                        <span className="stats-col">{player.stats.offensiveRebounds + player.stats.defensiveRebounds}</span>
                        <span className="stats-col">{player.stats.assists}</span>
                        <span className="stats-col">{player.stats.steals}</span>
                        <span className="stats-col">{player.stats.blocks}</span>
                        <span className="stats-col stats-col-separator">{player.stats.turnovers}</span>
                        <span className="stats-col stats-col-to">{player.stats.turnoverDD || 0}</span>
                        <span className="stats-col stats-col-to">{player.stats.turnoverTR || 0}</span>
                        <span className="stats-col stats-col-to">{player.stats.turnoverPM || 0}</span>
                        <span className="stats-col stats-col-to">{player.stats.turnoverCM || 0}</span>
                    </div>
                ))}

                <div className="stats-row stats-total">
                    <span className="stats-col-num"></span>
                    <span className="stats-col-name">合計</span>
                    <span className="stats-col stats-points">{sumStat(players, 'points')}</span>
                    <span className="stats-col">{sumStat(players, 'twoPointMade')}/{sumStat(players, 'twoPointAttempt')}</span>
                    <span className="stats-col">{sumStat(players, 'threePointMade')}/{sumStat(players, 'threePointAttempt')}</span>
                    <span className="stats-col">{sumStat(players, 'freeThrowMade')}/{sumStat(players, 'freeThrowAttempt')}</span>
                    <span className="stats-col">{sumStat(players, 'offensiveRebounds') + sumStat(players, 'defensiveRebounds')}</span>
                    <span className="stats-col">{sumStat(players, 'assists')}</span>
                    <span className="stats-col">{sumStat(players, 'steals')}</span>
                    <span className="stats-col">{sumStat(players, 'blocks')}</span>
                    <span className="stats-col stats-col-separator">{sumStat(players, 'turnovers')}</span>
                    <span className="stats-col stats-col-to">{sumStat(players, 'turnoverDD')}</span>
                    <span className="stats-col stats-col-to">{sumStat(players, 'turnoverTR')}</span>
                    <span className="stats-col stats-col-to">{sumStat(players, 'turnoverPM')}</span>
                    <span className="stats-col stats-col-to">{sumStat(players, 'turnoverCM')}</span>
                </div>
            </div>
        </div>
    );
}

function formatShot(made: number, attempt: number): string {
    if (attempt === 0) return '-';
    return `${made}/${attempt}`;
}

function sumStat(players: Player[], stat: keyof PlayerStats): number {
    return players.reduce((sum, p) => sum + (p.stats[stat] as number), 0);
}
