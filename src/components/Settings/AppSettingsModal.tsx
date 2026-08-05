import React, { useState, useEffect, useRef } from 'react';
import { showToast } from '../Toast/toastApi';
import { getStoredApiKey, saveApiKey, testGeminiConnection } from '../../utils/imageOCR';
import { getDefaultGameMode, saveDefaultGameMode, type GameMode } from '../../utils/appSettings';
import {
    exportAllData,
    exportGameHistoryCSV,
    exportGameHistoryDetailCSV,
    downloadCSV,
    copyToClipboard,
    parseImportFile,
    parseImportJSON,
    executeImport,
    shareBackup,
} from '../../utils/dataBackup';
import type { ParsedImportData } from '../../utils/dataBackup';
import { loadLastBackup } from '../../utils/lastBackupStorage';
import { getErrorLog, clearErrorLog, formatErrorLog } from '../../utils/errorLog';
import type { ErrorLogEntry } from '../../utils/errorLog';
import { LegalModal } from '../Legal';
import type { LegalTab } from '../Legal';
import { Modal, ConfirmModal } from '../Modal';
import { SettingsSection } from './SettingsSection';
import './AppSettingsModal.css';

type SectionId = 'mode' | 'ai' | 'data' | 'help' | 'errors' | 'about';

interface AppSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AppSettingsModal: React.FC<AppSettingsModalProps> = ({ isOpen, onClose }) => {
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [testStatus, setTestStatus] = useState<{ loading: boolean; message: string; success?: boolean } | null>(null);
    const [defaultMode, setDefaultMode] = useState<GameMode>('full');

    const [pendingImport, setPendingImport] = useState<ParsedImportData | null>(null);
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
    const [importTarget, setImportTarget] = useState<'myTeam' | 'opponent'>('myTeam');
    const [showTextImport, setShowTextImport] = useState(false);
    const [importText, setImportText] = useState('');
    const [textValidation, setTextValidation] = useState<{ valid: boolean; message: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const importPanelRef = useRef<HTMLDivElement>(null);
    const textImportPanelRef = useRef<HTMLDivElement>(null);
    const [errorLog, setErrorLog] = useState<ErrorLogEntry[]>([]);
    const [showErrorDetail, setShowErrorDetail] = useState(false);
    const [legalTab, setLegalTab] = useState<LegalTab | null>(null);
    const [lastBackupText, setLastBackupText] = useState<string>('未バックアップ');
    // 開いているセクション（同時に1つだけ）。既定は全て閉じ、見出しの一覧から選ばせる
    const [openSection, setOpenSection] = useState<SectionId | null>(null);

    // セクションは同時に1つしか開かない。データ管理から離れると復元パネルも
    // 消えるため、読み込み待ちのデータを持ったままにすると「画面には何も無いのに
    // 閉じるときだけ破棄確認が出る」状態になる。離れる時点で破棄して知らせる。
    const toggleSection = (id: SectionId) => {
        const next = openSection === id ? null : id;
        if (next !== 'data' && (pendingImport || showTextImport)) {
            setPendingImport(null);
            setShowTextImport(false);
            setImportText('');
            if (pendingImport) showToast('読み込んだデータを破棄しました', 'success');
        }
        setOpenSection(next);
    };

    // isOpenがfalse→trueに変化した際にフォーム状態をリセットする
    // （レンダー中の状態調整。useEffectでのcascading render警告を避けるため）
    const [prevIsOpen, setPrevIsOpen] = useState(false);
    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
        if (isOpen) {
            setApiKey(getStoredApiKey());
            setTestStatus(null);
            setDefaultMode(getDefaultGameMode());
            setPendingImport(null);
            setImportTarget('myTeam');
            setShowTextImport(false);
            setImportText('');
            setErrorLog(getErrorLog());
            setShowErrorDetail(false);
            setOpenSection(null);
            const lb = loadLastBackup();
            setLastBackupText(lb ? new Date(lb.timestamp).toLocaleString('ja-JP') : '未バックアップ');
        }
    }

