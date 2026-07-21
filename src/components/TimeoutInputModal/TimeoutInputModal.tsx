import { useState, useMemo } from 'react';
import { Modal } from '../Modal';
import './TimeoutInputModal.css';

interface TimeoutInputModalProps {
    isOpen: boolean;
    teamName: string;
    teamColor: 'white' | 'blue';
    currentQuarter: number;
    quarterMinutes?: 5 | 6;  // クォーター時間（分）。未指定時6＝後方互換
    onConfirm: (elapsedMinutes: number) => void;
    onCancel: () => void;
}

export function TimeoutInputModal({
    isOpen,
    teamName,
    teamColor,
    currentQuarter,
    quarterMinutes = 6,
    onConfirm,
    onCancel,
}: TimeoutInputModalProps) {
    // OTは3分、通常Qは試合設定のクォーター時間
    const quarterDuration = currentQuarter > 4 ? 3 : quarterMinutes;

    // 残り時間の状態
    const [remainingMin, setRemainingMin] = useState(quarterDuration);
    const [remainingSec, setRemainingSec] = useState(0);

    // モーダルが開くたび（またはopen中にクォーター長が変わった際）に初期値をリセット
    // （レンダー中の状態調整。useEffectでのcascading render警告を避けるため）
    const [prevOpenState, setPrevOpenState] = useState({ isOpen: false, quarterDuration });
    if (isOpen && (isOpen !== prevOpenState.isOpen || quarterDuration !== prevOpenState.quarterDuration)) {
        setPrevOpenState({ isOpen, quarterDuration });
        setRemainingMin(quarterDuration);
        setRemainingSec(0);
    } else if (isOpen !== prevOpenState.isOpen) {
        setPrevOpenState({ isOpen, quarterDuration });
    }

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
        <Modal
            onClose={onCancel}
            overlayClassName="timeout-modal-overlay"
            contentClassName="timeout-modal-content"
            labelledBy="timeout-modal-title"
        >
                <div className="timeout-modal-header">
                    <span className="timeout-modal-title" id="timeout-modal-title">タイムアウト</span>
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
        </Modal>
    );
}
