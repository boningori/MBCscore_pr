import React, { useState, useEffect } from 'react';
import { getStoredApiKey, saveApiKey, testGeminiConnection } from '../../utils/imageOCR';
import './AppSettingsModal.css';

interface AppSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AppSettingsModal: React.FC<AppSettingsModalProps> = ({ isOpen, onClose }) => {
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [testStatus, setTestStatus] = useState<{ loading: boolean; message: string; success?: boolean } | null>(null);

    useEffect(() => {
        if (isOpen) {
            setApiKey(getStoredApiKey());
            setTestStatus(null);
        }
    }, [isOpen]);

    const handleSave = () => {
        saveApiKey(apiKey.trim());
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
                    {/* AI設定セクション */}
                    <section className="settings-section">
                        <h3>AI機能 (Google Gemini API)</h3>
                        <p className="section-description">
                            Gemini APIキーを設定すると、写真読み込みの精度が向上します。
                            将来的に音声認識などの機能も利用できるようになります。
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
                </div>

                <div className="settings-footer">
                    <button className="btn btn-secondary" onClick={onClose}>キャンセル</button>
                    <button className="btn btn-primary" onClick={handleSave}>保存</button>
                </div>
            </div>
        </div>
    );
};
