import { useState } from 'react';
import type { PendingAction, PlayerSnapshot } from '../../types/pendingAction';
import './PendingActionResolver.css';

interface PendingActionResolverProps {
    pendingAction: PendingAction;
    onResolve: (playerId: string) => void;
    onCancel: () => void;
}

// アクションタイプの日本語表示
const getActionLabel = (actionType: string, value: string): string => {
    if (actionType === 'SCORE') {
        switch (value) {
            case '2P': return '2P成功';
            case '3P': return '3P成功';
            case 'FT': return 'FT成功';
            default: return value;
        }
    }
    if (actionType === 'STAT') {
        switch (value) {
            case 'OREB': return 'オフェンスリバウンド';
            case 'DREB': return 'ディフェンスリバウンド';
            case 'AST': return 'アシスト';
            case 'STL': return 'スティール';
            case 'BLK': return 'ブロック';
            case 'TO': return 'ターンオーバー';
            case '2PA': return '2Pミス';
            case '3PA': return '3Pミス';
            case 'FTA': return 'FTミス';
            default: return value;
        }
    }
    if (actionType === 'FOUL') {
        switch (value) {
            case 'P': return 'パーソナルファウル';
            case 'T': return 'テクニカルファウル';
            case 'U': return 'アンスポ';
            case 'D': return '失格';
            default: return 'ファウル';
        }
    }
    return value;
};

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
        <div className="pending-resolver-overlay" onClick={onCancel}>
            <div className="pending-resolver-modal" onClick={e => e.stopPropagation()}>
                <div className="resolver-header">
                    <h3>保留アクションの解決</h3>
                </div>

                <div className="resolver-info">
                    <div className="resolver-action-type">
                        {getActionLabel(pendingAction.actionType, pendingAction.value)}
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
                            <span className="player-number">#{player.number}</span>
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
            </div>
        </div>
    );
}
