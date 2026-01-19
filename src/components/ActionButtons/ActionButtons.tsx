import { SwipeableReboundButton } from './SwipeableReboundButton';
import { SwipeableTurnoverButton } from './SwipeableTurnoverButton';
import { SwipeableScoreButton } from './SwipeableScoreButton';
import './ActionButtons.css';

interface ActionButtonsProps {
    onScore: (type: '2P' | '3P' | 'FT') => void;
    onStat: (type: 'OREB' | 'DREB' | 'AST' | 'STL' | 'BLK' | 'TO' | 'TO:DD' | 'TO:TR' | 'TO:PM' | 'TO:CM') => void;
    onMiss: (type: '2PA' | '3PA' | 'FTA') => void;
    onFoul: () => void;
    disabled?: boolean;
    hasSelection?: boolean; // @deprecated アクション先行入力モードでは使用しないが、互換性のため残す
    activeAction?: { type: string; value?: string } | null;
    gameMode?: 'full' | 'simple'; // ゲームモード
}

export function ActionButtons({
    onScore,
    onStat,
    onMiss,
    onFoul,
    disabled = false,
    hasSelection = true, // デフォルトtrueにしてボタンを有効化（App側で制御）
    activeAction = null,
    gameMode = 'full',
}: ActionButtonsProps) {
    const isActive = (type: string, value?: string) => {
        if (!activeAction) return false;
        if (activeAction.type !== type) return false;
        if (value && activeAction.value !== value) return false;
        return true;
    };

    // hasSelectionは無視して、常に押せるようにする（disabledが無ければ）
    // ただし、もし従来の挙動（選手選択必須）を維持したい箇所があれば...
    // 今回は「アクション→選手」にするので、ボタンは常に有効であるべき。
    const isBtnDisabled = disabled;

    // リバウンドのアクティブ状態を判定
    const getActiveReboundType = (): 'OREB' | 'DREB' | null => {
        if (isActive('STAT', 'OREB')) return 'OREB';
        if (isActive('STAT', 'DREB')) return 'DREB';
        return null;
    };

    // ターンオーバーのアクティブ状態を判定
    const getActiveTurnoverType = (): 'TO' | 'TO:DD' | 'TO:TR' | 'TO:PM' | 'TO:CM' | null => {
        if (isActive('STAT', 'TO')) return 'TO';
        if (isActive('STAT', 'TO:DD')) return 'TO:DD';
        if (isActive('STAT', 'TO:TR')) return 'TO:TR';
        if (isActive('STAT', 'TO:PM')) return 'TO:PM';
        if (isActive('STAT', 'TO:CM')) return 'TO:CM';
        return null;
    };

    return (
        <div className="action-buttons-container">
            {/* シュートボタン（スワイプ対応: 上=成功, 下=ミス） */}
            <div className="action-group">
                <h4 className="action-group-title">シュート</h4>
                <div className="action-row score-row">
                    <SwipeableScoreButton
                        scoreType="2P"
                        onScore={onScore}
                        onMiss={onMiss}
                        disabled={isBtnDisabled}
                        isActiveScore={isActive('SCORE', '2P')}
                        isActiveMiss={isActive('MISS', '2PA')}
                    />
                    <SwipeableScoreButton
                        scoreType="3P"
                        onScore={onScore}
                        onMiss={onMiss}
                        disabled={isBtnDisabled}
                        isActiveScore={isActive('SCORE', '3P')}
                        isActiveMiss={isActive('MISS', '3PA')}
                    />
                    <SwipeableScoreButton
                        scoreType="FT"
                        onScore={onScore}
                        onMiss={onMiss}
                        disabled={isBtnDisabled}
                        isActiveScore={isActive('SCORE', 'FT')}
                        isActiveMiss={isActive('MISS', 'FTA')}
                    />
                </div>
            </div>

            {/* 統計ボタン（フルモードのみ表示） */}
            {gameMode === 'full' && (
                <div className="action-group">
                    <h4 className="action-group-title">統計</h4>
                    <div className="action-row">
                        {/* スワイプ可能なリバウンドボタン */}
                        <SwipeableReboundButton
                            onRebound={(type) => onStat(type)}
                            disabled={isBtnDisabled}
                            isActive={isActive('STAT', 'OREB') || isActive('STAT', 'DREB')}
                            activeType={getActiveReboundType()}
                        />
                    </div>
                    <div className="action-row">
                        <button
                            className={`action-btn stat-btn ${isActive('STAT', 'AST') ? 'active' : ''}`}
                            onClick={() => onStat('AST')}
                            disabled={isBtnDisabled}
                        >
                            <span className="action-icon">🤝</span>
                            <span className="action-label">AST</span>
                        </button>
                        <button
                            className={`action-btn stat-btn ${isActive('STAT', 'STL') ? 'active' : ''}`}
                            onClick={() => onStat('STL')}
                            disabled={isBtnDisabled}
                        >
                            <span className="action-icon">🔥</span>
                            <span className="action-label">STL</span>
                        </button>
                        <button
                            className={`action-btn stat-btn ${isActive('STAT', 'BLK') ? 'active' : ''}`}
                            onClick={() => onStat('BLK')}
                            disabled={isBtnDisabled}
                        >
                            <span className="action-icon">🛡️</span>
                            <span className="action-label">BLK</span>
                        </button>
                    </div>
                    <div className="action-row">
                        {/* スワイプ可能なターンオーバーボタン */}
                        <SwipeableTurnoverButton
                            onTurnover={(type) => onStat(type)}
                            disabled={isBtnDisabled}
                            isActive={isActive('STAT', 'TO') || isActive('STAT', 'TO:DD') || isActive('STAT', 'TO:TR') || isActive('STAT', 'TO:PM') || isActive('STAT', 'TO:CM')}
                            activeType={getActiveTurnoverType()}
                        />
                    </div>
                </div>
            )}

            {/* ファウル（選手アクション） */}
            <div className="action-group">
                <h4 className="action-group-title">ファウル</h4>
                <div className="action-row">
                    <button
                        className={`action-btn game-btn btn-foul ${isActive('FOUL') ? 'active' : ''}`}
                        onClick={onFoul}
                        disabled={isBtnDisabled}
                    >
                        <span className="action-icon">⚠️</span>
                        <span className="action-label">ファウル</span>
                    </button>
                </div>
            </div>

            {!hasSelection && !activeAction && gameMode !== 'simple' && (
                <div className="action-hint">
                    👆 アクションを選択してください
                </div>
            )}
            {activeAction && (
                <div className="action-hint active">
                    👇 選手を選択してください
                </div>
            )}
        </div>
    );
}
