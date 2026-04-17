import React, { useState, useEffect, useRef } from 'react';
import { showToast } from '../Toast/Toast';
import { getStoredApiKey, saveApiKey, testGeminiConnection } from '../../utils/imageOCR';
import { getDefaultGameMode, saveDefaultGameMode, type GameMode } from '../../utils/appSettings';
import {
    exportAllData,
    exportGameHistoryCSV,
    exportGameHistoryDetailCSV,
    downloadJSON,
    downloadCSV,
    shareFile,
    copyToClipboard,
    parseImportFile,
    parseImportJSON,
    executeImport,
    generateBackupFilename,
} from '../../utils/dataBackup';
import type { ParsedImportData } from '../../utils/dataBackup';
import './AppSettingsModal.css';

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
    const [importTarget, setImportTarget] = useState<'myTeam' | 'opponent'>('myTeam');
    const [showTextImport, setShowTextImport] = useState(false);
    const [importText, setImportText] = useState('');
    const [textValidation, setTextValidation] = useState<{ valid: boolean; message: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setApiKey(getStoredApiKey());
            setTestStatus(null);
            setDefaultMode(getDefaultGameMode());
            setPendingImport(null);
            setImportTarget('myTeam');
            setShowTextImport(false);
            setImportText('');
        }
    }, [isOpen]);

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

    const showStatus = (text: string, type: 'success' | 'error') => {
        showToast(text, type);
    };

    const handleSave = () => {
        saveApiKey(apiKey.trim());
        saveDefaultGameMode(defaultMode);
        showStatus('設定を保存しました', 'success');
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
        try {
            const data = exportAllData();
            const filename = generateBackupFilename();

            // モバイルデバイスの場合はWeb Share APIを試す
            if ('share' in navigator && navigator.userAgent.match(/mobile/i)) {
                const shared = await shareFile(data, filename, 'MBCscore 全データバックアップ');
                if (shared) {
                    showStatus('✓ データを共有しました', 'success');
                    return;
                }
            }

            // ダウンロード
            downloadJSON(data, filename);
            showStatus('✓ バックアップファイルをダウンロードしました', 'success');
        } catch (error) {
            showStatus('エクスポートに失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'), 'error');
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
        <div className="app-settings-overlay" onClick={onClose}>
            <div className="app-settings-modal" onClick={e => e.stopPropagation()}>
                <div className="settings-header">
                    <h2>アプリ設定</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="settings-content">
                    {/* デフォルトゲームモード設定 */}
                    <section className="settings-section">
                        <h3>デフォルトゲームモード</h3>
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
                    </section>

                    {/* AI設定セクション */}
                    <section className="settings-section">
                        <h3>AI機能 (Google Gemini API)</h3>
                        <p className="section-description">
                            Gemini APIキーを設定すると、写真読み込みの精度が向上します。
                        </p>
                        <p className="security-notice">
                            🔒 APIキーはこのデバイスのみに保存され、外部サーバーには送信されません。
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
                    </section>

                    {/* 将来の拡張用セクション */}
                    {/*
                    <section className="settings-section">
                        <h3>音声認識</h3>
                        <p className="section-description">音声での記録入力機能の設定</p>
                    </section>
                    */}

                    {/* データ管理セクション */}
                    <section className="settings-section">
                        <h3>📊 データ管理</h3>
                        <p className="section-description">
                            試合履歴・チーム情報などをバックアップ・復元できます。
                        </p>



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

                        <div className="data-management-buttons">
                            <div className="data-section-card">
                                <h4 className="subsection-title">📤 バックアップ</h4>
                                <button
                                    className="btn btn-primary btn-block"
                                    onClick={handleExportAll}
                                    aria-label="全データをJSONファイルとしてエクスポート"
                                >
                                    💾 全データをエクスポート
                                </button>
                                <button
                                    className="btn btn-secondary btn-block"
                                    onClick={handleExportCSV}
                                    aria-label="試合履歴サマリーをCSVでエクスポート"
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
                                    aria-label="選手スタッツ詳細をCSVでエクスポート"
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
                                    aria-label="全データをクリップボードにコピー"
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
                                    aria-label="JSONファイルからデータを復元"
                                >
                                    📂 ファイルから復元
                                </button>
                                <button
                                    className="btn btn-secondary btn-block"
                                    onClick={() => setShowTextImport(true)}
                                    aria-label="JSONデータを貼り付けて復元"
                                >
                                    📝 データを貼り付けて復元
                                </button>
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json"
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
                    </section>

                    {/* ヘルプセクション */}
                    <section className="settings-section">
                        <h3>ヘルプ</h3>
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
                    </section>
                </div>

                <div className="settings-footer">
                    <button className="btn btn-secondary" onClick={onClose}>キャンセル</button>
                    <button className="btn btn-primary" onClick={handleSave}>保存</button>
                </div>
            </div>
        </div>
    );
};
