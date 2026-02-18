import { useState, useRef, useEffect } from 'react';
import { showToast } from '../Toast/Toast';
import type { SavedTeam, SavedPlayer } from '../../utils/teamStorage';
import {
    loadMyTeams,
    saveMyTeam,
    deleteMyTeam,
    createEmptySavedTeam,
    generateTeamId
} from '../../utils/teamStorage';
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

    const [pendingImport, setPendingImport] = useState<ParsedImportData | null>(null);
    const [importTarget, setImportTarget] = useState<'myTeam' | 'opponent'>('myTeam');
    const [showTextImport, setShowTextImport] = useState(false);
    const [importText, setImportText] = useState('');
    const [textValidation, setTextValidation] = useState<{ valid: boolean; message: string } | null>(null);
    const jsonImportInputRef = useRef<HTMLInputElement>(null);

    // リアルタイムJSONバリデーション（500msデバウンス）
    useEffect(() => {
        if (!importText.trim()) {
            setTextValidation(null);
            return;
        }
        const timer = setTimeout(() => {
            try {
                const parsed = parseImportJSON(importText.trim());
                if (parsed.type === 'unknown') {
                    setTextValidation({ valid: false, message: '有効なJSONデータを入力してください' });
                } else {
                    const typeLabel = parsed.type === 'team' ? 'チームデータ' : parsed.type === 'backup' ? '全データバックアップ' : parsed.type === 'game' ? '試合データ' : 'データ';
                    setTextValidation({ valid: true, message: `✓ ${typeLabel}が検出されました` });
                }
            } catch {
                setTextValidation({ valid: false, message: '有効なJSONデータを入力してください' });
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [importText]);

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

    const handleExportTeam = async (e: React.MouseEvent, team: SavedTeam) => {
        e.stopPropagation();
        const data = exportTeam(team);
        const filename = generateTeamFilename(team.name);

        // モバイルデバイスの場合はWeb Share APIを試す
        if ('share' in navigator && navigator.userAgent.match(/mobile/i)) {
            const shared = await shareFile(data, filename, `${team.name} - チームデータ`);
            if (shared) {
                showToast(`✓ ${team.name} のデータを共有しました`, 'success');
                return;
            }
        }

        // ダウンロード
        downloadJSON(data, filename);
        showToast(`✓ ${filename} をダウンロードしました`, 'success');
    };

    const showStatus = (text: string, type: 'success' | 'error') => {
        showToast(text, type);
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
            } else {
                // すべてのインポートタイプで確認画面を表示（データ損失防止）
                setPendingImport(parsed);
            }
        } catch (error) {
            showStatus('インポートに失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'), 'error');
        }

        e.target.value = '';
    };

    const handleConfirmImport = () => {
        if (!pendingImport) return;
        const options = pendingImport.type === 'team' ? { teamTarget: importTarget } : undefined;
        const result = executeImport(pendingImport, options);
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
        } else {
            // すべてのインポートタイプで確認画面を表示（データ損失防止）
            setPendingImport(parsed);
            setShowTextImport(false);
            setImportText('');
        }
    };

    if (editingTeam) {
        return (
            <MyTeamEditor
                team={editingTeam}
                onSave={handleSave}
                onCancel={() => setEditingTeam(null)}
                showStatus={showStatus}
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

            <div className="manager-content">
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
                <button className="btn btn-primary btn-large add-team-btn" onClick={handleCreateNew}>
                    + 新規チーム作成
                </button>
            </div>



            {/* テキスト貼り付けUI */}
            {showTextImport && (
                <div className="text-import-panel">
                    <h4>📝 JSONデータの貼り付け</h4>
                    <p className="text-import-hint">MBCscoreの「エクスポート」や「クリップボードにコピー」で取得したJSONデータを貼り付けてください。</p>
                    <textarea
                        className="text-import-textarea"
                        value={importText}
                        onChange={e => setImportText(e.target.value)}
                        placeholder='ここにコピーしたデータを貼り付けてください'
                        rows={10}
                        style={{ minHeight: '200px' }}
                    />
                    {textValidation && (
                        <p className={`text-validation ${textValidation.valid ? 'valid' : 'invalid'}`}>
                            {textValidation.message}
                        </p>
                    )}
                    <div className="text-import-actions">
                        <button className="btn btn-secondary" onClick={() => { setShowTextImport(false); setImportText(''); }}>キャンセル</button>
                        <button className="btn btn-primary" onClick={handleImportTextSubmit} disabled={!importText.trim()}>読み込む</button>
                    </div>
                </div>
            )}

            {pendingImport && (
                <div className={`import-confirm-panel ${pendingImport.hasDuplicates ? 'has-duplicates' : ''}`}>
                    <h4>📋 インポート内容の確認</h4>
                    <p className="import-summary">{pendingImport.summary}</p>
                    {pendingImport.type === 'backup' && (
                        <div className="import-danger-warning">
                            <p className="import-warning-title">⚠️ 重要な警告</p>
                            <p className="import-warning-text">
                                これは全データバックアップファイルです。<br />
                                インポートすると、<strong>試合履歴・マイチーム・対戦チーム・設定</strong>が上書きされます。
                            </p>
                        </div>
                    )}
                    {pendingImport.type === 'backup' && (
                        <div className="import-merge-info">
                            <p className="import-info">
                                📌 復元ルール:<br />
                                • 同じデータがあれば新しい方に更新されます<br />
                                • 新しいデータは追加されます<br />
                                • 既存データが削除されることはありません
                            </p>
                        </div>
                    )}
                    {pendingImport.type === 'game' && (
                        <p className="import-info">ℹ️ 試合データをインポートします。同じIDの試合がある場合は上書きされます。</p>
                    )}
                    {pendingImport.type === 'team' && (
                        <>
                            <p className="import-info">📌 同じIDのチームが既にある場合、インポートしたデータで上書きされます。</p>
                            <div className="import-target-selector">
                                <label>インポート先：</label>
                                <select value={importTarget} onChange={e => setImportTarget(e.target.value as 'myTeam' | 'opponent')}>
                                    <option value="myTeam">マイチーム</option>
                                    <option value="opponent">対戦チーム</option>
                                </select>
                            </div>
                        </>
                    )}
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
                    <div className="import-confirm-actions">
                        <button className="btn btn-secondary" onClick={handleCancelImport}>キャンセル</button>
                        {pendingImport.type === 'backup' ? (
                            <button className="btn btn-danger" onClick={handleConfirmImport}>全データをインポート（上書き）</button>
                        ) : (
                            <button className="btn btn-primary" onClick={handleConfirmImport}>
                                {pendingImport.type === 'team'
                                    ? (importTarget === 'myTeam' ? 'マイチームにインポート' : '対戦チームにインポート')
                                    : 'インポート実行'}
                            </button>
                        )}
                    </div>
                </div>
            )}

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
                                    {team.players.slice(0, 5).map(p => {
                                        const bib = p.bibNumber ?? p.number;
                                        const uni = p.uniformNumber;
                                        return uni !== undefined ? `#${bib}/#${uni}` : `#${bib}`;
                                    }).join(', ')}
                                    {team.players.length > 5 && '...'}
                                </p>
                            </div>
                            <div className="team-card-actions">
                                {isSelectionMode && (
                                    <button
                                        className="btn btn-success btn-small"
                                        onClick={() => handleSelect(team)}
                                    >
                                        選択
                                    </button>
                                )}
                                <button
                                    className="btn btn-secondary btn-small"
                                    onClick={() => handleEdit(team)}
                                >
                                    編集
                                </button>
                                <button
                                    className="btn btn-secondary btn-small"
                                    onClick={(e) => handleExportTeam(e, team)}
                                    title="このチームをエクスポート"
                                >
                                    📤 エクスポート
                                </button>
                                <button
                                    className="btn btn-danger btn-small"
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
    showStatus: (text: string, type: 'success' | 'error') => void;
}

function MyTeamEditor({ team, onSave, onCancel, showStatus }: MyTeamEditorProps) {
    const [name, setName] = useState(team.name);
    const [coachName, setCoachName] = useState(team.coachName);
    const [coachLicenseNo, setCoachLicenseNo] = useState(team.coachLicenseNo || '');
    const [assistantCoachName, setAssistantCoachName] = useState(team.assistantCoachName || '');
    const [assistantCoachLicenseNo, setAssistantCoachLicenseNo] = useState(team.assistantCoachLicenseNo || '');
    // 既存データのマイグレーション: bibNumber/uniformNumberが未設定の場合はnumberを使用
    const [players, setPlayers] = useState<SavedPlayer[]>(team.players.map(p => ({
        ...p,
        bibNumber: p.bibNumber ?? p.number,
        uniformNumber: p.uniformNumber ?? p.number,
    })));
    const [newBibNumber, setNewBibNumber] = useState('');
    const [newUniformNumber, setNewUniformNumber] = useState('');
    const [newName, setNewName] = useState('');
    const [newCourtName, setNewCourtName] = useState('');
    const [newLicenseNo, setNewLicenseNo] = useState('');

    // 選手編集用の状態
    const [editingPlayerIndex, setEditingPlayerIndex] = useState<number | null>(null);
    const [editBibNumber, setEditBibNumber] = useState('');
    const [editUniformNumber, setEditUniformNumber] = useState('');
    const [editName, setEditName] = useState('');
    const [editCourtName, setEditCourtName] = useState('');
    const [editLicenseNo, setEditLicenseNo] = useState('');

    const handleAddPlayer = () => {
        // 少なくとも1つの番号と氏名が必要
        if ((!newBibNumber && !newUniformNumber) || !newName) return;

        const bibNum = newBibNumber ? parseInt(newBibNumber, 10) : undefined;
        const uniNum = newUniformNumber ? parseInt(newUniformNumber, 10) : undefined;

        // 番号の範囲チェック
        if (bibNum !== undefined && (isNaN(bibNum) || bibNum < 0 || bibNum > 99)) {
            showStatus('ビブス番号は0〜99の範囲で入力してください', 'error');
            return;
        }
        if (uniNum !== undefined && (isNaN(uniNum) || uniNum < 0 || uniNum > 99)) {
            showStatus('ユニフォーム番号は0〜99の範囲で入力してください', 'error');
            return;
        }

        // 重複チェック（それぞれの番号タイプで）
        if (bibNum !== undefined && players.some(p => p.bibNumber === bibNum)) {
            showStatus(`ビブス番号 ${bibNum} は既に登録されています`, 'error');
            return;
        }
        if (uniNum !== undefined && players.some(p => p.uniformNumber === uniNum)) {
            showStatus(`ユニフォーム番号 ${uniNum} は既に登録されています`, 'error');
            return;
        }

        if (players.length >= 15) return;

        // デフォルト番号はビブス番号優先
        const defaultNumber = bibNum ?? uniNum!;

        setPlayers([
            ...players,
            {
                number: defaultNumber,
                bibNumber: bibNum,
                uniformNumber: uniNum,
                name: newName,
                courtName: newCourtName || undefined,
                licenseNo: newLicenseNo || undefined,
                isCaptain: false
            }
        ].sort((a, b) => (a.bibNumber ?? a.number) - (b.bibNumber ?? b.number)));
        setNewBibNumber('');
        setNewUniformNumber('');
        setNewName('');
        setNewCourtName('');
        setNewLicenseNo('');
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
        setEditBibNumber(player.bibNumber !== undefined ? String(player.bibNumber) : '');
        setEditUniformNumber(player.uniformNumber !== undefined ? String(player.uniformNumber) : '');
        setEditName(player.name);
        setEditCourtName(player.courtName || '');
        setEditLicenseNo(player.licenseNo || '');
    };

    // 選手編集保存
    const handleSaveEdit = () => {
        if (editingPlayerIndex === null) return;

        const bibNum = editBibNumber ? parseInt(editBibNumber, 10) : undefined;
        const uniNum = editUniformNumber ? parseInt(editUniformNumber, 10) : undefined;

        // 少なくとも1つの番号が必要
        if (bibNum === undefined && uniNum === undefined) {
            showStatus('ビブス番号またはユニフォーム番号のいずれかを入力してください', 'error');
            return;
        }

        // 番号の範囲チェック
        if (bibNum !== undefined && (isNaN(bibNum) || bibNum < 0 || bibNum > 99)) {
            showStatus('ビブス番号は0〜99の範囲で入力してください', 'error');
            return;
        }
        if (uniNum !== undefined && (isNaN(uniNum) || uniNum < 0 || uniNum > 99)) {
            showStatus('ユニフォーム番号は0〜99の範囲で入力してください', 'error');
            return;
        }

        // 他の選手と番号が重複していないか確認（それぞれの番号タイプで）
        if (bibNum !== undefined) {
            const isDuplicateBib = players.some((p, i) => i !== editingPlayerIndex && p.bibNumber === bibNum);
            if (isDuplicateBib) {
                showStatus(`ビブス番号 ${bibNum} は既に登録されています`, 'error');
                return;
            }
        }
        if (uniNum !== undefined) {
            const isDuplicateUni = players.some((p, i) => i !== editingPlayerIndex && p.uniformNumber === uniNum);
            if (isDuplicateUni) {
                showStatus(`ユニフォーム番号 ${uniNum} は既に登録されています`, 'error');
                return;
            }
        }

        if (!editName.trim()) {
            showStatus('氏名を入力してください', 'error');
            return;
        }

        // デフォルト番号はビブス番号優先
        const defaultNumber = bibNum ?? uniNum!;

        setPlayers(players.map((p, i) =>
            i === editingPlayerIndex
                ? {
                    ...p,
                    number: defaultNumber,
                    bibNumber: bibNum,
                    uniformNumber: uniNum,
                    name: editName.trim(),
                    courtName: editCourtName.trim() || undefined,
                    licenseNo: editLicenseNo.trim() || undefined
                }
                : p
        ).sort((a, b) => (a.bibNumber ?? a.number) - (b.bibNumber ?? b.number)));
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
            coachLicenseNo: coachLicenseNo || undefined,
            assistantCoachName,
            assistantCoachLicenseNo: assistantCoachLicenseNo || undefined,
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
                        autoComplete="one-time-code"
                        name="team-name-field"
                        data-form-type="other"
                        data-lpignore="true"
                        data-1p-ignore="true"
                    />
                </div>

                <div className="form-section">
                    <label className="form-label">コーチ</label>
                    <div className="editor-coach-row">
                        <input
                            type="text"
                            className="input editor-coach-name-input"
                            value={coachName}
                            onChange={e => setCoachName(e.target.value)}
                            placeholder="コーチ名を入力"
                            autoComplete="one-time-code"
                            name="coach-name-field"
                            data-form-type="other"
                            data-lpignore="true"
                            data-1p-ignore="true"
                        />
                        <input
                            type="text"
                            className="input editor-coach-license-input"
                            value={coachLicenseNo}
                            onChange={e => setCoachLicenseNo(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                            placeholder="ライセンスNo."
                            maxLength={10}
                            autoComplete="one-time-code"
                            name="coach-license-field"
                            data-form-type="other"
                            data-lpignore="true"
                            data-1p-ignore="true"
                        />
                    </div>
                </div>

                <div className="form-section">
                    <label className="form-label">Aコーチ</label>
                    <div className="editor-coach-row">
                        <input
                            type="text"
                            className="input editor-coach-name-input"
                            value={assistantCoachName}
                            onChange={e => setAssistantCoachName(e.target.value)}
                            placeholder="Aコーチ名を入力"
                            autoComplete="one-time-code"
                            name="assistant-coach-field"
                            data-form-type="other"
                            data-lpignore="true"
                            data-1p-ignore="true"
                        />
                        <input
                            type="text"
                            className="input editor-coach-license-input"
                            value={assistantCoachLicenseNo}
                            onChange={e => setAssistantCoachLicenseNo(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                            placeholder="ライセンスNo."
                            maxLength={10}
                            autoComplete="one-time-code"
                            name="assistant-coach-license-field"
                            data-form-type="other"
                            data-lpignore="true"
                            data-1p-ignore="true"
                        />
                    </div>
                </div>

                <div className="form-section">
                    <div className="form-label-row">
                        <label className="form-label">選手登録 ({players.length}/15)</label>
                    </div>

                    <div className="add-player-row">
                        <input
                            type="number"
                            className="input player-number-input"
                            value={newBibNumber}
                            onChange={e => setNewBibNumber(e.target.value)}
                            placeholder="ビブス"
                            min="0"
                            max="99"
                            autoComplete="one-time-code"
                            inputMode="numeric"
                            data-form-type="other"
                            data-lpignore="true"
                        />
                        <input
                            type="number"
                            className="input player-number-input"
                            value={newUniformNumber}
                            onChange={e => setNewUniformNumber(e.target.value)}
                            placeholder="ユニ"
                            min="0"
                            max="99"
                            autoComplete="one-time-code"
                            inputMode="numeric"
                            data-form-type="other"
                            data-lpignore="true"
                        />
                        <input
                            type="text"
                            className="input player-name-input"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="氏名"
                            autoComplete="one-time-code"
                            name="player-name-field"
                            data-form-type="other"
                            data-lpignore="true"
                        />
                        <input
                            type="text"
                            className="input player-courtname-input"
                            value={newCourtName}
                            onChange={e => setNewCourtName(e.target.value)}
                            placeholder="コートネーム"
                            autoComplete="one-time-code"
                            name="court-name-field"
                            data-form-type="other"
                            data-lpignore="true"
                        />
                        <input
                            type="text"
                            className="input player-license-input"
                            value={newLicenseNo}
                            onChange={e => setNewLicenseNo(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                            placeholder="ライセンスNo."
                            maxLength={10}
                            autoComplete="one-time-code"
                            name="license-no-field"
                            data-form-type="other"
                            data-lpignore="true"
                            onKeyDown={e => e.key === 'Enter' && handleAddPlayer()}
                        />
                        <button
                            className="btn btn-primary"
                            onClick={handleAddPlayer}
                            disabled={(!newBibNumber && !newUniformNumber) || !newName || players.length >= 15}
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
                                            value={editBibNumber}
                                            onChange={e => setEditBibNumber(e.target.value)}
                                            placeholder="ビブス"
                                            min="0"
                                            max="99"
                                            autoFocus
                                            autoComplete="one-time-code"
                                            inputMode="numeric"
                                            data-form-type="other"
                                            data-lpignore="true"
                                        />
                                        <input
                                            type="number"
                                            className="input player-number-input"
                                            value={editUniformNumber}
                                            onChange={e => setEditUniformNumber(e.target.value)}
                                            placeholder="ユニ"
                                            min="0"
                                            max="99"
                                            autoComplete="one-time-code"
                                            inputMode="numeric"
                                            data-form-type="other"
                                            data-lpignore="true"
                                        />
                                        <input
                                            type="text"
                                            className="input player-name-input"
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            placeholder="氏名"
                                            autoComplete="one-time-code"
                                            name="edit-player-name"
                                            data-form-type="other"
                                            data-lpignore="true"
                                        />
                                        <input
                                            type="text"
                                            className="input player-courtname-input"
                                            value={editCourtName}
                                            onChange={e => setEditCourtName(e.target.value)}
                                            placeholder="コートネーム"
                                            autoComplete="one-time-code"
                                            name="edit-court-name"
                                            data-form-type="other"
                                            data-lpignore="true"
                                        />
                                        <input
                                            type="text"
                                            className="input player-license-input"
                                            value={editLicenseNo}
                                            onChange={e => setEditLicenseNo(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                                            placeholder="ライセンスNo."
                                            maxLength={10}
                                            autoComplete="one-time-code"
                                            name="edit-license-no"
                                            data-form-type="other"
                                            data-lpignore="true"
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
                                            className="player-numbers clickable"
                                            onClick={() => handleStartEdit(index)}
                                        >
                                            {player.bibNumber !== undefined && player.uniformNumber !== undefined
                                                ? `#${player.bibNumber}/#${player.uniformNumber}`
                                                : player.bibNumber !== undefined
                                                    ? `ビ#${player.bibNumber}`
                                                    : `ユ#${player.uniformNumber}`
                                            }
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
                                            {player.courtName ? `(${player.courtName})` : ''}
                                        </span>
                                        <span
                                            className="player-license clickable"
                                            onClick={() => handleStartEdit(index)}
                                        >
                                            {player.licenseNo || ''}
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
