import { useState, useRef, useCallback, useEffect } from 'react';
import type { ScoreEntry, StatEntry, FoulEntry, Player } from '../../types/game';
import { EditActionModal } from '../EditActionModal';
import './ActionHistory.css';

interface ActionHistoryProps {
    teamId: 'teamA' | 'teamB';
    teamName: string;
    scoreHistory: ScoreEntry[];
    statHistory: StatEntry[];
    foulHistory: FoulEntry[];
    players: Player[];
    onRemoveScore: (entryId: string) => void;
    onRemoveStat: (entryId: string) => void;
    onRemoveFoul: (entryId: string) => void;
    onEditScore?: (entryId: string, newPlayerId: string, newScoreType: string) => void;
    onEditStat?: (entryId: string, newPlayerId: string, newStatType: string) => void;
    onConvertScoreToMiss?: (entryId: string, newMissType: '2PA' | '3PA' | 'FTA') => void;
    onConvertMissToScore?: (entryId: string, newScoreType: '2P' | '3P' | 'FT') => void;
}

interface HistoryItem {
    id: string;
    type: 'score' | 'stat' | 'foul';
    timestamp: number;
    playerId: string;
    playerNumber: number;
    playerName: string;
    description: string;
    entryType: string;
}

export function ActionHistory({
    teamId,
    teamName: _teamName,
    scoreHistory,
    statHistory,
    foulHistory,
    players,
    onRemoveScore,
    onRemoveStat,
    onRemoveFoul,
    onEditScore,
    onEditStat,
    onConvertScoreToMiss,
    onConvertMissToScore,
}: ActionHistoryProps) {
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [editingItem, setEditingItem] = useState<HistoryItem | null>(null);
    const longPressTimer = useRef<number | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const dialRef = useRef<HTMLDivElement>(null);
    const [dialAngle, setDialAngle] = useState(0);
    const lastAngle = useRef(0);
    const isDragging = useRef(false);

    // 選手名を取得
    const getPlayerName = (playerId: string) => {
        const player = players.find(p => p.id === playerId);
        return player?.courtName || player?.name || `#${player?.number || '?'}`;
    };

    // 選手IDを取得
    const getPlayerId = (entry: ScoreEntry | StatEntry) => {
        return entry.playerId;
    };

    // 履歴アイテムを統合して時系列順（最新が上）に並べ替え
    // スコアタイプを表示用に変換
    const getScoreLabel = (scoreType: string, points: number): string => {
        switch (scoreType) {
            case '2P': return `2P成功 +${points}`;
            case '3P': return `3P成功 +${points}`;
            case 'FT': return `FT成功 +${points}`;
            default: return `${scoreType} +${points}`;
        }
    };

    // スタッツタイプを表示用に変換
    const getStatLabel = (statType: string): string => {
        switch (statType) {
            case '2PA': return '2Pミス';
            case '3PA': return '3Pミス';
            case 'FTA': return 'FTミス';
            case 'OREB': return 'オフェンスREB';
            case 'DREB': return 'ディフェンスREB';
            case 'AST': return 'アシスト';
            case 'STL': return 'スティール';
            case 'BLK': return 'ブロック';
            case 'TO': return 'ターンオーバー';
            case 'TO:DD': return 'TO(ダブドリ)';
            case 'TO:TR': return 'TO(トラベ)';
            case 'TO:PM': return 'TO(パスミス)';
            case 'TO:CM': return 'TO(キャッチミス)';
            default: return statType;
        }
    };

    // ファウルタイプを表示用に変換
    const getFoulLabel = (foulType: string, isCoachOrBench: boolean): string => {
        if (isCoachOrBench) {
            switch (foulType) {
                case 'T': return 'ベンチテクニカル';
                case 'BT': return 'ベンチテクニカル';
                default: return `ベンチ${foulType}`;
            }
        }
        switch (foulType) {
            case 'P': return 'パーソナルファウル';
            case 'T': return 'テクニカル';
            case 'BT': return 'ベンチテクニカル';
            case 'U': return 'アンスポ';
            case 'D': return '失格';
            case 'F': return 'ファイティング';
            default: return foulType;
        }
    };

    const allItems: HistoryItem[] = [
        ...scoreHistory
            .filter(s => s.teamId === teamId)
            .map(s => ({
                id: s.id,
                type: 'score' as const,
                timestamp: s.timestamp,
                playerId: getPlayerId(s),
                playerNumber: s.playerNumber,
                playerName: getPlayerName(s.playerId),
                description: getScoreLabel(s.scoreType, s.points),
                entryType: s.scoreType,
            })),
        ...statHistory
            .filter(s => s.teamId === teamId)
            .map(s => ({
                id: s.id,
                type: 'stat' as const,
                timestamp: s.timestamp,
                playerId: getPlayerId(s),
                playerNumber: s.playerNumber,
                playerName: getPlayerName(s.playerId),
                description: getStatLabel(s.statType),
                entryType: s.statType,
            })),
        ...foulHistory
            .filter(f => f.teamId === teamId)
            .map(f => ({
                id: f.id,
                type: 'foul' as const,
                timestamp: f.timestamp,
                playerId: f.playerId || 'bench',
                playerNumber: f.playerNumber,
                playerName: f.isCoachOrBench ? 'ベンチ' : getPlayerName(f.playerId || ''),
                description: getFoulLabel(f.foulType, f.isCoachOrBench),
                entryType: f.foulType,
            })),
    ].sort((a, b) => b.timestamp - a.timestamp);

    // ジョグダイヤルの角度からスクロール位置を計算
    const getAngleFromTouch = useCallback((clientY: number) => {
        if (!dialRef.current) return 0;
        const rect = dialRef.current.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const deltaY = clientY - centerY;
        return deltaY * 2; // スクロール感度調整
    }, []);

    const handleDialStart = useCallback((clientY: number) => {
        isDragging.current = true;
        lastAngle.current = getAngleFromTouch(clientY);
    }, [getAngleFromTouch]);

    const handleDialMove = useCallback((clientY: number) => {
        if (!isDragging.current || !listRef.current) return;

        const currentAngle = getAngleFromTouch(clientY);
        const delta = currentAngle - lastAngle.current;
        lastAngle.current = currentAngle;

        // ダイヤルを回転
        setDialAngle(prev => prev + delta);

        // リストをスクロール
        listRef.current.scrollTop += delta * 0.5;
    }, [getAngleFromTouch]);

    const handleDialEnd = useCallback(() => {
        isDragging.current = false;
    }, []);

    // タッチイベント
    const handleDialTouchStart = useCallback((e: React.TouchEvent) => {
        e.preventDefault();
        handleDialStart(e.touches[0].clientY);
    }, [handleDialStart]);

    const handleDialTouchMove = useCallback((e: React.TouchEvent) => {
        e.preventDefault();
        handleDialMove(e.touches[0].clientY);
    }, [handleDialMove]);

    // マウスイベント（デバッグ用）
    const handleDialMouseDown = useCallback((e: React.MouseEvent) => {
        handleDialStart(e.clientY);
    }, [handleDialStart]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => handleDialMove(e.clientY);
        const handleMouseUp = () => handleDialEnd();

        if (isDragging.current) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleDialMove, handleDialEnd]);

    const handleTouchStart = useCallback((itemId: string, e: React.MouseEvent | React.TouchEvent) => {
        // 右クリックは無視
        if ('button' in e && e.button === 2) return;

        // 長押し中のコンテキストメニューを防止
        const preventContextMenu = (ev: Event) => {
            ev.preventDefault();
            ev.stopPropagation();
        };
        document.addEventListener('contextmenu', preventContextMenu, { capture: true });

        longPressTimer.current = window.setTimeout(() => {
            setSelectedItemId(itemId);
            // メニュー表示後もしばらく防止を続ける
            setTimeout(() => {
                document.removeEventListener('contextmenu', preventContextMenu, { capture: true });
            }, 100);
        }, 500) as unknown as number;

        // タイマーがキャンセルされた場合に備えてクリーンアップ
        const cleanup = () => {
            document.removeEventListener('contextmenu', preventContextMenu, { capture: true });
            document.removeEventListener('mouseup', cleanup);
            document.removeEventListener('touchend', cleanup);
        };
        document.addEventListener('mouseup', cleanup, { once: true });
        document.addEventListener('touchend', cleanup, { once: true });
    }, []);

    const handleTouchEnd = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

    const handleRemove = useCallback((item: HistoryItem) => {
        if (item.type === 'score') {
            onRemoveScore(item.id);
        } else if (item.type === 'stat') {
            onRemoveStat(item.id);
        } else if (item.type === 'foul') {
            onRemoveFoul(item.id);
        }
        setSelectedItemId(null);
    }, [onRemoveScore, onRemoveStat, onRemoveFoul]);

    const handleEdit = useCallback((item: HistoryItem) => {
        setEditingItem(item);
        setSelectedItemId(null);
    }, []);

    const handleEditSave = useCallback((itemId: string, newPlayerId: string, newType: string) => {
        if (!editingItem) return;
        if (editingItem.type === 'score' && onEditScore) {
            onEditScore(itemId, newPlayerId, newType);
        } else if (editingItem.type === 'stat' && onEditStat) {
            onEditStat(itemId, newPlayerId, newType);
        }
        setEditingItem(null);
    }, [editingItem, onEditScore, onEditStat]);

    const handleConvertScoreToMiss = useCallback((entryId: string, newMissType: '2PA' | '3PA' | 'FTA') => {
        if (onConvertScoreToMiss) {
            onConvertScoreToMiss(entryId, newMissType);
        }
        setEditingItem(null);
    }, [onConvertScoreToMiss]);

    const handleConvertMissToScore = useCallback((entryId: string, newScoreType: '2P' | '3P' | 'FT') => {
        if (onConvertMissToScore) {
            onConvertMissToScore(entryId, newScoreType);
        }
        setEditingItem(null);
    }, [onConvertMissToScore]);

    const handleCancel = useCallback(() => {
        setSelectedItemId(null);
    }, []);

    return (
        <div className="action-history">
            <div className="history-header">
                <span className="team-name">アクション履歴</span>
                <span className="item-count">{allItems.length}件</span>
            </div>
            <div className="history-body">
                <div className="history-list" ref={listRef}>
                    {allItems.length === 0 ? (
                        <div className="history-empty">記録なし</div>
                    ) : (
                        allItems.map((item, index) => (
                            <div
                                key={item.id}
                                className={`history-item ${item.type} ${selectedItemId === item.id ? 'selected' : ''} ${index % 2 === 0 ? 'even' : 'odd'}`}
                                onTouchStart={(e) => handleTouchStart(item.id, e)}
                                onTouchEnd={handleTouchEnd}
                                onMouseDown={(e) => handleTouchStart(item.id, e)}
                                onMouseUp={handleTouchEnd}
                                onMouseLeave={handleTouchEnd}
                                onContextMenu={(e) => e.preventDefault()}
                            >
                                <span className="player-number">#{item.playerNumber === -1 ? '?' : item.playerNumber}</span>
                                <span className="action-desc">{item.description}</span>
                                {selectedItemId === item.id && (
                                    <div className="action-menu">
                                        {(onEditScore || onEditStat) && (
                                            <button className="btn btn-primary btn-small" onClick={() => handleEdit(item)}>
                                                編集
                                            </button>
                                        )}
                                        <button className="btn btn-danger btn-small" onClick={() => handleRemove(item)}>
                                            削除
                                        </button>
                                        <button className="btn btn-secondary btn-small" onClick={handleCancel}>
                                            キャンセル
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* ジョグダイヤル */}
                {allItems.length > 3 && (
                    <div
                        className="jog-dial"
                        ref={dialRef}
                        onTouchStart={handleDialTouchStart}
                        onTouchMove={handleDialTouchMove}
                        onTouchEnd={handleDialEnd}
                        onMouseDown={handleDialMouseDown}
                    >
                        <div
                            className="dial-inner"
                            style={{ transform: `rotate(${dialAngle}deg)` }}
                        >
                            <div className="dial-grip"></div>
                            <div className="dial-grip"></div>
                            <div className="dial-grip"></div>
                            <div className="dial-grip"></div>
                        </div>
                        <div className="dial-arrow up">▲</div>
                        <div className="dial-arrow down">▼</div>
                    </div>
                )}
            </div>

            {/* 編集モーダル */}
            {editingItem && (
                <EditActionModal
                    item={editingItem}
                    players={players}
                    onSave={handleEditSave}
                    onConvertScoreToMiss={handleConvertScoreToMiss}
                    onConvertMissToScore={handleConvertMissToScore}
                    onCancel={() => setEditingItem(null)}
                />
            )}
        </div>
    );
}

