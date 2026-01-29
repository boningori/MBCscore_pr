import { useState, useEffect, useMemo } from 'react';
import './TimeoutInputModal.css';

interface TimeoutInputModalProps {
    isOpen: boolean;
    teamName: string;
    teamColor: 'white' | 'blue';
    currentQuarter: number;
    onConfirm: (elapsedMinutes: number) => void;
    onCancel: () => void;
}

export function TimeoutInputModal({
    isOpen,
    teamName,
    teamColor,
    currentQuarter,
    onConfirm,
    onCancel,
}: TimeoutInputModalProps) {
    // OTは3分、通常Qは6分
    const quarterDuration = currentQuarter > 4 ? 3 : 6;

    // 残り時間の状態
    const [remainingMin, setRemainingMin] = useState(quarterDuration);
    const [remainingSec, setRemainingSec] = useState(0);

    // モーダルが開くたびに初期値をリセット
    useEffect(() => {
        if (isOpen) {
            setRemainingMin(quarterDuration);
            setRemainingSec(0);
        }
    }, [isOpen, quarterDuration]);

    // 経過時間を計算（分単位・切り上げ）
    const elapsedMinutes = useMemo(() => {
        const remainingSeconds = remainingMin * 60 + remainingSec;
        const elapsedSeconds = quarterDuration * 60 - remainingSeconds;
        // 0秒の場合は0、それ以外は切り上げ
        return elapsedSeconds <= 0 ? 0 : Math.ceil(elapsedSeconds / 60);
    }, [remainingMin, remainingSec, quarterDuration]);

    // クォーター表示
    const quarterLabel = currentQuarter > 4
        ? `OT${currentQuarter - 4}`
        : `${currentQuarter}Q`;

    const handleConfirm = () => {
        onConfirm(elapsedMinutes);
    };

    if (!isOpen) return null;

    return (
        <div className="timeout-modal-overlay" onClick={onCancel}>
            <div className="timeout-modal-content" onClick={e => e.stopPropagation()}>
                <div className="timeout-modal-header">
                    <span className="timeout-modal-title">タイムアウト</span>
                    <span className={`timeout-modal-team ${teamColor}`}>
                        {teamName}（{teamColor === 'white' ? '白' : '青'}）
                    </span>
                    <span className="timeout-modal-quarter">{quarterLabel}</span>
                </div>

                <div className="timeout-modal-body">
                    <div className="timeout-input-section">
                        <label className="timeout-input-label">残り時間</label>
                        <div className="timeout-time-inputs">
                            <select
                                value={remainingMin}
                                onChange={e => setRemainingMin(Number(e.target.value))}
                                className="timeout-select"
                            >
                                {Array.from({ length: quarterDuration + 1 }, (_, i) => (
                                    <option key={i} value={i}>{i}</option>
                                ))}
                            </select>
                            <span className="timeout-time-separator">分</span>
                            <select
                                value={remainingSec}
                                onChange={e => setRemainingSec(Number(e.target.value))}
                                className="timeout-select"
                            >
                                {Array.from({ length: 60 }, (_, i) => (
                                    <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                                ))}
                            </select>
                            <span className="timeout-time-separator">秒</span>
                        </div>
                    </div>

                    <div className="timeout-result-section">
                        <span className="timeout-result-arrow">→</span>
                        <span className="timeout-result-label">経過時間（記録）:</span>
                        <span className="timeout-result-value">{elapsedMinutes}</span>
                    </div>
                </div>

                <div className="timeout-modal-actions">
                    <button className="timeout-btn timeout-btn-cancel" onClick={onCancel}>
                        キャンセル
                    </button>
                    <button className="timeout-btn timeout-btn-confirm" onClick={handleConfirm}>
                        確定
                    </button>
                </div>
            </div>
        </div>
    );
}
