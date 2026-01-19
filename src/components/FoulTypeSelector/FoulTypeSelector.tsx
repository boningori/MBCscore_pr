import type { FoulType } from '../../types/game';
import { MAX_PERSONAL_FOULS } from '../../types/game';
import './FoulTypeSelector.css';

interface FoulTypeSelectorProps {
    onSelect: (foulType: FoulType, isTeamFoul?: boolean) => void;
    onCancel: () => void;
    hasSelectedPlayer: boolean;  // 選手が選択されているかどうか
    currentFoulCount?: number;   // 選択された選手の現在のファウル数
    playerName?: string;         // 選択された選手名
}

// ファウル種類の定義（ベンチテクニカルはスコアボードから直接記録）
const FOUL_TYPES: { type: FoulType; label: string; description: string; requiresPlayer: boolean }[] = [
    { type: 'P', label: 'P', description: 'パーソナルファウル', requiresPlayer: true },
    { type: 'T', label: 'T', description: 'テクニカルファウル', requiresPlayer: true },
    { type: 'U', label: 'U', description: 'アンスポーツマンライク', requiresPlayer: true },
    { type: 'D', label: 'D', description: 'ディスクォリファイイング', requiresPlayer: true },
];

export function FoulTypeSelector({ onSelect, onCancel, hasSelectedPlayer, currentFoulCount = 0, playerName }: FoulTypeSelectorProps) {
    const isFouledOut = currentFoulCount >= MAX_PERSONAL_FOULS;

    const handleSelect = (foul: typeof FOUL_TYPES[0]) => {
        // ベンチテクニカル以外は選手選択が必要
        if (foul.requiresPlayer && !hasSelectedPlayer) {
            return;
        }
        // ベンチテクニカルの場合はチームファウルとして記録
        const isTeamFoul = foul.type === 'BT';
        onSelect(foul.type, isTeamFoul);
    };

    return (
        <div className="foul-type-selector-overlay" onClick={onCancel}>
            <div className="foul-type-selector" onClick={e => e.stopPropagation()}>
                <h3>ファウル種類を選択</h3>

                {/* ファウルアウト警告 */}
                {hasSelectedPlayer && isFouledOut && (
                    <div className="foul-warning">
                        ⚠️ {playerName || '選手'}は既に{currentFoulCount}個のファウル（ファウルアウト済み）
                    </div>
                )}

                {/* 現在のファウル数表示 */}
                {hasSelectedPlayer && !isFouledOut && currentFoulCount > 0 && (
                    <div className="foul-count-info">
                        {playerName || '選手'}: 現在{currentFoulCount}個のファウル
                        {currentFoulCount >= 4 && <span className="foul-trouble"> (ファウルトラブル)</span>}
                    </div>
                )}

                <div className="foul-type-list">
                    {FOUL_TYPES.map(foul => {
                        const isDisabled = foul.requiresPlayer && !hasSelectedPlayer;
                        return (
                            <button
                                key={foul.type}
                                className={`foul-type-btn ${isDisabled ? 'disabled' : ''} ${isFouledOut ? 'warning-context' : ''}`}
                                onClick={() => handleSelect(foul)}
                                disabled={isDisabled}
                            >
                                <span className="foul-type-label">{foul.label}</span>
                                <span className="foul-type-desc">{foul.description}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="foul-type-actions">
                    <button className="btn btn-secondary" onClick={onCancel}>
                        キャンセル
                    </button>
                </div>
            </div>
        </div>
    );
}
