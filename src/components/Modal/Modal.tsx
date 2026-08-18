import { useEffect, useRef, type ReactNode } from 'react';
import { registerModal, unregisterModal } from './modalStack';

interface ModalProps {
    /** モーダルを閉じる要求（Escape / オーバーレイクリック / 明示クローズ） */
    onClose: () => void;
    /** ダイアログ見出し要素のid（aria-labelledby用） */
    labelledBy?: string;
    /** labelledByが無い場合のアクセシブル名 */
    ariaLabel?: string;
    /** オーバーレイに付与するクラス（既存デザイン流用のため差し替え可） */
    overlayClassName?: string;
    /** コンテンツに付与するクラス（既存デザイン流用のため差し替え可） */
    contentClassName?: string;
    /** オーバーレイクリックで閉じるか（既定: true） */
    closeOnOverlayClick?: boolean;
    /** Escapeキーで閉じるか（既定: true） */
    closeOnEsc?: boolean;
    /**
     * 端末の戻る操作で閉じるか（既定: true）。
     *
     * false でも重なり順の登録からは外れない。外すと戻るが下の画面へ抜けて、
     * ダイアログを開いたままホームへ飛ぶ（modalStack）。閉じずに受け止める。
     */
    closeOnBack?: boolean;
    children: ReactNode;
}

// Tab移動可能な要素のセレクタ
const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * アクセシブルなモーダルの土台。
 * role="dialog" / aria-modal、Escapeクローズ、フォーカストラップ、
 * 閉じた際のフォーカス復帰を提供する。見た目は呼び出し側のクラスで制御する。
 */
export function Modal({
    onClose,
    labelledBy,
    ariaLabel,
    overlayClassName = 'modal-overlay',
    contentClassName = 'modal-content',
    closeOnOverlayClick = true,
    closeOnEsc = true,
    closeOnBack = true,
    children,
}: ModalProps) {
    const contentRef = useRef<HTMLDivElement>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);

    // 端末の戻る操作で閉じられるよう、重なり順のレジストリに載せる。
    // onClose は呼び出し側で毎レンダー作り直されることが多いので、
    // 登録するのは ref を読むラッパにして、登録/解除はマウント時の1回に保つ。
    //
    // closeOnBack も ref で読む。登録し直すと重なり順が入れ替わるうえ、
    // 途中で false になった瞬間だけ登録が外れて戻るが下の画面へ抜ける
    const onCloseRef = useRef(onClose);
    const closeOnBackRef = useRef(closeOnBack);
    useEffect(() => {
        onCloseRef.current = onClose;
        closeOnBackRef.current = closeOnBack;
    });
    useEffect(() => {
        const id = registerModal(() => {
            // 閉じない作りでも登録は保つ。戻るをここで受け止めないと、
            // 画面遷移として扱われてダイアログごとホームへ飛ぶ
            if (!closeOnBackRef.current) return;
            onCloseRef.current();
        });
        return () => unregisterModal(id);
    }, []);

    // 開いた時点のフォーカス要素を記録し、閉じたら復帰
    useEffect(() => {
        previouslyFocused.current = document.activeElement as HTMLElement | null;

        // data-autofocus 指定 → 最初のフォーカス可能要素 → コンテナ自体 の順。
        // 確認ダイアログは肯定側（終了する・削除する）を先頭に置く構成が多く、
        // 素直に先頭へ当てると開いた直後のEnterがそのまま実行になってしまう。
        // 打ち消し側に data-autofocus を付けて逃がせるようにする
        const content = contentRef.current;
        if (content) {
            const preferred = content.querySelector<HTMLElement>('[data-autofocus]');
            const first = content.querySelector<HTMLElement>(FOCUSABLE);
            (preferred ?? first ?? content).focus();
        }

        return () => {
            previouslyFocused.current?.focus?.();
        };
    }, []);

    // Escape と Tab（フォーカストラップ）
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (closeOnEsc && e.key === 'Escape') {
            e.stopPropagation();
            onClose();
            return;
        }

        if (e.key !== 'Tab') return;

        const content = contentRef.current;
        if (!content) return;

        const focusables = Array.from(content.querySelectorAll<HTMLElement>(FOCUSABLE))
            .filter(el => el.offsetParent !== null || el === document.activeElement);
        if (focusables.length === 0) {
            e.preventDefault();
            return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    };

    return (
        <div
            className={overlayClassName}
            onClick={closeOnOverlayClick ? onClose : undefined}
            onKeyDown={handleKeyDown}
        >
            <div
                ref={contentRef}
                className={contentClassName}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                aria-label={labelledBy ? undefined : ariaLabel}
                tabIndex={-1}
                onClick={e => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}
