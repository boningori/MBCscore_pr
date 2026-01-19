import React, { useState, useEffect } from 'react';
import { getStoredApiKey, saveApiKey } from '../../utils/imageOCR';
import './OCRSettingsModal.css';

interface OCRSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const OCRSettingsModal: React.FC<OCRSettingsModalProps> = ({ isOpen, onClose }) => {
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setApiKey(getStoredApiKey());
        }
    }, [isOpen]);

    const handleSave = () => {
        saveApiKey(apiKey.trim());
        onClose();
        alert('APIキーを保存しました。次回からGeminiによる高精度OCRが有効になります。');
    };

    const handleClear = () => {
        setApiKey('');
        saveApiKey('');
        onClose();
        alert('APIキーを削除しました。Tesseract (標準OCR) に戻ります。');
    };

    if (!isOpen) return null;

    return (
        <div className="ocr-settings-overlay">
            <div className="ocr-settings-modal">
                <h3>OCR設定 (Google Gemini API)</h3>

                <p className="description">
                    Google AI StudioのAPIキーを設定すると、手書き文字や複雑なレイアウトの認識精度が大幅に向上します。
                </p>

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
                    <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="help-link"
                    >
                        APIキーの取得はこちら (Google AI Studio)
                    </a>
                </div>

                <div className="modal-actions">
                    <button className="cancel-btn" onClick={onClose}>キャンセル</button>
                    <button className="clear-btn" onClick={handleClear}>削除して戻す</button>
                    <button className="save-btn" onClick={handleSave}>保存して有効化</button>
                </div>
            </div>
        </div>
    );
};
