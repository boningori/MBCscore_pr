import type { Player, ScoreEntry, StatEntry, FoulEntry } from '../../types/game';
import { formatPlayerNumber } from '../../utils/playerNumber';
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
  /** 現クォーターのチームファウル数（指定時のみヘッダーにTFバッジを表示） */
  teamFouls?: number;
  /** 現クォーターのタイムアウト使用済みか */
  timeoutUsed?: boolean;
  /** タイムアウト記録の要求（指定時のみヘッダーに⏱チップを表示） */
  onTimeoutRequest?: () => void;
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
  teamFouls,
  timeoutUsed,
  onTimeoutRequest,
}: TeamPanelProps) {
  const side = teamId === 'teamA' ? 'team-a' : 'team-b';

  return (
    <div className={`team-panel ${side} color-${teamColor} ${isActive ? 'active' : ''}`}>
      <div className="team-panel-header">
        <span className="team-name">{teamName}</span>
        {/* チーム帰属の状態(TF・タイムアウト)はチームパネル側に表示する */}
        <div className="team-panel-status">
          {teamFouls !== undefined && (
            <span className={`tf-badge ${teamFouls >= 4 ? 'bonus' : ''}`}>TF {teamFouls}</span>
          )}
          {onTimeoutRequest && (
            <button
              className="btn-timeout-chip"
              onClick={onTimeoutRequest}
              disabled={timeoutUsed}
              aria-label="タイムアウト"
              title="タイムアウト"
            >
              ⏱ {timeoutUsed ? '済' : '残1'}
            </button>
          )}
        </div>
      </div>
      <div className="team-players">
        {players.filter(p => p.isOnCourt).map(player => {
          const displayName = player.courtName || player.name;
          return (
            <button
              type="button"
              key={player.id}
              className={`mini-player-card ${selectedPlayerId === player.id ? 'selected' : ''}`}
              onClick={() => onPlayerSelect(player.id, teamId)}
              aria-pressed={selectedPlayerId === player.id}
              aria-label={`#${formatPlayerNumber(player.number)} ${displayName} ${player.stats.points}点${player.fouls.length > 0 ? ` ファウル${player.fouls.length}` : ''}`}
            >
              <span className="player-num">
                #{formatPlayerNumber(player.number)}
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
              {/* 選択中の目印。aria-pressedで状態は伝わるので読み上げからは外す */}
              {selectedPlayerId === player.id && (
                <span className="player-check" aria-hidden="true">✓</span>
              )}
            </button>
          );
        })}
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
