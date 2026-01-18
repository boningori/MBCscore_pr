import { useState, useRef } from 'react';
import type { SavedTeam, SavedPlayer } from '../../utils/teamStorage';
import {
    loadRecentOpponents,
    saveRecentOpponent,
    createEmptySavedTeam,
    generateTeamId,
    clearRecentOpponents,
    loadOpponents
} from '../../utils/teamStorage';
import { recognizePlayerList, isOCRAvailable } from '../../utils/imageOCR';
import './OpponentSelect.css';

interface OpponentSelectProps {
    onSelect: (team: SavedTeam) => void;
    onBack: () => void;
}

export function OpponentSelect({ onSelect, onBack }: OpponentSelectProps) {
    const [history, setHistory] = useState<SavedTeam[]>(loadRecentOpponents);
    const [savedOpponents, setSavedOpponents] = useState<SavedTeam[]>(loadOpponents);
    const [isCreating, setIsCreating] = useState(false);
    const [editingTeam, setEditingTeam] = useState<SavedTeam | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [ocrError, setOcrError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const refreshHistory = () => {
        setHistory(loadRecentOpponents());
        setSavedOpponents(loadOpponents());
    };

    const handleSelect = (team: SavedTeam) => {
        // 選択されたら履歴の先頭に持ってくるために再保存
        saveRecentOpponent(team);
        onSelect(team);
    };

    const handleCreateNew = () => {
        setEditingTeam(createEmptySavedTeam());
        setIsCreating(true);
    };

    const handleSaveNew = (team: SavedTeam) => {
        saveRecentOpponent(team);
        setEditingTeam(null);
        setIsCreating(false);
        refreshHistory();
        // 保存して即選択扱いにするか、リストに戻るか
        // ここでは選択扱いにして進める
        onSelect(team);
    };

    const handleClearHistory = () => {
        if (confirm('対戦チームの履歴をすべて消去しますか？')) {
            clearRecentOpponents();
            refreshHistory();
        }
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
                setIsCreating(true);
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

    if (isCreating && editingTeam) {
        return (
            <OpponentEditor
                team={editingTeam}
                onSave={handleSaveNew}
                onCancel={() => {
                    setEditingTeam(null);
                    setIsCreating(false);
                }}
                onImageImport={handleImageImport}
                isLoading={isLoading}
            />
        );
    }

    return (
        <div className="opponent-select">
            <div className="select-header">
                <button className="btn btn-secondary" onClick={onBack}>
                    ← 戻る
                </button>
                <h2>対戦チームを選択</h2>
            </div>

            <div className="select-actions">
                <div className="select-actions-left">
                    <button className="btn btn-primary" onClick={handleCreateNew}>
                        + 未登録チームと対戦
                    </button>
                    {isOCRAvailable() && (
                        <>
                            <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
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
                {history.length > 0 && (
                    <button className="btn btn-small btn-danger" onClick={handleClearHistory}>
                        履歴クリア
                    </button>
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

            {/* チームセクションコンテナ（2列レイアウト） */}
            <div className="teams-container">
                {/* 登録済み対戦チーム */}
                {savedOpponents.length > 0 && (
                    <div className="saved-opponents-section">
                        <div className="section-header">
                            <h3>登録済み対戦チーム</h3>
                        </div>
                        <div className="team-list">
                            {savedOpponents.map(team => (
                                <div key={team.id} className="opponent-card" onClick={() => handleSelect(team)}>
                                    <div className="opponent-info">
                                        <h4 className="opponent-name">{team.name || '(未設定)'}</h4>
                                        <span className="opponent-detail">
                                            {team.players.length} Players
                                        </span>
                                    </div>
                                    <div className="opponent-select-btn">
                                        選択
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className={`history-section ${savedOpponents.length === 0 ? 'full' : ''}`}>
                    <div className="section-header">
                        <h3>最近の対戦チーム</h3>
                    </div>

                    <div className="team-list">
                        {history.length === 0 ? (
                            <p className="text-muted">対戦履歴はありません</p>
                        ) : (
                            history.map(team => (
                                <div key={team.id} className="opponent-card" onClick={() => handleSelect(team)}>
                                    <div className="opponent-info">
                                        <h4 className="opponent-name">{team.name || '(未設定)'}</h4>
                                        <span className="opponent-detail">
                                            {team.players.length} Players
                                        </span>
                                    </div>
                                    <div className="opponent-select-btn">
                                        選択
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// 簡易エディタ（使い捨て、または履歴保存用）
interface OpponentEditorProps {
    team: SavedTeam;
    onSave: (team: SavedTeam) => void;
    onCancel: () => void;
    onImageImport: (file: File) => void;
    isLoading: boolean;
}

function OpponentEditor({ team, onSave, onCancel, onImageImport, isLoading }: OpponentEditorProps) {
    const [name, setName] = useState(team.name);
    const [players, setPlayers] = useState<SavedPlayer[]>(team.players);
    const [newNumber, setNewNumber] = useState('');
    const [newName, setNewName] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleAddPlayer = () => {
        if (!newNumber) return;
        const number = parseInt(newNumber, 10);
        if (isNaN(number)) return;
        if (players.some(p => p.number === number)) return;

        // 名前がなくても対戦チームならOKとする（番号だけで管理する場合もあるため）
        const playerName = newName || `Player ${number}`;

        setPlayers([
            ...players,
            { number, name: playerName, isCaptain: false }
        ].sort((a, b) => a.number - b.number));
        setNewNumber('');
        setNewName('');
    };

    const handleRemovePlayer = (index: number) => {
        setPlayers(players.filter((_, i) => i !== index));
    };

    const handleSave = () => {
        if (!name) return;
        onSave({
            ...team,
            id: team.id || generateTeamId(),
            name,
            coachName: '', // 対戦チームのコーチ名は必須ではない
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

    return (
        <div className="opponent-editor">
            <div className="editor-header">
                <button className="btn btn-secondary" onClick={onCancel}>
                    ← キャンセル
                </button>
                <h2>対戦チーム情報入力</h2>
            </div>

            <div className="editor-form">
                <div className="form-section">
                    <label className="form-label">チーム名 *</label>
                    <input
                        type="text"
                        className="input"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="対戦チーム名"
                    />
                </div>

                <div className="form-section">
                    <div className="form-label-row">
                        <label className="form-label">選手 ({players.length}名)</label>
                        {isOCRAvailable() && (
                            <>
                                <button
                                    className="btn btn-secondary btn-small"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isLoading}
                                >
                                    📷 写真読込
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

                    {isLoading && <div className="ocr-loading">解析中...</div>}

                    <div className="add-player-row">
                        <input
                            type="number"
                            className="input player-number-input"
                            value={newNumber}
                            onChange={e => setNewNumber(e.target.value)}
                            placeholder="No."
                        />
                        <input
                            type="text"
                            className="input player-name-input"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="名前 (任意)"
                            onKeyDown={e => e.key === 'Enter' && handleAddPlayer()}
                        />
                        <button className="btn btn-primary" onClick={handleAddPlayer}>追加</button>
                    </div>

                    <div className="players-list-simple">
                        {players.map((player, index) => (
                            <span key={index} className="player-chip">
                                #{player.number} {player.name}
                                <button className="remove-btn" onClick={() => handleRemovePlayer(index)}>×</button>
                            </span>
                        ))}
                    </div>
                </div>

                <div className="editor-actions">
                    <button className="btn btn-success btn-large" onClick={handleSave} disabled={!name || players.length < 5}>
                        決定
                    </button>
                </div>
            </div>
        </div>
    );
}
