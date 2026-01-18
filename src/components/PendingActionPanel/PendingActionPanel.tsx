import { useState } from 'react';
import type { PendingAction, PlayerSnapshot } from '../../types/pendingAction';
import './PendingActionPanel.css';

interface PendingActionPanelProps {
    pendingActions: PendingAction[];
    onResolve: (pendingAction: PendingAction) => void;
    onResolveUnknown: (pendingActionId: string) => void;
    onRemove: (pendingActionId: string) => void;
    onUpdateCandidates: (pendingActionId: string, candidateIds: string[]) => void;
    onDirectResolve?: (pendingActionId: string, playerId: string) => void;
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

export function PendingActionPanel({
    pendingActions,
    onResolveUnknown,
    onRemove,
    onDirectResolve,
}: PendingActionPanelProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [selectedPlayerIds, setSelectedPlayerIds] = useState<Record<string, string | null>>({});

    if (pendingActions.length === 0) {
        return null;
    }

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    // 選手を選択（1人のみ）
    const handlePlayerSelect = (pendingId: string, playerId: string) => {
        setSelectedPlayerIds(prev => ({
            ...prev,
            [pendingId]: prev[pendingId] === playerId ? null : playerId, // 同じ選手をクリックで解除
        }));
    };

    // 確定ボタン
    const handleConfirm = (pending: PendingAction) => {
        const selectedPlayerId = selectedPlayerIds[pending.id];
        if (!selectedPlayerId) return;

        if (onDirectResolve) {
            onDirectResolve(pending.id, selectedPlayerId);
        }
        // クリーンアップ
        setSelectedPlayerIds(prev => {
            const newState = { ...prev };
            delete newState[pending.id];
            return newState;
        });
        setExpandedId(null);
    };

    // 不明で記録（STATのみ）
    const handleUnknown = (pendingId: string) => {
        onResolveUnknown(pendingId);
        setSelectedPlayerIds(prev => {
            const newState = { ...prev };
            delete newState[pendingId];
            return newState;
        });
        setExpandedId(null);
    };

    // 削除
    const handleRemove = (pendingId: string) => {
        onRemove(pendingId);
        setSelectedPlayerIds(prev => {
            const newState = { ...prev };
            delete newState[pendingId];
            return newState;
        });
        setExpandedId(null);
    };

    // 不明選択可能か（得点とファウルは不可）
    const canSelectUnknown = (pending: PendingAction): boolean => {
        return pending.actionType === 'STAT';
    };

    return (
        <div className="pending-action-panel">
            <div className="pending-action-header">
                <span className="pending-icon">⏳</span>
                <span className="pending-title">保留中</span>
                <span className="pending-count">{pendingActions.length}</span>
            </div>
            <div className="pending-action-list">
                {pendingActions.map((pending, index) => {
                    const selectedPlayerId = selectedPlayerIds[pending.id] || null;

                    return (
                        <div key={pending.id} className="pending-action-item">
                            <div
                                className="pending-action-summary"
                                onClick={() => toggleExpand(pending.id)}
                            >
                                <span className="pending-index">{index + 1}</span>
                                <span className="pending-action-type">
                                    {getActionLabel(pending.actionType, pending.value)}
                                </span>
                                <span className="pending-quarter">Q{pending.quarter}</span>
                                <span className="pending-time">{formatTime(pending.timestamp)}</span>
                                <span className={`pending-team ${pending.teamId}`}>
                                    {pending.teamId === 'teamA' ? 'A' : 'B'}
                                </span>
                            </div>

                            {expandedId === pending.id && (
                                <div className="pending-action-details">
                                    <div className="candidate-section">
                                        <div className="candidate-label">選手を選択してください:</div>
                                        <div className="candidate-players">
                                            {pending.playersOnCourt.map((player: PlayerSnapshot) => (
                                                <button
                                                    key={player.id}
                                                    className={`candidate-player-btn ${selectedPlayerId === player.id ? 'selected' : ''}`}
                                                    onClick={() => handlePlayerSelect(pending.id, player.id)}
                                                >
                                                    #{player.number}
                                                    {player.courtName && ` ${player.courtName}`}
                                                    {!player.courtName && player.name && ` ${player.name}`}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="pending-action-buttons">
                                        <button
                                            className="btn btn-primary btn-small"
                                            onClick={() => handleConfirm(pending)}
                                            disabled={!selectedPlayerId}
                                        >
                                            確定
                                        </button>
                                        {canSelectUnknown(pending) && (
                                            <button
                                                className="btn btn-warning btn-small"
                                                onClick={() => handleUnknown(pending.id)}
                                                title="選手不明としてチーム統計に記録"
                                            >
                                                不明で記録
                                            </button>
                                        )}
                                        <button
                                            className="btn btn-secondary btn-small"
                                            onClick={() => handleRemove(pending.id)}
                                        >
                                            削除
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
