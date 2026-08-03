import type { InstallPromptMode } from './useInstallPrompt';
import './InstallPrompt.css';

interface InstallPromptProps {
    mode: Exclude<InstallPromptMode, 'none'>;
    onInstall: () => void;
    onDismiss: () => void;
}

/**
 * ホーム画面への追加を案内するカード。
 * インストールするとオフラインでの起動が速くなり、アドレスバーが消えて
 * 記録画面を広く使えるため、そこを訴求する。
 */
export function InstallPrompt({ mode, onInstall, onDismiss }: InstallPromptProps) {
    return (
        <div className="install-prompt">
            <button
                className="install-prompt-close"
                onClick={onDismiss}
                aria-label="インストール案内を閉じる"
            >
                ×
            </button>
            <p className="install-prompt-title">📲 ホーム画面に追加できます</p>
            <p className="install-prompt-body">
                アプリとして起動でき、オフラインでも試合を記録できます。
            </p>

            {mode === 'prompt' ? (
                <button className="btn btn-primary install-prompt-action" onClick={onInstall}>
                    ホーム画面に追加
                </button>
            ) : (
                // iOSは beforeinstallprompt が無く、Safariの共有メニューからしか追加できない
                <ol className="install-prompt-steps">
                    <li>下部の「共有」<span aria-hidden="true">□↑</span> をタップ</li>
                    <li>「ホーム画面に追加」を選ぶ</li>
                    <li>右上の「追加」をタップ</li>
                </ol>
            )}
        </div>
    );
}
