import { useState } from 'react';
import type { SavedTeam, SavedPlayer } from '../../utils/teamStorage';
import {
    loadMyTeams,
    saveMyTeam,
    deleteMyTeam,
    createEmptySavedTeam,
    generateTeamId
} from '../../utils/teamStorage';
import './MyTeamManager.css';

interface MyTeamManagerProps {
    onBack: () => void;
    onSelectTeam?: (team: SavedTeam) => void;
    isSelectionMode?: boolean; // 選択モードかどうか
}

export function MyTeamManager({ onBack, onSelectTeam, isSelectionMode = false }: MyTeamManagerProps) {
    const [teams, setTeams] = useState<SavedTeam[]>(loadMyTeams);
    const [editingTeam, setEditingTeam] = useState<SavedTeam | null>(null);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

    const refreshTeams = () => {
        setTeams(loadMyTeams());
    };

    const handleCreateNew = () => {
        setEditingTeam(createEmptySavedTeam());
    };

    const handleEdit = (team: SavedTeam) => {
        setEditingTeam({ ...team });
    };

    const handleDelete = (teamId: string) => {
        setDeleteTargetId(teamId);
    };

    const confirmDelete = () => {
        if (deleteTargetId) {
            deleteMyTeam(deleteTargetId);
            refreshTeams();
            setDeleteTargetId(null);
        }
    };

    const cancelDelete = () => {
        setDeleteTargetId(null);
    };

    const handleSave = (team: SavedTeam) => {
        saveMyTeam(team);
        setEditingTeam(null);
        refreshTeams();
    };

    const handleSelect = (team: SavedTeam) => {
        onSelectTeam?.(team);
    };

    if (editingTeam) {
        return (
            <MyTeamEditor
                team={editingTeam}
                onSave={handleSave}
                onCancel={() => setEditingTeam(null)}
            />
        );
    }

    return (
        <div className="my-team-manager">
            <div className="manager-header">
                <button className="btn btn-secondary" onClick={onBack}>
                    ← 戻る
                </button>
                <h2>{isSelectionMode ? 'マイチーム選択' : 'マイチーム管理'}</h2>
            </div>

            <div className="manager-actions">
                <button className="btn btn-primary" onClick={handleCreateNew}>
                    + 新規作成
                </button>
            </div>

            <div className="team-list">
                {teams.length === 0 ? (
                    <div className="list-empty">
                        <p>登録されたチームがありません</p>
                        <p className="text-muted">「新規作成」でチームを追加してください</p>
                    </div>
                ) : (
                    teams.map(team => (
                        <div key={team.id} className="team-card">
                            <div className="team-card-info">
                                <h3 className="team-card-name">{team.name || '(未設定)'}</h3>
                                <p className="team-card-detail">
                                    {team.players.length}名 | コーチ: {team.coachName || '-'}
                                </p>
                                <p className="team-card-players">
                                    {team.players.slice(0, 5).map(p => `#${p.number}`).join(', ')}
                                    {team.players.length > 5 && '...'}
                                </p>
                            </div>
                            <div className="team-card-actions">
                                {isSelectionMode && (
                                    <button
                                        className="btn btn-success"
                                        onClick={() => handleSelect(team)}
                                    >
                                        選択
                                    </button>
                                )}
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => handleEdit(team)}
                                >
                                    編集
                                </button>
                                <button
                                    className="btn btn-danger"
                                    onClick={() => handleDelete(team.id)}
                                >
                                    削除
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* 削除確認モーダル */}
            {deleteTargetId && (
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
            )}
        </div>
    );
}

// チーム編集コンポーネント（内部利用）
interface MyTeamEditorProps {
    team: SavedTeam;
    onSave: (team: SavedTeam) => void;
    onCancel: () => void;
}

function MyTeamEditor({ team, onSave, onCancel }: MyTeamEditorProps) {
    const [name, setName] = useState(team.name);
    const [coachName, setCoachName] = useState(team.coachName);
    const [assistantCoachName, setAssistantCoachName] = useState(team.assistantCoachName || '');
    const [players, setPlayers] = useState<SavedPlayer[]>(team.players);
    const [newNumber, setNewNumber] = useState('');
    const [newName, setNewName] = useState('');
    const [newCourtName, setNewCourtName] = useState('');

    // 選手編集用の状態
    const [editingPlayerIndex, setEditingPlayerIndex] = useState<number | null>(null);
    const [editNumber, setEditNumber] = useState('');
    const [editName, setEditName] = useState('');
    const [editCourtName, setEditCourtName] = useState('');

    const handleAddPlayer = () => {
        if (!newNumber || !newName) return;
        const number = parseInt(newNumber, 10);
        if (isNaN(number) || number < 0 || number > 99) return;
        if (players.some(p => p.number === number)) {
            alert(`背番号 ${number} は既に登録されています`);
            return;
        }
        if (players.length >= 15) return;

        setPlayers([
            ...players,
            { number, name: newName, courtName: newCourtName || undefined, isCaptain: false }
        ].sort((a, b) => a.number - b.number));
        setNewNumber('');
        setNewName('');
        setNewCourtName('');
    };

    const handleRemovePlayer = (index: number) => {
        setPlayers(players.filter((_, i) => i !== index));
        setEditingPlayerIndex(null);
    };

    const handleToggleCaptain = (index: number) => {
        setPlayers(players.map((p, i) => ({
            ...p,
            isCaptain: i === index ? !p.isCaptain : false
        })));
    };

    // 選手編集開始
    const handleStartEdit = (index: number) => {
        const player = players[index];
        setEditingPlayerIndex(index);
        setEditNumber(String(player.number));
        setEditName(player.name);
        setEditCourtName(player.courtName || '');
    };

    // 選手編集保存
    const handleSaveEdit = () => {
        if (editingPlayerIndex === null) return;
        const number = parseInt(editNumber, 10);
        if (isNaN(number) || number < 0 || number > 99) {
            alert('背番号は0〜99の範囲で入力してください');
            return;
        }
        // 他の選手と番号が重複していないか確認
        const isDuplicate = players.some((p, i) => i !== editingPlayerIndex && p.number === number);
        if (isDuplicate) {
            alert(`背番号 ${number} は既に登録されています`);
            return;
        }
        if (!editName.trim()) {
            alert('氏名を入力してください');
            return;
        }

        setPlayers(players.map((p, i) =>
            i === editingPlayerIndex
                ? { ...p, number, name: editName.trim(), courtName: editCourtName.trim() || undefined }
                : p
        ).sort((a, b) => a.number - b.number));
        setEditingPlayerIndex(null);
    };

    // 選手編集キャンセル
    const handleCancelEdit = () => {
        setEditingPlayerIndex(null);
    };

    const handleSave = () => {
        if (!name) return;
        onSave({
            ...team,
            id: team.id || generateTeamId(),
            name,
            coachName,
            assistantCoachName,
            players,
            updatedAt: new Date().toISOString(),
        });
    };

    const isValid = name && players.length >= 5;

    return (
        <div className="my-team-editor">
            <div className="editor-header">
                <button className="btn btn-secondary" onClick={onCancel}>
                    ← キャンセル
                </button>
                <h2>{team.name ? 'チーム編集' : '新規チーム作成'}</h2>
            </div>

            <div className="editor-form">
                <div className="form-section">
                    <label className="form-label">チーム名 *</label>
                    <input
                        type="text"
                        className="input"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="チーム名を入力"
                    />
                </div>

                <div className="form-section">
                    <label className="form-label">コーチ名</label>
                    <input
                        type="text"
                        className="input"
                        value={coachName}
                        onChange={e => setCoachName(e.target.value)}
                        placeholder="コーチ名を入力"
                    />
                </div>

                <div className="form-section">
                    <label className="form-label">Aコーチ名</label>
                    <input
                        type="text"
                        className="input"
                        value={assistantCoachName}
                        onChange={e => setAssistantCoachName(e.target.value)}
                        placeholder="Aコーチ名を入力"
                    />
                </div>

                <div className="form-section">
                    <div className="form-label-row">
                        <label className="form-label">選手登録 ({players.length}/15)</label>
                    </div>

                    <div className="add-player-row">
                        <input
                            type="number"
                            className="input player-number-input"
                            value={newNumber}
                            onChange={e => setNewNumber(e.target.value)}
                            placeholder="No."
                            min="0"
                            max="99"
                        />
                        <input
                            type="text"
                            className="input player-name-input"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="氏名"
                        />
                        <input
                            type="text"
                            className="input player-courtname-input"
                            value={newCourtName}
                            onChange={e => setNewCourtName(e.target.value)}
                            placeholder="コートネーム"
                            onKeyDown={e => e.key === 'Enter' && handleAddPlayer()}
                        />
                        <button
                            className="btn btn-primary"
                            onClick={handleAddPlayer}
                            disabled={!newNumber || !newName || players.length >= 15}
                        >
                            追加
                        </button>
                    </div>

                    <div className="players-list">
                        {players.map((player, index) => (
                            <div key={index} className={`player-edit-card ${editingPlayerIndex === index ? 'editing' : ''}`}>
                                {editingPlayerIndex === index ? (
                                    // 編集モード
                                    <>
                                        <input
                                            type="number"
                                            className="input player-number-input"
                                            value={editNumber}
                                            onChange={e => setEditNumber(e.target.value)}
                                            min="0"
                                            max="99"
                                            autoFocus
                                        />
                                        <input
                                            type="text"
                                            className="input player-name-input"
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            placeholder="氏名"
                                        />
                                        <input
                                            type="text"
                                            className="input player-courtname-input"
                                            value={editCourtName}
                                            onChange={e => setEditCourtName(e.target.value)}
                                            placeholder="コートネーム"
                                            onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                                        />
                                        <div className="player-edit-actions">
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
                                        <span
                                            className="player-courtname clickable"
                                            onClick={() => handleStartEdit(index)}
                                        >
                                            {player.courtName ? `(${player.courtName})` : '(コートネーム未設定)'}
                                        </span>
                                        <div className="player-edit-actions">
                                            <button
                                                className={`btn btn-small ${player.isCaptain ? 'btn-warning' : 'btn-secondary'}`}
                                                onClick={() => handleToggleCaptain(index)}
                                            >
                                                C
                                            </button>
                                            <button
                                                className="btn btn-small btn-danger"
                                                onClick={() => handleRemovePlayer(index)}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="editor-actions">
                    <button className="btn btn-secondary btn-large" onClick={onCancel}>
                        キャンセル
                    </button>
                    <button
                        className="btn btn-success btn-large"
                        onClick={handleSave}
                        disabled={!isValid}
                    >
                        保存
                    </button>
                </div>
            </div>
        </div>
    );
}
