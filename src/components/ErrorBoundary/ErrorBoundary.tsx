import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { logError, formatErrorLog } from '../../utils/errorLog';
import './ErrorBoundary.css';

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    error: Error | null;
    copyNotice: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null, copyNotice: '' };

    static getDerivedStateFromError(error: Error): Pick<ErrorBoundaryState, 'error'> {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        logError('react', error.message, `${error.stack ?? ''}\n${info.componentStack ?? ''}`);
    }

    // この画面が出ている時点で App は落ちており、ToastContainer も道連れで
    // 消えているため showToast は無反応になる。かといって alert は
    // アプリ内の他の通知と作法が違い、PWAでは出方も端末任せになる。
    // 自前のUIの中で知らせるのが、この場面で確実に働く唯一の方法
    handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(formatErrorLog());
            this.setState({ copyNotice: 'エラー情報をコピーしました。メールに貼り付けて送付できます。' });
        } catch {
            this.setState({ copyNotice: 'コピーに失敗しました。設定画面のエラーログから再度お試しください。' });
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
                    {this.state.copyNotice && (
                        <p className="error-boundary-notice" role="status">
                            {this.state.copyNotice}
                        </p>
                    )}
                    <p className="error-boundary-contact">
                        繰り返し発生する場合は、エラー情報を添えて mbcscore@gmail.com までご連絡ください。
                    </p>
                </div>
            );
        }
        return this.props.children;
    }
}
