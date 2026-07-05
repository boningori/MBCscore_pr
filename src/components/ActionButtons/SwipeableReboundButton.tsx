import { useState, useCallback } from 'react';
import { useSwipe } from '../../hooks/useSwipe';
import './SwipeableReboundButton.css';

interface SwipeableReboundButtonProps {
    onRebound: (type: 'OREB' | 'DREB') => void;
    disabled?: boolean;
    isActive?: boolean;
    activeType?: 'OREB' | 'DREB' | null;
}

const SWIPE_THRESHOLD = 30;

export function SwipeableReboundButton({
    onRebound,
    disabled = false,
    isActive = false,
    activeType = null,
}: SwipeableReboundButtonProps) {
    const [showSelector, setShowSelector] = useState(false);

    const { swipeDirection, onTouchStart, onTouchMove, onTouchEnd, consumeSwipeFlag } = useSwipe(
        useCallback(() => onRebound('OREB'), [onRebound]),
        useCallback(() => onRebound('DREB'), [onRebound]),
        SWIPE_THRESHOLD,
    );

    const swipeType = swipeDirection === 'up' ? 'OREB' : swipeDirection === 'down' ? 'DREB' : null;

    const handleClick = useCallback(() => {
        // スワイプ後はクリックをスキップ
        if (consumeSwipeFlag()) return;
        setShowSelector(true);
    }, [consumeSwipeFlag]);

    const handleSelect = (type: 'OREB' | 'DREB') => {
        setShowSelector(false);
        onRebound(type);
    };

    const handleClickOutside = () => {
        setShowSelector(false);
    };

    return (
        <div className="swipeable-rebound-wrapper">
            <button
                className={`action-btn stat-btn swipeable-rebound-btn 
                    ${isActive ? 'active' : ''} 
                    ${activeType === 'OREB' ? 'active-oreb' : ''} 
                    ${activeType === 'DREB' ? 'active-dreb' : ''}
                    ${swipeType === 'OREB' ? 'swiping-up' : ''}
                    ${swipeType === 'DREB' ? 'swiping-down' : ''}`}
                onClick={handleClick}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                disabled={disabled}
            >
                <div className="rebound-content">
                    <span className="action-label">REB</span>
                    <span className="action-hint">↑オフェンス ↓ディフェンス</span>
                </div>
            </button>

            {/* スワイプ中のポップアップ（指を離すと確定） */}
            {swipeType && (
                <div className={`swipe-popup ${swipeType === 'OREB' ? 'oreb' : 'dreb'}`}>
                    <div className="swipe-popup-content">
                        <span className="popup-label">{swipeType === 'OREB' ? 'OR' : 'DR'}</span>
                        <span className="popup-sublabel">{swipeType === 'OREB' ? 'オフェンス' : 'ディフェンス'}</span>
                        <span className="popup-hint">離して確定</span>
                    </div>
                </div>
            )}

            {/* タップ時のセレクター */}
            {showSelector && (
                <>
                    <div className="rebound-selector-backdrop" onClick={handleClickOutside} />
                    <div className="rebound-selector">
                        <button
                            className="rebound-option oreb"
                            onClick={() => handleSelect('OREB')}
                        >
                            <span className="option-label">OR</span>
                            <span className="option-sublabel">オフェンス</span>
                        </button>
                        <button
                            className="rebound-option dreb"
                            onClick={() => handleSelect('DREB')}
                        >
                            <span className="option-label">DR</span>
                            <span className="option-sublabel">ディフェンス</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
