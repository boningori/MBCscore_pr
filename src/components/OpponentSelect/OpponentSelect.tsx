import { useState, useRef } from 'react';
import type { SavedTeam, SavedPlayer } from '../../utils/teamStorage';
import {
    loadRecentOpponents,
    saveRecentOpponent,
    saveOpponent,
    createEmptySavedTeam,
    generateTeamId,
    clearRecentOpponents,
    loadOpponents
} from '../../utils/teamStorage';
import { recognizePlayerList, isOCRAvailable, getStoredApiKey } from '../../utils/imageOCR';
import {
    DOUBLE_ZERO_INTERNAL,
    formatPlayerNumber,
    parsePlayerNumber,
    isValidPlayerNumber,
    sortPlayersByNumber,
} from '../../utils/playerNumber';
import '../../styles/number-grid.css';
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
    const hasApiKey = !!getStoredApiKey();

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

    const handleSaveNew = (team: SavedTeam, saveToRegistry: boolean) => {
        saveRecentOpponent(team);
        if (saveToRegistry) {
            saveOpponent(team);
        }
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
                            <button
                                className={`btn ${hasApiKey ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => fileInputRef.current?.click()}
                                title={hasApiKey ? 'Gemini AIで高精度に読み取ります' : '標準OCRで読み取ります'}
                            >
                                {hasApiKey ? '✨ AI読込' : '📷 写真読込'}
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
                    {hasApiKey ? 'AIが画像を解析中...' : 'OCRで画像を解析中...'}
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
    onSave: (team: SavedTeam, saveToRegistry: boolean) => void;
    onCancel: () => void;
    onImageImport: (file: File) => void;
    isLoading: boolean;
}

function OpponentEditor({ team, onSave, onCancel, onImageImport, isLoading }: OpponentEditorProps) {
    const [name, setName] = useState(team.name);
    const [coachName, setCoachName] = useState(team.coachName || '');
    const [coachLicenseNo, setCoachLicenseNo] = useState(team.coachLicenseNo || '');
    const [assistantCoachName, setAssistantCoachName] = useState(team.assistantCoachName || '');
    const [assistantCoachLicenseNo, setAssistantCoachLicenseNo] = useState(team.assistantCoachLicenseNo || '');
    const [players, setPlayers] = useState<SavedPlayer[]>(team.players);
    const [newNumber, setNewNumber] = useState('');
    const [newName, setNewName] = useState('');
    const [newLicenseNo, setNewLicenseNo] = useState('');
    const [saveToRegistry, setSaveToRegistry] = useState(false);
    const [showNumberGrid, setShowNumberGrid] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const hasApiKey = !!getStoredApiKey();

    // 番号をトグル（追加/削除）
    const handleToggleNumber = (num: number) => {
        const existingIndex = players.findIndex(p => p.number === num);

        if (existingIndex >= 0) {
            // 既存なら削除
            setPlayers(players.filter((_, i) => i !== existingIndex));
        } else {
            // 新規なら追加
            const displayNum = formatPlayerNumber(num);
            const newPlayer: SavedPlayer = {
                number: num,
                name: `選手${displayNum}`,
                isCaptain: false,
            };
            setPlayers(sortPlayersByNumber([...players, newPlayer]));
        }
    };

    const handleAddPlayer = () => {
        if (!newNumber) return;
        const number = parsePlayerNumber(newNumber);
        if (number === null || !isValidPlayerNumber(number)) {
            alert('背番号は0〜99または00を入力してください');
            return;
        }

        const displayNum = formatPlayerNumber(number);
        if (players.some(p => p.number === number)) {
            alert(`背番号 ${displayNum} は既に登録されています`);
            return;
        }

        // 名前がなくても対戦チームならOKとする（番号だけで管理する場合もあるため）
        const playerName = newName || `選手${displayNum}`;

        setPlayers(sortPlayersByNumber([
            ...players,
            { number, name: playerName, licenseNo: newLicenseNo.trim() || undefined, isCaptain: false }
        ]));
        setNewNumber('');
        setNewName('');
        setNewLicenseNo('');
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
            coachName,
            coachLicenseNo: coachLicenseNo || undefined,
            assistantCoachName,
            assistantCoachLicenseNo: assistantCoachLicenseNo || undefined,
            players,
            updatedAt: new Date().toISOString(),
        }, saveToRegistry);
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
                    <label className="form-label">コーチ</label>
                    <div className="opponent-coach-row">
                        <input
                            type="text"
                            className="input opponent-coach-name-input"
                            value={coachName}
                            onChange={e => setCoachName(e.target.value)}
                            placeholder="コーチ名（任意）"
                            autoComplete="off"
                        />
                        <input
                            type="text"
                            className="input opponent-coach-license-input"
                            value={coachLicenseNo}
                            onChange={e => setCoachLicenseNo(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                            placeholder="ライセンスNo."
                            maxLength={10}
                            autoComplete="off"
                        />
                    </div>
                </div>

                <div className="form-section">
                    <label className="form-label">Aコーチ</label>
                    <div className="opponent-coach-row">
                        <input
                            type="text"
                            className="input opponent-coach-name-input"
                            value={assistantCoachName}
                            onChange={e => setAssistantCoachName(e.target.value)}
                            placeholder="Aコーチ名（任意）"
                            autoComplete="off"
                        />
                        <input
                            type="text"
                            className="input opponent-coach-license-input"
                            value={assistantCoachLicenseNo}
                            onChange={e => setAssistantCoachLicenseNo(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                            placeholder="ライセンスNo."
                            maxLength={10}
                            autoComplete="off"
                        />
                    </div>
                </div>

                <div className="form-section">
                    <div className="players-header-row">
                        <label className="form-label">選手登録 ({players.length}人)</label>
                        <div className="player-actions-row">
                            <button
                                className={`btn btn-small ${showNumberGrid ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setShowNumberGrid(!showNumberGrid)}
                            >
                                # 番号一括選択
                            </button>
                            {isOCRAvailable() && (
                                <button
                                    className={`btn btn-small ${hasApiKey ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isLoading}
                                    title={hasApiKey ? 'Gemini AIで高精度に読み取ります' : '標準OCRで読み取ります'}
                                >
                                    {hasApiKey ? '✨ AI読込' : '📷 写真読込'}
                                </button>
                            )}
                            <button
                                className="btn btn-danger btn-small"
                                onClick={() => {
                                    if (players.length > 0 && confirm('登録済みの選手を全てクリアしますか？')) {
                                        setPlayers([]);
                                    }
                                }}
                                disabled={players.length === 0}
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

                    {isLoading && <div className="ocr-loading">{hasApiKey ? 'AIが解析中...' : 'OCRで解析中...'}</div>}

                    {/* 番号グリッド選択UI */}
                    {showNumberGrid && (
                        <div className="number-grid-container">
                            <p className="number-grid-hint">タップで追加/削除</p>
                            <div className="number-grid">
                                {/* 0-99 と 00 の番号ボタン（00は99の後） */}
                                {[...Array.from({ length: 100 }, (_, i) => i), DOUBLE_ZERO_INTERNAL].map((num) => {
                                    const isSelected = players.some(p => p.number === num);
                                    return (
                                        <button
                                            key={num}
                                            className={`number-grid-item ${isSelected ? 'selected' : ''}`}
                                            onClick={() => handleToggleNumber(num)}
                                        >
                                            {formatPlayerNumber(num)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="add-player-row">
                        <input
                            type="text"
                            inputMode="numeric"
                            className="input player-number-input"
                            value={newNumber}
                            onChange={e => setNewNumber(e.target.value)}
                            placeholder="No."
                            maxLength={2}
                        />
                        <input
                            type="text"
                            className="input player-name-input"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="名前 (任意)"
                        />
                        <input
                            type="text"
                            className="input opponent-player-license-input"
                            value={newLicenseNo}
                            onChange={e => setNewLicenseNo(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                            placeholder="ライセンスNo."
                            maxLength={10}
                            autoComplete="off"
                            onKeyDown={e => e.key === 'Enter' && handleAddPlayer()}
                        />
                        <button className="btn btn-primary" onClick={handleAddPlayer}>追加</button>
                    </div>

                    <div className="players-list-simple">
                        {players.map((player, index) => (
                            <span key={index} className="player-chip">
                                #{formatPlayerNumber(player.number)} {player.name}{player.licenseNo ? ` [${player.licenseNo}]` : ''}
                                <button className="remove-btn" onClick={() => handleRemovePlayer(index)}>×</button>
                            </span>
                        ))}
                    </div>
                </div>

                <div className="save-option">
                    <label className="checkbox-label">
                        <input
                            type="checkbox"
                            checked={saveToRegistry}
                            onChange={e => setSaveToRegistry(e.target.checked)}
                        />
                        対戦チーム管理にも登録する
                    </label>
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
