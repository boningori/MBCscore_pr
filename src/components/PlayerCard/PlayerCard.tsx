import type { Player } from '../../types/game';
import { MAX_PERSONAL_FOULS } from '../../types/game';
import './PlayerCard.css';

interface PlayerCardProps {
    player: Player;
    teamId: string;
    isSelected: boolean;
    onClick: () => void;
    showStats?: boolean;
}

export function PlayerCard({ player, isSelected, onClick, showStats = true }: PlayerCardProps) {
    const isFouledOut = player.fouls.length >= 5;

    return (
        <div
            className={`player-card ${isSelected ? 'selected' : ''} ${player.isOnCourt ? 'on-court' : ''} ${isFouledOut ? 'fouled-out' : ''}`}
            onClick={onClick}
        >
            <div className="player-number">{player.number}</div>

            <div className="player-info">
                <span className={`player-name ${player.isCaptain ? 'captain' : ''}`}>
                    {player.name}
                </span>

                {showStats && (
                    <div className="player-quick-stats">
                        <span className="stat-points">{player.stats.points}pts</span>
                        {player.fouls.length > 0 && (
                            <span className={`stat-fouls ${player.fouls.length >= 4 ? 'warning' : ''}`}>
                                F{player.fouls.length}
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="player-fouls">
                {player.fouls.map((foul, index) => (
                    <span key={index} className={`foul-indicator ${index >= MAX_PERSONAL_FOULS ? 'extra-foul' : ''}`}>{foul}</span>
                ))}
                {player.fouls.length < MAX_PERSONAL_FOULS && Array.from({ length: MAX_PERSONAL_FOULS - player.fouls.length }).map((_, index) => (
                    <span key={`empty-${index}`} className="foul-indicator empty" />
                ))}
            </div>

            {player.isOnCourt && <div className="on-court-badge">ON</div>}
        </div>
    );
}

// コンパクトな選手リスト表示
interface PlayerListProps {
    players: Player[];
    teamId: string;
    selectedPlayerId: string | null;
    onPlayerSelect: (playerId: string, teamId: string) => void;
    title?: string;
    showOnCourt?: boolean;
}

export function PlayerList({
    players,
    teamId,
    selectedPlayerId,
    onPlayerSelect,
    title,
    showOnCourt = true
}: PlayerListProps) {
    const filteredPlayers = showOnCourt
        ? players.filter(p => p.isOnCourt)
        : players.filter(p => !p.isOnCourt);

    return (
        <div className="player-list-container">
            {title && <h3 className="player-list-title">{title}</h3>}
            <div className="player-list">
                {filteredPlayers.map(player => (
                    <PlayerCard
                        key={player.id}
                        player={player}
                        teamId={teamId}
                        isSelected={selectedPlayerId === player.id}
                        onClick={() => onPlayerSelect(player.id, teamId)}
                    />
                ))}
                {filteredPlayers.length === 0 && (
                    <div className="player-list-empty text-muted">
                        選手がいません
                    </div>
                )}
            </div>
        </div>
    );
}