    // importTextが変化したらバリデーション表示を一旦クリアする（レンダー中の状態調整）
    // デバウンス済みの再検証はuseEffect側で行われる
    const [prevImportText, setPrevImportText] = useState(importText);
    if (importText !== prevImportText) {
        setPrevImportText(importText);
        setTextValidation(null);
    }

    // リアルタイムJSONバリデーション（500msデバウンス）
    useEffect(() => {
        if (!importText.trim()) {
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

    // 復元パネルが出たら必ず視界に入れる。
    // パネルが開いた位置がたまたま画面外だと「押しても何も起こらない」ように
    // 見えてしまう。
    //
    // block は 'start'。横向き(812x375)ではスクロール領域が200pxしかないのに
    // パネルは314pxあり、領域に収まりきらない。'center' だと下端の
    // インポート実行ボタンが、'nearest' だと上端の見出しが、それぞれ
    // 見切れていた（いずれも実測）。'start' なら必ず見出しから読み始められ、
    // 下へスクロールすればボタンに届く、という素直な順序になる。
    //
    // behavior: 'smooth' はパネル挿入直後のレイアウト変化でアニメーションが
    // 打ち消され、実測でスクロール位置が動かなかった。即時スクロールにする
    // （prefers-reduced-motion を尊重する方針とも一致する）。
    useEffect(() => {
        const panel = importPanelRef.current ?? textImportPanelRef.current;
        panel?.scrollIntoView({ block: 'start' });
    }, [pendingImport, showTextImport]);

    const showStatus = (text: string, type: 'success' | 'error') => {
        showToast(text, type);
    };

    // インポート確認中に閉じると、選んだファイルの内容が黙って捨てられる。
    // 破棄してよいか確認してから閉じる（Escape・オーバーレイクリックも含む）。
    // 確認はアプリ内のモーダルで出す。window.confirm は他の確認
    // （DeleteConfirmModal 等）と作法が違ううえ、PWAでは出方が端末任せになる
    const handleRequestClose = () => {
        if (pendingImport) {
            setShowDiscardConfirm(true);
            return;
        }
        onClose();
    };

    const handleSave = () => {
        saveApiKey(apiKey.trim());
        saveDefaultGameMode(defaultMode);
        showStatus('設定を保存しました', 'success');
    };

    const handleCopyErrorLog = async () => {
        try {
            await navigator.clipboard.writeText(formatErrorLog());
            showToast('エラーログをコピーしました', 'success');
        } catch {
            showToast('コピーに失敗しました', 'error');
        }
    };

    const handleClearErrorLog = () => {
        clearErrorLog();
        setErrorLog([]);
        showToast('エラーログを削除しました', 'success');
    };

    const handleClear = () => {
        setApiKey('');
        saveApiKey('');
        setTestStatus(null);
        showStatus('APIキーを削除しました。標準OCRに戻ります。', 'success');
    };

    const handleTestConnection = async () => {
        if (!apiKey.trim()) {
            showStatus('APIキーを入力してください', 'error');
            return;
        }

        setTestStatus({ loading: true, message: '接続テスト中...' });
        const result = await testGeminiConnection(apiKey.trim());
        setTestStatus({
            loading: false,
            message: result.message,
            success: result.success
        });
    };

    // データ管理ハンドラー
    const handleExportAll = async () => {
        const ok = await shareBackup();
        if (ok) {
            const lb = loadLastBackup();
            setLastBackupText(lb ? new Date(lb.timestamp).toLocaleString('ja-JP') : '未バックアップ');
            showStatus('✓ バックアップを保存しました', 'success');
        } else {
            showStatus('バックアップに失敗しました', 'error');
        }
    };

    const handleExportCSV = () => {
        try {
            const csv = exportGameHistoryCSV();
            const filename = `MBCscore_試合履歴_${new Date().toISOString().slice(0, 10)}.csv`;
            downloadCSV(csv, filename);
            showStatus('✓ CSV形式でダウンロードしました', 'success');
        } catch (error) {
            showStatus('CSVエクスポートに失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'), 'error');
        }
    };

    const handleExportDetailCSV = () => {
        try {
            const csv = exportGameHistoryDetailCSV();
            const filename = `MBCscore_選手スタッツ詳細_${new Date().toISOString().slice(0, 10)}.csv`;
            downloadCSV(csv, filename);
            showStatus('✓ 選手スタッツ詳細CSVをダウンロードしました', 'success');
        } catch (error) {
            showStatus('CSVエクスポートに失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'), 'error');
        }
    };

    const handleCopyBackup = async () => {
        try {
            const data = exportAllData();
            const success = await copyToClipboard(data);
            if (success) {
                showStatus('✓ クリップボードにコピーしました', 'success');
            } else {
                showStatus('クリップボードへのコピーに失敗しました', 'error');
            }
        } catch (error) {
            showStatus('コピーに失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'), 'error');
        }
    };

