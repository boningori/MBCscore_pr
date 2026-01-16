import { useState, useEffect } from 'react';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import type { VoiceCommand } from '../../utils/voiceCommands';
import './VoiceInput.css';

interface VoiceInputProps {
    onCommand: (command: VoiceCommand) => void;
}

export function VoiceInput({ onCommand }: VoiceInputProps) {
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const {
        isListening,
        isSupported,
        transcript,
        lastCommand,
        error,
        toggleListening,
    } = useVoiceInput({
        onCommand,
        continuous: true,
        language: 'ja-JP',
    });

    // オフライン時の表示
    if (!isOnline) {
        return (
            <div className="voice-input-offline">
                <span className="voice-icon disabled">🎤</span>
                <span className="offline-label">オフラインです</span>
            </div>
        );
    }

    if (!isSupported) {
        return (
            <div className="voice-input-unsupported">
                <span className="voice-icon">🎤</span>
                <span>音声入力未対応</span>
            </div>
        );
    }

    return (
        <div className="voice-input-container">
            <button
                className={`voice-toggle-btn ${isListening ? 'listening' : ''}`}
                onClick={toggleListening}
            >
                <span className="voice-icon">{isListening ? '🔴' : '🎤'}</span>
                <span className="voice-status">
                    {isListening ? '認識中...' : '音声入力'}
                </span>
            </button>

            {isListening && (
                <div className="voice-feedback">
                    {transcript && (
                        <div className="voice-transcript">
                            "{transcript}"
                        </div>
                    )}
                    {lastCommand && lastCommand.type !== 'unknown' && (
                        <div className="voice-command-feedback">
                            ✓ {formatCommand(lastCommand)}
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="voice-error">
                    {error === 'not-allowed' ? 'マイクの使用を許可してください' : error}
                </div>
            )}
        </div>
    );
}

function formatCommand(command: VoiceCommand): string {
    if (!command.playerNumber && !command.action) {
        return command.type === 'timeout' ? 'タイムアウト' : 'クォーター終了';
    }

    const actionLabels: Record<string, string> = {
        '2P': '2点',
        '3P': '3点',
        'FT': 'フリースロー',
        'OREB': 'オフェンスリバウンド',
        'DREB': 'ディフェンスリバウンド',
        'AST': 'アシスト',
        'STL': 'スティール',
        'BLK': 'ブロック',
        'TO': 'ターンオーバー',
        'P': 'ファウル',
        'T': 'テクニカル',
    };

    const action = command.action ? actionLabels[command.action] || command.action : '';
    return `#${command.playerNumber} ${action}`;
}
