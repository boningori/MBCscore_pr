import { useState } from 'react';
import type { Player, FreeThrowResult } from '../../types/game';
import { formatPlayerNumber } from '../../utils/playerNumber';
import { wouldOverflowFoulColumns } from '../../utils/foulColumns';
import { Modal } from '../Modal';
import './EditActionModal.css';

interface EditActionModalProps {
    item: {
        id: string;
        type: 'score' | 'stat' | 'foul';
        entryType: string;
        playerId: string;
        playerNumber: number;
        isOwnGoal?: boolean;
        /** ファウルの種別を読める形で（種別は変えられないので表示専用） */
        typeLabel?: string;
        /** フリースローを伴うファウルか */
        hasFreeThrows?: boolean;
        /** いまのFT結果（編集の初期値） */
        freeThrowResults?: FreeThrowResult[];
        /** FTの成否を直せるか（紐付きが崩れている記録は直せない。canEditFreeThrows） */
        canEditFreeThrows?: boolean;
    };
    players: Player[];
    onSave: (itemId: string, newPlayerId: string, newType: string) => void;
    /** FTの成否だけを直す（本数と種別は変えない） */
    onEditFreeThrows?: (entryId: string, freeThrowResults: FreeThrowResult[]) => void;
    // 変換にも選手を渡す。「誰の記録か」と「成功／ミス」は同時に間違えるので、
    // 変換経路で選手を捨てると訂正したはずの付け替えが黙って消える
    onConvertScoreToMiss?: (entryId: string, newMissType: '2PA' | '3PA' | 'FTA', newPlayerId: string) => void;
    onConvertMissToScore?: (entryId: string, newScoreType: '2P' | '3P' | 'FT', newPlayerId: string) => void;
    onToggleOwnGoal?: (entryId: string) => void;
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

// 非シュート系スタッツの選択肢。
//
// ターンオーバーの細目（TOボタンのスワイプで記録できる）も並べる。
// 無かったころは、現在の種別がどの選択肢にも一致しないため、ダブドリの記録を
// 開くと「OREB」が選ばれているように見えていた。選手だけ直したい記録で
// 事実と違う種別が表示されるうえ、一度でも種類を触ると細目へ戻せず、
// 削除して記録し直すしかなかった。
const OTHER_STAT_TYPES = [
    { value: 'OREB', label: 'OREB (オフェンスリバウンド)' },
    { value: 'DREB', label: 'DREB (ディフェンスリバウンド)' },
    { value: 'AST', label: 'AST (アシスト)' },
    { value: 'STL', label: 'STL (スティール)' },
    { value: 'BLK', label: 'BLK (ブロック)' },
    { value: 'TO', label: 'TO (ターンオーバー)' },
    { value: 'TO:DD', label: 'TO (ダブドリ)' },
    { value: 'TO:TR', label: 'TO (トラベリング)' },
    { value: 'TO:PM', label: 'TO (パスミス)' },
    { value: 'TO:CM', label: 'TO (キャッチミス)' },
];

// シュート関連のタイプかどうかを判定
const isShotType = (type: string): boolean => {
    return ['2P', '3P', 'FT', '2PA', '3PA', 'FTA'].includes(type);
};

// scoreタイプかどうか（成功）
const isScoreType = (type: string): boolean => {
    return ['2P', '3P', 'FT'].includes(type);
};

export function EditActionModal({
    item,
    players,
    onSave,
    onEditFreeThrows,
    onConvertScoreToMiss,
    onConvertMissToScore,
    onToggleOwnGoal,
    onCancel,
}: EditActionModalProps) {
    const [selectedPlayerId, setSelectedPlayerId] = useState(item.playerId);
    const [selectedType, setSelectedType] = useState(item.entryType);
    const [isOwnGoal, setIsOwnGoal] = useState(item.isOwnGoal ?? false);
    // FTの成否。件数は本数のまま固定で、○×だけを差し替える
    const [ftResults, setFtResults] = useState<FreeThrowResult[]>(() => item.freeThrowResults ?? []);

    // 元の記録が名簿の誰にも結び付いていない（保留を「選手不明」で解決した記録）。
    //
    // プルダウンには名簿しか並ばないので、'unknown' はどの選択肢にも一致せず
    // 名簿の先頭が選ばれているように見えていた。表示と実体が食い違ううえ、
    // そのまま保存しても reducer 側で誰にも当たらず黙って捨てられる。
    // 得点への変換に至っては、帰属の無い得点エントリが生まれてスコアボードと
    // ランニングスコアの得点が食い違う（scoreHandlers の handleConvertMissToScore）。
    // ここは「選手を割り当てる」ための唯一の導線でもあるので、変換を塞ぐのではなく
    // 先に選手を選ばせる。
    const hasUnknownPlayer = !players.some(p => p.id === item.playerId);
    const needsPlayerChoice = hasUnknownPlayer && !players.some(p => p.id === selectedPlayerId);

    // ファウルは選手の付け替えだけを扱う。
    // 種別やFT本数まで変えられるようにすると公式様式の表記とFTの本数が
    // 辻褄の合わない組み合わせを作れてしまうため、そこは削除して入れ直す。
    // 種別の選択肢を出さないのは、ファウルの entryType（'P' 等）が
    // 「シュート関連ではない」と判定され、OREB/DREB… が並んでいたのも兼ねる
    const isFoul = item.type === 'foul';

    // FTの成否を直せる行か。直せない記録（ミスへ変換した・シューターを付け替えた）は
    // 従来どおり「削除して入れ直す」案内だけを出す
    const canEditFt = isFoul && !!item.canEditFreeThrows && !!onEditFreeThrows && ftResults.length > 0;
    const ftChanged = canEditFt
        && (item.freeThrowResults ?? []).some((r, i) => r !== ftResults[i]);
    const ftMade = ftResults.filter(r => r === 'made').length;

    // 付け替え先が既に5ファウルなら、移した瞬間に6個目になり公式様式の
    // ファウル欄（5枠）から漏れる。handleEditFoul は付け替え先の個数を
    // 見ていないため、記録フローの確認（FoulInputFlow）をすり抜ける経路になる。
    // 付け替えは長押し→編集と既に慎重な操作なので、ダイアログは重ねず警告だけ出す
    const foulOverflowTarget = isFoul && selectedPlayerId !== item.playerId
        ? players.find(p => p.id === selectedPlayerId && wouldOverflowFoulColumns(p.fouls))
        : undefined;

    // 現在の編集対象がシュート関連かどうか
    const isOriginalShotRelated = isShotType(item.entryType);
    const isSelectedShotRelated = isShotType(selectedType);

    // OGチェックボックスを表示するか（得点の成功系のみ）
    const showOwnGoal = isOriginalShotRelated && item.type === 'score' && isScoreType(selectedType);

    // シュート関連の場合は統合リスト、それ以外は非シュート系のみ。
    // OG中はミスを出さない —— 「入らなかったオウンゴール」は存在せず、
    // reducerも変換を受け付けない（scoreHandlers）。残すと選んでも何も起きない
    const types = isOriginalShotRelated
        ? SHOT_TYPES
            .filter(t => !isOwnGoal || t.category === 'score')
            .map(t => ({ value: t.value, label: t.label }))
        : OTHER_STAT_TYPES;

    const handleSave = () => {
        // ファウルは選手とFTの成否だけ。種別はそのまま返して呼び出し側の分岐に渡す
        if (isFoul) {
            // 成否を触っていれば、そちらを先に確定する。
            // 付け替えと同時に直しても両方が残るよう、別々のアクションで投げる
            if (ftChanged) {
                onEditFreeThrows?.(item.id, ftResults);
            }
            if (selectedPlayerId !== item.playerId) {
                onSave(item.id, selectedPlayerId, item.entryType);
            } else if (!ftChanged) {
                // どちらも変えていない場合も、閉じる挙動は従来どおりに保つ
                onSave(item.id, selectedPlayerId, item.entryType);
            }
            return;
        }

        const originalCategory = item.type; // 'score' or 'stat'
        const selectedShotType = SHOT_TYPES.find(t => t.value === selectedType);
        const newCategory = selectedShotType?.category;

        // OGの変更はいちばん先に反映する。
        // reducerはOGの得点をミスへ変換しない（scoreHandlers）ので、解除を変換より
        // 後に投げると「まだOG」と判定されて変換が黙って捨てられる。
        // 種別が得点かどうかで絞らないのは、この「OGを外してミスへ直す」訂正が
        // まさに種別を変えながらOGを解除する操作だから
        if (item.type === 'score' && isOwnGoal !== (item.isOwnGoal ?? false)) {
            onToggleOwnGoal?.(item.id);
        }

        // シュート関連の変換チェック
        if (isOriginalShotRelated && isSelectedShotRelated) {
            // 成功 → ミス への変換
            if (originalCategory === 'score' && newCategory === 'stat') {
                if (onConvertScoreToMiss) {
                    onConvertScoreToMiss(item.id, selectedType as '2PA' | '3PA' | 'FTA', selectedPlayerId);
                    return;
                }
            }
            // ミス → 成功 への変換
            if (originalCategory === 'stat' && newCategory === 'score') {
                if (onConvertMissToScore) {
                    onConvertMissToScore(item.id, selectedType as '2P' | '3P' | 'FT', selectedPlayerId);
                    return;
                }
            }
        }

        // 通常の編集（同じカテゴリ内の変更、または選手変更のみ）
        onSave(item.id, selectedPlayerId, selectedType);
    };

    // 変換が発生するかどうかを判定
    const isConversion = (): boolean => {
        if (isFoul) return false;
        if (!isOriginalShotRelated || !isSelectedShotRelated) return false;
        const originalCategory = item.type;
        const selectedShotType = SHOT_TYPES.find(t => t.value === selectedType);
        const newCategory = selectedShotType?.category;
        return originalCategory !== newCategory;
    };

    return (
        <Modal
            onClose={onCancel}
            overlayClassName="edit-action-modal-overlay"
            contentClassName="edit-action-modal"
            labelledBy="edit-action-modal-title"
        >
                <h3 id="edit-action-modal-title">記録を編集</h3>

                <div className="edit-form">
                    <div className="form-group">
                        <label htmlFor="edit-action-field-1">選手</label>
                        <select id="edit-action-field-1"
                            value={selectedPlayerId}
                            onChange={e => setSelectedPlayerId(e.target.value)}
                        >
                            {hasUnknownPlayer && (
                                <option value={item.playerId}>選手不明（選んでください）</option>
                            )}
                            {players.map(p => (
                                <option key={p.id} value={p.id}>
                                    #{formatPlayerNumber(p.number)} {p.courtName || p.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {isFoul ? (
                        <div className="form-group">
                            <span className="form-label-static">ファウル種類</span>
                            {/* 何を直しているのかが分からないと選手だけ選ばせても危うい */}
                            <p className="edit-readonly-value">{item.typeLabel || item.entryType}</p>
                            {/* すぐ下にFTの成否の選択が出るので、「フリースローは変更できません」
                                とだけ言うと真下のUIと食い違う。変えられないのは種類と本数 */}
                            <p className="edit-readonly-note">
                                {canEditFt
                                    ? '種類とフリースローの本数は変更できません。変える場合は削除して記録し直してください。'
                                    : '種類とフリースローは変更できません。変える場合は削除して記録し直してください。'}
                            </p>
                        </div>
                    ) : (
                        <div className="form-group">
                            <label htmlFor="edit-action-field-2">
                                {isOriginalShotRelated ? 'シュート結果' : 'スタッツ種類'}
                            </label>
                            <select id="edit-action-field-2"
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
                    )}

                    {showOwnGoal && (
                        <div className="form-group form-group-inline">
                            <label htmlFor="og-checkbox">相手チームのオウンゴール（▲）</label>
                            <input
                                id="og-checkbox"
                                type="checkbox"
                                checked={isOwnGoal}
                                onChange={e => setIsOwnGoal(e.target.checked)}
                            />
                        </div>
                    )}

                    {isConversion() && (
                        <div className="conversion-notice">
                            ⚠️ {item.type === 'score' ? '成功→ミス' : 'ミス→成功'}に変換されます
                        </div>
                    )}

                    {/* 外したFTは記録を1件も作らない（本数だけシューターのスタッツに入る）ため、
                        シューター側の履歴には現れない。この行がFTの成否を持っている唯一の
                        記録なので、ここで直せるようにする。動かすのは成否だけ——本数と種別まで
                        変えられるようにすると、公式様式の表記とFTの本数が辻褄の合わない
                        組み合わせを作れてしまう（handleEditFoulFreeThrows） */}
                    {canEditFt && (
                        <div className="form-group ft-edit-group">
                            <label id="ft-edit-label">フリースローの結果</label>
                            <div className="ft-edit-rows">
                                {ftResults.map((result, index) => (
                                    <div className="ft-edit-row" key={index}>
                                        <span className="ft-edit-index">{index + 1}本目</span>
                                        <div className="ft-edit-choices" role="radiogroup" aria-label={`${index + 1}本目の結果`}>
                                            {(['made', 'missed'] as const).map(value => (
                                                <button
                                                    key={value}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={result === value}
                                                    className={`ft-edit-choice ${result === value ? 'selected' : ''} ${value}`}
                                                    onClick={() => setFtResults(prev =>
                                                        prev.map((r, i) => (i === index ? value : r)))}
                                                >
                                                    {value === 'made' ? '○ 成功' : '× 失敗'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="ft-edit-summary">
                                結果: {ftMade}/{ftResults.length} 成功
                            </div>
                        </div>
                    )}

                    {/* 直せない記録（FTをミスへ変換した・シューターを付け替えた）は、
                        本数と得点エントリが1対1で対応しないため差分を当てられない。
                        入れ直しが要ることを言わないと、利用者は直す場所を探し続ける */}
                    {isFoul && item.hasFreeThrows && !canEditFt && (
                        <div className="edit-hint">
                            FTの成否を直すには、この記録を削除して入れ直してください（ここで直せるのは選手だけです）
                        </div>
                    )}

                    {foulOverflowTarget && (
                        <div className="conversion-notice">
                            ⚠️ #{formatPlayerNumber(foulOverflowTarget.number)} {foulOverflowTarget.courtName || foulOverflowTarget.name} は既に{foulOverflowTarget.fouls.length}ファウルです。
                            付け替えると{foulOverflowTarget.fouls.length + 1}個目になり、公式様式には記録されません
                        </div>
                    )}
                </div>

                <div className="edit-actions">
                    <button className="btn btn-secondary" onClick={onCancel}>
                        キャンセル
                    </button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={needsPlayerChoice}>
                        {isConversion() ? '変換' : '保存'}
                    </button>
                </div>
        </Modal>
    );
}
