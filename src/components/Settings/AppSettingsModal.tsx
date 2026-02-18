import React, { useState, useEffect, useRef } from 'react';
import { getStoredApiKey, saveApiKey, testGeminiConnection } from '../../utils/imageOCR';
import { getDefaultGameMode, saveDefaultGameMode, type GameMode } from '../../utils/appSettings';
import {
    exportAllData,
    exportGameHistoryCSV,
    downloadJSON,
    downloadCSV,
    shareFile,
    copyToClipboard,
    importFromFile,
    importFromJSON,
    generateBackupFilename,
} from '../../utils/dataBackup';
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
    const [importStatus, setImportStatus] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setApiKey(getStoredApiKey());
            setTestStatus(null);
            setDefaultMode(getDefaultGameMode());
        }
    }, [isOpen]);

    const handleSave = () => {
        saveApiKey(apiKey.trim());
        saveDefaultGameMode(defaultMode);
        onClose();
        alert('設定を保存しました。');
    };

    const handleClear = () => {
        setApiKey('');
        saveApiKey('');
        setTestStatus(null);
        alert('APIキーを削除しました。標準OCRに戻ります。');
    };

    const handleTestConnection = async () => {
        if (!apiKey.trim()) {
            alert('APIキーを入力してください');
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
            if (navigator.share && navigator.userAgent.match(/mobile/i)) {
                const shared = await shareFile(data, filename, 'MBCscore 全データバックアップ');
                if (shared) {
                    setImportStatus('✓ データを共有しました');
                    setTimeout(() => setImportStatus(''), 3000);
                    return;
                }
            }

            // ダウンロード
            downloadJSON(data, filename);
            setImportStatus('✓ バックアップファイルをダウンロードしました');
            setTimeout(() => setImportStatus(''), 3000);
        } catch (error) {
            alert('エクスポートに失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'));
        }
    };

    const handleExportCSV = () => {
        try {
            const csv = exportGameHistoryCSV();
            const filename = `MBCscore_試合履歴_${new Date().toISOString().slice(0, 10)}.csv`;
            downloadCSV(csv, filename);
            setImportStatus('✓ CSV形式でダウンロードしました');
            setTimeout(() => setImportStatus(''), 3000);
        } catch (error) {
            alert('CSVエクスポートに失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'));
        }
    };

    const handleCopyBackup = async () => {
        try {
            const data = exportAllData();
            const success = await copyToClipboard(data);
            if (success) {
                setImportStatus('✓ クリップボードにコピーしました');
                setTimeout(() => setImportStatus(''), 3000);
            } else {
                alert('クリップボードへのコピーに失敗しました');
            }
        } catch (error) {
            alert('コピーに失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'));
        }
    };

    const handleImportFile = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const result = await importFromFile(file);
            if (result.success) {
                setImportStatus(`✓ ${result.message}`);
                setTimeout(() => setImportStatus(''), 5000);
                // データが変更されたので、設定を再読み込み
                setDefaultMode(getDefaultGameMode());
            } else {
                alert(`インポート失敗: ${result.message}\n${result.errors?.join('\n') || ''}`);
            }
        } catch (error) {
            alert('インポートに失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'));
        }

        // inputをリセット（同じファイルを再度選択できるように）
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleImportText = () => {
        const text = prompt('JSONデータを貼り付けてください:');
        if (!text) return;

        try {
            const result = importFromJSON(text);
            if (result.success) {
                setImportStatus(`✓ ${result.message}`);
                setTimeout(() => setImportStatus(''), 5000);
                // データが変更されたので、設定を再読み込み
                setDefaultMode(getDefaultGameMode());
            } else {
                alert(`インポート失敗: ${result.message}\n${result.errors?.join('\n') || ''}`);
            }
        } catch (error) {
            alert('インポートに失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'));
        }
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

                        {importStatus && (
                            <div className="import-status-message">
                                {importStatus}
                            </div>
                        )}

                        <div className="data-management-buttons">
                            <h4 className="subsection-title">バックアップ</h4>
                            <button
                                className="btn btn-primary btn-block"
                                onClick={handleExportAll}
                            >
                                💾 全データをエクスポート
                            </button>
                            <button
                                className="btn btn-secondary btn-block"
                                onClick={handleExportCSV}
                            >
                                📊 試合履歴をCSVでエクスポート
                            </button>
                            <button
                                className="btn btn-secondary btn-block"
                                onClick={handleCopyBackup}
                            >
                                📋 クリップボードにコピー
                            </button>

                            <h4 className="subsection-title">復元</h4>
                            <button
                                className="btn btn-primary btn-block"
                                onClick={handleImportFile}
                            >
                                📂 ファイルから復元
                            </button>
                            <button
                                className="btn btn-secondary btn-block"
                                onClick={handleImportText}
                            >
                                📝 データを貼り付けて復元
                            </button>

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
