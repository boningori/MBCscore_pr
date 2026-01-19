import { useState, useEffect, useRef } from 'react';
import type { SavedTeam, SavedPlayer } from '../../utils/teamStorage';
import {
    loadOpponents,
    saveOpponent,
    deleteOpponent,
    createEmptySavedTeam,
} from '../../utils/teamStorage';
import { recognizePlayerList } from '../../utils/imageOCR';
import './OpponentManager.css';

interface OpponentManagerProps {
    onBack: () => void;
}

export function OpponentManager({ onBack }: OpponentManagerProps) {
    const [teams, setTeams] = useState<SavedTeam[]>([]);
    const [editingTeam, setEditingTeam] = useState<SavedTeam | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

    // OCR related state
    const [isLoading, setIsLoading] = useState(false);
    const [ocrError, setOcrError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setTeams(loadOpponents());
    }, []);

    const handleCreateNew = () => {
        setEditingTeam(createEmptySavedTeam());
        setIsCreating(true);
        setOcrError(null);
    };

    const handleEdit = (team: SavedTeam) => {
        setEditingTeam({ ...team });
        setIsCreating(false);
        setOcrError(null);
    };

    const handleDelete = (teamId: string) => {
        setDeleteTargetId(teamId);
    };

    const confirmDelete = () => {
        if (deleteTargetId) {
            deleteOpponent(deleteTargetId);
            setTeams(loadOpponents());
            setDeleteTargetId(null);
        }
    };

    const cancelDelete = () => {
        setDeleteTargetId(null);
    };

    const handleSave = () => {
        if (!editingTeam) return;
        if (!editingTeam.name.trim()) {
            alert('チーム名を入力してください');
            return;
        }
        if (editingTeam.players.length < 5) {
            alert('最低5人の選手を登録してください');
            return;
        }

        // 背番号重複チェック
        const numbers = editingTeam.players.map(p => p.number);
        const uniqueNumbers = new Set(numbers);
        if (numbers.length !== uniqueNumbers.size) {
            alert('背番号が重複している選手がいます。修正してください。');
            return;
        }

        saveOpponent(editingTeam);
        setTeams(loadOpponents());
        setEditingTeam(null);
        setIsCreating(false);
    };

    const handleCancel = () => {
        setEditingTeam(null);
        setIsCreating(false);
    };

    const handleTeamNameChange = (name: string) => {
        if (!editingTeam) return;
        setEditingTeam({ ...editingTeam, name });
    };

    const handleCoachNameChange = (coachName: string) => {
        if (!editingTeam) return;
        setEditingTeam({ ...editingTeam, coachName });
    };

    const handleAssistantCoachNameChange = (assistantCoachName: string) => {
        if (!editingTeam) return;
        setEditingTeam({ ...editingTeam, assistantCoachName });
    };

    const [newNumber, setNewNumber] = useState('');
    const [newName, setNewName] = useState('');

    // 選手編集用の状態
    const [editingPlayerIndex, setEditingPlayerIndex] = useState<number | null>(null);
    const [editNumber, setEditNumber] = useState('');
    const [editName, setEditName] = useState('');

    // 番号グリッド選択モード
    const [showNumberGrid, setShowNumberGrid] = useState(false);

    // 番号をトグル（追加/削除）
    const handleToggleNumber = (num: number) => {
        if (!editingTeam) return;

        const existingIndex = editingTeam.players.findIndex(p => p.number === num);

        if (existingIndex >= 0) {
            // 既存なら削除
            const players = editingTeam.players.filter((_, i) => i !== existingIndex);
            setEditingTeam({ ...editingTeam, players });
        } else {
            // 新規なら追加
            const newPlayer: SavedPlayer = {
                number: num,
                name: `選手${num}`,
                isCaptain: false,
            };
            setEditingTeam({
                ...editingTeam,
                players: [...editingTeam.players, newPlayer].sort((a, b) => a.number - b.number),
            });
        }
    };

    // 全選手クリア
    const handleClearAllPlayers = () => {
        if (!editingTeam) return;
        if (editingTeam.players.length === 0) return;

        if (confirm('登録済みの選手を全てクリアしますか？')) {
            setEditingTeam({ ...editingTeam, players: [] });
        }
    };

    const handleAddPlayer = () => {
        if (!editingTeam || !newNumber) return;  // 名前は任意

        const number = parseInt(newNumber, 10);
        if (isNaN(number) || number < 0 || number > 99) return;

        // 重複チェック
        if (editingTeam.players.some(p => p.number === number)) {
            alert(`背番号 ${number} は既に登録されています`);
            return;
        }

        const newPlayer: SavedPlayer = {
            number: number,
            name: newName.trim() || `選手${number}`,  // 名前が空の場合は「選手N」とする
            isCaptain: false,
        };

        setEditingTeam({
            ...editingTeam,
            players: [...editingTeam.players, newPlayer].sort((a, b) => a.number - b.number),
        });

        setNewNumber('');
        setNewName('');
    };

    const handleRemovePlayer = (index: number) => {
        if (!editingTeam) return;
        const players = editingTeam.players.filter((_, i) => i !== index);
        setEditingTeam({ ...editingTeam, players });
        setEditingPlayerIndex(null);
    };

    const handleToggleCaptain = (index: number) => {
        if (!editingTeam) return;
        const players = editingTeam.players.map((p, i) => ({
            ...p,
            isCaptain: i === index ? !p.isCaptain : false
        }));
        setEditingTeam({ ...editingTeam, players });
    };

    // 選手編集開始
    const handleStartEdit = (index: number) => {
        if (!editingTeam) return;
        const player = editingTeam.players[index];
        setEditingPlayerIndex(index);
        setEditNumber(String(player.number));
        setEditName(player.name);
    };

    // 選手編集保存
    const handleSaveEdit = () => {
        if (!editingTeam || editingPlayerIndex === null) return;
        const number = parseInt(editNumber, 10);
        if (isNaN(number) || number < 0 || number > 99) {
            alert('背番号は0〜99の範囲で入力してください');
            return;
        }
        // 他の選手と番号が重複していないか確認
        const isDuplicate = editingTeam.players.some((p, i) => i !== editingPlayerIndex && p.number === number);
        if (isDuplicate) {
            alert(`背番号 ${number} は既に登録されています`);
            return;
        }
        // 対戦チームは名前任意なので空の場合は「選手N」とする
        const playerName = editName.trim() || `選手${number}`;

        const players = editingTeam.players.map((p, i) =>
            i === editingPlayerIndex
                ? { ...p, number, name: playerName }
                : p
        ).sort((a, b) => a.number - b.number);
        setEditingTeam({ ...editingTeam, players });
        setEditingPlayerIndex(null);
    };

    // 選手編集キャンセル
    const handleCancelEdit = () => {
        setEditingPlayerIndex(null);
    };

    // OCR Logic
    const handleImageImport = async (file: File) => {
        if (!editingTeam) return;
        setIsLoading(true);
        setOcrError(null);
        try {
            const result = await recognizePlayerList(file);
            if (result.success && result.players.length > 0) {
                // Merge players: Add only if number doesn't exist
                const currentNumbers = new Set(editingTeam.players.map(p => p.number));
                const newPlayers: SavedPlayer[] = [];
                let duplicateCount = 0;

                for (const p of result.players) {
                    if (!currentNumbers.has(p.number)) {
                        newPlayers.push(p);
                        currentNumbers.add(p.number);
                    } else {
                        duplicateCount++;
                    }
                }

                if (newPlayers.length > 0) {
                    setEditingTeam({
                        ...editingTeam,
                        players: [...editingTeam.players, ...newPlayers].sort((a, b) => a.number - b.number)
                    });
                    if (duplicateCount > 0) {
                        alert(`${newPlayers.length}人の選手を追加しました。（${duplicateCount}人は重複のためスキップされました）`);
                    } else {
                        alert(`${newPlayers.length}人の選手を追加しました。`);
                    }
                } else {
                    setOcrError('読み取った選手は全て登録済みか、有効なデータがありませんでした。');
                }
            } else {
                setOcrError(result.error || '選手情報を認識できませんでした');
            }
        } catch (error) {
            setOcrError('画像の処理に失敗しました');
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleImageImport(file);
        }
        e.target.value = '';
    };

    // 編集画面
    if (editingTeam) {
        return (
            <div className="opponent-manager-container">
                <div className="opponent-manager-header">
                    <button className="btn btn-secondary" onClick={handleCancel}>
                        ← キャンセル
                    </button>
                    <h2>{isCreating ? '対戦チーム新規登録' : '対戦チーム編集'}</h2>
                </div>

                <div className="team-edit-form">
                    <div className="form-group">
                        <label>チーム名 *</label>
                        <input
                            type="text"
                            value={editingTeam.name}
                            onChange={(e) => handleTeamNameChange(e.target.value)}
                            placeholder="チーム名を入力"
                            autoComplete="off"
                        />
                    </div>

                    <div className="form-group">
                        <label>コーチ名</label>
                        <input
                            type="text"
                            value={editingTeam.coachName}
                            onChange={(e) => handleCoachNameChange(e.target.value)}
                            placeholder="コーチ名を入力（任意）"
                            autoComplete="off"
                        />
                    </div>

                    <div className="form-group">
                        <label>Aコーチ名</label>
                        <input
                            type="text"
                            value={editingTeam.assistantCoachName || ''}
                            onChange={(e) => handleAssistantCoachNameChange(e.target.value)}
                            placeholder="Aコーチ名を入力（任意）"
                            autoComplete="off"
                        />
                    </div>

                    <div className="players-section">
                        <div className="players-header-row">
                            <label className="form-label">選手登録 ({editingTeam.players.length}人)</label>
                            <div className="player-actions-row">
                                <button
                                    className={`btn btn-small ${showNumberGrid ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setShowNumberGrid(!showNumberGrid)}
                                >
                                    # 番号一括選択
                                </button>
                                <button
                                    className="btn btn-secondary btn-small"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isLoading}
                                >
                                    📷 写真読込
                                </button>
                                <button
                                    className="btn btn-danger btn-small"
                                    onClick={handleClearAllPlayers}
                                    disabled={editingTeam.players.length === 0}
                                >
                                    全クリア
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={handleFileSelect}
                                    style={{ display: 'none' }}
                                />
                            </div>
                        </div>

                        {isLoading && (
                            <div className="ocr-loading">
                                <span className="spinner"></span>
                                画像を解析中...
                            </div>
                        )}

                        {ocrError && (
                            <div className="alert alert-danger">
                                {ocrError}
                            </div>
                        )}

                        {/* 番号グリッド選択UI */}
                        {showNumberGrid && (
                            <div className="number-grid-container">
                                <p className="number-grid-hint">タップで追加/削除</p>
                                <div className="number-grid">
                                    {Array.from({ length: 100 }, (_, i) => {
                                        const isSelected = editingTeam.players.some(p => p.number === i);
                                        return (
                                            <button
                                                key={i}
                                                className={`number-grid-item ${isSelected ? 'selected' : ''}`}
                                                onClick={() => handleToggleNumber(i)}
                                            >
                                                {i}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="add-player-row">
                            <input
                                type="number"
                                className="player-number-input"
                                value={newNumber}
                                onChange={e => setNewNumber(e.target.value)}
                                placeholder="No."
                                min="0"
                                max="99"
                                autoComplete="off"
                            />
                            <input
                                type="text"
                                className="player-name-input"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder="氏名"
                                autoComplete="off"
                                onKeyDown={e => e.key === 'Enter' && handleAddPlayer()}
                            />
                            <button
                                className="btn btn-primary"
                                onClick={handleAddPlayer}
                                disabled={!newNumber}
                            >
                                追加
                            </button>
                        </div>

                        <div className="players-list">
                            {editingTeam.players.map((player, index) => (
                                <div key={index} className={`player-edit-row ${editingPlayerIndex === index ? 'editing' : ''}`}>
                                    {editingPlayerIndex === index ? (
                                        // 編集モード
                                        <>
                                            <input
                                                type="number"
                                                className="player-number-input"
                                                value={editNumber}
                                                onChange={e => setEditNumber(e.target.value)}
                                                min="0"
                                                max="99"
                                                autoFocus
                                                autoComplete="off"
                                            />
                                            <input
                                                type="text"
                                                className="player-name-input"
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                placeholder="氏名"
                                                autoComplete="off"
                                                onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                                            />
                                            <div className="player-actions">
                                                <button
                                                    className="btn btn-small btn-success"
                                                    onClick={handleSaveEdit}
                                                >
                                                    ✓
                                                </button>
                                                <button
                                                    className="btn btn-small btn-secondary"
                                                    onClick={handleCancelEdit}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        // 表示モード
                                        <>
                                            <span
                                                className="player-number clickable"
                                                onClick={() => handleStartEdit(index)}
                                            >
                                                #{player.number}
                                            </span>
                                            <span
                                                className="player-name clickable"
                                                onClick={() => handleStartEdit(index)}
                                            >
                                                {player.name}
                                            </span>
                                            <div className="player-actions">
                                                <button
                                                    className={`btn btn-small ${player.isCaptain ? 'btn-warning' : 'btn-secondary'}`}
                                                    onClick={() => handleToggleCaptain(index)}
                                                >
                                                    C
                                                </button>
                                                <button
                                                    className="btn btn-danger btn-small"
                                                    onClick={() => handleRemovePlayer(index)}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="form-actions">
                        <button className="btn btn-success btn-large" onClick={handleSave}>
                            保存
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // 一覧画面
    return (
        <div className="opponent-manager-container">
            <div className="opponent-manager-header">
                <button className="btn btn-secondary" onClick={onBack}>
                    ← ホームへ
                </button>
                <h2>対戦チーム管理</h2>
            </div>

            <div className="opponent-manager-content">
                <button className="btn btn-primary btn-large add-team-btn" onClick={handleCreateNew}>
                    + 新規チーム登録
                </button>

                {teams.length === 0 ? (
                    <div className="empty-state">
                        <p>登録された対戦チームはありません</p>
                    </div>
                ) : (
                    <div className="teams-list">
                        {teams.map(team => (
                            <div key={team.id} className="team-card">
                                <div className="team-info">
                                    <h3>{team.name}</h3>
                                    <p>{team.players.length}人登録</p>
                                </div>
                                <div className="team-actions">
                                    <button className="btn btn-secondary btn-small" onClick={() => handleEdit(team)}>
                                        編集
                                    </button>
                                    <button className="btn btn-danger btn-small" onClick={() => handleDelete(team.id)}>
                                        削除
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>


            {/* 削除確認モーダル */}
            {
                deleteTargetId && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h3>チーム削除の確認</h3>
                            <p>このチームを削除してもよろしいですか？</p>
                            <p className="text-muted text-sm my-2">※この操作は取り消せません</p>
                            <div className="modal-actions">
                                <button className="btn btn-secondary" onClick={cancelDelete}>
                                    キャンセル
                                </button>
                                <button className="btn btn-danger" onClick={confirmDelete}>
                                    削除する
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
