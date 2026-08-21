import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import './UpdatePrompt.css';

/** バーの表示中だけ body に付く目印。ページ下部の逃げ場は index.css が作る */
export const UPDATE_PROMPT_BODY_CLASS = 'has-update-prompt';

/** 実測したバーの高さを CSS へ渡す変数名 */
export const UPDATE_PROMPT_HEIGHT_VAR = '--update-prompt-height';

interface UpdatePromptProps {
    onUpdate: () => void;
    onDismiss: () => void;
}

/**
 * バーの高さぶんの逃げ場をページ下部に確保する。
 *
 * バーは position: fixed で最前面に浮くため、これが無いと画面下端の操作要素を
 * 覆う。375x812で実測したところ、ホーム画面の「📖 使用説明書」がバーの出ている
 * 間はタップ判定ごと奪われていた。ページ末尾にある要素なので、スクロールして
 * 下から逃がすこともできない。
 * （チーム編集の「キャンセル」も同じ状態だったが、そちらは未保存の入力を抱える
 * 画面なので updateSuppression 側でバー自体を出さないようにした）
 *
 * 高さを実測で渡すのは、@media (max-width: 380px) で縦積みになって変わるうえ、
 * 中身の寸法が clamp(px, vh, px) のトークンで決まり画面の高さにも依存するため。
 * 定数を書くとどこかの画面幅でずれる。
 */
function useBottomSpacing(ref: RefObject<HTMLDivElement | null>): void {
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;

        const { body, documentElement } = document;
        const applyHeight = () => {
            documentElement.style.setProperty(UPDATE_PROMPT_HEIGHT_VAR, `${element.offsetHeight}px`);
        };

        body.classList.add(UPDATE_PROMPT_BODY_CLASS);
        applyHeight();

        // 画面回転や折り返しの変化で高さが変わる。ResizeObserver を持たない
        // 環境（jsdom等）では初回の実測だけで済ませる
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(applyHeight);
        observer?.observe(element);

        return () => {
            observer?.disconnect();
            body.classList.remove(UPDATE_PROMPT_BODY_CLASS);
            documentElement.style.removeProperty(UPDATE_PROMPT_HEIGHT_VAR);
        };
    }, [ref]);
}

/**
 * 新しいバージョンが利用可能なことを知らせる非ブロッキングなバー。
 * 更新はページの再読み込みを伴うため、必ず利用者の操作を待つ。
 */
export function UpdatePrompt({ onUpdate, onDismiss }: UpdatePromptProps) {
    const ref = useRef<HTMLDivElement>(null);
    useBottomSpacing(ref);

    return (
        <div className="update-prompt" role="status" ref={ref}>
            <span className="update-prompt-message">
                新しいバージョンがあります
            </span>
            <div className="update-prompt-actions">
                <button className="update-prompt-btn secondary" onClick={onDismiss}>
                    後で
                </button>
                <button className="update-prompt-btn primary" onClick={onUpdate}>
                    更新
                </button>
            </div>
        </div>
    );
}
