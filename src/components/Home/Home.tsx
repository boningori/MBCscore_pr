import { useState, useEffect } from 'react';
import type { SavedTeam } from '../../utils/teamStorage';
import { loadMyTeams, loadRecentOpponents } from '../../utils/teamStorage';
import { hasGameSession } from '../../utils/gameSessionStorage';
import './Home.css';



interface HomeProps {
    onStartGame: () => void;
    onManageTeams: () => void;
    onViewHistory: () => void;
    onManageOpponents: () => void;
    onResumeGame?: () => void;
    onOpenSettings: () => void;
    isFullScreen: boolean;
    onToggleFullScreen: () => void;
}

export function Home({ onStartGame, onManageTeams, onViewHistory, onManageOpponents, onResumeGame, onOpenSettings, isFullScreen, onToggleFullScreen }: HomeProps) {
    const [myTeams] = useState<SavedTeam[]>(loadMyTeams);
    const [recentOpponents] = useState<SavedTeam[]>(loadRecentOpponents);
    const [canResume, setCanResume] = useState(false);

    useEffect(() => {
        setCanResume(hasGameSession());
    }, []);

    const hasMyTeams = myTeams.length > 0;

    return (
        <div className="home-container">
            <div className="home-header">
                <div className="home-brand">
                    <h1 className="home-title">MBC<span className="title-accent">score</span></h1>
                    <p className="home-tagline">ミニバス用スコアシートアプリ ベータ版</p>
                </div>
                <div className="header-buttons">
                    <button className="btn btn-secondary btn-icon" onClick={onOpenSettings} title="設定">
                        ⚙️
                    </button>
                    <button className="btn btn-secondary btn-icon" onClick={onToggleFullScreen} title={isFullScreen ? '画面縮小' : '全画面'}>
                        {isFullScreen ? '⊟' : '⊞'}
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
                                <span className="menu-icon">▶️</span>
                                <span className="menu-label">試合を再開</span>
                                <span className="menu-description">中断した試合を続ける</span>
                            </button>
                        )}

                        <button className="home-menu-item" onClick={onManageTeams}>
                            <span className="menu-icon">👥</span>
                            <span className="menu-label">マイチーム管理</span>
                            <span className="menu-description">{myTeams.length}チーム登録済み</span>
                        </button>

                        <button className="home-menu-item" onClick={onViewHistory}>
                            <span className="menu-icon">📋</span>
                            <span className="menu-label">試合履歴</span>
                            <span className="menu-description">過去の記録を見る</span>
                        </button>

                        <button className="home-menu-item" onClick={onManageOpponents}>
                            <span className="menu-icon">🆚</span>
                            <span className="menu-label">対戦チーム管理</span>
                            <span className="menu-description">対戦チームを登録・編集</span>
                        </button>
                    </div>
                )}

                {recentOpponents.length > 0 && (
                    <div className="home-recent">
                        <h3>最近の対戦チーム</h3>
                        <div className="recent-list">
                            {recentOpponents.slice(0, 3).map(team => (
                                <div key={team.id} className="recent-item">
                                    <span className="recent-name">{team.name}</span>
                                    <span className="recent-players">{team.players.length}名</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="home-footer">
                <p className="text-muted text-sm">
                    音声入力対応 | タブレット最適化 | オフライン動作
                </p>
            </div>
        </div>
    );
}
