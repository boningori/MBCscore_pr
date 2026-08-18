import { useState } from 'react';
import { Modal } from '../Modal';
import type { Player } from '../../types/game';
import { MAX_PLAYERS_PER_TEAM } from '../../types/game';
import { getDisqualification, shortDisqualificationLabel } from '../../utils/disqualification';
import {
    formatPlayerNumber,
    parsePlayerNumber,
    isValidPlayerNumber,
} from '../../utils/playerNumber';
import { findOverflowPlayer } from '../TeamShared/playerLimit';
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
    // 5ファウルの選手もIN候補に残す。練習試合では相手チームの同意で出続けることが
    // あり、除外するとコートに戻す手段がなくなる。除外したままだとベンチ全員が
    // 退場した際に「ベンチに選手がいません」と誤って表示されもする。
    // 判断は記録者に任せ、カード上に「退場」と併記して見落としを防ぐ
    const benchPlayers = players.filter(p => !p.isOnCourt);

    const handleConfirm = () => {
        if (playerOut && playerIn) {
            onSubstitute(playerIn, playerOut);
            onClose();
        }
    };

    // 追加すると公式様式（15人分）から外れる選手。
    //
    // 外れるのは追加する選手とは限らない。名簿は背番号順に並ぶため、若い番号を
    // 足すと番号の大きい既存選手が押し出される。従来は「これ以上は収まりません」
    // とだけ出していたが、実際には得点を記録済みの既存選手が様式から消えており、
    // 伝えている結果が事実と違っていた（実測: #24 が消えてチーム合計と
    // 個人欄の合計が食い違った）。
    const pendingNumber = parsePlayerNumber(newNumber);
    const overflowTarget =
        pendingNumber !== null &&
        isValidPlayerNumber(pendingNumber) &&
        !players.some(p => p.number === pendingNumber)
            ? findOverflowPlayer(players, { number: pendingNumber, name: newName.trim() })
            : null;

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
        <Modal
            onClose={onClose}
            contentClassName="modal-content substitution-modal"
            labelledBy="substitution-modal-title"
        >
                <div className="modal-header">
                    <h2 className="modal-title" id="substitution-modal-title">選手交代 - {teamName}</h2>
                    <button className="modal-close" onClick={onClose} aria-label="閉じる">✕</button>
                </div>

                <div className="substitution-grid">
                    <div className="substitution-column">
                        <h3 className="sub-column-title">コート (OUT)</h3>
                        <div className="sub-player-list">
                            {onCourtPlayers.map(player => (
                                <button
                                    type="button"
                                    key={player.id}
                                    className={`sub-player-card ${playerOut === player.id ? 'selected out' : ''}`}
                                    onClick={() => setPlayerOut(player.id)}
                                    aria-pressed={playerOut === player.id}
                                >
                                    <span className="sub-player-number">#{formatPlayerNumber(player.number)}</span>
                                    <span className="sub-player-name">{player.name}</span>
                                    <span className="sub-player-stats">{player.stats.points}pts</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="substitution-arrow">
                        {playerOut && playerIn ? '⇄' : '→'}
                    </div>

                    <div className="substitution-column">
                        <h3 className="sub-column-title">ベンチ (IN)</h3>
                        <div className="sub-player-list">
                            {benchPlayers.map(player => {
                                // 退場は5ファウルだけではない（D 1つ / U・T 2つ）。
                                // どれも5個目より先に来るので、数だけで見ると失格済みの選手が
                                // 何の断りもなくIN候補に並ぶ。スタメン選択・選手カード・統計表と
                                // 同じ disqualification.ts の判定に揃える
                                const disqualification = getDisqualification(player.fouls);
                                const fouledOut = disqualification !== null;
                                return (
                                    <button
                                        type="button"
                                        key={player.id}
                                        className={`sub-player-card ${playerIn === player.id ? 'selected in' : ''} ${fouledOut ? 'fouled-out' : ''}`}
                                        onClick={() => setPlayerIn(player.id)}
                                        aria-pressed={playerIn === player.id}
                                    >
                                        <span className="sub-player-number">#{formatPlayerNumber(player.number)}</span>
                                        <span className="sub-player-name">{player.name}</span>
                                        {disqualification && (
                                            <span className="sub-player-fouled-out">
                                                {shortDisqualificationLabel(disqualification)}
                                            </span>
                                        )}
                                        <span className="sub-player-quarters">
                                            Q: {player.quartersPlayed.map((q, i) => q ? i + 1 : '').filter(Boolean).join(',') || '-'}
                                        </span>
                                    </button>
                                );
                            })}
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
                                        {/*
                                          公式様式の選手欄は15人分しかないため、超えると
                                          スコアシートの行があふれる。ただし練習試合では
                                          人数が読めないまま始まることがあり、止めると
                                          記録そのものができなくなる。判断は利用者に任せ、
                                          結果だけ先に伝える（退場者の扱いと同じ方針）
                                        */}
                                        {players.length >= MAX_PLAYERS_PER_TEAM && (
                                            <div className="add-player-notice" role="status">
                                                {overflowTarget === null
                                                    ? `すでに${players.length}人います。スコアシートの選手欄は${MAX_PLAYERS_PER_TEAM}人分のため、追加すると1人が載らなくなります。`
                                                    : overflowTarget.number === pendingNumber
                                                        ? `スコアシートの選手欄は${MAX_PLAYERS_PER_TEAM}人分です。#${formatPlayerNumber(pendingNumber)} は印刷・出力に載りません（記録は残ります）。`
                                                        : `スコアシートの選手欄は${MAX_PLAYERS_PER_TEAM}人分です。追加すると #${formatPlayerNumber(overflowTarget.number)} ${overflowTarget.name} が印刷・出力に載らなくなります（記録は残ります）。`}
                                            </div>
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
        </Modal>
    );
}
