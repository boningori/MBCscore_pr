import { useState, useRef } from 'react';
import './SwipeableTurnoverButton.css';

interface SwipeableTurnoverButtonProps {
    onTurnover: (type: 'TO' | 'TO:DD' | 'TO:TR' | 'TO:PM' | 'TO:CM') => void;
    disabled?: boolean;
    isActive?: boolean;
    activeType?: 'TO' | 'TO:DD' | 'TO:TR' | 'TO:PM' | 'TO:CM' | null;
}

type SwipeDirection = 'up' | 'down' | 'left' | 'right' | null;

const SWIPE_THRESHOLD = 40;

// スワイプ方向とTO種類のマッピング
const SWIPE_TO_TYPE: Record<NonNullable<SwipeDirection>, 'TO:DD' | 'TO:TR' | 'TO:PM' | 'TO:CM'> = {
    up: 'TO:DD',     // ダブドリ
    down: 'TO:TR',   // トラベ
    left: 'TO:PM',   // パスミス
    right: 'TO:CM',  // キャッチミス
};

const TO_LABELS: Record<string, string> = {
    'TO': 'ターンオーバー',
    'TO:DD': 'ダブドリ',
    'TO:TR': 'トラベ',
    'TO:PM': 'パスミス',
    'TO:CM': 'キャッチ',
};

export function SwipeableTurnoverButton({
    onTurnover,
    disabled = false,
    isActive = false,
    activeType = null,
}: SwipeableTurnoverButtonProps) {
    const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>(null);
    const [showSelector, setShowSelector] = useState(false);
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);
    const hasSwiped = useRef(false);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (disabled) return;
        touchStartRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
        };
        hasSwiped.current = false;
        setSwipeDirection(null);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (disabled || !touchStartRef.current) return;
        const deltaX = e.touches[0].clientX - touchStartRef.current.x;
        const deltaY = e.touches[0].clientY - touchStartRef.current.y;

        // 4方向判定
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // 横方向が優勢
            if (deltaX > SWIPE_THRESHOLD) {
                setSwipeDirection('right');
                hasSwiped.current = true;
            } else if (deltaX < -SWIPE_THRESHOLD) {
                setSwipeDirection('left');
                hasSwiped.current = true;
            } else {
                setSwipeDirection(null);
            }
        } else {
            // 縦方向が優勢
            if (deltaY > SWIPE_THRESHOLD) {
                setSwipeDirection('down');
                hasSwiped.current = true;
            } else if (deltaY < -SWIPE_THRESHOLD) {
                setSwipeDirection('up');
                hasSwiped.current = true;
            } else {
                setSwipeDirection(null);
            }
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (disabled) return;

        if (hasSwiped.current && swipeDirection) {
            e.preventDefault();
            e.stopPropagation();
            // スワイプで確定
            const toType = SWIPE_TO_TYPE[swipeDirection];
            onTurnover(toType);
            // スワイプ後はクリックイベントを無視するため、少し遅延してリセット
            setTimeout(() => { hasSwiped.current = false; }, 300);
        } else {
            hasSwiped.current = false;
        }
        // タップの場合はセレクターを表示（handleClickで処理）

        touchStartRef.current = null;
        setSwipeDirection(null);
    };

    const handleClick = () => {
        if (disabled || hasSwiped.current) return;
        // タップ時はセレクターを表示（または直接TOを記録）
        setShowSelector(true);
    };

    const handleSelectType = (type: 'TO' | 'TO:DD' | 'TO:TR' | 'TO:PM' | 'TO:CM') => {
        onTurnover(type);
        setShowSelector(false);
    };

    const handleCancelSelector = () => {
        setShowSelector(false);
    };

    return (
        <div className="swipeable-turnover-wrapper">
            <button
                className={`swipeable-turnover-btn action-btn stat-btn btn-turnover ${isActive ? 'active' : ''} ${swipeDirection ? `swiping-${swipeDirection}` : ''}`}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onClick={handleClick}
                disabled={disabled}
            >
                <div className="turnover-content">
                    <span className="action-label">
                        {activeType ? TO_LABELS[activeType] : 'ターンオーバー'}
                    </span>
                </div>

                {/* スワイプヒント */}
                <div className="swipe-hints">
                    <span className="hint hint-up">↑ダブドリ</span>
                    <span className="hint hint-down">↓トラベリング</span>
                    <span className="hint hint-left">←パスミス</span>
                    <span className="hint hint-right">→キャッチミス</span>
                </div>

                {/* スワイプ中のポップアップ */}
                {swipeDirection && (
                    <div className={`swipe-popup swipe-popup-${swipeDirection}`}>
                        <div className="popup-content">
                            <span className="popup-label">{TO_LABELS[SWIPE_TO_TYPE[swipeDirection]]}</span>
                            <span className="popup-hint">離して確定</span>
                        </div>
                    </div>
                )}
            </button>

            {/* タップ時のセレクター */}
            {showSelector && (
                <div className="turnover-selector-overlay" onClick={handleCancelSelector}>
                    <div className="turnover-selector" onClick={e => e.stopPropagation()}>
                        <div className="selector-title">TO種類を選択</div>
                        <div className="selector-options">
                            <button className="selector-btn" onClick={() => handleSelectType('TO')}>
                                TO（その他）
                            </button>
                            <button className="selector-btn" onClick={() => handleSelectType('TO:DD')}>
                                ダブドリ
                            </button>
                            <button className="selector-btn" onClick={() => handleSelectType('TO:TR')}>
                                トラベ
                            </button>
                            <button className="selector-btn" onClick={() => handleSelectType('TO:PM')}>
                                パスミス
                            </button>
                            <button className="selector-btn" onClick={() => handleSelectType('TO:CM')}>
                                キャッチミス
                            </button>
                        </div>
                        <button className="selector-cancel" onClick={handleCancelSelector}>
                            キャンセル
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
