// スワイプ操作の共通フック
// 上フリック=onSwipeUp、下フリック=onSwipeDown、タップ判定はconsumeSwipeFlagで行う
// SwipeableScoreButton / SwipeableTurnoverButton の重複ロジックを統合
// （SwipeableReboundButton も使っていたが、REBは OR/DR の2ボタンに分かれていて
//  この部品はどこからも描画されていなかったため削除した）

import { useState, useRef, useCallback } from 'react';

const DEFAULT_SWIPE_THRESHOLD = 30;

export type SwipeDirection = 'up' | 'down' | null;

export function useSwipe(
    onSwipeUp: () => void,
    onSwipeDown: () => void,
    threshold: number = DEFAULT_SWIPE_THRESHOLD,
) {
    const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>(null);
    const touchStartY = useRef<number | null>(null);
    const hasSwiped = useRef(false);

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        touchStartY.current = e.touches[0].clientY;
        hasSwiped.current = false;
        setSwipeDirection(null);
    }, []);

    const onTouchMove = useCallback((e: React.TouchEvent) => {
        if (touchStartY.current === null) return;

        const currentY = e.touches[0].clientY;
        const deltaY = touchStartY.current - currentY;

        // スワイプ閾値を超えたらポップアップを表示
        if (Math.abs(deltaY) > threshold) {
            hasSwiped.current = true;
            setSwipeDirection(deltaY > 0 ? 'up' : 'down');
        } else {
            setSwipeDirection(null);
        }
    }, [threshold]);

    const onTouchEnd = useCallback((e: React.TouchEvent) => {
        // スワイプ中なら指を離した時点で確定
        if (swipeDirection === 'up') {
            e.preventDefault();
            e.stopPropagation();
            onSwipeUp();
        } else if (swipeDirection === 'down') {
            e.preventDefault();
            e.stopPropagation();
            onSwipeDown();
        }

        touchStartY.current = null;
        setSwipeDirection(null);
    }, [swipeDirection, onSwipeUp, onSwipeDown]);

    // クリックハンドラ用: 直前がスワイプならtrueを返してフラグをクリア
    const consumeSwipeFlag = useCallback(() => {
        const wasSwipe = hasSwiped.current;
        hasSwiped.current = false;
        return wasSwipe;
    }, []);

    return { swipeDirection, onTouchStart, onTouchMove, onTouchEnd, consumeSwipeFlag };
}
