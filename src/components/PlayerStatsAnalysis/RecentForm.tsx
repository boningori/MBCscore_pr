// 直近フォーム: 直近5試合平均 vs 通算平均

import { getRecentForm } from '../../utils/playerFormStats';
import type { PlayerGameRecord } from '../../utils/playerStatsAnalysis';

interface RecentFormProps {
    gameHistory: PlayerGameRecord[];
}

const CARDS: { key: 'points' | 'rebounds' | 'assists'; label: string }[] = [
    { key: 'points', label: '得点' },
    { key: 'rebounds', label: 'REB' },
    { key: 'assists', label: 'AST' },
];

export function RecentForm({ gameHistory }: RecentFormProps) {
    const form = getRecentForm(gameHistory);
    if (form.recentGames === 0) return null;

    return (
        <div className="recent-form-section">
            <div className="section-title">
                <span className="title-text">🔥 直近フォーム</span>
                <span className="title-note">
                    {form.isPartial
                        ? `直近${form.recentGames}試合（データ不足）`
                        : `直近${form.recentGames}試合 vs 通算平均`}
                </span>
            </div>
            <div className="recent-form-cards">
                {CARDS.map(({ key, label }) => {
                    const delta = form.deltas[key];
                    const dir = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
                    const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '±';
                    const sign = delta > 0 ? '+' : '';
                    return (
                        <div className={`recent-form-card ${dir}`} key={key}>
                            <span className="rf-value">{form.recentAvg[key].toFixed(1)}</span>
                            <span className={`rf-delta ${dir}`}>{arrow} {sign}{delta.toFixed(1)}</span>
                            <span className="rf-label">{label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
