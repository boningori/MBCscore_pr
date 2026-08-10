import { useState } from 'react';
import type { PendingAction, PlayerSnapshot } from '../../types/pendingAction';
import { formatPlayerNumber } from '../../utils/playerNumber';
import { actionLabel } from '../../utils/actionLabels';
import { Modal } from '../Modal';
import './PendingActionResolver.css';

interface PendingActionResolverProps {
    pendingAction: PendingAction;
    onResolve: (playerId: string) => void;
    onCancel: () => void;
}

// 時刻フォーマット
const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

export function PendingActionResolver({
    pendingAction,
    onResolve,
    onCancel,
}: PendingActionResolverProps) {
    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

    const handleConfirm = () => {
        if (selectedPlayerId) {
            onResolve(selectedPlayerId);
        }
    };

    const isCandidate = (playerId: string): boolean => {
        return pendingAction.candidatePlayerIds.includes(playerId);
    };

    return (
        <Modal
            onClose={onCancel}
            overlayClassName="pending-resolver-overlay"
            contentClassName="pending-resolver-modal"
            labelledBy="pending-resolver-title"
        >
                <div className="resolver-header">
                    <h3 id="pending-resolver-title">保留アクションの解決</h3>
                </div>

                <div className="resolver-info">
                    <div className="resolver-action-type">
                        {actionLabel(pendingAction.actionType, pendingAction.value)}
                    </div>
                    <div className="resolver-meta">
                        <span className="resolver-quarter">Q{pendingAction.quarter}</span>
                        <span className="resolver-time">{formatTime(pendingAction.timestamp)}</span>
                    </div>
                </div>

                <div className="resolver-instruction">
                    その時コート上にいた選手から選択してください:
                </div>

                {pendingAction.candidatePlayerIds.length > 0 && (
                    <div className="resolver-candidates-hint">
                        ★ = 候補選手
                    </div>
                )}

                <div className="resolver-players">
                    {pendingAction.playersOnCourt.map((player: PlayerSnapshot) => (
                        <button
                            key={player.id}
                            className={`resolver-player-btn ${selectedPlayerId === player.id ? 'selected' : ''
                                } ${isCandidate(player.id) ? 'candidate' : ''}`}
                            onClick={() => setSelectedPlayerId(player.id)}
                        >
                            <span className="player-number">#{formatPlayerNumber(player.number)}</span>
                            {player.courtName && (
                                <span className="player-name">{player.courtName}</span>
                            )}
                            {!player.courtName && player.name && (
                                <span className="player-name">{player.name}</span>
                            )}
                            {isCandidate(player.id) && <span className="candidate-star">★</span>}
                        </button>
                    ))}
                </div>

                <div className="resolver-buttons">
                    <button
                        className="btn btn-primary"
                        onClick={handleConfirm}
                        disabled={!selectedPlayerId}
                    >
                        確定
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={onCancel}
                    >
                        キャンセル
                    </button>
                </div>
        </Modal>
    );
}
