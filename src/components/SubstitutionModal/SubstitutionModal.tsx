import { useState } from 'react';
import type { Player } from '../../types/game';
import './SubstitutionModal.css';

interface SubstitutionModalProps {
    teamName: string;
    teamId: string;
    players: Player[];
    onSubstitute: (playerInId: string, playerOutId: string) => void;
    onClose: () => void;
}

export function SubstitutionModal({
    teamName,
    players,
    onSubstitute,
    onClose,
}: SubstitutionModalProps) {
    const [playerOut, setPlayerOut] = useState<string | null>(null);
    const [playerIn, setPlayerIn] = useState<string | null>(null);

    const onCourtPlayers = players.filter(p => p.isOnCourt && p.fouls.length < 5);
    const benchPlayers = players.filter(p => !p.isOnCourt && p.fouls.length < 5);

    const handleConfirm = () => {
        if (playerOut && playerIn) {
            onSubstitute(playerIn, playerOut);
            onClose();
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content substitution-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">選手交代 - {teamName}</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="substitution-grid">
                    <div className="substitution-column">
                        <h3 className="sub-column-title">コート (OUT)</h3>
                        <div className="sub-player-list">
                            {onCourtPlayers.map(player => (
                                <div
                                    key={player.id}
                                    className={`sub-player-card ${playerOut === player.id ? 'selected out' : ''}`}
                                    onClick={() => setPlayerOut(player.id)}
                                >
                                    <span className="sub-player-number">#{player.number}</span>
                                    <span className="sub-player-name">{player.name}</span>
                                    <span className="sub-player-stats">{player.stats.points}pts</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="substitution-arrow">
                        {playerOut && playerIn ? '⇄' : '→'}
                    </div>

                    <div className="substitution-column">
                        <h3 className="sub-column-title">ベンチ (IN)</h3>
                        <div className="sub-player-list">
                            {benchPlayers.map(player => (
                                <div
                                    key={player.id}
                                    className={`sub-player-card ${playerIn === player.id ? 'selected in' : ''}`}
                                    onClick={() => setPlayerIn(player.id)}
                                >
                                    <span className="sub-player-number">#{player.number}</span>
                                    <span className="sub-player-name">{player.name}</span>
                                    <span className="sub-player-quarters">
                                        Q: {player.quartersPlayed.map((q, i) => q ? i + 1 : '').filter(Boolean).join(',') || '-'}
                                    </span>
                                </div>
                            ))}
                            {benchPlayers.length === 0 && (
                                <div className="sub-empty">ベンチに選手がいません</div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="substitution-actions">
                    <button className="btn btn-secondary btn-large" onClick={onClose}>
                        キャンセル
                    </button>
                    <button
                        className="btn btn-success btn-large"
                        onClick={handleConfirm}
                        disabled={!playerOut || !playerIn}
                    >
                        交代実行
                    </button>
                </div>
            </div>
        </div>
    );
}
