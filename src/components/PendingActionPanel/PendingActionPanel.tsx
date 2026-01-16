import { useState } from 'react';
import type { PendingAction, PlayerSnapshot } from '../../types/pendingAction';
import './PendingActionPanel.css';

interface PendingActionPanelProps {
    pendingActions: PendingAction[];
    onResolve: (pendingAction: PendingAction) => void;
    onResolveUnknown: (pendingActionId: string) => void;
    onRemove: (pendingActionId: string) => void;
    onUpdateCandidates: (pendingActionId: string, candidateIds: string[]) => void;
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
    onResolve,
    onResolveUnknown,
    onRemove,
    onUpdateCandidates,
}: PendingActionPanelProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    if (pendingActions.length === 0) {
        return null;
    }

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    const toggleCandidate = (pendingAction: PendingAction, playerId: string) => {
        const current = pendingAction.candidatePlayerIds;
        const newCandidates = current.includes(playerId)
            ? current.filter(id => id !== playerId)
            : [...current, playerId];
        onUpdateCandidates(pendingAction.id, newCandidates);
    };

    return (
        <div className="pending-action-panel">
            <div className="pending-action-header">
                <span className="pending-icon">⏳</span>
                <span className="pending-title">保留中</span>
                <span className="pending-count">{pendingActions.length}</span>
            </div>
            <div className="pending-action-list">
                {pendingActions.map((pending, index) => (
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
                                    <div className="candidate-label">候補選手（タップで選択/解除）:</div>
                                    <div className="candidate-players">
                                        {pending.playersOnCourt.map((player: PlayerSnapshot) => (
                                            <button
                                                key={player.id}
                                                className={`candidate-player-btn ${pending.candidatePlayerIds.includes(player.id) ? 'selected' : ''
                                                    }`}
                                                onClick={() => toggleCandidate(pending, player.id)}
                                            >
                                                #{player.number}
                                                {player.courtName && ` ${player.courtName}`}
                                            </button>
                                        ))}
                                    </div>
                                    {pending.candidatePlayerIds.length > 0 && (
                                        <div className="selected-candidates">
                                            候補: {pending.candidatePlayerIds
                                                .map(id => {
                                                    const p = pending.playersOnCourt.find(pl => pl.id === id);
                                                    return p ? `#${p.number}` : '';
                                                })
                                                .filter(Boolean)
                                                .join(', ')}
                                        </div>
                                    )}
                                </div>
                                <div className="pending-action-buttons">
                                    <button
                                        className="btn btn-primary btn-small"
                                        onClick={() => onResolve(pending)}
                                    >
                                        解決
                                    </button>
                                    {pending.actionType === 'STAT' && (
                                        <button
                                            className="btn btn-warning btn-small"
                                            onClick={() => onResolveUnknown(pending.id)}
                                            title="選手不明としてチーム統計に記録"
                                        >
                                            不明で記録
                                        </button>
                                    )}
                                    <button
                                        className="btn btn-secondary btn-small"
                                        onClick={() => onRemove(pending.id)}
                                    >
                                        削除
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
