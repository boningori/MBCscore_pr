import type { ReactNode } from 'react';

interface SettingsSectionProps {
    /** aria-controls用の識別子（画面内で一意） */
    id: string;
    title: string;
    /** 見出しの右に出す補足（例: 最終バックアップ日時） */
    hint?: string;
    isOpen: boolean;
    onToggle: () => void;
    children: ReactNode;
}

/**
 * 設定画面の折りたたみセクション。
 *
 * 設定モーダルは全項目を並べると縦2000px超（スマホ縦で約3画面、横向きで約5画面）
 * あり、目的の項目に辿り着くまで延々スクロールする必要があった。
 * 既定では全て閉じ、見出しだけの一覧から1タップで開ける形にする。
 *
 * 閉じている間は中身をDOMに出さない。hidden属性で隠すだけだと、
 * 閉じたセクション内のフォーカス可能要素をモーダルのフォーカストラップが
 * 拾ってしまい、Tabで見えない場所に飛ぶため。
 */
export function SettingsSection({ id, title, hint, isOpen, onToggle, children }: SettingsSectionProps) {
    const panelId = `settings-section-${id}`;

    return (
        <section className={`settings-section ${isOpen ? 'is-open' : ''}`}>
            <button
                type="button"
                className="settings-section-header"
                onClick={onToggle}
                aria-expanded={isOpen}
                aria-controls={panelId}
            >
                <span className="settings-section-title">{title}</span>
                {hint && <span className="settings-section-hint">{hint}</span>}
                <span className="settings-section-chevron" aria-hidden="true">
                    {isOpen ? '▾' : '▸'}
                </span>
            </button>
            {isOpen && (
                <div className="settings-section-body" id={panelId}>
                    {children}
                </div>
            )}
        </section>
    );
}
