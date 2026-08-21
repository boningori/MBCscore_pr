import type { SavedTeam } from '../../utils/teamStorage';
import { loadMyTeams } from '../../utils/teamStorage';
import { getGameSessionState } from '../../utils/gameSessionStorage';
import { InstallPrompt, useInstallPrompt } from '../InstallPrompt';
import './Home.css';



interface HomeProps {
    onStartGame: () => void;
    onManageTeams: () => void;
    onViewHistory: () => void;
    onManageOpponents: () => void;
    onViewPlayerStats: () => void;
    onResumeGame?: () => void;
    onOpenSettings: () => void;
    isFullScreen: boolean;
    onToggleFullScreen: () => void;
}

export function Home({ onStartGame, onManageTeams, onViewHistory, onManageOpponents, onViewPlayerStats, onResumeGame, onOpenSettings, isFullScreen, onToggleFullScreen }: HomeProps) {
    // 描画のたびに読み直す。
    //
    // アプリ設定はホームの上にモーダルで開くため、バックアップを取り込んでも
    // ホームは再マウントされない。マウント時に一度だけ読んでいたころは、
    // 取り込みが「進行中の試合: 復元」と成功を伝えているのに「試合を再開」が
    // 現れず、リロードするまで到達できなかった。マイチーム数も同様に古いまま
    // だった。設定を閉じると App が再描画されるので、ここで読み直せば追従する。
    // どちらも小さなJSONの読み出しで、ホームの再描画はまれ。
    const myTeams: SavedTeam[] = loadMyTeams();
    const sessionState = getGameSessionState();
    const canResume = sessionState !== 'none';
    // 終了したのに保存していない試合。試合終了の画面は端末の戻るで素通りできる
    // （オーバーレイであってモーダルではない）ため、ホームがその状態を
    // 引き受ける。「中断した試合を続ける」としか出ていないと、保存し忘れて
    // いることがホームからは読み取れない
    const isUnsavedResult = sessionState === 'finished';
    const install = useInstallPrompt();

    const hasMyTeams = myTeams.length > 0;

    return (
        <main className="home-container">
            <div className="home-header">
                <div className="header-left">
                    {/* 絵文字だけだとアクセシブル名が絵文字自体になり「四角」等と読まれる。
                        試合画面の同種ボタンに合わせて aria-label を付ける */}
                    <button
                        className="btn btn-secondary btn-icon"
                        onClick={onToggleFullScreen}
                        title={isFullScreen ? '画面縮小' : '全画面'}
                        aria-label={isFullScreen ? '画面縮小' : '全画面表示'}
                    >
                        {isFullScreen ? '⊟' : '⊞'}
                    </button>
                </div>
                <div className="home-brand">
                    <h1 className="home-title">MBC<span className="title-accent">score</span></h1>
                    <p className="home-tagline">ミニバス用スコアシートアプリ</p>
                </div>
                <div className="header-right">
                    <button
                        className="btn btn-secondary btn-icon"
                        onClick={onOpenSettings}
                        title="設定"
                        aria-label="設定"
                    >
                        ⚙️
                    </button>
                </div>
            </div>

            <div className="home-content">
                {!hasMyTeams ? (
                    <div className="home-welcome">
                        <h2>はじめに</h2>
                        <p>まずマイチームを登録してください</p>
                        <button className="btn btn-primary btn-large" onClick={onManageTeams}>
                            + マイチームを登録
                        </button>
                    </div>
                ) : (
                    <div className="home-menu">
                        <button className="home-menu-item primary" onClick={onStartGame}>
                            <span className="menu-icon">🏀</span>
                            <span className="menu-label">新規試合開始</span>
                            <span className="menu-description">試合記録を開始する</span>
                        </button>

                        {canResume && onResumeGame && (
                            <button className="home-menu-item resume" onClick={onResumeGame}>
                                <span className="menu-icon">{isUnsavedResult ? '💾' : '▶️'}</span>
                                <span className="menu-label">
                                    {isUnsavedResult ? '試合結果を保存' : '試合を再開'}
                                </span>
                                <span className="menu-description">
                                    {isUnsavedResult ? '終了した試合が未保存です' : '中断した試合を続ける'}
                                </span>
                            </button>
                        )}

                        <button className="home-menu-item" onClick={onManageTeams}>
                            <span className="menu-icon">👥</span>
                            <span className="menu-label">マイチーム管理</span>
                            <span className="menu-description">{myTeams.length}チーム登録済み</span>
                        </button>

                        <button className="home-menu-item" onClick={onManageOpponents}>
                            <span className="menu-icon">🆚</span>
                            <span className="menu-label">対戦チーム管理</span>
                            <span className="menu-description">対戦チームを登録・編集</span>
                        </button>

                        <button className="home-menu-item" onClick={onViewHistory}>
                            <span className="menu-icon">📋</span>
                            <span className="menu-label">試合履歴</span>
                            <span className="menu-description">過去の記録を見る</span>
                        </button>

                        <button className="home-menu-item" onClick={onViewPlayerStats}>
                            <span className="menu-icon">📊</span>
                            <span className="menu-label">選手スタッツ分析</span>
                            <span className="menu-description">選手の成長を可視化</span>
                        </button>
                    </div>
                )}

                {install.mode !== 'none' && (
                    <InstallPrompt
                        mode={install.mode}
                        onInstall={install.install}
                        onDismiss={install.dismiss}
                    />
                )}
            </div>

            <div className="home-footer">
                <a
                    href={`${import.meta.env.BASE_URL}manual.html`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="manual-link"
                >
                    📖 使用説明書
                </a>
                <p className="text-muted text-sm">
                    {/* バージョン表示: PWA更新の確認と不具合報告時の特定用 */}
                    v{__APP_VERSION__} | タブレット最適化 | オフライン動作
                </p>
            </div>
        </main>
    );
}
