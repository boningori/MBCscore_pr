import { useState, useCallback } from 'react';
import { useSwipe } from '../../hooks/useSwipe';
import './SwipeableScoreButton.css';

type ScoreType = '2P' | '3P' | 'FT';

interface SwipeableScoreButtonProps {
    scoreType: ScoreType;
    onScore: (type: ScoreType) => void;
    onMiss: (type: '2PA' | '3PA' | 'FTA') => void;
    disabled?: boolean;
    isActiveScore?: boolean;
    isActiveMiss?: boolean;
}

const SWIPE_THRESHOLD = 30;

// スコアタイプの表示情報
const SCORE_INFO: Record<ScoreType, { label: string; icon: string; missType: '2PA' | '3PA' | 'FTA' }> = {
    '2P': { label: '2P', icon: '🏀', missType: '2PA' },
    '3P': { label: '3P', icon: '🎯', missType: '3PA' },
    'FT': { label: 'FT', icon: '🆓', missType: 'FTA' },
};

export function SwipeableScoreButton({
    scoreType,
    onScore,
    onMiss,
    disabled = false,
    isActiveScore = false,
    isActiveMiss = false,
}: SwipeableScoreButtonProps) {
    const [showSelector, setShowSelector] = useState(false);
    const info = SCORE_INFO[scoreType];

    const { swipeDirection, onTouchStart, onTouchMove, onTouchEnd, consumeSwipeFlag } = useSwipe(
        useCallback(() => onScore(scoreType), [onScore, scoreType]),
        useCallback(() => onMiss(info.missType), [onMiss, info.missType]),
        SWIPE_THRESHOLD,
    );

    const handleClick = useCallback(() => {
        // スワイプ後はクリックをスキップ
        if (consumeSwipeFlag()) return;
        setShowSelector(true);
    }, [consumeSwipeFlag]);

    const handleSelectScore = () => {
        setShowSelector(false);
        onScore(scoreType);
    };

    const handleSelectMiss = () => {
        setShowSelector(false);
        onMiss(info.missType);
    };

    const handleClickOutside = () => {
        setShowSelector(false);
    };

    return (
        <div className="swipeable-score-wrapper">
            <button
                className={`action-btn swipeable-score-btn btn-${scoreType.toLowerCase()}
                    ${isActiveScore ? 'active-score' : ''}
                    ${isActiveMiss ? 'active-miss' : ''}
                    ${swipeDirection === 'up' ? 'swiping-up' : ''}
                    ${swipeDirection === 'down' ? 'swiping-down' : ''}`}
                onClick={handleClick}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                disabled={disabled}
            >
                <div className="score-content">
                    <span className="action-icon">{info.icon}</span>
                    <span className="action-label">{info.label}</span>
                    <span className="action-hint">↑成功 ↓ミス</span>
                </div>
            </button>

            {/* スワイプ中のポップアップ（指を離すと確定） */}
            {swipeDirection && (
                <div className={`swipe-popup ${swipeDirection === 'up' ? 'score' : 'miss'}`}>
                    <div className="swipe-popup-content">
                        <span className="popup-label">
                            {swipeDirection === 'up' ? `${info.label}成功` : `${info.label}ミス`}
                        </span>
                        <span className="popup-hint">離して確定</span>
                    </div>
                </div>
            )}

            {/* タップ時のセレクター */}
            {showSelector && (
                <>
                    <div className="score-selector-backdrop" onClick={handleClickOutside} />
                    <div className="score-selector">
                        <button
                            className="score-option success"
                            onClick={handleSelectScore}
                        >
                            <span className="option-label">{info.label}成功</span>
                        </button>
                        <button
                            className="score-option miss"
                            onClick={handleSelectMiss}
                        >
                            <span className="option-label">{info.label}ミス</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
