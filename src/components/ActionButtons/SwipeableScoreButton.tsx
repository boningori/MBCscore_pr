import { useState, useCallback, useEffect, useRef } from 'react';
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
const SCORE_INFO: Record<ScoreType, { label: string; icon: string; missType: '2PA' | '3PA' | 'FTA'; ariaLabel: string }> = {
    '2P': { label: '2P', icon: '🏀', missType: '2PA', ariaLabel: '2Pシュート' },
    '3P': { label: '3P', icon: '🎯', missType: '3PA', ariaLabel: '3Pシュート' },
    'FT': { label: 'FT', icon: '🆓', missType: 'FTA', ariaLabel: 'フリースロー' },
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
    const wrapperRef = useRef<HTMLDivElement>(null);
    const info = SCORE_INFO[scoreType];

    // メニュー外のタップで閉じる。
    // clickではなくpointerdownで閉じることで、同じタップが下の要素（選手カード）に届く。
    // clickで閉じると黒幕がタップを吸ってしまい、連続入力時に選手を選べなくなる
    useEffect(() => {
        if (!showSelector) return;
        const handlePointerDown = (e: PointerEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setShowSelector(false);
            }
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [showSelector]);

    const { swipeDirection, onTouchStart, onTouchMove, onTouchEnd, consumeSwipeFlag } = useSwipe(
        useCallback(() => onScore(scoreType), [onScore, scoreType]),
        useCallback(() => onMiss(info.missType), [onMiss, info.missType]),
        SWIPE_THRESHOLD,
    );

    const handleClick = useCallback(() => {
        // スワイプ後はクリックをスキップ
        if (consumeSwipeFlag()) return;
        // 黒幕がタップを吸わなくなったぶん、ボタン自身のタップで閉じられるようにする
        setShowSelector(prev => !prev);
    }, [consumeSwipeFlag]);

    const handleSelectScore = () => {
        setShowSelector(false);
        onScore(scoreType);
    };

    const handleSelectMiss = () => {
        setShowSelector(false);
        onMiss(info.missType);
    };

    return (
        <div className="swipeable-score-wrapper" ref={wrapperRef}>
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
                aria-label={info.ariaLabel}
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
                    {/* 暗転のみ。タップ判定は持たない（下の選手カードへタップを通すため） */}
                    <div className="score-selector-backdrop" />
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