    const handleImportFile = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const parsed = await parseImportFile(file);
            if (parsed.type === 'unknown') {
                showStatus(`インポート失敗: ${parsed.summary}`, 'error');
            } else {
                setPendingImport(parsed);
            }
        } catch (error) {
            showStatus('インポートに失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'), 'error');
        }

        // inputをリセット（同じファイルを再度選択できるように）
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleImportTextSubmit = () => {
        if (!importText.trim()) return;

        const parsed = parseImportJSON(importText.trim());
        if (parsed.type === 'unknown') {
            showStatus(`インポート失敗: ${parsed.summary}`, 'error');
        } else {
            setPendingImport(parsed);
            setShowTextImport(false);
            setImportText('');
        }
    };

    const handleConfirmImport = () => {
        if (!pendingImport) return;

        const options = pendingImport.type === 'team' ? { teamTarget: importTarget } : undefined;
        const result = executeImport(pendingImport, options);
        if (result.success) {
            showStatus(`✓ ${result.message}`, 'success');
            setDefaultMode(getDefaultGameMode());
        } else {
            showStatus(`インポート失敗: ${result.message}`, 'error');
        }
        setPendingImport(null);
    };

    const handleCancelImport = () => {
        setPendingImport(null);
    };

    if (!isOpen) return null;

    const hasApiKey = !!apiKey.trim();

    return (
        <Modal
            onClose={handleRequestClose}
            overlayClassName="app-settings-overlay"
            contentClassName="app-settings-modal"
            labelledBy="app-settings-title"
        >
                <div className="settings-header">
                    <h2 id="app-settings-title">アプリ設定</h2>
                    <button className="close-btn" onClick={handleRequestClose} aria-label="閉じる">×</button>
                </div>

                <div className="settings-content">
                    {/* デフォルトゲームモード設定 */}
                    <SettingsSection id="mode" title="デフォルトゲームモード" isOpen={openSection === 'mode'} onToggle={() => toggleSection('mode')}>
                        <p className="section-description">
                            試合開始時に使用するモードを選択します。スマホではシンプルモード、タブレットではフルモードがおすすめです。
                        </p>
                        <div className="mode-selector">
                            <button
                                className={`mode-btn ${defaultMode === 'full' ? 'active' : ''}`}
                                onClick={() => setDefaultMode('full')}
                            >
                                <span className="mode-icon">💻</span>
                                <span className="mode-label">フルモード</span>
                                <span className="mode-desc">全機能表示（タブレット向け）</span>
                            </button>
                            <button
                                className={`mode-btn ${defaultMode === 'simple' ? 'active' : ''}`}
                                onClick={() => setDefaultMode('simple')}
                            >
                                <span className="mode-icon">📱</span>
                                <span className="mode-label">シンプルモード</span>
                                <span className="mode-desc">コンパクト表示（スマホ向け）</span>
                            </button>
                        </div>
                    </SettingsSection>

                    {/* AI設定セクション */}
                    <SettingsSection id="ai" title="AI機能 (Google Gemini API)" hint={hasApiKey ? 'AI有効' : '標準モード'} isOpen={openSection === 'ai'} onToggle={() => toggleSection('ai')}>
                        <p className="section-description">
                            Gemini APIキーを設定すると、写真読み込みの精度が向上します。
                        </p>
                        <p className="security-notice">
                            🔒 APIキーはこのデバイス内にのみ保存されます。OCR実行時にGoogleのAPIへ送信されますが、当アプリの運営者や第三者のサーバーには送信されません。
                        </p>

                        <div className="api-status">
                            <span className={`status-badge ${hasApiKey ? 'active' : 'inactive'}`}>
                                {hasApiKey ? '✓ AI有効' : '○ 標準モード'}
                            </span>
                        </div>

                        <div className="input-group">
                            <label>Gemini API Key</label>
                            <div className="password-wrapper">
                                <input
                                    type={showKey ? "text" : "password"}
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="AIza..."
                                />
                                <button
                                    type="button"
                                    className="toggle-visibility"
                                    onClick={() => setShowKey(!showKey)}
                                >
                                    {showKey ? '隠す' : '表示'}
                                </button>
                            </div>

                            <div className="test-connection-section">
                                <button
                                    className="btn btn-secondary btn-small"
                                    onClick={handleTestConnection}
                                    disabled={testStatus?.loading || !apiKey}
                                >
                                    {testStatus?.loading ? 'テスト中...' : '接続テスト'}
                                </button>
                                {testStatus && (
                                    <span className={`test-status ${testStatus.success ? 'success' : 'error'}`}>
                                        {testStatus.message}
                                    </span>
                                )}
                            </div>

                            <a
                                href="https://aistudio.google.com/app/apikey"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="help-link"
                            >
                                APIキーの取得はこちら (Google AI Studio)
                            </a>
                        </div>

                        {hasApiKey && (
                            <button className="btn btn-danger btn-small" onClick={handleClear}>
                                APIキーを削除
                            </button>
                        )}
                    </SettingsSection>

                    {/* 将来の拡張用セクション */}
                    {/*
                    <section className="settings-section">
                        <h3>音声認識</h3>
                        <p className="section-description">音声での記録入力機能の設定</p>
                    </section>
                    */}

                    {/* データ管理セクション */}
                    <SettingsSection id="data" title="📊 データ管理" hint={`最終: ${lastBackupText}`} isOpen={openSection === 'data'} onToggle={() => toggleSection('data')}>
                        <p className="section-description">
                            試合履歴・チーム情報などをバックアップ・復元できます。
                        </p>

                        <div className="data-management-buttons">
                            <div className="data-section-card">
                                <h4 className="subsection-title">📤 バックアップ</h4>
                                <p className="section-description last-backup-label">
                                    最終バックアップ: {lastBackupText}
                                </p>
                                <button
                                    className="btn btn-primary btn-block"
                                    onClick={handleExportAll}
                                    aria-label="今すぐクラウド/ファイルに保存"
                                >
                                    💾 今すぐクラウド/ファイルに保存
                                </button>
                                <button
                                    className="btn btn-secondary btn-block"
                                    onClick={handleExportCSV}
                                    aria-label="試合履歴（サマリー）CSVをエクスポート"
                                >
                                    📊 試合履歴（サマリー）CSV
                                    <span className="btn-description">
                                        ✓ 試合ごとの結果・得点・勝敗<br />
                                        ✗ 選手の個別スタッツは含みません
                                    </span>
                                    <span className="excel-badge">Excelで開けます</span>
                                </button>
                                <button
                                    className="btn btn-secondary btn-block"
                                    onClick={handleExportDetailCSV}
                                    aria-label="選手スタッツ詳細CSVをエクスポート"
                                >
                                    📈 選手スタッツ詳細CSV
                                    <span className="btn-description">
                                        ✓ 全選手の詳細スタッツ（2P/3P/FT/リバウンド等）<br />
                                        ⚠ ファイルサイズが大きくなる場合があります
                                    </span>
                                    <span className="excel-badge">Excelで開けます</span>
                                </button>
                                <button
                                    className="btn btn-secondary btn-block"
                                    onClick={handleCopyBackup}
                                    aria-label="クリップボードにコピー"
                                >
                                    📋 クリップボードにコピー
                                    <span className="btn-description">他のデバイスに貼り付けて復元できます</span>
                                </button>
                            </div>

                            <div className="data-section-card">
                                <h4 className="subsection-title">📥 復元</h4>
                                <button
                                    className="btn btn-primary btn-block"
                                    onClick={handleImportFile}
                                    aria-label="ファイルから復元"
                                >
                                    📂 ファイルから復元
                                </button>
                                <button
                                    className="btn btn-secondary btn-block"
                                    onClick={() => setShowTextImport(true)}
                                    aria-label="データを貼り付けて復元"
                                >
                                    📝 データを貼り付けて復元
                                </button>

                                {/*
                                  確認パネル・貼り付けパネルは必ず「復元」ボタンの直後に置く。
                                  以前は データ管理セクションの先頭（復元ボタンの約440px上）にあり、
                                  スマホ幅ではパネルが画面外の上に挿入されていた。挿入分は
                                  スクロールアンカリングが吸収するためボタンも動かず、
                                  「押しても何も起こらない」ように見えていた。
                                */}
                                {showTextImport && (
                                    <div className="text-import-panel" ref={textImportPanelRef}>
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
                                    <div
                                        className={`import-confirm-panel ${pendingImport.hasDuplicates ? 'has-duplicates' : ''}`}
                                        ref={importPanelRef}
                                    >
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
                                        {pendingImport.type === 'backup' && (
                                            <>
                                                <div className="import-danger-warning">
                                                    <p className="import-warning-title">⚠️ 重要な警告</p>
                                                    <p className="import-warning-text">
                                                        これは全データバックアップファイルです。<br />
                                                        インポートすると、<strong>試合履歴・マイチーム・対戦チーム・設定</strong>が上書きされます。
                                                    </p>
                                                </div>
                                                <div className="import-merge-info">
                                                    <p className="import-info">
                                                        📌 復元ルール:<br />
                                                        • 同じデータがあれば新しい方に更新されます<br />
                                                        • 新しいデータは追加されます<br />
                                                        • 既存データが削除されることはありません
                                                    </p>
                                                </div>
                                            </>
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
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json,.txt"
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                            />
                        </div>

                        <div className="backup-notice">
                            <p>⚠️ <strong>重要な注意事項</strong></p>
                            <ul>
                                <li>ブラウザの「サイトデータ削除」を行うと全データが消えます</li>
                                <li>定期的にバックアップを取ることを推奨します</li>
                                <li>復元時は既存データとマージされます（重複は上書き）</li>
                                <li>バックアップには選手名などの個人情報が含まれます</li>
                            </ul>
                        </div>
                    </SettingsSection>

                    {/* ヘルプセクション */}
                    <SettingsSection id="help" title="ヘルプ" isOpen={openSection === 'help'} onToggle={() => toggleSection('help')}>
                        <a
                            href="https://github.com/boningori/MBCscore_pr#readme"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="help-link help-link-large"
                        >
                            📖 使い方を見る (README)
                        </a>
                        <p className="section-description">
                            フリック入力や保留処理など、アプリの詳しい使い方を確認できます。
                        </p>
                        <div className="contact-info">
                            <p className="contact-item">
                                📧 ご質問・ご要望：<a href="mailto:mbcscore@gmail.com">mbcscore@gmail.com</a>
                            </p>
                            <p className="contact-item">
                                💻 ソースコード：<a
                                    href="https://github.com/boningori/MBCscore_pr"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >GitHub</a>
                            </p>
                        </div>
                    </SettingsSection>

                    {/* エラーログセクション */}
                    <SettingsSection id="errors" title="エラーログ" hint={`${errorLog.length}件`} isOpen={openSection === 'errors'} onToggle={() => toggleSection('errors')}>
                        <p className="section-description">
                            アプリ内で発生したエラーの記録です（端末内にのみ保存。外部送信はされません）。
                            不具合報告の際は「コピー」した内容を mbcscore@gmail.com にお送りください。
                        </p>
                        <p className="section-description">記録件数: {errorLog.length}件</p>
                        {errorLog.length > 0 && (
                            <>
                                <div className="backup-buttons">
                                    <button className="btn btn-secondary" onClick={() => setShowErrorDetail(!showErrorDetail)}>
                                        {showErrorDetail ? '内容を隠す' : '内容を表示'}
                                    </button>
                                    <button className="btn btn-secondary" onClick={handleCopyErrorLog}>
                                        📋 コピー
                                    </button>
                                    <button className="btn btn-secondary" onClick={handleClearErrorLog}>
                                        🗑 削除
                                    </button>
                                </div>
                                {showErrorDetail && (
                                    <pre className="error-log-detail">
                                        {errorLog.slice(0, 10).map(e =>
                                            `[${new Date(e.timestamp).toLocaleString('ja-JP')}] (${e.source}) ${e.message}`
                                        ).join('\n')}
                                    </pre>
                                )}
                            </>
                        )}
                    </SettingsSection>

                    {/* アプリについてセクション */}
                    <SettingsSection id="about" title="アプリについて" hint={`v${__APP_VERSION__}`} isOpen={openSection === 'about'} onToggle={() => toggleSection('about')}>
                        <p className="section-description">MBCscore バージョン {__APP_VERSION__}</p>
                        <div className="backup-buttons">
                            <button className="btn btn-secondary" onClick={() => setLegalTab('terms')}>
                                📜 利用規約
                            </button>
                            <button className="btn btn-secondary" onClick={() => setLegalTab('privacy')}>
                                🔒 プライバシーポリシー
                            </button>
                            <button className="btn btn-secondary" onClick={() => setLegalTab('licenses')}>
                                📦 OSSライセンス
                            </button>
                        </div>
                        <p className="section-description">
                            ※本アプリはJBA公式スコアシートに準拠したレイアウトを提供しますが、JBA公認製品ではありません。
                        </p>
                    </SettingsSection>
                </div>

                {/*
                  「保存」はAPIキーと既定ゲームモードだけを保存する。
                  復元の確定ボタンと誤読されないよう対象を名前に含め、
                  スクロールしなくても押せるよう画面下部に固定する（CSSのsticky）。
                */}
                <div className="settings-footer">
                    <button className="btn btn-secondary" onClick={handleRequestClose}>キャンセル</button>
                    <button className="btn btn-primary" onClick={handleSave}>設定を保存</button>
                </div>

                <LegalModal
                    isOpen={legalTab !== null}
                    initialTab={legalTab ?? 'terms'}
                    onClose={() => setLegalTab(null)}
                />

                {showDiscardConfirm && (
                    <ConfirmModal
                        title="確認"
                        message="読み込んだデータはまだ復元されていません。破棄して閉じますか？"
                        confirmLabel="破棄して閉じる"
                        cancelLabel="編集に戻る"
                        onConfirm={() => { setShowDiscardConfirm(false); onClose(); }}
                        onCancel={() => setShowDiscardConfirm(false)}
                    />
                )}
        </Modal>
    );
};
