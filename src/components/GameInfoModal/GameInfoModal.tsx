import { useState } from 'react';
import type { GameInfo } from '../../types/game';
import { Modal } from '../Modal';
import './GameInfoModal.css';

interface GameInfoModalProps {
    gameInfo: GameInfo;
    endTime: Date | null;
    onSave: (gameInfo: Partial<GameInfo>) => void;
    onEndTimeChange?: (endTime: Date | null) => void;
    onClose: () => void;
}

function formatEndTimeStr(endTime: Date | null): string {
    if (!endTime) return '';
    const d = new Date(endTime);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function GameInfoModal({ gameInfo, endTime, onSave, onEndTimeChange, onClose }: GameInfoModalProps) {
    // 本モーダルはopenのたびに条件付きマウントされるため、マウント時の遅延初期化で初回同期を行う
    const [formData, setFormData] = useState<GameInfo>(() => ({ ...gameInfo }));
    const [endTimeStr, setEndTimeStr] = useState(() => formatEndTimeStr(endTime));

    const handleChange = (field: keyof GameInfo, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        onSave(formData);
        if (onEndTimeChange && endTimeStr) {
            const [hours, minutes] = endTimeStr.split(':').map(Number);
            const base = endTime ? new Date(endTime) : new Date();
            base.setHours(hours, minutes, 0, 0);
            onEndTimeChange(base);
        }
        onClose();
    };

    return (
        <Modal
            onClose={onClose}
            overlayClassName="game-info-modal-overlay"
            contentClassName="game-info-modal"
            labelledBy="game-info-modal-title"
        >
                <h3 id="game-info-modal-title">試合情報</h3>

                <div className="game-info-form">
                    <div className="form-section">
                        <h4>試合基本情報</h4>
                        <div className="form-row">
                            <div className="form-group">
                                <label>
                                    <span className="form-label-text">会場</span>
                                    <input
                                        type="text"
                                        value={formData.venue}
                                        onChange={e => handleChange('venue', e.target.value)}
                                        placeholder="会場名を入力"
                                    />
                                </label>
                            </div>
                            <div className="form-group">
                                <label>
                                    <span className="form-label-text">開始時間</span>
                                    <input
                                        type="time"
                                        value={formData.time}
                                        onChange={e => handleChange('time', e.target.value)}
                                    />
                                </label>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>
                                    <span className="form-label-text">Game No.</span>
                                    <input
                                        type="text"
                                        value={formData.gameNo}
                                        onChange={e => handleChange('gameNo', e.target.value)}
                                        placeholder="例: 1"
                                    />
                                </label>
                            </div>
                            <div className="form-group">
                                <label>
                                    <span className="form-label-text">終了時間</span>
                                    <input
                                        type="time"
                                        value={endTimeStr}
                                        onChange={e => setEndTimeStr(e.target.value)}
                                    />
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="form-section">
                        <h4>審判</h4>
                        <div className="form-row">
                            <div className="form-group">
                                <label>
                                    <span className="form-label-text">クルーチーフ</span>
                                    <input
                                        type="text"
                                        value={formData.crewChief}
                                        onChange={e => handleChange('crewChief', e.target.value)}
                                        placeholder="氏名を入力"
                                    />
                                </label>
                            </div>
                            <div className="form-group">
                                <label>
                                    <span className="form-label-text">アンパイア</span>
                                    <input
                                        type="text"
                                        value={formData.umpire}
                                        onChange={e => handleChange('umpire', e.target.value)}
                                        placeholder="氏名を入力"
                                    />
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="form-section">
                        <h4>TO（テーブルオフィシャルズ）</h4>
                        <div className="form-row">
                            <div className="form-group">
                                <label>
                                    <span className="form-label-text">スコアラー</span>
                                    <input
                                        type="text"
                                        value={formData.scorer}
                                        onChange={e => handleChange('scorer', e.target.value)}
                                        placeholder="氏名を入力"
                                    />
                                </label>
                            </div>
                            <div className="form-group">
                                <label>
                                    <span className="form-label-text">A・スコアラー</span>
                                    <input
                                        type="text"
                                        value={formData.assistantScorer}
                                        onChange={e => handleChange('assistantScorer', e.target.value)}
                                        placeholder="氏名を入力"
                                    />
                                </label>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>
                                    <span className="form-label-text">タイマー</span>
                                    <input
                                        type="text"
                                        value={formData.timer}
                                        onChange={e => handleChange('timer', e.target.value)}
                                        placeholder="氏名を入力"
                                    />
                                </label>
                            </div>
                            <div className="form-group">
                                <label>
                                    <span className="form-label-text">ショットクロックオペレーター</span>
                                    <input
                                        type="text"
                                        value={formData.shotClockOperator}
                                        onChange={e => handleChange('shotClockOperator', e.target.value)}
                                        placeholder="氏名を入力"
                                    />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={onClose}>
                        キャンセル
                    </button>
                    <button className="btn btn-primary" onClick={handleSave}>
                        保存
                    </button>
                </div>
        </Modal>
    );
}
