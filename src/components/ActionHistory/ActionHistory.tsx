import { useState, useRef, useCallback, useEffect } from 'react';
import type { ScoreEntry, StatEntry, FoulEntry, Player, ScoreType, StatType, FreeThrowResult } from '../../types/game';
import { canEditFreeThrows, countMadeFreeThrows } from '../../context/reducers/foulHandlers';
import { formatPlayerNumber } from '../../utils/playerNumber';
import { EditActionModal } from '../EditActionModal';
import { useBackHandler } from '../../hooks/useBackHandler';
import './ActionHistory.css';

// FT結果をフォーマット（例: "(FT: 1/2)"）。
// 成功本数は FoulEntry.freeThrowResults ではなく、いま残っている記録から数える
// （理由は countMadeFreeThrows のコメント）
const formatFtResult = (freeThrows: number | undefined, made: number): string => {
    if (!freeThrows || freeThrows === 0) return '';
    return ` (FT: ${made}/${freeThrows})`;
};

interface ActionHistoryProps {
    teamId: 'teamA' | 'teamB';
    teamName: string;
    scoreHistory: ScoreEntry[];
    statHistory: StatEntry[];
    foulHistory: FoulEntry[];
    players: Player[];
    /**
     * この試合が3Pを使うか。編集ダイアログの選択肢を記録画面と揃えるために渡す
     * （3P OFF の試合で 3P/3PA を出さない。詳細は EditActionModal）
     */
    showThreePoint?: boolean;
    onRemoveScore: (entryId: string) => void;
    onRemoveStat: (entryId: string) => void;
    onRemoveFoul: (entryId: string) => void;
    onEditScore?: (entryId: string, newPlayerId: string, newScoreType: ScoreType) => void;
    onEditStat?: (entryId: string, newPlayerId: string, newStatType: StatType) => void;
    /** ファウルをした選手の付け替え（種別とFTは変えない。理由は handleEditFoul） */
    onEditFoul?: (entryId: string, newPlayerId: string) => void;
    /** FTの成否の訂正（本数と種別は変えない。理由は handleEditFoulFreeThrows） */
    onEditFoulFreeThrows?: (entryId: string, freeThrowResults: FreeThrowResult[]) => void;
    onConvertScoreToMiss?: (entryId: string, newMissType: '2PA' | '3PA' | 'FTA', newPlayerId: string) => void;
    onConvertMissToScore?: (entryId: string, newScoreType: '2P' | '3P' | 'FT', newPlayerId: string) => void;
    onToggleOwnGoal?: (entryId: string) => void;
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
    isOwnGoal?: boolean;
    /**
     * 編集で直せる行か。
     *
     * コーチ・ベンチのファウルは移す先の選手行が無いので直せない。
     * ここを見ずに「編集」を出していたため、開いても保存しても
     * 何も起きない行が混ざっていた。
     */
    canEdit: boolean;
    /**
     * フリースローを伴うファウルか。
     *
     * 外したFTは記録を1件も作らない（本数だけシューターのスタッツに入る）ので、
     * シューター側の履歴には現れない。この行がFTの成否を持っている唯一の記録。
     */
    hasFreeThrows?: boolean;
    /** いまのFT結果（編集ダイアログの初期値） */
    freeThrowResults?: FreeThrowResult[];
    /**
     * FTの成否を直せるか。
     *
     * ミスへ変換した・シューターを付け替えた記録は、本数と得点エントリが
     * 1対1で対応しないため直せない（canEditFreeThrows）。その場合は
     * 「削除して入れ直す」案内だけを出す。
     */
    canEditFreeThrows?: boolean;
}

