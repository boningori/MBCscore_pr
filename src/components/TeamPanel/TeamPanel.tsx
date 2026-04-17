import type { Player, ScoreEntry, StatEntry, FoulEntry } from '../../types/game';
import { ActionHistory } from '../ActionHistory';

interface ActionHistoryHandlers {
  onRemoveScore: (entryId: string) => void;
  onRemoveStat: (entryId: string) => void;
  onRemoveFoul: (entryId: string) => void;
  onEditScore: (entryId: string, newPlayerId: string, newScoreType: string) => void;
  onEditStat: (entryId: string, newPlayerId: string, newStatType: string) => void;
  onConvertScoreToMiss: (entryId: string, newMissType: '2PA' | '3PA' | 'FTA') => void;
  onConvertMissToScore: (entryId: string, newScoreType: '2P' | '3P' | 'FT') => void;
  onToggleOwnGoal: (entryId: string) => void;
}

interface TeamPanelProps {
  teamId: 'teamA' | 'teamB';
  teamName: string;
  teamColor: 'white' | 'blue';
  players: Player[];
  isMyTeam?: boolean;
  isActive: boolean;
  selectedPlayerId: string | null;
  gameMode: 'full' | 'simple';
  scoreHistory: ScoreEntry[];
  statHistory: StatEntry[];
  foulHistory: FoulEntry[];
  onPlayerSelect: (playerId: string, teamId: string) => void;
  onSubstitute: () => void;
  onCoachFoul: () => void;
  actionHistoryHandlers: ActionHistoryHandlers;
}

export function TeamPanel({
  teamId,
  teamName,
  teamColor,
  players,
  isMyTeam,
  isActive,
  selectedPlayerId,
  gameMode,
  scoreHistory,
  statHistory,
  foulHistory,
  onPlayerSelect,
  onSubstitute,
  onCoachFoul,
  actionHistoryHandlers,
}: TeamPanelProps) {
  const side = teamId === 'teamA' ? 'team-a' : 'team-b';

  return (
    <div className={`team-panel ${side} color-${teamColor} ${isActive ? 'active' : ''}`}>
      <div className="team-panel-header">
        <span className="team-name">{teamName}</span>
      </div>
      <div className="team-players">
        {players.filter(p => p.isOnCourt).map(player => (
          <div
            key={player.id}
            className={`mini-player-card ${selectedPlayerId === player.id ? 'selected' : ''}`}
            onClick={() => onPlayerSelect(player.id, teamId)}
          >
            <span className="player-num">
              #{player.number}
              {gameMode === 'full' && isMyTeam
                ? (player.courtName ? ` ${player.courtName}` : ` ${player.name}`)
                : ''}
            </span>
            <span className="player-pts">{player.stats.points}</span>
            {player.fouls.length > 0 && (
              <span className={`player-fouls ${player.fouls.length >= 4 ? 'warning' : ''}`}>
                F{player.fouls.length}
              </span>
            )}
          </div>
        ))}
        {gameMode === 'simple' && (
          <button className="simple-sub-btn" onClick={onSubstitute}>
            🔄 交代
          </button>
        )}
      </div>
      <div className="team-bench">
        <div className="bench-actions">
          <button className="btn btn-small" onClick={onSubstitute}>
            交代
          </button>
          <button className="btn btn-small btn-danger" onClick={onCoachFoul}>
            ベンチ<br />ファウル
          </button>
        </div>
      </div>
      {gameMode === 'full' && (
        <ActionHistory
          teamId={teamId}
          teamName={teamName}
          scoreHistory={scoreHistory}
          statHistory={statHistory}
          foulHistory={foulHistory}
          players={players}
          {...actionHistoryHandlers}
        />
      )}
    </div>
  );
}
