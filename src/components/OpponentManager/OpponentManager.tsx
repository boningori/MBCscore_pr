import { useState, useRef } from 'react';
import { showToast } from '../Toast/toastApi';
import type { SavedTeam, SavedPlayer } from '../../utils/teamStorage';
import {
    loadOpponents,
    saveOpponent,
    deleteOpponent,
    createEmptySavedTeam,
} from '../../utils/teamStorage';
import { recognizePlayerList } from '../../utils/imageOCR';
import { getStoredApiKey } from '../../utils/geminiClient';
import {
    DOUBLE_ZERO_INTERNAL,
    formatPlayerNumber,
    parsePlayerNumber,
    isValidPlayerNumber,
    sortPlayersByNumber,
} from '../../utils/playerNumber';
import {
    exportTeam,
    downloadJSON,
    shareFile,
    generateTeamFilename,
} from '../../utils/dataBackup';
import {
    useTeamImportExport,
    TextImportPanel,
    DeleteConfirmModal,
    isPlayerLimitReached,
    playerLimitMessage,
} from '../TeamShared';
import { useBackHandler } from '../../hooks/useBackHandler';
import '../../styles/number-grid.css';
import './OpponentManager.css';

interface OpponentManagerProps {
    onBack: () => void;
}

export function OpponentManager({ onBack }: OpponentManagerProps) {
    const [teams, setTeams] = useState<SavedTeam[]>(loadOpponents);
    const [editingTeam, setEditingTeam] = useState<SavedTeam | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

    // OCR related state
    const [isLoading, setIsLoading] = useState(false);
    const [ocrError, setOcrError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const jsonImportInputRef = useRef<HTMLInputElement>(null);
    const hasApiKey = !!getStoredApiKey();

    const refreshTeams = () => {
        setTeams(loadOpponents());
    };

    const {
        pendingImport, importTarget, setImportTarget,
        showTextImport, setShowTextImport,
        importText, updateImportText, textValidation,
        handleJsonImport, handleConfirmImport, handleCancelImport, handleImportTextSubmit,
    } = useTeamImportExport({ onImported: refreshTeams, defaultImportTarget: 'opponent' });

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
            refreshTeams();
            setDeleteTargetId(null);
        }
    };

    const cancelDelete = () => {
        setDeleteTargetId(null);
    };

    const handleSave = () => {
        if (!editingTeam) return;
        if (!editingTeam.name.trim()) {
            showStatus('チーム名を入力してください', 'error');
            return;
        }
        if (editingTeam.players.length < 5) {
            showStatus('最低5人の選手を登録してください', 'error');
            return;
        }

        // 背番号重複チェック
        const numbers = editingTeam.players.map(p => p.number);
        const uniqueNumbers = new Set(numbers);
        if (numbers.length !== uniqueNumbers.size) {
            showStatus('背番号が重複している選手がいます。修正してください。', 'error');
            return;
        }

        saveOpponent(editingTeam);
        refreshTeams();
        setEditingTeam(null);
        setIsCreating(false);
    };

    const handleCancel = () => {
        setEditingTeam(null);
        setIsCreating(false);
    };

    // 端末の戻る操作は編集フォームを閉じて一覧へ。ここを受け取らないと、
    // 画面ごとホームへ飛んで未保存の名簿が確認なく消える（useBackHandler）。
    // マイチーム管理と同じ作りなので、同じ扱いにそろえる
    useBackHandler(editingTeam !== null, handleCancel);

    const closeTextImport = () => {
        setShowTextImport(false);
        updateImportText('');
    };

    // 貼り付けパネルと取り込み確認も画面の中の一段。理由はマイチーム管理の同じ箇所
    useBackHandler(showTextImport, closeTextImport);
    useBackHandler(pendingImport !== null, handleCancelImport);

    const handleExportTeam = async (team: SavedTeam) => {
        const data = exportTeam(team);
        const filename = generateTeamFilename(team.name);

        // モバイルデバイスの場合はWeb Share APIを試す
        if ('share' in navigator && navigator.userAgent.match(/mobile/i)) {
            const shared = await shareFile(data, filename);
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

    const handleTeamNameChange = (name: string) => {
        if (!editingTeam) return;
        setEditingTeam({ ...editingTeam, name });
    };

    const handleCoachNameChange = (coachName: string) => {
        if (!editingTeam) return;
        setEditingTeam({ ...editingTeam, coachName });
    };

    const handleCoachLicenseNoChange = (coachLicenseNo: string) => {
        if (!editingTeam) return;
        setEditingTeam({ ...editingTeam, coachLicenseNo: coachLicenseNo.replace(/[^a-zA-Z0-9]/g, '') });
    };

    const handleAssistantCoachNameChange = (assistantCoachName: string) => {
        if (!editingTeam) return;
        setEditingTeam({ ...editingTeam, assistantCoachName });
    };

    const handleAssistantCoachLicenseNoChange = (assistantCoachLicenseNo: string) => {
        if (!editingTeam) return;
        setEditingTeam({ ...editingTeam, assistantCoachLicenseNo: assistantCoachLicenseNo.replace(/[^a-zA-Z0-9]/g, '') });
    };

    const [newNumber, setNewNumber] = useState('');
    const [newName, setNewName] = useState('');
    const [newLicenseNo, setNewLicenseNo] = useState('');

    // 選手編集用の状態
    const [editingPlayerIndex, setEditingPlayerIndex] = useState<number | null>(null);
    const [editNumber, setEditNumber] = useState('');
    const [editName, setEditName] = useState('');
    const [editLicenseNo, setEditLicenseNo] = useState('');

    // 番号グリッド選択モード
    const [showNumberGrid, setShowNumberGrid] = useState(false);

    // 番号をトグル（追加/削除）
    const handleToggleNumber = (num: number) => {
        if (!editingTeam) return;

        const existingIndex = editingTeam.players.findIndex(p => p.number === num);

        if (existingIndex >= 0) {
            // 既存なら削除。上限に達していても外す操作は常に通す（詰みにしない）
            const players = editingTeam.players.filter((_, i) => i !== existingIndex);
            setEditingTeam({ ...editingTeam, players });
        } else {
            if (isPlayerLimitReached(editingTeam.players.length)) {
                showStatus(playerLimitMessage(), 'error');
                return;
            }
            // 新規なら追加
            const displayNum = formatPlayerNumber(num);
            const newPlayer: SavedPlayer = {
                number: num,
                name: `選手${displayNum}`,
                isCaptain: false,
            };
            setEditingTeam({
                ...editingTeam,
                players: sortPlayersByNumber([...editingTeam.players, newPlayer]),
            });
        }
    };

    // 全選手クリア（確認モーダル経由）
    const [showClearPlayersConfirm, setShowClearPlayersConfirm] = useState(false);

    const handleClearAllPlayers = () => {
        if (!editingTeam) return;
        if (editingTeam.players.length === 0) return;
        setShowClearPlayersConfirm(true);
    };

    const confirmClearAllPlayers = () => {
        if (editingTeam) {
            setEditingTeam({ ...editingTeam, players: [] });
        }
        setShowClearPlayersConfirm(false);
    };

    const handleAddPlayer = () => {
        if (!editingTeam || !newNumber) return;  // 名前は任意

        if (isPlayerLimitReached(editingTeam.players.length)) {
            showStatus(playerLimitMessage(), 'error');
            return;
        }

        const number = parsePlayerNumber(newNumber);
        if (number === null || !isValidPlayerNumber(number)) {
            showStatus('背番号は0〜99または00を入力してください', 'error');
            return;
        }

        // 重複チェック
        const displayNum = formatPlayerNumber(number);
        if (editingTeam.players.some(p => p.number === number)) {
            showStatus(`背番号 ${displayNum} は既に登録されています`, 'error');
            return;
        }

        const newPlayer: SavedPlayer = {
            number: number,
            name: newName.trim() || `選手${displayNum}`,  // 名前が空の場合は「選手N」とする
            licenseNo: newLicenseNo.trim() || undefined,
            isCaptain: false,
        };

        setEditingTeam({
            ...editingTeam,
            players: sortPlayersByNumber([...editingTeam.players, newPlayer]),
        });

        setNewNumber('');
        setNewName('');
        setNewLicenseNo('');
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
        setEditNumber(formatPlayerNumber(player.number));
        setEditName(player.name);
        setEditLicenseNo(player.licenseNo || '');
    };

    // 選手編集保存
    const handleSaveEdit = () => {
        if (!editingTeam || editingPlayerIndex === null) return;
        const number = parsePlayerNumber(editNumber);
        if (number === null || !isValidPlayerNumber(number)) {
            showStatus('背番号は0〜99または00を入力してください', 'error');
            return;
        }
        // 他の選手と番号が重複していないか確認
        const displayNum = formatPlayerNumber(number);
        const isDuplicate = editingTeam.players.some((p, i) => i !== editingPlayerIndex && p.number === number);
        if (isDuplicate) {
            showStatus(`背番号 ${displayNum} は既に登録されています`, 'error');
            return;
        }
        // 対戦チームは名前任意なので空の場合は「選手N」とする
        const playerName = editName.trim() || `選手${displayNum}`;

        const players = sortPlayersByNumber(editingTeam.players.map((p, i) =>
            i === editingPlayerIndex
                ? { ...p, number, name: playerName, licenseNo: editLicenseNo.trim() || undefined }
                : p
        ));
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

                // 上限は手入力・番号グリッドと同じ規則で掛ける（isPlayerLimitReached）。
                // ここだけ素通りしていたため、写真1枚で16人以上の名簿ができ、
                // スコアシートに現れない選手が生まれていた（playerLimit.ts）
                let overflowCount = 0;

                for (const p of result.players) {
                    if (currentNumbers.has(p.number)) {
                        duplicateCount++;
                        continue;
                    }
                    if (isPlayerLimitReached(editingTeam.players.length + newPlayers.length)) {
                        overflowCount++;
                        continue;
                    }
                    newPlayers.push(p);
                    currentNumbers.add(p.number);
                }

                if (newPlayers.length > 0) {
                    setEditingTeam({
                        ...editingTeam,
                        players: [...editingTeam.players, ...newPlayers].sort((a, b) => a.number - b.number)
                    });

                    const engineName = result.usedEngine === 'Gemini' ? 'AI (Gemini)' : 'OCR';
                    const duplicateMsg = duplicateCount > 0 ? `（${duplicateCount}人はスキップ）` : '';

                    let message = `✓ ${engineName}で${newPlayers.length}人の選手を読み込みました。${duplicateMsg}`;
                    if (result.usedEngine === 'Tesseract' && result.fallbackReason) {
                        message += ` ※Gemini APIでの読み取りに失敗したため、標準OCRを使用しました。`;
                    }

                    showStatus(message, 'success');
                    // 上限で入らなかった分は、成功の通知に紛れないよう別に伝える
                    if (overflowCount > 0) {
                        setOcrError(`${overflowCount}人は追加できませんでした。${playerLimitMessage()}`);
                    }

                } else if (overflowCount > 0) {
                    setOcrError(`読み取った選手を追加できませんでした。${playerLimitMessage()}`);
                } else {
                    setOcrError('読み取った選手は全て登録済みか、有効なデータがありませんでした。');
                }
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

    // 編集画面
    if (editingTeam) {
        return (
            <main className="opponent-manager-container">
                <div className="opponent-manager-header">
                    <button className="btn btn-secondary" onClick={handleCancel}>
                        ← キャンセル
                    </button>
                    <h1>{isCreating ? '対戦チーム新規登録' : '対戦チーム編集'}</h1>
                </div>

                <div className="team-edit-form">
                    <div className="form-group">
                        <label htmlFor="opponent-mgr-field-1">チーム名 *</label>
                        <input id="opponent-mgr-field-1"
                            type="text"
                            value={editingTeam.name}
                            onChange={(e) => handleTeamNameChange(e.target.value)}
                            placeholder="チーム名を入力"
                            autoComplete="off"
                        />
                    </div>

                    <div className="form-group">
                        {/* 1行に氏名とライセンスNo.の2つが並ぶ。labelは氏名側に結び付け、
                            もう一方はaria-labelで区別する（同じ「コーチ」では読み分けられない） */}
                        <label htmlFor="opponent-coach-name">コーチ</label>
                        <div className="opponent-coach-row">
                            <input
                                id="opponent-coach-name"
                                type="text"
                                className="opponent-coach-name-input"
                                value={editingTeam.coachName}
                                onChange={(e) => handleCoachNameChange(e.target.value)}
                                placeholder="コーチ名（任意）"
                                autoComplete="off"
                            />
                            <input
                                type="text"
                                className="opponent-coach-license-input"
                                aria-label="コーチのライセンスNo."
                                value={editingTeam.coachLicenseNo || ''}
                                onChange={(e) => handleCoachLicenseNoChange(e.target.value)}
                                placeholder="ライセンスNo."
                                maxLength={10}
                                autoComplete="off"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="opponent-assistant-coach-name">Aコーチ</label>
                        <div className="opponent-coach-row">
                            <input
                                id="opponent-assistant-coach-name"
                                type="text"
                                className="opponent-coach-name-input"
                                value={editingTeam.assistantCoachName || ''}
                                onChange={(e) => handleAssistantCoachNameChange(e.target.value)}
                                placeholder="Aコーチ名（任意）"
                                autoComplete="off"
                            />
                            <input
                                type="text"
                                className="opponent-coach-license-input"
                                aria-label="AコーチのライセンスNo."
                                value={editingTeam.assistantCoachLicenseNo || ''}
                                onChange={(e) => handleAssistantCoachLicenseNoChange(e.target.value)}
                                placeholder="ライセンスNo."
                                maxLength={10}
                                autoComplete="off"
                            />
                        </div>
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
                                    className={`btn btn-small ${hasApiKey ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isLoading}
                                    title={hasApiKey ? "Gemini AIで高精度に読み取ります" : "標準OCRで読み取ります（ホーム画面の設定でAI有効化）"}
                                >
                                    {hasApiKey ? '✨ AI読込' : '📷 写真読込'}
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
                                {hasApiKey ? 'AIが画像を解析中...' : 'OCRで画像を解析中...'}
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
                                    {/* 0-99 と 00 の番号ボタン（00は99の後） */}
                                    {[...Array.from({ length: 100 }, (_, i) => i), DOUBLE_ZERO_INTERNAL].map((num) => {
                                        const isSelected = editingTeam.players.some(p => p.number === num);
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
                                className="player-number-input"
                                value={newNumber}
                                onChange={e => setNewNumber(e.target.value)}
                                aria-label="背番号"
                                placeholder="No."
                                maxLength={2}
                                autoComplete="off"
                            />
                            <input
                                type="text"
                                className="player-name-input"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                aria-label="選手名"
                                placeholder="氏名"
                                autoComplete="off"
                            />
                            <input
                                type="text"
                                className="opponent-player-license-input"
                                value={newLicenseNo}
                                onChange={e => setNewLicenseNo(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                                aria-label="選手のライセンスNo."
                                placeholder="ライセンスNo."
                                maxLength={10}
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
                                                type="text"
                                                inputMode="numeric"
                                                className="player-number-input"
                                                aria-label="背番号"
                                                value={editNumber}
                                                onChange={e => setEditNumber(e.target.value)}
                                                maxLength={2}
                                                autoFocus
                                                autoComplete="off"
                                            />
                                            <input
                                                type="text"
                                                className="player-name-input"
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                aria-label="選手名"
                                                placeholder="氏名"
                                                autoComplete="off"
                                            />
                                            <input
                                                type="text"
                                                className="opponent-player-license-input"
                                                value={editLicenseNo}
                                                onChange={e => setEditLicenseNo(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                                                aria-label="選手のライセンスNo."
                                                placeholder="ライセンスNo."
                                                maxLength={10}
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
                                                #{formatPlayerNumber(player.number)}
                                            </span>
                                            <span
                                                className="player-name clickable"
                                                onClick={() => handleStartEdit(index)}
                                            >
                                                {player.name}
                                            </span>
                                            <span
                                                className="opponent-player-license clickable"
                                                onClick={() => handleStartEdit(index)}
                                            >
                                                {player.licenseNo || ''}
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
            </main>
        );
    }

    // 一覧画面
    return (
        <main className="opponent-manager-container">
            <div className="opponent-manager-header">
                <button className="btn btn-secondary" onClick={onBack}>
                    ← ホームへ
                </button>
                <h1>対戦チーム管理</h1>
            </div>

            <div className="opponent-manager-content">
                <button className="btn btn-secondary" onClick={handleImportTeam}>
                    📥 チームインポート
                </button>
                <input
                    ref={jsonImportInputRef}
                    type="file"
                    accept=".json,.txt"
                    onChange={handleJsonImport}
                    style={{ display: 'none' }}
                />
                <button className="btn btn-secondary" onClick={() => setShowTextImport(true)}>
                    📝 データを貼り付け
                </button>
                <button className="btn btn-primary btn-large add-team-btn" onClick={handleCreateNew}>
                    + 新規チーム登録
                </button>
            </div>



            {showTextImport && (
                <TextImportPanel
                    importText={importText}
                    updateImportText={updateImportText}
                    textValidation={textValidation}
                    onSubmit={handleImportTextSubmit}
                    onCancel={closeTextImport}
                />
            )}

            {pendingImport && (
                // NOTE: MyTeamManager版のImportConfirmPanelと異なり、team種別でも
                // ボタン文言は常に「インポート実行」（マイチーム/対戦チームで文言を変えない）。
                // 元のOpponentManager実装の挙動を維持するためインラインのまま残す。
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
                    {pendingImport.type === 'game' && (
                        <p className="import-info">ℹ️ 試合データをインポートします。同じIDの試合がある場合は上書きされます。</p>
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
                    {pendingImport.type === 'team' && (
                        <>
                            <p className="import-info">📌 同じIDのチームが既にある場合、インポートしたデータで上書きされます。</p>
                            <div className="import-target-selector">
                                <label htmlFor="opponent-mgr-field-2">インポート先：</label>
                                <select id="opponent-mgr-field-2" value={importTarget} onChange={e => setImportTarget(e.target.value as 'myTeam' | 'opponent')}>
                                    <option value="myTeam">マイチーム</option>
                                    <option value="opponent">対戦チーム</option>
                                </select>
                            </div>
                        </>
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
                    <div className="import-confirm-actions">
                        <button className="btn btn-secondary" onClick={handleCancelImport}>キャンセル</button>
                        {pendingImport.type === 'backup' ? (
                            <button className="btn btn-danger" onClick={handleConfirmImport}>全データをインポート（上書き）</button>
                        ) : (
                            <button className="btn btn-primary" onClick={handleConfirmImport}>インポート実行</button>
                        )}
                    </div>
                </div>
            )}

            {teams.length === 0 ? (
                <div className="empty-state">
                    <p>登録された対戦チームはありません</p>
                </div>
            ) : (
                <div className="teams-list">
                    {teams.map(team => (
                        <div key={team.id} className="team-card">
                            <div className="team-card-info">
                                <h3 className="team-card-name">{team.name || '(未設定)'}</h3>
                                <p className="team-card-detail">
                                    {team.players.length}名 | コーチ: {team.coachName || '-'}
                                </p>
                                <p className="team-card-players">
                                    {team.players.slice(0, 5).map(p => `#${formatPlayerNumber(p.number)}`).join(', ')}
                                    {team.players.length > 5 && '...'}
                                </p>
                            </div>
                            <div className="team-card-actions">
                                <button className="btn btn-secondary btn-small" onClick={() => handleEdit(team)}>
                                    編集
                                </button>
                                <button className="btn btn-secondary btn-small" onClick={() => handleExportTeam(team)} title="このチームをエクスポート">
                                    📤 エクスポート
                                </button>
                                <button className="btn btn-danger btn-small" onClick={() => handleDelete(team.id)}>
                                    削除
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}


            {deleteTargetId && (
                <DeleteConfirmModal
                    title="チーム削除の確認"
                    message="このチームを削除してもよろしいですか？"
                    note="※この操作は取り消せません"
                    onConfirm={confirmDelete}
                    onCancel={cancelDelete}
                />
            )}

            {showClearPlayersConfirm && (
                <DeleteConfirmModal
                    title="選手の全クリア"
                    message="登録済みの選手を全てクリアしますか？"
                    onConfirm={confirmClearAllPlayers}
                    onCancel={() => setShowClearPlayersConfirm(false)}
                />
            )}
        </main>
    );
}
