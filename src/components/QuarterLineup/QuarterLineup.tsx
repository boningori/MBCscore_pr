import { useState, useEffect } from 'react';
import type { Player } from '../../types/game';
import { PLAYERS_ON_COURT } from '../../types/game';
import './QuarterLineup.css';

interface QuarterLineupProps {
    quarter: number;
    teamName: string;
    players: Player[];
    onConfirm: (startingPlayerIds: string[]) => void;
    onBack?: () => void;
}

export function QuarterLineup({
    quarter,
    teamName,
    players,
    onConfirm,
    onBack,
}: QuarterLineupProps) {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // チームまたはクォーターが変わったら選択をリセット
    useEffect(() => {
        const initialSelected = players
            .filter(p => p.isOnCourt && p.fouls.length < 5)
            .map(p => p.id);
        setSelectedIds(initialSelected);
    }, [teamName, quarter]);

    // 出場可能な選手（5ファウル退場していない）
    const availablePlayers = players.filter(p => p.fouls.length < 5);

    // 前クォーター出場者
    const previousQuarterPlayers = players.filter(
        p => !!p.quartersPlayed[quarter - 2] && quarter > 1
    );

    const handlePlayerToggle = (playerId: string) => {
        if (selectedIds.includes(playerId)) {
            setSelectedIds(selectedIds.filter(id => id !== playerId));
        } else if (selectedIds.length < PLAYERS_ON_COURT) {
            setSelectedIds([...selectedIds, playerId]);
        }
    };

    const handleConfirm = () => {
        if (selectedIds.length === PLAYERS_ON_COURT) {
            onConfirm(selectedIds);
        }
    };

    const isValid = selectedIds.length === PLAYERS_ON_COURT;

    // クォーター色（1Q/3Qは赤、2Q/4Qは黒）
    const quarterClass = quarter === 1 || quarter === 3 ? 'q-odd' : 'q-even';

    return (
        <div className="quarter-lineup">
            <div className="quarter-lineup-header">
                {onBack && (
                    <button className="btn btn-secondary" onClick={onBack}>
                        ← 戻る
                    </button>
                )}
                <div className={`quarter-badge ${quarterClass}`}>
                    Q{quarter}
                </div>
                <h2>{teamName} スタメン選択</h2>
            </div>

            <div className="lineup-status">
                <span className={selectedIds.length === PLAYERS_ON_COURT ? 'complete' : 'incomplete'}>
                    {selectedIds.length} / {PLAYERS_ON_COURT} 名選択
                </span>
            </div>

            {quarter > 1 && previousQuarterPlayers.length > 0 && (
                <div className="previous-quarter-info">
                    <span className="text-muted">前Q出場: </span>
                    {previousQuarterPlayers.map(p => `#${p.number}`).join(', ')}
                </div>
            )}

            <div className="player-selection-grid">
                {availablePlayers.map(player => {
                    const isSelected = selectedIds.includes(player.id);
                    const wasOnCourt = player.isOnCourt;

                    return (
                        <div
                            key={player.id}
                            className={`lineup-player-card ${isSelected ? 'selected' : ''} ${wasOnCourt ? 'was-on-court' : ''}`}
                            onClick={() => handlePlayerToggle(player.id)}
                        >
                            <div className="lineup-player-number">#{player.number}</div>
                            <div className="lineup-player-name">
                                {player.name}
                                {player.isCaptain && <span className="captain-badge">C</span>}
                            </div>
                            <div className="lineup-player-stats">
                                <span className="stat-points">{player.stats.points}pts</span>
                                {player.fouls.length > 0 && (
                                    <span className={`stat-fouls ${player.fouls.length >= 4 ? 'warning' : ''}`}>
                                        F{player.fouls.length}
                                    </span>
                                )}
                            </div>
                            <div className="lineup-player-quarters">
                                {[1, 2, 3, 4].map(q => (
                                    <span
                                        key={q}
                                        className={`quarter-dot ${player.quartersPlayed[q - 1] ? 'played' : ''} ${q === quarter ? 'current' : ''}`}
                                    >
                                        {q}
                                    </span>
                                ))}
                            </div>
                            {isSelected && <div className="selection-check">✓</div>}
                        </div>
                    );
                })}
            </div>

            <div className="quarter-lineup-actions">
                <button
                    className="btn btn-success btn-large"
                    onClick={handleConfirm}
                    disabled={!isValid}
                >
                    {quarter === 1 ? '試合開始' : `Q${quarter} 開始`}
                </button>
            </div>

            <div className="quarter-rule-hint">
                <p className="text-muted text-sm">
                    ※ ミニバスルール: 各選手は最低2Q、最大3Q出場
                </p>
            </div>
        </div>
    );
}
