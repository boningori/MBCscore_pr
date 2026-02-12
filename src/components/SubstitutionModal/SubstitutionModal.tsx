import { useState } from 'react';
import type { Player } from '../../types/game';
import {
    formatPlayerNumber,
    parsePlayerNumber,
    isValidPlayerNumber,
} from '../../utils/playerNumber';
import './SubstitutionModal.css';

interface SubstitutionModalProps {
    teamName: string;
    teamId: string;
    players: Player[];
    onSubstitute: (playerInId: string, playerOutId: string) => void;
    onAddPlayer?: (number: number, name: string) => void;
    onClose: () => void;
}

export function SubstitutionModal({
    teamName,
    players,
    onSubstitute,
    onAddPlayer,
    onClose,
}: SubstitutionModalProps) {
    const [playerOut, setPlayerOut] = useState<string | null>(null);
    const [playerIn, setPlayerIn] = useState<string | null>(null);

    // 選手追加フォーム
    const [showAddForm, setShowAddForm] = useState(false);
    const [newNumber, setNewNumber] = useState('');
    const [newName, setNewName] = useState('');
    const [addError, setAddError] = useState<string | null>(null);

    const onCourtPlayers = players.filter(p => p.isOnCourt);
    const benchPlayers = players.filter(p => !p.isOnCourt && p.fouls.length < 5);

    const handleConfirm = () => {
        if (playerOut && playerIn) {
            onSubstitute(playerIn, playerOut);
            onClose();
        }
    };

    const handleAddPlayer = () => {
        setAddError(null);

        if (!newNumber.trim()) {
            setAddError('背番号を入力してください');
            return;
        }

        const number = parsePlayerNumber(newNumber);
        if (number === null || !isValidPlayerNumber(number)) {
            setAddError('背番号は0〜99または00を入力してください');
            return;
        }

        // 重複チェック
        const displayNum = formatPlayerNumber(number);
        if (players.some(p => p.number === number)) {
            setAddError(`背番号 ${displayNum} は既に登録されています`);
            return;
        }

        const playerName = newName.trim() || `選手${displayNum}`;

        if (onAddPlayer) {
            onAddPlayer(number, playerName);
        }

        // フォームをリセット
        setNewNumber('');
        setNewName('');
        setShowAddForm(false);
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
                                    <span className="sub-player-number">#{formatPlayerNumber(player.number)}</span>
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
                                    <span className="sub-player-number">#{formatPlayerNumber(player.number)}</span>
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

                        {/* 選手追加セクション */}
                        {onAddPlayer && (
                            <div className="add-player-section">
                                {!showAddForm ? (
                                    <button
                                        className="btn btn-secondary add-player-btn"
                                        onClick={() => setShowAddForm(true)}
                                    >
                                        + 選手を追加
                                    </button>
                                ) : (
                                    <div className="add-player-form">
                                        <div className="add-player-inputs">
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                className="add-player-number"
                                                value={newNumber}
                                                onChange={e => setNewNumber(e.target.value)}
                                                placeholder="No."
                                                maxLength={2}
                                                autoFocus
                                                autoComplete="off"
                                            />
                                            <input
                                                type="text"
                                                className="add-player-name"
                                                value={newName}
                                                onChange={e => setNewName(e.target.value)}
                                                placeholder="氏名（任意）"
                                                autoComplete="off"
                                                onKeyDown={e => e.key === 'Enter' && handleAddPlayer()}
                                            />
                                        </div>
                                        {addError && (
                                            <div className="add-player-error">{addError}</div>
                                        )}
                                        <div className="add-player-actions">
                                            <button
                                                className="btn btn-small btn-secondary"
                                                onClick={() => {
                                                    setShowAddForm(false);
                                                    setNewNumber('');
                                                    setNewName('');
                                                    setAddError(null);
                                                }}
                                            >
                                                キャンセル
                                            </button>
                                            <button
                                                className="btn btn-small btn-primary"
                                                onClick={handleAddPlayer}
                                            >
                                                追加
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
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
