import { useState, useRef } from 'react';
import { showToast } from '../Toast/toastApi';
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
} from '../../utils/dataBackup';
import { parsePlayerNumber, formatPlayerNumber } from '../../utils/playerNumber';
import { useTeamImportExport, TextImportPanel, ImportConfirmPanel, DeleteConfirmModal } from '../TeamShared';
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

    const jsonImportInputRef = useRef<HTMLInputElement>(null);

    const refreshTeams = () => {
        setTeams(loadMyTeams());
    };

    const {
        pendingImport, importTarget, setImportTarget,
        showTextImport, setShowTextImport,
        importText, updateImportText, textValidation,
        handleJsonImport, handleConfirmImport, handleCancelImport, handleImportTextSubmit,
    } = useTeamImportExport({ onImported: refreshTeams, defaultImportTarget: 'myTeam' });

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



            {showTextImport && (
                <TextImportPanel
                    importText={importText}
                    updateImportText={updateImportText}
                    textValidation={textValidation}
                    onSubmit={handleImportTextSubmit}
                    onCancel={() => { setShowTextImport(false); updateImportText(''); }}
                />
            )}

            {pendingImport && (
                <ImportConfirmPanel
                    pendingImport={pendingImport}
                    importTarget={importTarget}
                    onChangeImportTarget={setImportTarget}
                    onConfirm={handleConfirmImport}
                    onCancel={handleCancelImport}
                />
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

            {deleteTargetId && (
                <DeleteConfirmModal
                    title="チーム削除の確認"
                    message="このチームを削除してもよろしいですか？"
                    note="※この操作は取り消せません"
                    onConfirm={confirmDelete}
                    onCancel={cancelDelete}
                />
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

        // 「00」は「0」と別の番号として内部値100で扱う（parsePlayerNumber）
        const bibNum = newBibNumber ? parsePlayerNumber(newBibNumber) : undefined;
        const uniNum = newUniformNumber ? parsePlayerNumber(newUniformNumber) : undefined;

        // 番号の範囲チェック
        if (bibNum === null) {
            showStatus('ビブス番号は0〜99または00で入力してください', 'error');
            return;
        }
        if (uniNum === null) {
            showStatus('ユニフォーム番号は0〜99または00で入力してください', 'error');
            return;
        }

        // 重複チェック（それぞれの番号タイプで）
        if (bibNum !== undefined && players.some(p => p.bibNumber === bibNum)) {
            showStatus(`ビブス番号 ${formatPlayerNumber(bibNum)} は既に登録されています`, 'error');
            return;
        }
        if (uniNum !== undefined && players.some(p => p.uniformNumber === uniNum)) {
            showStatus(`ユニフォーム番号 ${formatPlayerNumber(uniNum)} は既に登録されています`, 'error');
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
        setEditBibNumber(player.bibNumber !== undefined ? formatPlayerNumber(player.bibNumber) : '');
        setEditUniformNumber(player.uniformNumber !== undefined ? formatPlayerNumber(player.uniformNumber) : '');
        setEditName(player.name);
        setEditCourtName(player.courtName || '');
        setEditLicenseNo(player.licenseNo || '');
    };

    // 選手編集保存
    const handleSaveEdit = () => {
        if (editingPlayerIndex === null) return;

        // 「00」は「0」と別の番号として内部値100で扱う（parsePlayerNumber）
        const bibNum = editBibNumber ? parsePlayerNumber(editBibNumber) : undefined;
        const uniNum = editUniformNumber ? parsePlayerNumber(editUniformNumber) : undefined;

        // 少なくとも1つの番号が必要
        if (bibNum === undefined && uniNum === undefined) {
            showStatus('ビブス番号またはユニフォーム番号のいずれかを入力してください', 'error');
            return;
        }

        // 番号の範囲チェック
        if (bibNum === null) {
            showStatus('ビブス番号は0〜99または00で入力してください', 'error');
            return;
        }
        if (uniNum === null) {
            showStatus('ユニフォーム番号は0〜99または00で入力してください', 'error');
            return;
        }

        // 他の選手と番号が重複していないか確認（それぞれの番号タイプで）
        if (bibNum !== undefined) {
            const isDuplicateBib = players.some((p, i) => i !== editingPlayerIndex && p.bibNumber === bibNum);
            if (isDuplicateBib) {
                showStatus(`ビブス番号 ${formatPlayerNumber(bibNum)} は既に登録されています`, 'error');
                return;
            }
        }
        if (uniNum !== undefined) {
            const isDuplicateUni = players.some((p, i) => i !== editingPlayerIndex && p.uniformNumber === uniNum);
            if (isDuplicateUni) {
                showStatus(`ユニフォーム番号 ${formatPlayerNumber(uniNum)} は既に登録されています`, 'error');
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
                            type="text"
                            className="input player-number-input"
                            value={newBibNumber}
                            onChange={e => setNewBibNumber(e.target.value.replace(/\D/g, '').slice(0, 2))}
                            placeholder="ビブス"
                            maxLength={2}
                            autoComplete="one-time-code"
                            inputMode="numeric"
                            data-form-type="other"
                            data-lpignore="true"
                        />
                        <input
                            type="text"
                            className="input player-number-input"
                            value={newUniformNumber}
                            onChange={e => setNewUniformNumber(e.target.value.replace(/\D/g, '').slice(0, 2))}
                            placeholder="ユニ"
                            maxLength={2}
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
                                            type="text"
                                            className="input player-number-input"
                                            value={editBibNumber}
                                            onChange={e => setEditBibNumber(e.target.value.replace(/\D/g, '').slice(0, 2))}
                                            placeholder="ビブス"
                                            maxLength={2}
                                            autoFocus
                                            autoComplete="one-time-code"
                                            inputMode="numeric"
                                            data-form-type="other"
                                            data-lpignore="true"
                                        />
                                        <input
                                            type="text"
                                            className="input player-number-input"
                                            value={editUniformNumber}
                                            onChange={e => setEditUniformNumber(e.target.value.replace(/\D/g, '').slice(0, 2))}
                                            placeholder="ユニ"
                                            maxLength={2}
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
                                                ? `#${formatPlayerNumber(player.bibNumber)}/#${formatPlayerNumber(player.uniformNumber)}`
                                                : player.bibNumber !== undefined
                                                    ? `ビ#${formatPlayerNumber(player.bibNumber)}`
                                                    : `ユ#${formatPlayerNumber(player.uniformNumber ?? player.number)}`
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
