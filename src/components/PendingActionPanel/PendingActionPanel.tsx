import { useState, useEffect, useRef } from 'react';
import type { PendingAction, PlayerSnapshot } from '../../types/pendingAction';
import { formatPlayerNumber } from '../../utils/playerNumber';
import { actionLabel } from '../../utils/actionLabels';
import { ConfirmModal } from '../Modal';
import './PendingActionPanel.css';

interface PendingActionPanelProps {
    pendingActions: PendingAction[];
    onResolve: (pendingAction: PendingAction) => void;
    onResolveUnknown: (pendingActionId: string) => void;
    onRemove: (pendingActionId: string) => void;
    onUpdateCandidates: (pendingActionId: string, candidateIds: string[]) => void;
    onDirectResolve?: (pendingActionId: string, playerId: string) => void;
}

export function PendingActionPanel({
    pendingActions,
    onResolveUnknown,
    onRemove,
    onDirectResolve,
}: PendingActionPanelProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [selectedPlayerIds, setSelectedPlayerIds] = useState<Record<string, string | null>>({});
    // 折りたたみ状態（既定: バッジ表示）。展開中のパネルは下の操作を覆うため、
    // 使うときだけ開き、外側タップで閉じる
    const [open, setOpen] = useState(false);
    // 削除の確認待ち（取り消せない操作なので一段挟む）
    const [removeTarget, setRemoveTarget] = useState<PendingAction | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    // 展開中に外側をタップしたら折りたたむ
    useEffect(() => {
        if (!open) return;
        const handlePointerDown = (e: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [open]);

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

    // 削除。取り消せないうえ、得点の保留を消すと試合終了時の
    // 「未割り当ての記録があります」警告にも掛からなくなる（もう存在しないため）。
    // 確定ボタンの隣にある一発操作なので、必ず確認を挟む
    const handleRemove = (pendingId: string) => {
        onRemove(pendingId);
        setSelectedPlayerIds(prev => {
            const newState = { ...prev };
            delete newState[pendingId];
            return newState;
        });
        setExpandedId(null);
        setRemoveTarget(null);
    };

    // 不明選択可能か（得点とファウルは不可）
    const canSelectUnknown = (pending: PendingAction): boolean => {
        return pending.actionType === 'STAT';
    };

    // 折りたたみ時: 件数バッジのみ
    if (!open) {
        // 1件だけなら開くと同時に展開してタップ数を減らす
        const handleOpen = () => {
            setOpen(true);
            if (pendingActions.length === 1) {
                setExpandedId(pendingActions[0].id);
            }
        };
        return (
            <button className="pending-badge" onClick={handleOpen}>
                <span className="pending-icon">⏳</span>
                <span className="pending-title">保留</span>
                <span className="pending-count">{pendingActions.length}</span>
            </button>
        );
    }

    return (
        <div className="pending-action-panel" ref={rootRef}>
            <button className="pending-action-header" onClick={() => setOpen(false)}>
                <span className="pending-icon">⏳</span>
                <span className="pending-title">保留中</span>
                <span className="pending-count">{pendingActions.length}</span>
                <span className="pending-collapse" aria-hidden="true">▲</span>
            </button>
            <div className="pending-action-list">
                {pendingActions.map((pending, index) => {
                    const selectedPlayerId = selectedPlayerIds[pending.id] || null;

                    return (
                        <div key={pending.id} className="pending-action-item">
                            <button
                                type="button"
                                className="pending-action-summary"
                                onClick={() => toggleExpand(pending.id)}
                                aria-expanded={expandedId === pending.id}
                            >
                                <span className="pending-index">{index + 1}</span>
                                <span className="pending-action-type">
                                    {actionLabel(pending.actionType, pending.value)}
                                </span>
                                <span className="pending-quarter">Q{pending.quarter}</span>
                                <span className={`pending-team ${pending.teamId}`}>
                                    {pending.teamId === 'teamA' ? 'A' : 'B'}
                                </span>
                            </button>

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
                                                    #{formatPlayerNumber(player.number)}
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
                                            onClick={() => setRemoveTarget(pending)}
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

            {/* 確認はパネルの中に描く。外に出すと、オーバーレイへのタップが
                「外側タップ」と判定されてパネルごと畳まれてしまう */}
            {removeTarget && (
                <ConfirmModal
                    title="保留記録の削除"
                    message={`Q${removeTarget.quarter} の「${actionLabel(removeTarget.actionType, removeTarget.value)}」を削除します`}
                    note="※この操作は取り消せません。未割り当ての記録は最終スコアに入っていないため、消すと後から辿れなくなります"
                    onConfirm={() => handleRemove(removeTarget.id)}
                    onCancel={() => setRemoveTarget(null)}
                />
            )}
        </div>
    );
}