export function ActionHistory({
    teamId,
    scoreHistory,
    statHistory,
    foulHistory,
    players,
    showThreePoint,
    onRemoveScore,
    onRemoveStat,
    onRemoveFoul,
    onEditScore,
    onEditStat,
    onEditFoul,
    onEditFoulFreeThrows,
    onConvertScoreToMiss,
    onConvertMissToScore,
    onToggleOwnGoal,
}: ActionHistoryProps) {
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [editingItem, setEditingItem] = useState<HistoryItem | null>(null);
    const longPressTimer = useRef<number | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const dialRef = useRef<HTMLDivElement>(null);
    const [dialAngle, setDialAngle] = useState(0);
    const lastAngle = useRef(0);
    // ドラッグ中かどうかは state で持つ。
    // ref にすると、これを見て document のリスナーを貼る useEffect が
    // 「掴んだ」ことに気づけない（依存が安定した useCallback だけなので
    // マウント時の1回しか走らず、その時点では常に false）。
    // 結果、マウスでは mousemove が一度も登録されず、つまみが動かなかった
    const [isDragging, setIsDragging] = useState(false);

    // 選手名を取得
    const getPlayerName = (playerId: string) => {
        const player = players.find(p => p.id === playerId);
        return player?.courtName || player?.name || (player ? `#${formatPlayerNumber(player.number)}` : '#?');
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

    // ファウルタイプを表示用に変換。
    //
    // FT本数は付けない。公式様式の「P2」は種別と本数を1マスに詰めるための表記で、
    // 和名に付けると「パーソナルファウル2」＝2個目のファウルとも読める。しかも
    // すぐ隣に formatFtResult が「(FT: 1/2)」と本数付きで出すので、同じ数字を
    // 二度、別の書き方で並べていた（実測: 「パーソナルファウル2 (FT: 1/2)」）。
    // 本数が0なら元から接尾辞は付かず、0でなければ必ず (FT: n/m) が出るので、
    // 落としても失う情報は無い。様式側（RunningScoresheet）の P2 表記は別物。
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
                description: (s.isOwnGoal ? '▲OG ' : '') + getScoreLabel(s.scoreType, s.points),
                entryType: s.scoreType,
                isOwnGoal: s.isOwnGoal || false,
                canEdit: !!onEditScore,
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
                canEdit: !!onEditStat,
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
                description: getFoulLabel(f.foulType, f.isCoachOrBench)
                    + formatFtResult(f.freeThrows, countMadeFreeThrows(f, scoreHistory, statHistory)),
                entryType: f.foulType,
                // コーチ・ベンチのファウルは選手行に無いので付け替えられない
                canEdit: !!onEditFoul && !f.isCoachOrBench && !!f.playerId,
                hasFreeThrows: (f.freeThrows ?? 0) > 0,
                freeThrowResults: f.freeThrowResults,
                canEditFreeThrows: !!onEditFoulFreeThrows
                    && canEditFreeThrows(f, scoreHistory, statHistory),
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
        setIsDragging(true);
        lastAngle.current = getAngleFromTouch(clientY);
    }, [getAngleFromTouch]);

    const handleDialMove = useCallback((clientY: number) => {
        if (!listRef.current) return;

        const currentAngle = getAngleFromTouch(clientY);
        const delta = currentAngle - lastAngle.current;
        lastAngle.current = currentAngle;

        // ダイヤルを回転
        setDialAngle(prev => prev + delta);

        // リストをスクロール
        listRef.current.scrollTop += delta * 0.5;
    }, [getAngleFromTouch]);

    const handleDialEnd = useCallback(() => {
        setIsDragging(false);
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

    // 掴んでいる間だけ document を見る。つまみの外へカーソルが出ても
    // 追従させたいので、要素ではなく document に貼る
    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => handleDialMove(e.clientY);
        const handleMouseUp = () => handleDialEnd();

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, handleDialMove, handleDialEnd]);

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

    /**
     * 行のキーボード操作。
     *
     * この行はポインタの長押しでメニューを開く作りで onClick を持たない。
     * キーボードのEnter/Spaceが発火させるのは click なので、記録の訂正が
     * キーボード・支援技術から一切できなかった。
     * 長押しの分岐は残したまま（一覧をスクロールするだけで開くのを避ける）、
     * 同じ操作子にキー操作を足す。FoulInputFlow のPファウルと同じ作法。
     */
    const handleItemKeyDown = useCallback((itemId: string, e: React.KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        // 押しっぱなしのキーリピートで開閉を繰り返さない
        if (e.repeat) return;
        // Spaceのスクロールと、Enterが起こす合成clickを止める
        e.preventDefault();
        setSelectedItemId(prev => (prev === itemId ? null : itemId));
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
        // EditActionModal は得点・スタッツ両方を1つのコールバックで返すため
        // newType は string。どちらの編集かはこの分岐で確定しているので、
        // ここで絞る（選択肢は各種別の一覧から生成している）
        if (editingItem.type === 'score' && onEditScore) {
            onEditScore(itemId, newPlayerId, newType as ScoreType);
        } else if (editingItem.type === 'stat' && onEditStat) {
            onEditStat(itemId, newPlayerId, newType as StatType);
        } else if (editingItem.type === 'foul' && onEditFoul) {
            // ファウルは選手だけ付け替える（newType は元の種別のまま返ってくる）
            onEditFoul(itemId, newPlayerId);
        }
        setEditingItem(null);
    }, [editingItem, onEditScore, onEditStat, onEditFoul]);

    const handleEditFreeThrows = useCallback((entryId: string, freeThrowResults: FreeThrowResult[]) => {
        onEditFoulFreeThrows?.(entryId, freeThrowResults);
        setEditingItem(null);
    }, [onEditFoulFreeThrows]);

    const handleConvertScoreToMiss = useCallback((entryId: string, newMissType: '2PA' | '3PA' | 'FTA', newPlayerId: string) => {
        if (onConvertScoreToMiss) {
            onConvertScoreToMiss(entryId, newMissType, newPlayerId);
        }
        setEditingItem(null);
    }, [onConvertScoreToMiss]);

    const handleConvertMissToScore = useCallback((entryId: string, newScoreType: '2P' | '3P' | 'FT', newPlayerId: string) => {
        if (onConvertMissToScore) {
            onConvertMissToScore(entryId, newScoreType, newPlayerId);
        }
        setEditingItem(null);
    }, [onConvertMissToScore]);

    const handleCancel = useCallback(() => {
        setSelectedItemId(null);
    }, []);

    // 長押しで開いた編集・削除メニューも、戻る操作で閉じるだけにする。
    // 画面上の「キャンセル」と行き先を揃える（受け取らないと記録画面ごと
    // ホームへ飛ぶ）。編集ダイアログはあとからマウントされる＝スタックの上に
    // 載るので、開いている間はそちらが先に閉じる（modalStack の LIFO）
    useBackHandler(selectedItemId !== null, handleCancel);

    return (
        <div className="action-history">
            <div className="history-header">
                <span className="team-name">アクション履歴</span>
                {/* 長押しでしか開かないメニューは、書いていないと存在に気づけない */}
                {allItems.length > 0 && <span className="history-hint">長押しで編集・削除</span>}
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
                            >
                                {/*
                                  操作子をbuttonに切り出す。行そのものをbuttonにはできない
                                  （中の編集・削除と入れ子になる）ので、メニューは兄弟に置く
                                */}
                                <button
                                    type="button"
                                    className="history-item-main"
                                    onTouchStart={(e) => handleTouchStart(item.id, e)}
                                    onTouchEnd={handleTouchEnd}
                                    onMouseDown={(e) => handleTouchStart(item.id, e)}
                                    onMouseUp={handleTouchEnd}
                                    onMouseLeave={handleTouchEnd}
                                    onKeyDown={(e) => handleItemKeyDown(item.id, e)}
                                    onContextMenu={(e) => e.preventDefault()}
                                    aria-expanded={selectedItemId === item.id}
                                    aria-keyshortcuts="Enter"
                                    title="長押し、またはEnterで編集・削除"
                                >
                                    <span className="player-number">#{item.playerNumber === -1 ? '?' : formatPlayerNumber(item.playerNumber)}</span>
                                    <span className="action-desc">{item.description}</span>
                                </button>
                                {selectedItemId === item.id && (
                                    <div className="action-menu">
                                        {/*
                                          直せない行に編集を出さない。ファウルは選手の付け替えだけを
                                          扱い（EDIT_FOUL）、コーチ・ベンチのファウルは移す先の選手行が
                                          無いので canEdit が false になる
                                        */}
                                        {item.canEdit && (
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
                                        {item.type === 'foul' && !item.canEdit && (
                                            <span className="action-menu-note">
                                                ベンチのファウルは削除して入力し直してください
                                            </span>
                                        )}
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
                    item={{ ...editingItem, typeLabel: editingItem.description }}
                    players={players}
                    showThreePoint={showThreePoint}
                    onSave={handleEditSave}
                    onEditFreeThrows={handleEditFreeThrows}
                    onConvertScoreToMiss={handleConvertScoreToMiss}
                    onConvertMissToScore={handleConvertMissToScore}
                    onToggleOwnGoal={onToggleOwnGoal}
                    onCancel={() => setEditingItem(null)}
                />
            )}
        </div>
    );
}

