import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { logError, formatErrorLog } from '../../utils/errorLog';
import './ErrorBoundary.css';

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        logError('react', error.message, `${error.stack ?? ''}\n${info.componentStack ?? ''}`);
    }

    handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(formatErrorLog());
            alert('エラー情報をコピーしました。メールに貼り付けて送付できます。');
        } catch {
            alert('コピーに失敗しました。設定画面のエラーログから再度お試しください。');
        }
    };

    render() {
        if (this.state.error) {
            return (
                <div className="error-boundary">
                    <h1>⚠️ エラーが発生しました</h1>
                    <p>申し訳ありません。アプリで予期しないエラーが発生しました。</p>
                    <p>
                        <strong>記録済みの試合・チームデータは端末内に保存されています。</strong>
                        再読み込みで復帰できます。
                    </p>
                    <div className="error-boundary-actions">
                        <button className="btn btn-primary" onClick={() => window.location.reload()}>
                            再読み込み
                        </button>
                        <button className="btn btn-secondary" onClick={this.handleCopy}>
                            エラー情報をコピー
                        </button>
                    </div>
                    <p className="error-boundary-contact">
                        繰り返し発生する場合は、エラー情報を添えて mbcscore@gmail.com までご連絡ください。
                    </p>
                </div>
            );
        }
        return this.props.children;
    }
}
