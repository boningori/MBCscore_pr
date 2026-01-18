import { useState, useRef } from 'react';
import type { SavedTeam, SavedPlayer } from '../../utils/teamStorage';
import {
    loadMyTeams,
    saveMyTeam,
    deleteMyTeam,
    createEmptySavedTeam,
    generateTeamId
} from '../../utils/teamStorage';
import { recognizePlayerList, isOCRAvailable } from '../../utils/imageOCR';
import './TeamManager.css';

interface TeamManagerProps {
    onSelectTeam: (team: SavedTeam) => void;
    onBack: () => void;
    mode: 'myTeam' | 'opponent';
}

export function TeamManager({ onSelectTeam, onBack, mode }: TeamManagerProps) {
    const [teams, setTeams] = useState<SavedTeam[]>(loadMyTeams);
    const [editingTeam, setEditingTeam] = useState<SavedTeam | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [ocrError, setOcrError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
        if (confirm('このチームを削除しますか？')) {
            deleteMyTeam(teamId);
            refreshTeams();
        }
    };

    const handleSave = (team: SavedTeam) => {
        saveMyTeam(team);
        setEditingTeam(null);
        refreshTeams();
    };

    const handleSelect = (team: SavedTeam) => {
        onSelectTeam(team);
    };

    const handleImageImport = async (file: File) => {
        setIsLoading(true);
        setOcrError(null);
        try {
            const result = await recognizePlayerList(file);
            if (result.success && result.players.length > 0) {
                const newTeam = createEmptySavedTeam();
                newTeam.players = result.players;
                setEditingTeam(newTeam);
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

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    if (editingTeam) {
        return (
            <TeamEditor
                team={editingTeam}
                onSave={handleSave}
                onCancel={() => setEditingTeam(null)}
                onImageImport={handleImageImport}
                isLoading={isLoading}
            />
        );
    }

    return (
        <div className="team-manager">
            <div className="team-manager-header">
                <button className="btn btn-secondary" onClick={onBack}>
                    ← 戻る
                </button>
                <h2>{mode === 'myTeam' ? 'マイチーム管理' : '対戦チーム選択'}</h2>
            </div>

            <div className="team-manager-actions">
                <button className="btn btn-primary" onClick={handleCreateNew}>
                    + 新規作成
                </button>
                {isOCRAvailable() && (
                    <>
                        <button className="btn btn-secondary" onClick={triggerFileInput}>
                            📷 写真から登録
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                        />
                    </>
                )}
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

            <div className="team-list">
                {teams.length === 0 ? (
                    <div className="team-list-empty">
                        <p>登録されたチームがありません</p>
                        <p className="text-muted">「新規作成」または「写真から登録」でチームを追加してください</p>
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
                                <button
                                    className="btn btn-success"
                                    onClick={() => handleSelect(team)}
                                >
                                    選択
                                </button>
                                {mode === 'myTeam' && (
                                    <>
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
                                    </>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// チーム編集コンポーネント
interface TeamEditorProps {
    team: SavedTeam;
    onSave: (team: SavedTeam) => void;
    onCancel: () => void;
    onImageImport: (file: File) => void;
    isLoading: boolean;
}

function TeamEditor({ team, onSave, onCancel, onImageImport, isLoading }: TeamEditorProps) {
    const [name, setName] = useState(team.name);
    const [coachName, setCoachName] = useState(team.coachName);
    const [players, setPlayers] = useState<SavedPlayer[]>(team.players);
    const [newNumber, setNewNumber] = useState('');
    const [newName, setNewName] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleAddPlayer = () => {
        if (!newNumber || !newName) return;
        const number = parseInt(newNumber, 10);
        if (isNaN(number) || number < 0 || number > 99) return;
        if (players.some(p => p.number === number)) return;
        if (players.length >= 15) return;

        setPlayers([
            ...players,
            { number, name: newName, isCaptain: false }
        ].sort((a, b) => a.number - b.number));
        setNewNumber('');
        setNewName('');
    };

    const handleRemovePlayer = (index: number) => {
        setPlayers(players.filter((_, i) => i !== index));
    };

    const handleToggleCaptain = (index: number) => {
        setPlayers(players.map((p, i) => ({
            ...p,
            isCaptain: i === index ? !p.isCaptain : false
        })));
    };

    const handleSave = () => {
        if (!name) return;
        onSave({
            ...team,
            id: team.id || generateTeamId(),
            name,
            coachName,
            players,
            updatedAt: new Date().toISOString(),
        });
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onImageImport(file);
        }
        e.target.value = '';
    };

    const isValid = name && players.length >= 5;

    return (
        <div className="team-editor">
            <div className="team-editor-header">
                <button className="btn btn-secondary" onClick={onCancel}>
                    ← キャンセル
                </button>
                <h2>{team.name ? 'チーム編集' : '新規チーム作成'}</h2>
            </div>

            <div className="team-editor-form">
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
                    <div className="form-label-row">
                        <label className="form-label">選手登録 ({players.length}/15)</label>
                        {isOCRAvailable() && (
                            <>
                                <button
                                    className="btn btn-secondary btn-small"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isLoading}
                                >
                                    📷 写真から追加
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={handleFileSelect}
                                    style={{ display: 'none' }}
                                />
                            </>
                        )}
                    </div>

                    {isLoading && (
                        <div className="ocr-loading">
                            <span className="spinner"></span>
                            画像を解析中...
                        </div>
                    )}

                    <div className="add-player-row">
                        <input
                            type="number"
                            className="input player-number-input"
                            value={newNumber}
                            onChange={e => setNewNumber(e.target.value)}
                            placeholder="背番号"
                            min="0"
                            max="99"
                        />
                        <input
                            type="text"
                            className="input player-name-input"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="選手名"
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
                            <div key={index} className="player-edit-card">
                                <span className="player-number">#{player.number}</span>
                                <span className="player-name">{player.name}</span>
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
                            </div>
                        ))}
                    </div>
                </div>

                <div className="team-editor-actions">
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
