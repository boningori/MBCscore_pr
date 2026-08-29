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
    activeActionLabel?: string | null; // 選択中アクションの表示名（例: "2P成功"）
    gameMode?: 'full' | 'simple'; // ゲームモード
    showThreePoint?: boolean; // 3P入力ボタンを表示するか（未指定時true=後方互換）
    onHoldPending?: () => void; // 選手がわからない → 保留アクション化（チーム選択へ）
    onCancelAction?: () => void; // 選択中アクションの取り消し
    /** アイドル時の注意書き（例: クォーター間の「Q◯として保存」）。指定時は通常のアイドル文言を置き換える */
    idleNotice?: string | null;
}

export function ActionButtons({
    onScore,
    onStat,
    onMiss,
    onFoul,
    disabled = false,
    // hasSelection = true, // デフォルトtrueにしてボタンを有効化（App側で制御） - unused
    activeAction = null,
    activeActionLabel = null,
    gameMode = 'full',
    showThreePoint = true,
    onHoldPending,
    onCancelAction,
    idleNotice = null,
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
            {/* ステータスバー（常設・高さ固定でレイアウトシフトを防ぐ）。
                アクション選択中はガイドと保留/キャンセル操作を表示する。

                has-notice はクォーター間などの注意書きを出している状態の目印。
                シンプルモードはアイドルの案内文を隠して画面高を稼ぐが、
                その指定が `:not(.active)` だったため注意書きも巻き添えで
                消えていた（実測: 文言は入っているのに高さ0）。
                注意書きは「いま記録すると次のQとして保存される」ことを伝える
                唯一の手掛かりで、あとからピリオドを直す導線は無い。
                隠してよいのはアイドルの案内文だけなので、両者をクラスで分ける。

                試合終了後（disabled）は、アイドルの案内文を出してはいけない。
                入力ボタンも選手カードも止まっているのに「選手とアクションをタップ
                して記録」と誘い続けることになり、押しても反応しない理由が画面の
                どこにも無かった。ここは注意書き扱いにしてシンプルモードでも残す
                —— 効かない操作の理由を伝えるのは、案内文よりクォーター間の
                注意書きに近い。
                記録待ち（activeAction）より優先する。終了前に立てた記録待ちが
                残っていても、もう選手をタップして記録することはできないため */}
            <div
                className={`action-status-bar ${activeAction && !disabled ? 'active' : (disabled || idleNotice) ? 'has-notice' : ''}`}
                role="status"
            >
                {disabled ? (
                    <span className="status-notice">試合終了。記録の追加はできません（訂正はアクション履歴から）</span>
                ) : activeAction ? (
                    <>
                        {/* この状態では選手タップが「選択」ではなく「即記録」になるため、
                            記録待ちであることを明示する */}
                        <span className="status-badge">記録待ち</span>
                        <span className="status-text">
                            {activeActionLabel ?? ''} → 選手をタップ
                        </span>
                        {onHoldPending && (
                            <button className="btn btn-warning btn-small" onClick={onHoldPending}>
                                選手がわからない
                            </button>
                        )}
                        {onCancelAction && (
                            <button className="btn btn-secondary btn-small" onClick={onCancelAction}>
                                キャンセル
                            </button>
                        )}
                    </>
                ) : idleNotice ? (
                    <span className="status-notice">{idleNotice}</span>
                ) : (
                    <span className="status-idle">選手とアクションをタップして記録</span>
                )}
            </div>

            {/* シュートボタン（スワイプ対応: 上=成功, 下=ミス） */}
            <div className="action-group">
                {/* <h4 className="action-group-title">シュート</h4> */}
                <div className="action-row score-row">
                    <SwipeableScoreButton
                        scoreType="2P"
                        onScore={onScore}
                        onMiss={onMiss}
                        disabled={isBtnDisabled}
                        isActiveScore={isActive('SCORE', '2P')}
                        isActiveMiss={isActive('MISS', '2PA')}
                    />
                    {showThreePoint && (
                        <SwipeableScoreButton
                            scoreType="3P"
                            onScore={onScore}
                            onMiss={onMiss}
                            disabled={isBtnDisabled}
                            isActiveScore={isActive('SCORE', '3P')}
                            isActiveMiss={isActive('MISS', '3PA')}
                        />
                    )}
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
                    {/* <h4 className="action-group-title">統計</h4> */}
                    <div className="action-row">
                        {/* リバウンドボタン（OR/DR分割） */}
                        <button
                            className={`action-btn stat-btn btn-oreb ${isActive('STAT', 'OREB') ? 'active' : ''}`}
                            onClick={() => onStat('OREB')}
                            disabled={isBtnDisabled}
                        >
                            <span className="rebound-label">OR</span>
                            <span className="rebound-sublabel">オフェンス</span>
                            <span className="rebound-sublabel">リバウンド</span>
                        </button>
                        <button
                            className={`action-btn stat-btn btn-dreb ${isActive('STAT', 'DREB') ? 'active' : ''}`}
                            onClick={() => onStat('DREB')}
                            disabled={isBtnDisabled}
                        >
                            <span className="rebound-label">DR</span>
                            <span className="rebound-sublabel">ディフェンス</span>
                            <span className="rebound-sublabel">リバウンド</span>
                        </button>
                    </div>
                    <div className="action-row">
                        <button
                            className={`action-btn stat-btn btn-ast ${isActive('STAT', 'AST') ? 'active' : ''}`}
                            onClick={() => onStat('AST')}
                            disabled={isBtnDisabled}
                        >
                            <span className="action-icon">🤝</span>
                            <span className="action-label">AST</span>
                        </button>
                        <button
                            className={`action-btn stat-btn btn-stl ${isActive('STAT', 'STL') ? 'active' : ''}`}
                            onClick={() => onStat('STL')}
                            disabled={isBtnDisabled}
                        >
                            <span className="action-icon">🔥</span>
                            <span className="action-label">STL</span>
                        </button>
                        <button
                            className={`action-btn stat-btn btn-blk ${isActive('STAT', 'BLK') ? 'active' : ''}`}
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
                {/* <h4 className="action-group-title">ファウル</h4> */}
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

        </div>
    );
}
