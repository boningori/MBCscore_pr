import { useState } from 'react';
import type { Player } from '../../types/game';
import './EditActionModal.css';

interface EditActionModalProps {
    item: {
        id: string;
        type: 'score' | 'stat' | 'foul';
        entryType: string;
        playerId: string;
        playerNumber: number;
    };
    players: Player[];
    onSave: (itemId: string, newPlayerId: string, newType: string) => void;
    onConvertScoreToMiss?: (entryId: string, newMissType: '2PA' | '3PA' | 'FTA') => void;
    onConvertMissToScore?: (entryId: string, newScoreType: '2P' | '3P' | 'FT') => void;
    onCancel: () => void;
}

// シュート関連の選択肢（成功とミスを統合）
const SHOT_TYPES = [
    { value: '2P', label: '2P成功 (+2)', category: 'score' },
    { value: '2PA', label: '2Pミス', category: 'stat' },
    { value: '3P', label: '3P成功 (+3)', category: 'score' },
    { value: '3PA', label: '3Pミス', category: 'stat' },
    { value: 'FT', label: 'FT成功 (+1)', category: 'score' },
    { value: 'FTA', label: 'FTミス', category: 'stat' },
];

// 非シュート系スタッツの選択肢
const OTHER_STAT_TYPES = [
    { value: 'OREB', label: 'OREB (オフェンスリバウンド)' },
    { value: 'DREB', label: 'DREB (ディフェンスリバウンド)' },
    { value: 'AST', label: 'AST (アシスト)' },
    { value: 'STL', label: 'STL (スティール)' },
    { value: 'BLK', label: 'BLK (ブロック)' },
    { value: 'TO', label: 'TO (ターンオーバー)' },
];

// シュート関連のタイプかどうかを判定
const isShotType = (type: string): boolean => {
    return ['2P', '3P', 'FT', '2PA', '3PA', 'FTA'].includes(type);
};

export function EditActionModal({
    item,
    players,
    onSave,
    onConvertScoreToMiss,
    onConvertMissToScore,
    onCancel,
}: EditActionModalProps) {
    const [selectedPlayerId, setSelectedPlayerId] = useState(item.playerId);
    const [selectedType, setSelectedType] = useState(item.entryType);

    // 現在の編集対象がシュート関連かどうか
    const isOriginalShotRelated = isShotType(item.entryType);
    const isSelectedShotRelated = isShotType(selectedType);

    // シュート関連の場合は統合リスト、それ以外は非シュート系のみ
    const types = isOriginalShotRelated
        ? SHOT_TYPES.map(t => ({ value: t.value, label: t.label }))
        : OTHER_STAT_TYPES;

    const handleSave = () => {
        const originalCategory = item.type; // 'score' or 'stat'
        const selectedShotType = SHOT_TYPES.find(t => t.value === selectedType);
        const newCategory = selectedShotType?.category;

        // シュート関連の変換チェック
        if (isOriginalShotRelated && isSelectedShotRelated) {
            // 成功 → ミス への変換
            if (originalCategory === 'score' && newCategory === 'stat') {
                if (onConvertScoreToMiss) {
                    onConvertScoreToMiss(item.id, selectedType as '2PA' | '3PA' | 'FTA');
                    return;
                }
            }
            // ミス → 成功 への変換
            if (originalCategory === 'stat' && newCategory === 'score') {
                if (onConvertMissToScore) {
                    onConvertMissToScore(item.id, selectedType as '2P' | '3P' | 'FT');
                    return;
                }
            }
        }

        // 通常の編集（同じカテゴリ内の変更、または選手変更のみ）
        onSave(item.id, selectedPlayerId, selectedType);
    };

    // 変換が発生するかどうかを判定
    const isConversion = (): boolean => {
        if (!isOriginalShotRelated || !isSelectedShotRelated) return false;
        const originalCategory = item.type;
        const selectedShotType = SHOT_TYPES.find(t => t.value === selectedType);
        const newCategory = selectedShotType?.category;
        return originalCategory !== newCategory;
    };

    return (
        <div className="edit-action-modal-overlay" onClick={onCancel}>
            <div className="edit-action-modal" onClick={e => e.stopPropagation()}>
                <h3>記録を編集</h3>

                <div className="edit-form">
                    <div className="form-group">
                        <label>選手</label>
                        <select
                            value={selectedPlayerId}
                            onChange={e => setSelectedPlayerId(e.target.value)}
                        >
                            {players.map(p => (
                                <option key={p.id} value={p.id}>
                                    #{p.number} {p.courtName || p.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>
                            {isOriginalShotRelated ? 'シュート結果' : 'スタッツ種類'}
                        </label>
                        <select
                            value={selectedType}
                            onChange={e => setSelectedType(e.target.value)}
                        >
                            {types.map(t => (
                                <option key={t.value} value={t.value}>
                                    {t.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {isConversion() && (
                        <div className="conversion-notice">
                            ⚠️ {item.type === 'score' ? '成功→ミス' : 'ミス→成功'}に変換されます
                        </div>
                    )}
                </div>

                <div className="edit-actions">
                    <button className="btn btn-secondary" onClick={onCancel}>
                        キャンセル
                    </button>
                    <button className="btn btn-primary" onClick={handleSave}>
                        {isConversion() ? '変換' : '保存'}
                    </button>
                </div>
            </div>
        </div>
    );
}
