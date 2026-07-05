import { useState, useRef } from 'react';
import type { SavedTeam, SavedPlayer } from '../../utils/teamStorage';
import {
    loadMyTeams,
    saveMyTeam,
    deleteMyTeam,
    createEmptySavedTeam,
    generateTeamId
} from '../../utils/teamStorage';
import { recognizePlayerList, isOCRAvailable, getStoredApiKey } from '../../utils/imageOCR';
import {
    exportTeam,
    downloadJSON,
    shareFile,
    generateTeamFilename,
    parseImportFile,
    parseImportJSON,
    executeImport,
} from '../../utils/dataBackup';
import type { ParsedImportData } from '../../utils/dataBackup';
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
    const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [pendingImport, setPendingImport] = useState<ParsedImportData | null>(null);
    const [importTarget, setImportTarget] = useState<'myTeam' | 'opponent'>('myTeam');
    const [showTextImport, setShowTextImport] = useState(false);
    const [importText, setImportText] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const jsonImportInputRef = useRef<HTMLInputElement>(null);
    const hasApiKey = !!getStoredApiKey();

    const refreshTeams = () => {
        setTeams(loadMyTeams());
    };

    const handleCreateNew = () => {
        setEditingTeam(createEmptySavedTeam());
    };

    const handleEdit = (team: SavedTeam) => {
        setEditingTeam({ ...team });
    };

    const showStatus = (text: string, type: 'success' | 'error') => {
        setStatusMessage({ text, type });
        if (type === 'success') {
            setTimeout(() => setStatusMessage(null), 4000);
        }
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
        } catch {
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

    const handleExportTeam = async (team: SavedTeam) => {
        const data = exportTeam(team);
        const filename = generateTeamFilename(team.name);

        // モバイルデバイスの場合はWeb Share APIを試す
        if ('share' in navigator && navigator.userAgent.match(/mobile/i)) {
            const shared = await shareFile(data, filename, `${team.name} - チームデータ`);
            if (shared) return;
        }

        // ダウンロード
        downloadJSON(data, filename);
    };

    const handleImportTeam = () => {
        jsonImportInputRef.current?.click();
    };

    const handleJsonImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const parsed = await parseImportFile(file);
            if (parsed.type === 'unknown') {
                showStatus(`インポート失敗: ${parsed.summary}`, 'error');
            } else if (parsed.type === 'team') {
                // チームデータの場合は確認パネルを表示
                setPendingImport(parsed);
            } else {
                // チーム以外のデータはそのままインポート
                const result = executeImport(parsed);
                if (result.success) {
                    showStatus(`✓ ${result.message}`, 'success');
                    refreshTeams();
                } else {
                    showStatus(`インポート失敗: ${result.message}`, 'error');
                }
            }
        } catch (error) {
            showStatus('インポートに失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'), 'error');
        }

        e.target.value = '';
    };

    const handleConfirmImport = () => {
        if (!pendingImport) return;
        const result = executeImport(pendingImport, { teamTarget: importTarget });
        if (result.success) {
            showStatus(`✓ ${result.message}`, 'success');
            refreshTeams();
        } else {
            showStatus(`インポート失敗: ${result.message}`, 'error');
        }
        setPendingImport(null);
    };

    const handleCancelImport = () => {
        setPendingImport(null);
    };

    const handleImportTextSubmit = () => {
        if (!importText.trim()) return;
        const parsed = parseImportJSON(importText.trim());
        if (parsed.type === 'unknown') {
            showStatus(`インポート失敗: ${parsed.summary}`, 'error');
        } else if (parsed.type === 'team') {
            setPendingImport(parsed);
            setShowTextImport(false);
            setImportText('');
        } else {
            const result = executeImport(parsed);
            if (result.success) {
                showStatus(`✓ ${result.message}`, 'success');
                refreshTeams();
            } else {
                showStatus(`インポート失敗: ${result.message}`, 'error');
            }
            setShowTextImport(false);
            setImportText('');
        }
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
                        <button
                            className={`btn ${hasApiKey ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={triggerFileInput}
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
                <button className="btn btn-secondary" onClick={handleImportTeam}>
                    📥 チームインポート
                </button>
                <input
                    ref={jsonImportInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleJsonImport}
                    style={{ display: 'none' }}
                />
                <button className="btn btn-secondary" onClick={() => setShowTextImport(true)}>
                    📝 データを貼り付け
                </button>
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

            {statusMessage && (
                <div className={`status-message ${statusMessage.type}`}>
                    {statusMessage.text}
                    {statusMessage.type === 'error' && (
                        <button className="status-dismiss" onClick={() => setStatusMessage(null)}>×</button>
                    )}
                </div>
            )}

            {/* テキスト貼り付けUI */}
            {showTextImport && (
                <div className="text-import-panel">
                    <h4>📝 JSONデータの貼り付け</h4>
                    <textarea
                        className="text-import-textarea"
                        value={importText}
                        onChange={e => setImportText(e.target.value)}
                        placeholder='JSONデータをここに貼り付けてください'
                        rows={6}
                    />
                    <div className="text-import-actions">
                        <button className="btn btn-secondary" onClick={() => { setShowTextImport(false); setImportText(''); }}>キャンセル</button>
                        <button className="btn btn-primary" onClick={handleImportTextSubmit} disabled={!importText.trim()}>読み込む</button>
                    </div>
                </div>
            )}

            {/* インポート確認UI */}
            {pendingImport && (
                <div className={`import-confirm-panel ${pendingImport.hasDuplicates ? 'has-duplicates' : ''}`}>
                    <h4>📋 インポート内容の確認</h4>
                    <p className="import-summary">{pendingImport.summary}</p>
                    {pendingImport.preview && pendingImport.preview.length > 0 && (
                        <div className="import-preview">
                            {pendingImport.preview.map((line, i) => (
                                <p key={i} className="import-preview-line">{line}</p>
                            ))}
                        </div>
                    )}
                    {pendingImport.hasDuplicates && (
                        <p className="import-warning">⚠️ {pendingImport.duplicateDetails}</p>
                    )}
                    <div className="import-target-selector">
                        <label>インポート先：</label>
                        <select value={importTarget} onChange={e => setImportTarget(e.target.value as 'myTeam' | 'opponent')}>
                            <option value="myTeam">マイチーム</option>
                            <option value="opponent">対戦チーム</option>
                        </select>
                    </div>
                    <div className="import-confirm-actions">
                        <button className="btn btn-secondary" onClick={handleCancelImport}>キャンセル</button>
                        <button className="btn btn-primary" onClick={handleConfirmImport}>インポート実行</button>
                    </div>
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
                                            className="btn btn-secondary"
                                            onClick={() => handleExportTeam(team)}
                                            title="このチームをエクスポート"
                                        >
                                            📤 エクスポート
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

            {/* 削除確認モーダル */}
            {deleteTargetId && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>チームの削除</h3>
                        <p>このチームを削除してもよろしいですか？</p>
                        <p className="text-muted text-sm">※この操作は取り消せません</p>
                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={cancelDelete}>キャンセル</button>
                            <button className="btn btn-danger" onClick={confirmDelete}>削除する</button>
                        </div>
                    </div>
                </div>
            )}
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
